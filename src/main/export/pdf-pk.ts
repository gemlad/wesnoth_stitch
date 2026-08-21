/**
 * The Pattern Keeper chart PDF (§5.5, #55) — the same pattern, laid out for a parser.
 *
 * Pattern Keeper is an Android app that imports a chart PDF and lets you tick stitches off on
 * a phone or tablet. It does not read a chart *format*; it reads the drawing operators in the
 * PDF and reconstructs the chart from them — it finds the gridlines, reads the glyph sitting
 * in each cell as **text**, and looks up what that glyph means in a key table it finds by its
 * column headings. That is the whole design constraint here, and it is a different one from
 * the printed chart's: `pdf.ts` is laid out for a person holding paper, this is laid out for
 * software reading operators.
 *
 * **So it is a second document, not a flag on the first.** #55 says the existing export must
 * not change, and that is the right call for more than compatibility: the two have genuinely
 * opposing requirements. The print chart earns its keep with a cover, a preview raster, colour
 * under the glyphs and centre markers over them — every one of which is either noise or an
 * outright trap for a parser looking for grids. What they *do* share is the geometry
 * (`pdf-layout`), so a cell is the same physical size in both and the tiling cannot drift.
 *
 * **What the layout commits to, and why:**
 *
 * - **No cover page.** The cover carries a raster preview of the pattern (#46). Pattern Keeper
 *   warns that preview grids get read "as part of the chart itself", and a chart it finds and
 *   you did not want is a grid you have to delete by hand on a phone. The document opens on
 *   the chart.
 * - **Symbols only, never colour.** Pattern Keeper takes its colours from the key's DMC codes
 *   and renders them itself, so a filled cell underneath the glyph tells it nothing it does
 *   not already know — while flooding every cell with a rectangle it has to see past.
 * - **Solid gridlines, no transparency.** The print chart strokes its grid at 60% opacity,
 *   which is an `ExtGState` alpha. A grey stroke is the same thing to the eye and one less
 *   construct between the parser and the line.
 * - **No centre markers.** The true-centre diamond (#54) is drawn *inside* a cell, where it
 *   is a second mark in a cell that should hold exactly one. Pattern Keeper tracks your place
 *   for you, which is the job the markers exist to do on paper.
 * - **The key's headings are `Symbol`, `Number`, `Name`, spelled exactly that way.** They are
 *   how the table is found at all; Pattern Keeper's own designer guidance is emphatic that the
 *   standard header names must be used. `Number` holds `DMC 310` rather than a bare `310` —
 *   the brand disambiguates it, exactly as the OXS export's `number` attribute does (§5.5).
 *
 * The attribution footer (#47) stays on every page: the licence asks for it regardless of who
 * the page was laid out for.
 */
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import {
  flipHorizontal,
  symbolsFor,
  type QuantizedPalette,
  type StitchPattern
} from '../../shared/pipeline'
import { drawLicenceFooter, drawPageNumber } from './pdf-footer'
import { drawRunningHead } from './pdf-header'
import { keyRows } from './pdf-key'
import type { ChartMeta } from './pdf-key'
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  DEFAULT_CELL_MM,
  glyphSizePt,
  MARGIN_MM,
  mmToPt,
  planTiles,
  PRINTABLE_HEIGHT_MM,
  TITLE_BAND_MM,
  type Tile
} from './pdf-layout'

export type { ChartMeta } from './pdf-key'

/**
 * The key table's column headings.
 *
 * **These strings are load-bearing, not labels.** Pattern Keeper locates the floss table by
 * matching them, so translating or prettifying them ("Colour", "DMC", "Shade") does not make a
 * friendlier chart — it makes one that imports with no colours at all. Exported so the test
 * asserts against the same constants the page is drawn from.
 */
export const PK_KEY_HEADINGS = ['Symbol', 'Number', 'Name'] as const

/** Every 10th gridline is heavy — the convention every commercial chart counts by. */
const MAJOR_EVERY = 10

/**
 * Gridline weights, in points, and the grey the minor lines take.
 *
 * Both are ~0.2mm and ~0.4mm, and heavier than the print chart's (0.2pt / 0.7pt): the print
 * chart is read by an eye that can follow a hairline, this one by a parser that has to *find*
 * the line. The grey is solid rather than a black stroke at 60% alpha — see the module note.
 */
const MINOR_LINE_PT = 0.57
const MAJOR_LINE_PT = 1.13
const MINOR_INK = rgb(0.31, 0.31, 0.31)

