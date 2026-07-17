/**
 * The pages either side of the chart (§5.5, #35): the cover/stats page and the floss key.
 *
 * The key is the half of a chart people underrate. A chart page tells you *where* the
 * glyphs go; the key is the only thing that says what a glyph *means* — which skein to buy
 * and which to thread. A chart without a key is decoration.
 *
 * **One face, no bold.** Only DejaVu Sans regular is bundled (#32), so hierarchy here is
 * done with size and spacing rather than weight. Shipping a second face would double the
 * font asset and the coverage surface for a heading, which is not a trade worth making.
 */
import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib'
import { rgb } from 'pdf-lib'
import type { QuantizedPalette } from '../../shared/pipeline'
import { symbolsFor } from '../../shared/pipeline'
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  MARGIN_MM,
  mmToPt,
  PRINTABLE_HEIGHT_MM,
  PRINTABLE_WIDTH_MM
} from './pdf-layout'

/** Fabric counts (stitches per inch) a cross-stitcher actually buys. */
export const AIDA_COUNTS = [11, 14, 16, 18] as const

/**
 * Vertical pitch of one floss-key row.
 *
 * 6mm, not 7 — so **one page holds 40 rows**, which fit the original 37-colour cap on a
 * single sheet. #30 / D3 has since widened the set provisionally to 49, so a full-cap key
 * now spans **two** pages; `drawKeyPages` paginates for exactly this. Row pitch is
 * deliberately *not* shrunk to reclaim one page: the widened glyphs are provisional (the
 * #28 print test may drop the cap back under 40), and squeezing key legibility for a number
 * that may not hold would be the wrong trade. Revisit if the cap settles above 40.
 */
const KEY_ROW_MM = 6
/** Space at the top of a key page for its heading. */
const KEY_HEADER_MM = 14

const INK = rgb(0, 0, 0)
const MUTED = rgb(0.42, 0.42, 0.42)

/** Metadata the cover page states about the pattern. */
export interface ChartMeta {
  /** Usually the sprite's name — what this is a chart *of*. */
  title: string
  width: number
  height: number
}

/** How many key rows fit on one page. Derived, so changing the page can't silently clip. */
export function keyRowsPerPage(): number {
  return Math.floor((PRINTABLE_HEIGHT_MM - KEY_HEADER_MM) / KEY_ROW_MM)
}

function addPage(pdf: PDFDocument): PDFPage {
  return pdf.addPage([mmToPt(A4_WIDTH_MM), mmToPt(A4_HEIGHT_MM)])
}

/** Finished size in inches on `count`-count Aida — a stitch is 1/count of an inch. */
function finishedInches(stitches: number, count: number): number {
  return stitches / count
}

/**
 * The cover: what this is, how big it comes out, and who owns the art.
 *
 * The attribution is **not decorative**. Wesnoth's artwork is GPL v2+ / CC-BY-SA 4.0, and
 * the licence frequently *requires* credit on anything derived from it. The prototype
 * carried this notice; a port that dropped it would be a licensing regression, not a
 * simplification.
 */
export function drawCoverPage(
  pdf: PDFDocument,
  meta: ChartMeta,
  palette: QuantizedPalette,
  font: PDFFont
): PDFPage {
  const page = addPage(pdf)
  const left = mmToPt(MARGIN_MM)
  let y = mmToPt(A4_HEIGHT_MM - MARGIN_MM - 10)

  page.drawText(meta.title, { x: left, y, size: 22, font, color: INK })

  y -= mmToPt(12)
  const stitches = palette.colours.reduce((sum, c) => sum + c.pixelCount, 0)
  page.drawText(
    `${meta.width} × ${meta.height} stitches · ${palette.colourCount} DMC floss colours · ${stitches.toLocaleString()} stitches to sew`,
    { x: left, y, size: 11, font, color: INK }
  )

  // The palette was reduced to fit the chart — say so, rather than quietly present the
  // reduced count as if it were the sprite's own (§5.2).
  if (palette.colourCount < palette.sourceColourCount) {
    y -= mmToPt(6)
    page.drawText(
      `Reduced from the sprite's own ${palette.sourceColourCount} distinct floss colours.`,
      { x: left, y, size: 9, font, color: MUTED }
    )
  }

  y -= mmToPt(16)
  page.drawText('Approximate finished size', { x: left, y, size: 13, font, color: INK })

  for (const count of AIDA_COUNTS) {
    y -= mmToPt(7)
    const w = finishedInches(meta.width, count)
    const h = finishedInches(meta.height, count)
    const line =
      `${count}-count Aida:   ` +
      `${w.toFixed(1)}" × ${h.toFixed(1)}"   ` +
      `(${(w * 2.54).toFixed(1)} × ${(h * 2.54).toFixed(1)} cm)`
    page.drawText(line, { x: left + mmToPt(4), y, size: 10, font, color: INK })
  }

  // Attribution, at the foot.
  const notice = [
    'Wesnoth artwork is licensed GPL v2+ / CC-BY-SA 4.0 by the Battle for Wesnoth project.',
    'https://wiki.wesnoth.org/Wesnoth:Copyrights'
  ]
  let noticeY = mmToPt(MARGIN_MM + 6)
  for (const line of [...notice].reverse()) {
    page.drawText(line, { x: left, y: noticeY, size: 8, font, color: MUTED })
    noticeY += mmToPt(4.5)
  }

  return page
}

