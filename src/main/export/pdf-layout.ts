/**
 * Chart page geometry (§5.5) — millimetres first, points second.
 *
 * **Why physical units, when pdf-lib speaks points?** Because §5.3's entire legibility case
 * is stated physically: a glyph must read at ~5pt in a ~2.36mm cell. A layout expressed in
 * "55 stitches to a page" (as the prototype's `chart.py` is) has no physical size at all —
 * it has whatever size the page happens to give it. You cannot falsify "legible at 5pt"
 * against a chart that does not know how big it is, so #28's verdict against such a chart
 * would be worthless. Everything here is therefore derived from millimetres, and converted
 * to points only at the point of drawing.
 *
 * **Where 2.36mm comes from** — it is not a magic number, it is a consequence. Take A4
 * (210mm), take 20mm margins, and you have 170mm of printable width. Put the reference
 * Wesnoth sprite (72 cells wide) across it and each cell is 170/72 = 2.361mm, which at
 * 72pt/inch is a 6.69pt cell carrying a ~4.8pt glyph. That is the number §5.3 and #28 are
 * both quoting, and `DEFAULT_CELL_MM` recomputes it rather than hardcoding it — so if the
 * page or the margins ever change, the quoted figure changes with them instead of quietly
 * becoming a lie.
 */

export const MM_PER_INCH = 25.4
export const PT_PER_INCH = 72

/** Millimetres → PDF points, the only unit pdf-lib will take. */
export function mmToPt(mm: number): number {
  return (mm * PT_PER_INCH) / MM_PER_INCH
}

export const A4_WIDTH_MM = 210
export const A4_HEIGHT_MM = 297

/** Generous, and deliberately so: the row/column rulers are drawn in the margin. */
export const MARGIN_MM = 20

export const PRINTABLE_WIDTH_MM = A4_WIDTH_MM - 2 * MARGIN_MM // 170
export const PRINTABLE_HEIGHT_MM = A4_HEIGHT_MM - 2 * MARGIN_MM // 257

/** Space above the grid for the "Rows … / Cols …" tile heading. */
export const TITLE_BAND_MM = 8

export const CHART_HEIGHT_MM = PRINTABLE_HEIGHT_MM - TITLE_BAND_MM // 249

/**
 * The reference sprite width §5.3 quotes its legibility figures against: a 72-cell Wesnoth
 * unit sprite, which is the overwhelmingly common size in the checkout.
 */
export const REFERENCE_SPRITE_CELLS = 72

/**
 * ~2.361mm. The scale at which the reference sprite fits across one page — and so the
 * smallest cell the chart will normally ever print at, which is exactly why §5.3 states its
 * legibility claim here rather than somewhere more comfortable.
 */
export const DEFAULT_CELL_MM = PRINTABLE_WIDTH_MM / REFERENCE_SPRITE_CELLS

/**
 * Glyph height as a fraction of the cell. 0.72 puts a `DEFAULT_CELL_MM` cell's glyph at
 * ~4.8pt — the figure §5.3 and #28 quote, so this constant is load-bearing for their
 * argument, not a styling preference.
 */
export const GLYPH_SCALE = 0.72

/** Font size, in points, for a glyph in a `cellMm` cell. */
export function glyphSizePt(cellMm: number): number {
  return mmToPt(cellMm) * GLYPH_SCALE
}

/** A half-open rectangle of cells: columns `[x0, x1)`, rows `[y0, y1)`. */
export interface Tile {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** How many whole cells of `cellMm` fit across the printable width / chart height. */
export function cellsPerPage(cellMm: number): { cols: number; rows: number } {
  if (!(cellMm > 0) || !Number.isFinite(cellMm)) {
    throw new RangeError(`cellMm must be a positive, finite number of millimetres, got ${cellMm}`)
  }
  const cols = Math.floor(PRINTABLE_WIDTH_MM / cellMm)
  const rows = Math.floor(CHART_HEIGHT_MM / cellMm)
  if (cols < 1 || rows < 1) {
    throw new RangeError(`cellMm ${cellMm} is larger than the printable area — no cell fits`)
  }
  return { cols, rows }
}

/**
 * Cut a `width × height` pattern into page-sized tiles, reading order (rows of tiles, each
 * left to right) — so printing the PDF and stacking the pages gives you the chart in order.
 *
 * Tiles do **not** overlap: a stitch on a seam appears on exactly one page. Whether they
 * *should* overlap by a row, so pages can be aligned by eye, is deliberately still open —
 * see the M3 breakdown's Q1. It is a change to this function and nothing else.
 */
export function planTiles(width: number, height: number, cellMm: number): Tile[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`pattern must be at least 1×1 whole cells, got ${width}×${height}`)
  }
  const { cols, rows } = cellsPerPage(cellMm)

  const tiles: Tile[] = []
  for (let y0 = 0; y0 < height; y0 += rows) {
    for (let x0 = 0; x0 < width; x0 += cols) {
      tiles.push({
        x0,
        y0,
        x1: Math.min(x0 + cols, width),
        y1: Math.min(y0 + rows, height)
      })
    }
  }
  return tiles
}