const INK = rgb(0, 0, 0)
const HAIRLINE = rgb(0.75, 0.75, 0.75)

const RULER_FONT_PT = 6
const TITLE_FONT_PT = 9

/** Vertical pitch of one key row. Matches the print key, so both hold 40 rows to a page. */
const KEY_ROW_MM = 6
/** Space at the top of a key page for its heading and the column headings under it. */
const KEY_HEADER_MM = 22
const KEY_HEADING_PT = 14
const KEY_COLUMN_HEADING_PT = 9
const KEY_TEXT_PT = 9.5
const KEY_GLYPH_PT = 11

/**
 * Where each key column starts, as mm from the left margin.
 *
 * Fixed offsets rather than measured ones, so the heading and the value under it share an x
 * exactly. Pattern Keeper reads a table by its columns; a `Name` value that starts a
 * millimetre left of its heading on one row and a millimetre right on the next is a table
 * whose columns have to be *inferred* rather than read.
 */
const KEY_COLUMNS_MM = { symbol: 0, number: 22, name: 52 }

/** What the PK chart needs to know beyond the pattern itself. */
export interface PatternKeeperOptions {
  /** The export face (#32). Callers in Electron get these from `loadExportFont()`. */
  fontBytes: Uint8Array
  /** Mirror the pattern left-to-right (#56), as the preview and the print chart do. */
  flip: boolean
  /** Physical cell size, mm. Defaults to §5.5's export scale (`DEFAULT_CELL_MM`). */
  cellMm?: number
}

/** How many key rows fit on one page. Derived, so changing the page can't silently clip. */
export function pkKeyRowsPerPage(): number {
  return Math.floor((PRINTABLE_HEIGHT_MM - KEY_HEADER_MM) / KEY_ROW_MM)
}

function addPage(pdf: PDFDocument): PDFPage {
  return pdf.addPage([mmToPt(A4_WIDTH_MM), mmToPt(A4_HEIGHT_MM)])
}

/**
 * Draw one chart tile: glyphs, then the grid over them, then the margin rulers and heading.
 *
 * PDF's origin is bottom-left and the pattern's is top-left, so every row is flipped as it is
 * placed. Getting that wrong yields a vertically mirrored chart that still looks like a
 * plausible sprite — the sort of bug a dimensions-only test sails straight past.
 *
 * **A no-stitch cell is left empty.** FlossCross's own Pattern Keeper export writes a *space*
 * glyph into every blank cell; we do not, because a blank cell means "no floss here" and
 * writing a character there invites a reader to treat the fabric as a 48th colour. If a real
 * import ever turns out to need the placeholder, this is the one line that changes.
 */
