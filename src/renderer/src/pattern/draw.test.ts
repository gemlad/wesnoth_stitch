import { describe, it, expect } from 'vitest'
import {
  cellBleed,
  contrastInk,
  drawCells,
  drawOverlay,
  visibleCellRange,
  type DrawContext,
  type CellRange
} from './draw'
import { cssToRgb, rgbToCss } from './settings'
import type { StitchPattern } from '../../../shared/pipeline'

/**
 * The grid is drawn by side-effecting a 2D context, so the only way to assert on it
 * without a real canvas is to record the calls. `DrawContext` is structural precisely
 * so this fake satisfies it.
 */
interface Rect {
  x: number
  y: number
  w: number
  h: number
  fill: string
}
interface Glyph {
  text: string
  x: number
  y: number
  fill: string
}
interface Line {
  from: [number, number]
  to: [number, number]
  width: number
  stroke: string
}

class FakeContext implements DrawContext {
  fillStyle: string | CanvasGradient | CanvasPattern = ''
  strokeStyle: string | CanvasGradient | CanvasPattern = ''
  font = ''
  textAlign: CanvasTextAlign = 'start'
  textBaseline: CanvasTextBaseline = 'alphabetic'
  lineWidth = 1

  rects: Rect[] = []
  glyphs: Glyph[] = []
  lines: Line[] = []
  strokes = 0

  private cursor: [number, number] = [0, 0]

  fillRect(x: number, y: number, w: number, h: number): void {
    this.rects.push({ x, y, w, h, fill: String(this.fillStyle) })
  }
  fillText(text: string, x: number, y: number): void {
    this.glyphs.push({ text, x, y, fill: String(this.fillStyle) })
  }
  beginPath(): void {
    // Nothing to reset: each segment is recorded as it is added, in `lineTo`.
  }
  moveTo(x: number, y: number): void {
    this.cursor = [x, y]
  }
  lineTo(x: number, y: number): void {
    this.lines.push({
      from: this.cursor,
      to: [x, y],
      // Konva applies lineWidth/strokeStyle at stroke() time, but the drawing code sets
      // them once per batch, so reading them here records the same values.
      width: this.lineWidth,
      stroke: String(this.strokeStyle)
    })
  }
  stroke(): void {
    this.strokes++
  }
}

/** `.` = no stitch; digits are palette indices. Rows are `cells[y][x]`, as §6 has them. */
function patternOf(rows: string[]): StitchPattern {
  return {
    width: rows[0].length,
    height: rows.length,
    cells: rows.map((row) => [...row].map((c) => (c === '.' ? null : Number(c))))
  }
}

const FILLS = ['#ff0000', '#00ff00', '#0000ff']
const GLYPHS = ['×', '○', '■']
const BG = '#f2ecdc'
const ALL = (p: StitchPattern): CellRange => ({ x0: 0, y0: 0, x1: p.width, y1: p.height })

describe('visibleCellRange', () => {
  const pattern = patternOf(Array(100).fill('.'.repeat(100)))

  it('covers the whole pattern when it fits inside the viewport', () => {
    const r = visibleCellRange(pattern, {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      width: 500,
      height: 500
    })
    expect(r).toEqual({ x0: 0, y0: 0, x1: 100, y1: 100 })
  })

  it('clips to the cells on screen when zoomed past the viewport', () => {
    // 10 px per cell, panned 100 px left/up: cell 10 is at the viewport's left edge,
    // and a 200 px viewport spans 20 more cells.
    const r = visibleCellRange(pattern, {
      scale: 10,
      offsetX: -100,
      offsetY: -100,
      width: 200,
      height: 200
    })
    expect(r).toEqual({ x0: 10, y0: 10, x1: 30, y1: 30 })
  })

  it('includes the partially-visible cells at both edges, not just the whole ones', () => {
    // Panned by 5 px = half a cell, so cell 0 is half off-screen and must still be drawn.
    const r = visibleCellRange(pattern, {
      scale: 10,
      offsetX: -5,
      offsetY: -5,
      width: 100,
      height: 100
    })
    expect(r.x0).toBe(0)
    expect(r.x1).toBe(11)
  })

  it('collapses to an empty in-bounds range when panned entirely off screen', () => {
    // Pattern is 1,000 px wide at this scale but pushed 5,000 px left, and 900 px down
    // past the bottom of a 200 px viewport: nothing is visible on either axis.
    const off = visibleCellRange(pattern, {
      scale: 10,
      offsetX: -5000,
      offsetY: 900,
      width: 200,
      height: 200
    })
    expect(off).toEqual({ x0: 100, x1: 100, y0: 0, y1: 0 })
  })

  it('yields an empty range rather than dividing by a zero scale', () => {
    const r = visibleCellRange(pattern, {
      scale: 0,
      offsetX: 0,
      offsetY: 0,
      width: 200,
      height: 200
    })
    expect(r).toEqual({ x0: 0, y0: 0, x1: 0, y1: 0 })
  })
})

