/**
 * Centre markers on the chart (#54) — the convention that lets a stitcher start from the
 * middle and count outward instead of from a corner.
 *
 * Three marks: an arrow at the centre of the top edge (mid-column), an arrow at the centre of
 * the left edge (mid-row), and a diamond on the true centre cell (mid-row × mid-column).
 *
 * On a multi-page chart the centre column and centre row can land on different pages, so which
 * marks a page carries is decided per tile. `centreMarksForTile` is that pure decision, split
 * out so the "which page" logic — the part the issue warns about — is unit-tested apart from
 * pdf-lib drawing.
 */
import type { PDFPage } from 'pdf-lib'
import { rgb } from 'pdf-lib'
import type { StitchPattern } from '../../shared/pipeline'
import { mmToPt, type Tile } from './pdf-layout'

const MARK_INK = rgb(0, 0, 0)
const ARROW_ARM_MM = 2.4 // half-width / height of the edge chevrons
const ARROW_WEIGHT_PT = 1.5
const CENTRE_WEIGHT_PT = 1.2

/** Which centre marks belong on a given tile, and where the pattern's centre is. */
export interface CentreMarks {
  centreCol: number
  centreRow: number
  /** Top-edge arrow: the tile holds the top edge and the centre column. */
  top: boolean
  /** Left-edge arrow: the tile holds the left edge and the centre row. */
  side: boolean
  /** True-centre diamond: the tile holds the centre cell. */
  centre: boolean
}

const inRange = (v: number, lo: number, hi: number): boolean => v >= lo && v < hi

/**
 * Decide which of the three centre marks `tile` should draw for `pattern`. The centre column
 * and row are `Math.floor(size / 2)` — the standard chart centre. On a single-page chart all
 * three land on the one tile; on a large chart each mark goes only on the page that contains
 * its edge/cell.
 */
export function centreMarksForTile(pattern: StitchPattern, tile: Tile): CentreMarks {
  const centreCol = Math.floor(pattern.width / 2)
  const centreRow = Math.floor(pattern.height / 2)
  const colInTile = inRange(centreCol, tile.x0, tile.x1)
  const rowInTile = inRange(centreRow, tile.y0, tile.y1)
  return {
    centreCol,
    centreRow,
    top: tile.y0 === 0 && colInTile,
    side: tile.x0 === 0 && rowInTile,
    centre: colInTile && rowInTile
  }
}

/** Grid geometry a tile was drawn against, in PDF points (origin bottom-left). */
export interface MarkerGeometry {
  /** Left edge of the grid. */
  left: number
  /** Top edge of the grid (its highest PDF y). */
  gridTop: number
  /** One cell, in points. */
  cell: number
}

/**
 * Draw the centre marks this tile carries. Arrows sit in the margin pointing into the grid;
 * the diamond outlines the centre cell so its stitch is still readable inside it.
 */
export function drawCentreMarks(
  page: PDFPage,
  marks: CentreMarks,
  tile: Tile,
  geom: MarkerGeometry
): void {
  const { left, gridTop, cell } = geom
  const arm = mmToPt(ARROW_ARM_MM)

  if (marks.top) {
    // Downward chevron at the grid's top edge, apex on the centre column, arms into the margin.
    const x = left + (marks.centreCol - tile.x0 + 0.5) * cell
    page.drawLine({
      start: { x: x - arm, y: gridTop + arm },
      end: { x, y: gridTop },
      thickness: ARROW_WEIGHT_PT,
      color: MARK_INK
    })
    page.drawLine({
      start: { x: x + arm, y: gridTop + arm },
      end: { x, y: gridTop },
      thickness: ARROW_WEIGHT_PT,
      color: MARK_INK
    })
  }

  if (marks.side) {
    // Rightward chevron at the grid's left edge, apex on the centre row, arms into the margin.
    const y = gridTop - (marks.centreRow - tile.y0 + 0.5) * cell
    page.drawLine({
      start: { x: left - arm, y: y - arm },
      end: { x: left, y },
      thickness: ARROW_WEIGHT_PT,
      color: MARK_INK
    })
    page.drawLine({
      start: { x: left - arm, y: y + arm },
      end: { x: left, y },
      thickness: ARROW_WEIGHT_PT,
      color: MARK_INK
    })
  }

  if (marks.centre) {
    // Diamond outlining the centre cell — points at the cell's edge midpoints, so the stitch
    // inside stays visible.
    const cx = left + (marks.centreCol - tile.x0 + 0.5) * cell
    const cy = gridTop - (marks.centreRow - tile.y0 + 0.5) * cell
    const r = cell * 0.7
    const n = { x: cx, y: cy + r }
    const e = { x: cx + r, y: cy }
    const s = { x: cx, y: cy - r }
    const w = { x: cx - r, y: cy }
    for (const [a, b] of [
      [n, e],
      [e, s],
      [s, w],
      [w, n]
    ] as const) {
      page.drawLine({ start: a, end: b, thickness: CENTRE_WEIGHT_PT, color: MARK_INK })
    }
  }
}
