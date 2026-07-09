/**
 * Canvas drawing for the pattern grid (§5.4).
 *
 * **Why these are plain functions over a 2D context and not Konva nodes.** Design §5.4
 * specifies one Konva `Rect` per source pixel and asserts that at Wesnoth sprite sizes
 * this is "nowhere near a performance concern — no virtualization needed for v1". That
 * assertion predates any of this code, and it is wrong. Measured in Electron on a 72×72
 * grid (5,184 cells, the size of a typical unit sprite), median of 10 draws:
 *
 * |                                   | node-per-cell | one shape, this module |
 * |-----------------------------------|--------------:|-----------------------:|
 * | build                             |       87.3 ms |                 3.7 ms |
 * | recolour every cell + redraw      |       12.9 ms |                 1.9 ms |
 * | redraw, nothing changed           |       10.9 ms |                      — |
 * | zoom step                         |       14.5 ms |                 2.1 ms |
 * | symbol overlay redraw             |       55.5 ms |                 2.6 ms |
 *
 * A 10.9 ms floor to redraw an *unchanged* layer already eats two thirds of a 16.7 ms
 * frame before React or the ~1.9 ms conversion (#17) get a turn, so the live colour
 * slider (#19) could not have hit 60 fps on top of it. The symbol layer is worse:
 * 3,631 `Konva.Text` nodes cost 55.5 ms a redraw — 18 fps, panning a static chart.
 * Collapsing each layer to a single `Konva.Shape` whose `sceneFunc` loops `fillRect` /
 * `fillText` removes the per-node overhead and leaves the grid ~6× (colour) to ~21×
 * (symbols) cheaper, with the whole frame back under budget.
 *
 * Keeping the loops here, behind a structural `DrawContext` rather than `Konva.Context`,
 * is what lets them be unit-tested against a recording fake in the existing node-env
 * vitest — no jsdom, no canvas, no component harness.
 */
import type { RGB } from '../../../shared/colour'
import type { StitchPattern } from '../../../shared/pipeline'

/**
 * Font stack for chart symbols. The glyph set (#16) was deliberately confined to Basic
 * Latin, Latin-1 `×`, Geometric Shapes and `☆` — ranges these three fonts all cover —
 * so the overlay never falls back to tofu on any of the three target platforms.
 */
export const CHART_FONT = 'DejaVu Sans, Segoe UI Symbol, Arial, sans-serif'

/** Glyph height as a fraction of a cell. Leaves a little air so adjacent glyphs don't touch. */
const GLYPH_SIZE = 0.72

/** Below this zoom (px per cell) glyphs are smaller than ~4px and read as noise, so we skip them. */
export const MIN_SYMBOL_SCALE = 6

/** Below this zoom the grid lines would be denser than the cells they separate. */
const MIN_GRID_SCALE = 5

/** Cross-stitch charts rule a heavier line every 10 cells, so you can count without losing your place. */
const MAJOR_GRID_EVERY = 10

/**
 * The subset of `CanvasRenderingContext2D` these functions touch. Declared structurally
 * so `Konva.Context` satisfies it without this module importing Konva, and so tests can
 * pass a recording fake.
 */
export interface DrawContext {
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  lineWidth: number
  fillRect(x: number, y: number, width: number, height: number): void
  fillText(text: string, x: number, y: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  stroke(): void
}

/** A half-open range of cells `[x0, x1) × [y0, y1)`, in source-pixel coordinates. */
export interface CellRange {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** The stage's current transform, in screen pixels. `scale` is pixels per cell. */
export interface View {
  scale: number
  offsetX: number
  offsetY: number
  width: number
  height: number
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n))

/**
 * The cells currently inside the viewport, clamped to the pattern.
 *
 * Culling matters because zoom is unbounded above: at 40 px per cell a 72×72 pattern is
 * 2,880 px square and only a few hundred of its 5,184 cells are on screen, so a full
 * redraw per pan frame would be almost entirely wasted `fillText` calls.
 */
export function visibleCellRange(pattern: StitchPattern, view: View): CellRange {
  if (!(view.scale > 0)) return { x0: 0, y0: 0, x1: 0, y1: 0 }
  return {
    x0: clamp(Math.floor(-view.offsetX / view.scale), 0, pattern.width),
    x1: clamp(Math.ceil((view.width - view.offsetX) / view.scale), 0, pattern.width),
    y0: clamp(Math.floor(-view.offsetY / view.scale), 0, pattern.height),
    y1: clamp(Math.ceil((view.height - view.offsetY) / view.scale), 0, pattern.height)
  }
}

/**
 * Half a device pixel, in cell units.
 *
 * At a fractional zoom a cell's edges land mid-pixel, and the canvas antialiases each
 * `fillRect` against what is already there — leaving a faint seam of background between
 * neighbours, which reads as an unwanted grid. Overdrawing each cell by half a device
 * pixel makes neighbours overlap on the seam instead of meeting at it.
 */
export const cellBleed = (scale: number): number => (scale > 0 ? 0.5 / scale : 0)

export interface CellsOptions {
  pattern: StitchPattern
  /** CSS colour per palette index, index-aligned with `QuantizedPalette.colours`. */
  fills: string[]
  /** CSS fabric colour. Every "no stitch" cell is this. */
  background: string
  range: CellRange
  /** False in symbol-only mode, where the chart is glyphs on blank fabric. */
  showColour: boolean
  bleed: number
}

/**
 * Fills the colour layer: fabric everywhere, then one `fillRect` per stitched cell.
 *
 * Painting the background as a single rect first means transparent cells cost nothing,
 * which is most of a Wesnoth sprite — they sit inside the unit's bounding box but
 * outside its silhouette.
 */
export function drawCells(ctx: DrawContext, o: CellsOptions): void {
  const { range: r } = o
  ctx.fillStyle = o.background
  ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0)
  if (!o.showColour) return

