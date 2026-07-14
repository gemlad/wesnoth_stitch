/**
 * The tiled chart pages (§5.5, #34) — the pages you actually stitch from.
 *
 * Three things this does that the prototype's `chart.py` does not, each of them the point
 * of the port rather than incidental:
 *
 * 1. **Glyphs come from `symbolsFor()`, and running out is an error.** `chart.py:57` does
 *    `SYMBOLS[i % len(SYMBOLS)]`, silently handing two floss colours the *same* glyph once
 *    it passes the end of its list. On a black-and-white chart the glyph is the only thing
 *    telling two colours apart, so that is not a graceful degradation — it is a chart that
 *    lies. `symbolsFor` throws instead, and the slider's cap (§5.3) means it never has to.
 * 2. **Cells have a physical size** (see `pdf-layout`), so "legible at 5pt" is a claim you
 *    can take to a printer and check.
 * 3. **Glyphs are vector text in an embedded font**, not raster. A rasterised 4.8pt glyph
 *    is a smudge; that is the whole reason §3 rejects `printToPDF` and canvas-based PDF.
 */
import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib'
import { rgb } from 'pdf-lib'
import { contrastInk, type RGB } from '../../shared/colour'
import type { PatternSettings } from '../../shared/ipc'
import { symbolsFor, type QuantizedPalette, type StitchPattern } from '../../shared/pipeline'
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  DEFAULT_CELL_MM,
  glyphSizePt,
  MARGIN_MM,
  mmToPt,
  planTiles,
  TITLE_BAND_MM,
  type Tile
} from './pdf-layout'

/** Every 10th gridline is heavy — the convention every commercial chart uses to count by. */
const MAJOR_EVERY = 10
const MINOR_LINE_PT = 0.2
const MAJOR_LINE_PT = 0.7
const RULER_FONT_PT = 6
const TITLE_FONT_PT = 9

export interface ChartOptions extends PatternSettings {
  /** Physical cell size. Defaults to the §5.3 reference scale (~2.36mm). */
  cellMm?: number
}

/** pdf-lib wants 0–1 components; the rest of the app speaks 0–255. */
function toPdfRgb({ r, g, b }: RGB): ReturnType<typeof rgb> {
  return rgb(r / 255, g / 255, b / 255)
}

/** `contrastInk` returns `#000000`/`#ffffff`; the chart needs it as a pdf-lib colour. */
function inkFor(background: RGB): ReturnType<typeof rgb> {
  return contrastInk(background) === '#000000' ? rgb(0, 0, 0) : rgb(1, 1, 1)
}

/**
 * Draw one tile onto `page`.
 *
 * PDF's origin is bottom-left and the pattern's is top-left, so every row is flipped as it
 * is placed — `cells[y][x]` with y counted from the top lands at a PDF y counted from the
 * bottom. Getting this wrong produces a vertically mirrored chart that still looks like a
 * plausible sprite, which is exactly the sort of bug a dimensions-only test sails past.
 */