function drawTile(
  page: PDFPage,
  tile: Tile,
  pattern: StitchPattern,
  palette: QuantizedPalette,
  font: PDFFont,
  { cellMm, title }: { cellMm: number; title: string }
): void {
  const cell = mmToPt(cellMm)
  const cols = tile.x1 - tile.x0
  const rows = tile.y1 - tile.y0

  const symbols = symbolsFor(palette)
  const glyphPt = glyphSizePt(cellMm)

  const left = mmToPt(MARGIN_MM)
  const gridTop = mmToPt(A4_HEIGHT_MM - MARGIN_MM - TITLE_BAND_MM)
  const gridBottom = gridTop - rows * cell

  // 1. Glyphs — black on bare paper, one per stitched cell, and nothing at all in a cell
  //    with no floss in it.
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = pattern.cells[tile.y0 + row][tile.x0 + col]
      if (index === null) continue

      const symbol = symbols[index]
      if (symbol === undefined) {
        throw new RangeError(
          `Cell (${tile.x0 + col}, ${tile.y0 + row}) indexes palette colour ${index}, ` +
            `but the palette has ${palette.colours.length}`
        )
      }

      const x = left + col * cell
      const y = gridTop - (row + 1) * cell
      const w = font.widthOfTextAtSize(symbol.glyph, glyphPt)
      page.drawText(symbol.glyph, {
        x: x + (cell - w) / 2,
        // Centre on the cap-height box rather than the baseline, or every glyph sits low.
        y: y + (cell - font.heightAtSize(glyphPt, { descender: false })) / 2,
        size: glyphPt,
        font,
        color: INK
      })
    }
  }

  // 2. Gridlines, over the glyphs. Every line runs the full extent of the grid — a parser
  //    matching a grid wants unbroken rules, not segments stopped at each cell.
  for (let col = 0; col <= cols; col++) {
    const major = (tile.x0 + col) % MAJOR_EVERY === 0
    const x = left + col * cell
    page.drawLine({
      start: { x, y: gridTop },
      end: { x, y: gridBottom },
      thickness: major ? MAJOR_LINE_PT : MINOR_LINE_PT,
      color: major ? INK : MINOR_INK
    })
  }
  for (let row = 0; row <= rows; row++) {
    const major = (tile.y0 + row) % MAJOR_EVERY === 0
    const y = gridTop - row * cell
    page.drawLine({
      start: { x: left, y },
      end: { x: left + cols * cell, y },
      thickness: major ? MAJOR_LINE_PT : MINOR_LINE_PT,
      color: major ? INK : MINOR_INK
    })
  }

  // 3. Rulers in the margin every 10 cells, so a person reading the same PDF on paper can
  //    still find their place. They sit outside the grid, where they are furniture to a
  //    parser rather than a cell's contents.
  for (let col = 0; col < cols; col++) {
    const absolute = tile.x0 + col
    if (absolute % MAJOR_EVERY !== 0) continue
    page.drawText(String(absolute), {
      x: left + col * cell + 1,
      y: gridTop + 3,
      size: RULER_FONT_PT,
      font,
      color: INK
    })
  }
  for (let row = 0; row < rows; row++) {
    const absolute = tile.y0 + row
    if (absolute % MAJOR_EVERY !== 0) continue
    const label = String(absolute)
    page.drawText(label, {
      x: left - font.widthOfTextAtSize(label, RULER_FONT_PT) - 3,
      y: gridTop - row * cell - RULER_FONT_PT,
      size: RULER_FONT_PT,
      font,
      color: INK
    })
  }

  // 4. Heading, so a loose page can be put back in its place, with the sprite's name (#91)
  //    right-aligned on the same baseline. Sharing the line is what keeps the header out of
  //    the tiling maths — see pdf-header.
  const heading = `Rows ${tile.y0}–${tile.y1} / Cols ${tile.x0}–${tile.x1}`
  const headingY = mmToPt(A4_HEIGHT_MM - MARGIN_MM) - TITLE_FONT_PT
  page.drawText(heading, { x: left, y: headingY, size: TITLE_FONT_PT, font, color: INK })
  drawRunningHead(page, font, title, {
    y: headingY,
    headingRightPt: left + font.widthOfTextAtSize(heading, TITLE_FONT_PT)
  })
}

/**
 * Append the chart pages, one per tile, in reading order.
 *
 * @returns the pages added, so the caller can number them.
 * @throws RangeError (via `symbolsFor`) if the palette holds more colours than the symbol set
 * can name — the same refusal the print chart makes, for the same reason: a chart that reuses
 * a glyph is a chart that lies.
 */
export function drawPkChartPages(
  pdf: PDFDocument,
  pattern: StitchPattern,
  palette: QuantizedPalette,
  font: PDFFont,
  { title, cellMm = DEFAULT_CELL_MM }: { title: string; cellMm?: number }
): PDFPage[] {
  return planTiles(pattern.width, pattern.height, cellMm).map((tile) => {
    const page = addPage(pdf)
    drawTile(page, tile, pattern, palette, font, { cellMm, title })
    drawLicenceFooter(page, font) // every page carries the attribution (#47)
    return page
  })
}

/**
 * Append the floss key: a three-column table headed `Symbol`, `Number`, `Name`.
 *
 * Rows are ordered by DMC code and take their glyphs from `keyRows` — the *same* function the
 * print key uses, off the same `symbolsFor(palette)` assignment the chart pages draw from. Two
 * exports of one pattern that disagreed about what a glyph means would be worse than having
 * only one, so neither document is allowed its own opinion.
 *
 * **One row is one line, never two.** Pattern Keeper's guidance asks that the key not word
 * wrap, and DMC names are short enough that it never has to; a name that somehow outran its
 * column is truncated rather than allowed to run into the page edge.
 */