  const size = 1 + o.bleed
  for (let y = r.y0; y < r.y1; y++) {
    const row = o.pattern.cells[y]
    for (let x = r.x0; x < r.x1; x++) {
      const i = row[x]
      if (i === null) continue
      ctx.fillStyle = o.fills[i]
      ctx.fillRect(x, y, size, size)
    }
  }
}

export interface OverlayOptions {
  pattern: StitchPattern
  range: CellRange
  /** Pixels per cell. Drives hairline width and the legibility cutoffs. */
  scale: number
  /** Chart symbol per palette index, index-aligned with `QuantizedPalette.colours`. */
  glyphs: string[]
  /** Ink colour per palette index — chosen to contrast with whatever is behind the glyph. */
  inks: string[]
  showSymbols: boolean
  gridColour: string
  gridMajorColour: string
}

/**
 * Draws the overlay layer: cell grid, then symbols.
 *
 * The grid is not decoration. In symbol-only mode it is the only thing separating one
 * stitch from the next, and every printed cross-stitch chart has one.
 */
export function drawOverlay(ctx: DrawContext, o: OverlayOptions): void {
  const { range: r, scale } = o
  if (scale >= MIN_GRID_SCALE) drawGrid(ctx, o)

  if (!o.showSymbols || scale < MIN_SYMBOL_SCALE) return
  ctx.font = `${GLYPH_SIZE}px ${CHART_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let y = r.y0; y < r.y1; y++) {
    const row = o.pattern.cells[y]
    for (let x = r.x0; x < r.x1; x++) {
      const i = row[x]
      if (i === null) continue
      ctx.fillStyle = o.inks[i]
      ctx.fillText(o.glyphs[i], x + 0.5, y + 0.5)
    }
  }
}

/**
 * One stroked path for the minor lines and one for the major, rather than a path per
 * line: each `stroke()` is a rasterizer pass, and there are up to 2·(w+h) lines.
 */
function drawGrid(ctx: DrawContext, o: OverlayOptions): void {
  const { range: r } = o
  const isMajor = (n: number): boolean => n % MAJOR_GRID_EVERY === 0

  for (const major of [false, true]) {
    ctx.lineWidth = (major ? 1.6 : 1) / o.scale
    ctx.strokeStyle = major ? o.gridMajorColour : o.gridColour
    ctx.beginPath()
    for (let x = r.x0; x <= r.x1; x++) {
      if (isMajor(x) !== major) continue
      ctx.moveTo(x, r.y0)
      ctx.lineTo(x, r.y1)
    }
    for (let y = r.y0; y <= r.y1; y++) {
      if (isMajor(y) !== major) continue
      ctx.moveTo(r.x0, y)
      ctx.lineTo(r.x1, y)
    }
    ctx.stroke()
  }
}

/**
 * Black or white, whichever a glyph needs to stay readable on `bg`.
 *
 * A chart symbol is the only thing distinguishing two floss colours on a black-and-white
 * print (§5.3), so it cannot be allowed to disappear into a dark navy or a pale cream.
 * Compares WCAG contrast ratios against the two ink choices rather than thresholding
 * luminance, which gets the near-mid greys right.
 */
export function contrastInk(bg: RGB): string {
  const l = relativeLuminance(bg)
  const onWhite = 1.05 / (l + 0.05)
  const onBlack = (l + 0.05) / 0.05
  return onBlack >= onWhite ? '#000000' : '#ffffff'
}

/** WCAG 2.x relative luminance of an 8-bit sRGB colour. */
function relativeLuminance({ r, g, b }: RGB): number {
  const lin = (c: number): number => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