describe('drawCells', () => {
  const pattern = patternOf(['0.1', '2.0'])

  it('lays fabric under the whole range, then paints only the stitched cells', () => {
    const ctx = new FakeContext()
    drawCells(ctx, {
      pattern,
      fills: FILLS,
      background: BG,
      range: ALL(pattern),
      showColour: true,
      bleed: 0
    })

    const [fabric, ...cells] = ctx.rects
    expect(fabric).toEqual({ x: 0, y: 0, w: 3, h: 2, fill: BG })
    // Four stitches, at the four non-'.' positions, each with its palette colour.
    expect(cells).toEqual([
      { x: 0, y: 0, w: 1, h: 1, fill: '#ff0000' },
      { x: 2, y: 0, w: 1, h: 1, fill: '#00ff00' },
      { x: 0, y: 1, w: 1, h: 1, fill: '#0000ff' },
      { x: 2, y: 1, w: 1, h: 1, fill: '#ff0000' }
    ])
  })

  it('leaves transparent cells as bare fabric — no stitch is drawn over them', () => {
    const ctx = new FakeContext()
    drawCells(ctx, {
      pattern,
      fills: FILLS,
      background: BG,
      range: ALL(pattern),
      showColour: true,
      bleed: 0
    })
    const stitched = ctx.rects.slice(1)
    expect(stitched).toHaveLength(4)
    expect(stitched.some((r) => r.x === 1)).toBe(false)
  })

  it('draws fabric only, no stitches, in symbol-only mode', () => {
    const ctx = new FakeContext()
    drawCells(ctx, {
      pattern,
      fills: FILLS,
      background: BG,
      range: ALL(pattern),
      showColour: false,
      bleed: 0
    })
    expect(ctx.rects).toEqual([{ x: 0, y: 0, w: 3, h: 2, fill: BG }])
  })

  it('overdraws each cell by the bleed, so neighbours overlap instead of leaving a seam', () => {
    const ctx = new FakeContext()
    drawCells(ctx, {
      pattern,
      fills: FILLS,
      background: BG,
      range: ALL(pattern),
      showColour: true,
      bleed: 0.25
    })
    for (const cell of ctx.rects.slice(1)) {
      expect(cell.w).toBe(1.25)
      expect(cell.h).toBe(1.25)
    }
    // The fabric underneath is not bled — it is already exactly the range.
    expect(ctx.rects[0].w).toBe(3)
  })

  it('draws only the cells in range when the view is culled', () => {
    const ctx = new FakeContext()
    drawCells(ctx, {
      pattern,
      fills: FILLS,
      background: BG,
      range: { x0: 2, y0: 0, x1: 3, y1: 2 },
      showColour: true,
      bleed: 0
    })
    expect(ctx.rects.slice(1)).toEqual([
      { x: 2, y: 0, w: 1, h: 1, fill: '#00ff00' },
      { x: 2, y: 1, w: 1, h: 1, fill: '#ff0000' }
    ])
  })
})

describe('cellBleed', () => {
  it('is half a device pixel, in cell units', () => {
    expect(cellBleed(16)).toBeCloseTo(0.03125)
    expect(cellBleed(1)).toBe(0.5)
  })

  it('is zero at a degenerate scale rather than Infinity', () => {
    expect(cellBleed(0)).toBe(0)
  })
})