/**
 * The floss key: one row per colour — swatch, glyph, DMC code and name, stitch count.
 *
 * Glyphs come from the same `symbolsFor(palette)` call the chart pages make, so the key and
 * the chart **cannot** disagree about what a glyph means. Deriving them twice, or letting
 * the key re-index the palette itself, is how a chart ends up keyed wrong — the one bug
 * that would waste an entire stitching project rather than just look bad.
 *
 * Paginates. Up to 40 colours the key is a single page; a full 49-colour cap (#30 / D3)
 * spills onto a second. "It always fits on one page" was exactly the assumption that broke
 * when the cap moved, which is why this loop exists.
 */
export function drawKeyPages(
  pdf: PDFDocument,
  palette: QuantizedPalette,
  font: PDFFont,
  /**
   * Rows per page. Defaults to what the page holds (40). The cap has since risen to 49
   * (#30 / D3), so a full-cap key now runs onto a second page and the pagination below is
   * live, not merely defensive. A test overrides this to exercise the boundary directly.
   */
  rowsPerPage: number = keyRowsPerPage()
): PDFPage[] {
  const symbols = symbolsFor(palette)
  const perPage = rowsPerPage
  const pages: PDFPage[] = []

  const left = mmToPt(MARGIN_MM)
  const swatch = mmToPt(4.5)

  for (let start = 0; start < palette.colours.length; start += perPage) {
    const page = addPage(pdf)
    pages.push(page)

    const chunk = palette.colours.slice(start, start + perPage)
    let y = mmToPt(A4_HEIGHT_MM - MARGIN_MM - 8)

    const heading =
      palette.colours.length > perPage
        ? `Floss key (${start + 1}–${start + chunk.length} of ${palette.colours.length})`
        : 'Floss key'
    page.drawText(heading, { x: left, y, size: 14, font, color: INK })

    y -= mmToPt(KEY_HEADER_MM - 4)

    chunk.forEach((colour, row) => {
      const index = start + row
      const rowY = y - mmToPt(row * KEY_ROW_MM)

      page.drawRectangle({
        x: left,
        y: rowY - swatch + mmToPt(1),
        width: swatch,
        height: swatch,
        color: rgb(colour.rgb.r / 255, colour.rgb.g / 255, colour.rgb.b / 255),
        borderColor: MUTED,
        borderWidth: 0.3
      })

      page.drawText(symbols[index].glyph, {
        x: left + swatch + mmToPt(4),
        y: rowY - mmToPt(2.6),
        size: 11,
        font,
        color: INK
      })

      page.drawText(`DMC ${colour.dmc.code} — ${colour.dmc.name}`, {
        x: left + swatch + mmToPt(12),
        y: rowY - mmToPt(2.6),
        size: 9.5,
        font,
        color: INK
      })

      const count = `${colour.pixelCount.toLocaleString()} st.`
      page.drawText(count, {
        x: left + mmToPt(PRINTABLE_WIDTH_MM) - font.widthOfTextAtSize(count, 9.5),
        y: rowY - mmToPt(2.6),
        size: 9.5,
        font,
        color: MUTED
      })
    })
  }

  return pages
}