function drawTile(
  page: PDFPage,
  tile: Tile,
  pattern: StitchPattern,
  palette: QuantizedPalette,
  font: PDFFont,
  options: Required<ChartOptions>
): void {
  const { cellMm, backgroundColour, symbolDisplay } = options
  const cell = mmToPt(cellMm)
  const cols = tile.x1 - tile.x0
  const rows = tile.y1 - tile.y0

  const showColour = symbolDisplay === 'colour' || symbolDisplay === 'both'
  const showSymbol = symbolDisplay === 'symbol' || symbolDisplay === 'both'

  const symbols = symbolsFor(palette)
  const glyphPt = glyphSizePt(cellMm)

  // Grid's top-left corner, in PDF coordinates (origin bottom-left). The grid hangs below
  // the top margin and the title band; it grows downward from there.
  const left = mmToPt(MARGIN_MM)
  const gridTop = mmToPt(A4_HEIGHT_MM - MARGIN_MM - TITLE_BAND_MM)
  const gridBottom = gridTop - rows * cell

  // 1. Cells.
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = pattern.cells[tile.y0 + row][tile.x0 + col]
      const x = left + col * cell
      const y = gridTop - (row + 1) * cell // +1: pdf rects are drawn from their bottom edge

      const colour = index === null ? backgroundColour : palette.colours[index]?.rgb
      if (colour === undefined) {
        throw new RangeError(
          `Cell (${tile.x0 + col}, ${tile.y0 + row}) indexes palette colour ${index}, ` +
            `but the palette has ${palette.colours.length}`
        )
      }

      if (showColour) {
        page.drawRectangle({ x, y, width: cell, height: cell, color: toPdfRgb(colour) })
      }

      // A no-stitch cell gets no glyph: there is no floss there to name.
      if (showSymbol && index !== null) {
        const glyph = symbols[index].glyph
        // In `symbol` mode the cell is bare paper, so the ink must contrast with the
        // *fabric*; in `both` mode it sits on the floss colour. Same call the preview
        // makes (§5.3), so the export cannot pick an ink the preview would not have.
        const ink = inkFor(showColour ? colour : backgroundColour)
        const w = font.widthOfTextAtSize(glyph, glyphPt)
        page.drawText(glyph, {
          x: x + (cell - w) / 2,
          // Centre on the cap-height box rather than the baseline, or every glyph sits low.
          y: y + (cell - font.heightAtSize(glyphPt, { descender: false })) / 2,
          size: glyphPt,
          font,
          color: ink
        })
      }
    }
  }

  // 2. Gridlines, drawn over the cells so they are not half-covered by them.
  const line = rgb(0, 0, 0)
  for (let col = 0; col <= cols; col++) {
    const absolute = tile.x0 + col
    const x = left + col * cell
    page.drawLine({
      start: { x, y: gridTop },
      end: { x, y: gridBottom },
      thickness: absolute % MAJOR_EVERY === 0 ? MAJOR_LINE_PT : MINOR_LINE_PT,
      color: line,
      opacity: 0.6
    })
  }
  for (let row = 0; row <= rows; row++) {
    const absolute = tile.y0 + row
    const y = gridTop - row * cell
    page.drawLine({
      start: { x: left, y },
      end: { x: left + cols * cell, y },
      thickness: absolute % MAJOR_EVERY === 0 ? MAJOR_LINE_PT : MINOR_LINE_PT,
      color: line,
      opacity: 0.6
    })
  }

  // 3. Rulers, in the margin, every 10 cells — so you can find your place after a break.
  for (let col = 0; col <= cols; col++) {
    const absolute = tile.x0 + col
    if (absolute % MAJOR_EVERY !== 0 || col === cols) continue
    page.drawText(String(absolute), {
      x: left + col * cell + 1,
      y: gridTop + 3,
      size: RULER_FONT_PT,
      font,
      color: line
    })
  }
  for (let row = 0; row <= rows; row++) {
    const absolute = tile.y0 + row
    if (absolute % MAJOR_EVERY !== 0 || row === rows) continue
    const label = String(absolute)
    page.drawText(label, {
      x: left - font.widthOfTextAtSize(label, RULER_FONT_PT) - 3,
      y: gridTop - row * cell - RULER_FONT_PT,
      size: RULER_FONT_PT,
      font,
      color: line
    })
  }

  // 4. Heading, so a loose page can be put back in its place.
  page.drawText(
    `Rows ${tile.y0}–${tile.y1} / Cols ${tile.x0}–${tile.x1}`,
    {
      x: left,
      y: mmToPt(A4_HEIGHT_MM - MARGIN_MM) - TITLE_FONT_PT,
      size: TITLE_FONT_PT,
      font,
      color: line
    }
  )
}

/**
 * Append the chart pages for `pattern` to `pdf`, one page per tile, in reading order.
 *
 * @returns the pages added, so the caller (#35) can count them.
 * @throws RangeError if the palette holds more colours than there are stitch symbols —
 * via `symbolsFor`. See the module note: a chart that reuses a glyph is a chart that lies.
 */
export function drawChartPages(
  pdf: PDFDocument,
  pattern: StitchPattern,
  palette: QuantizedPalette,
  font: PDFFont,
  options: ChartOptions
): PDFPage[] {
  const resolved: Required<ChartOptions> = { cellMm: DEFAULT_CELL_MM, ...options }
  const tiles = planTiles(pattern.width, pattern.height, resolved.cellMm)

  return tiles.map((tile) => {
    const page = pdf.addPage([mmToPt(A4_WIDTH_MM), mmToPt(A4_HEIGHT_MM)])
    drawTile(page, tile, pattern, palette, font, resolved)
    return page
  })
}