describe('drawOverlay', () => {
  const pattern = patternOf(['0.1', '2.0'])
  const base = {
    pattern,
    range: ALL(pattern),
    glyphs: GLYPHS,
    inks: ['#000000', '#ffffff', '#000000'],
    gridColour: 'rgba(0,0,0,0.18)',
    gridMajorColour: 'rgba(0,0,0,0.45)'
  }

  it('centres one glyph in each stitched cell, in that colour’s ink', () => {
    const ctx = new FakeContext()
    drawOverlay(ctx, { ...base, scale: 16, showSymbols: true })
    expect(ctx.glyphs).toEqual([
      { text: '×', x: 0.5, y: 0.5, fill: '#000000' },
      { text: '○', x: 2.5, y: 0.5, fill: '#ffffff' },
      { text: '■', x: 0.5, y: 1.5, fill: '#000000' },
      { text: '×', x: 2.5, y: 1.5, fill: '#000000' }
    ])
    expect(ctx.textAlign).toBe('center')
    expect(ctx.textBaseline).toBe('middle')
  })

  it('sizes the glyph in cell units, so the stage transform scales it', () => {
    const ctx = new FakeContext()
    drawOverlay(ctx, { ...base, scale: 16, showSymbols: true })
    expect(ctx.font).toBe('0.72px DejaVu Sans, Segoe UI Symbol, Arial, sans-serif')
  })

  it('draws no glyph over a transparent cell', () => {
    const ctx = new FakeContext()
    drawOverlay(ctx, { ...base, scale: 16, showSymbols: true })
    expect(ctx.glyphs).toHaveLength(4)
    expect(ctx.glyphs.every((g) => g.x !== 1.5)).toBe(true)
  })

  it('skips symbols in colour-only mode but keeps the grid', () => {
    const ctx = new FakeContext()
    drawOverlay(ctx, { ...base, scale: 16, showSymbols: false })
    expect(ctx.glyphs).toEqual([])
    expect(ctx.lines.length).toBeGreaterThan(0)
  })

  it('drops symbols below the legibility cutoff, where they would be sub-4px mush', () => {
    const ctx = new FakeContext()
    drawOverlay(ctx, { ...base, scale: 5, showSymbols: true })
    expect(ctx.glyphs).toEqual([])
  })

  it('drops the grid when cells get smaller than the lines separating them', () => {
    const ctx = new FakeContext()
    drawOverlay(ctx, { ...base, scale: 4, showSymbols: true })
    expect(ctx.lines).toEqual([])
  })

  it('rules a line on every cell boundary, both axes', () => {
    const ctx = new FakeContext()
    drawOverlay(ctx, { ...base, scale: 16, showSymbols: false })
    // 3×2 cells → 4 vertical + 3 horizontal boundaries.
    const vertical = ctx.lines.filter((l) => l.from[0] === l.to[0])
    const horizontal = ctx.lines.filter((l) => l.from[1] === l.to[1])
    expect(vertical.map((l) => l.from[0]).sort()).toEqual([0, 1, 2, 3])
    expect(horizontal.map((l) => l.from[1]).sort()).toEqual([0, 1, 2])
  })

  it('scales hairlines down by the zoom, so a line stays ~1px however far you zoom in', () => {
    const ctx = new FakeContext()
    drawOverlay(ctx, { ...base, scale: 20, showSymbols: false })
    const minor = ctx.lines.find((l) => l.stroke === base.gridColour)!
    expect(minor.width).toBeCloseTo(1 / 20)
  })

  it('rules a heavier line every 10 cells, so stitches can be counted', () => {
    const big = patternOf(Array(21).fill('0'.repeat(21)))
    const ctx = new FakeContext()
    drawOverlay(ctx, {
      ...base,
      pattern: big,
      range: ALL(big),
      scale: 16,
      showSymbols: false
    })
    const majors = ctx.lines.filter((l) => l.stroke === base.gridMajorColour)
    const majorVertical = majors.filter((l) => l.from[0] === l.to[0]).map((l) => l.from[0])
    expect([...new Set(majorVertical)].sort((a, b) => a - b)).toEqual([0, 10, 20])
    expect(majors[0].width).toBeGreaterThan(
      ctx.lines.find((l) => l.stroke === base.gridColour)!.width
    )
  })

  it('strokes minor and major lines as two batched paths, not one path per line', () => {
    const ctx = new FakeContext()
    drawOverlay(ctx, { ...base, scale: 16, showSymbols: false })
    expect(ctx.strokes).toBe(2)
  })
})

describe('contrastInk', () => {
  it('inks white on a dark floss and black on a light one', () => {
    expect(contrastInk({ r: 0, g: 0, b: 0 })).toBe('#ffffff')
    expect(contrastInk({ r: 26, g: 32, b: 84 })).toBe('#ffffff') // DMC 823, navy blue
    expect(contrastInk({ r: 255, g: 255, b: 255 })).toBe('#000000')
    expect(contrastInk({ r: 242, g: 236, b: 220 })).toBe('#000000') // unbleached Aida
  })

  it('weighs green far above blue, as perceived brightness does', () => {
    // Pure blue is dark despite a maxed channel; pure green is bright.
    expect(contrastInk({ r: 0, g: 0, b: 255 })).toBe('#ffffff')
    expect(contrastInk({ r: 0, g: 255, b: 0 })).toBe('#000000')
  })

  it('flips below mid-grey, where a naive 50% threshold would pick the worse ink', () => {
    // Solving onBlack === onWhite gives luminance 0.1791, i.e. sRGB ≈ 117.4 — so greys
    // 118..127 want black ink even though they sit under 50%. Thresholding at 128 would
    // ink them white and lose contrast.
    expect(contrastInk({ r: 117, g: 117, b: 117 })).toBe('#ffffff')
    expect(contrastInk({ r: 118, g: 118, b: 118 })).toBe('#000000')
    expect(contrastInk({ r: 127, g: 127, b: 127 })).toBe('#000000')
  })
})

describe('rgbToCss / cssToRgb', () => {
  it('round-trips a colour through the form <input type="color"> speaks', () => {
    const rgb = { r: 242, g: 236, b: 220 }
    expect(rgbToCss(rgb)).toBe('#f2ecdc')
    expect(cssToRgb('#f2ecdc')).toEqual(rgb)
  })

  it('pads single-digit channels, so #0a0b0c does not collapse to #abc', () => {
    expect(rgbToCss({ r: 10, g: 11, b: 12 })).toBe('#0a0b0c')
    expect(cssToRgb('#0a0b0c')).toEqual({ r: 10, g: 11, b: 12 })
  })

  it('clamps out-of-gamut channels rather than emitting a malformed colour', () => {
    expect(rgbToCss({ r: -5, g: 300, b: 127.6 })).toBe('#00ff80')
  })
})