export function drawPkKeyPages(
  pdf: PDFDocument,
  palette: QuantizedPalette,
  font: PDFFont,
  title: string,
  /** Rows per page. Defaults to what the page holds; a test overrides it to force the split. */
  rowsPerPage: number = pkKeyRowsPerPage()
): PDFPage[] {
  const rows = keyRows(palette)
  const pages: PDFPage[] = []
  const left = mmToPt(MARGIN_MM)
  const column = {
    symbol: left + mmToPt(KEY_COLUMNS_MM.symbol),
    number: left + mmToPt(KEY_COLUMNS_MM.number),
    name: left + mmToPt(KEY_COLUMNS_MM.name)
  }

  for (let start = 0; start < rows.length; start += rowsPerPage) {
    const page = addPage(pdf)
    pages.push(page)
    drawLicenceFooter(page, font) // every page carries the attribution (#47)

    const chunk = rows.slice(start, start + rowsPerPage)
    const headingY = mmToPt(A4_HEIGHT_MM - MARGIN_MM - 8)

    const heading =
      rows.length > rowsPerPage
        ? `Floss key (${start + 1}–${start + chunk.length} of ${rows.length})`
        : 'Floss key'
    page.drawText(heading, { x: left, y: headingY, size: KEY_HEADING_PT, font, color: INK })
    drawRunningHead(page, font, title, {
      y: headingY,
      headingRightPt: left + font.widthOfTextAtSize(heading, KEY_HEADING_PT)
    })

    // The column headings. Repeated on every key page rather than only the first: a table
    // found halfway down a document is only a table if it says what its columns are.
    const [symbolHeading, numberHeading, nameHeading] = PK_KEY_HEADINGS
    const columnsY = headingY - mmToPt(8)
    page.drawText(symbolHeading, {
      x: column.symbol,
      y: columnsY,
      size: KEY_COLUMN_HEADING_PT,
      font,
      color: INK
    })
    page.drawText(numberHeading, {
      x: column.number,
      y: columnsY,
      size: KEY_COLUMN_HEADING_PT,
      font,
      color: INK
    })
    page.drawText(nameHeading, {
      x: column.name,
      y: columnsY,
      size: KEY_COLUMN_HEADING_PT,
      font,
      color: INK
    })

    const ruleY = columnsY - mmToPt(2)
    page.drawLine({
      start: { x: left, y: ruleY },
      end: { x: mmToPt(A4_WIDTH_MM - MARGIN_MM), y: ruleY },
      thickness: 0.5,
      color: HAIRLINE
    })

    const firstRowY = ruleY - mmToPt(5)
    chunk.forEach(({ colour, symbol }, row) => {
      const y = firstRowY - mmToPt(row * KEY_ROW_MM)
      page.drawText(symbol.glyph, {
        x: column.symbol,
        y,
        size: KEY_GLYPH_PT,
        font,
        color: INK
      })
      // "DMC 310", not "310": the brand is what makes the code unambiguous to software that
      // knows several floss ranges — the same call §5.5 makes for the OXS `number` attribute.
      page.drawText(`DMC ${colour.dmc.code}`, {
        x: column.number,
        y,
        size: KEY_TEXT_PT,
        font,
        color: INK
      })
      page.drawText(colour.dmc.name, { x: column.name, y, size: KEY_TEXT_PT, font, color: INK })
    })
  }

  return pages
}

/**
 * Build the Pattern Keeper chart: chart pages first, then the floss key.
 *
 * **Chart first, key last**, which is the order the attached reference export (#55) uses and
 * the opposite of the print document's — there the key comes before the chart because you buy
 * floss before you sew. Nothing is bought here: the document is imported once and then read on
 * a screen, so the pages you actually look at come first.
 *
 * Pages are numbered from 1, all of them. The print chart leaves page 1 unnumbered because it
 * is a cover (#92); this document has no cover, so nothing is exempt.
 *
 * @throws RangeError if the palette holds more colours than the symbol set can name, or a cell
 * indexes a colour the palette does not have. Both are pipeline bugs, and both would otherwise
 * produce a chart that imports cleanly and is wrong.
 */
export async function buildPatternKeeperPdf(
  pattern: StitchPattern,
  palette: QuantizedPalette,
  meta: ChartMeta,
  options: PatternKeeperOptions
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(options.fontBytes, { subset: true })

  pdf.setTitle(meta.title)
  pdf.setCreator('Wesnoth Stitch')

  // Flipped once, here, exactly as `buildChartPdf` does it (#56) — so the chart and the key
  // are derived from one pattern and cannot end up facing different ways.
  const charted = options.flip ? flipHorizontal(pattern) : pattern

  const chart = drawPkChartPages(pdf, charted, palette, font, {
    title: meta.title,
    ...(options.cellMm === undefined ? {} : { cellMm: options.cellMm })
  })
  const key = drawPkKeyPages(pdf, palette, font, meta.title)

  const pages = [...chart, ...key]
  pages.forEach((page, index) => drawPageNumber(page, font, index + 1, pages.length))

  return pdf.save()
}
