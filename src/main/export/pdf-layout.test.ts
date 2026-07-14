/**
 * Chart geometry (#34, §5.5).
 *
 * The load-bearing test here is the first one: §5.3 and #28 both quote "2.36mm per cell,
 * ~4.8pt glyph" as *the* scale the legibility argument is made at. If the layout stops
 * producing those numbers, the argument is being made about a chart we no longer print,
 * and #28's verdict silently stops applying. So they are pinned.
 */
import { describe, expect, it } from 'vitest'
import {
  A4_WIDTH_MM,
  cellsPerPage,
  CHART_HEIGHT_MM,
  DEFAULT_CELL_MM,
  glyphSizePt,
  mmToPt,
  planTiles,
  PRINTABLE_WIDTH_MM,
  REFERENCE_SPRITE_CELLS
} from './pdf-layout'

describe('the scale §5.3 states its legibility claim at', () => {
  it('puts the reference 72-cell sprite across A4 at ~2.36mm per cell', () => {
    expect(DEFAULT_CELL_MM).toBeCloseTo(2.36, 2)
  })

  it('puts that cell’s glyph at ~4.8pt', () => {
    expect(glyphSizePt(DEFAULT_CELL_MM)).toBeCloseTo(4.8, 1)
  })

  it('derives the cell from the page, so the quoted figure cannot drift from the layout', () => {
    // Not a tautology worth skipping: it is the assertion that 2.36 is a *consequence* of
    // A4 + 20mm margins + a 72-cell sprite, and not a constant someone typed in.
    expect(DEFAULT_CELL_MM).toBe(PRINTABLE_WIDTH_MM / REFERENCE_SPRITE_CELLS)
    expect(PRINTABLE_WIDTH_MM).toBe(A4_WIDTH_MM - 40)
  })

  it('fits the whole reference sprite on a single page at that scale', () => {
    // The point of choosing this scale: a typical Wesnoth sprite is one chart page.
    const { cols, rows } = cellsPerPage(DEFAULT_CELL_MM)
    expect(cols).toBe(REFERENCE_SPRITE_CELLS)
    expect(rows).toBeGreaterThanOrEqual(REFERENCE_SPRITE_CELLS)
    expect(planTiles(72, 72, DEFAULT_CELL_MM)).toHaveLength(1)
  })
})

describe('mmToPt', () => {
  it('converts on the 72pt/inch, 25.4mm/inch definitions', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 10)
    expect(mmToPt(0)).toBe(0)
  })
})

describe('cellsPerPage', () => {
  it('fits whole cells only — a part-cell would print clipped', () => {
    const { cols, rows } = cellsPerPage(10)
    expect(cols).toBe(17) // 170mm / 10mm
    expect(rows).toBe(Math.floor(CHART_HEIGHT_MM / 10))
  })

  it.each([0, -1, NaN, Infinity])('rejects cellMm %p', (mm) => {
    expect(() => cellsPerPage(mm)).toThrow(RangeError)
  })

  it('rejects a cell too big to fit the page at all', () => {
    expect(() => cellsPerPage(PRINTABLE_WIDTH_MM + 1)).toThrow(/no cell fits/)
  })
})

describe('planTiles', () => {
  it('covers every cell exactly once, with no gaps and no overlap', () => {
    // The property that matters. A tiling that double-prints a seam row, or drops one,
    // yields a chart you cannot stitch from — and both are easy to write by accident.
    const [width, height] = [50, 40]
    const tiles = planTiles(width, height, 10) // 17×24 cells per page → 3×2 tiles

    const seen = new Map<string, number>()
    for (const t of tiles) {
      for (let y = t.y0; y < t.y1; y++) {
        for (let x = t.x0; x < t.x1; x++) {
          const key = `${x},${y}`
          seen.set(key, (seen.get(key) ?? 0) + 1)
        }
      }
    }

    expect(seen.size, 'every cell appears').toBe(width * height)
    expect([...seen.values()].every((n) => n === 1), 'no cell appears twice').toBe(true)
  })

  it('emits tiles in reading order, so printed pages stack in order', () => {
    // 10mm cells → 17 cols and 24 rows per page, so a 30×30 pattern is 2×2 tiles.
    // Across first, then down — the order you would lay the printed sheets out in.
    const tiles = planTiles(30, 30, 10)
    expect(tiles.map((t) => [t.x0, t.y0])).toEqual([
      [0, 0],
      [17, 0],
      [0, 24],
      [17, 24]
    ])
  })

  it('clamps the last tile to the pattern rather than running past it', () => {
    const tiles = planTiles(20, 5, 10) // 17 cols/page
    expect(tiles.at(-1)).toEqual({ x0: 17, y0: 0, x1: 20, y1: 5 })
  })

  it('returns a single tile when the pattern fits on one page', () => {
    expect(planTiles(10, 10, 10)).toEqual([{ x0: 0, y0: 0, x1: 10, y1: 10 }])
  })

  it.each([
    [0, 5],
    [5, 0],
    [1.5, 5]
  ])('rejects a %p×%p pattern', (w, h) => {
    expect(() => planTiles(w, h, 10)).toThrow(RangeError)
  })
})
