/**
 * The licence footer that appears on **every** page of the exported chart (#47).
 *
 * The cover used to be the only page carrying the Wesnoth attribution; a loose chart page
 * with the cover left behind would then carry no credit at all, which the licence does not
 * allow. This draws the same notice at the foot of any page, from the one shared string
 * (`shared/licence.ts`) the on-screen notice also uses.
 *
 * It sits in the bottom margin, below where the chart grid can ever reach (a full page's grid
 * bottoms at `MARGIN_MM`), so it never collides with content.
 */
import type { PDFFont, PDFPage } from 'pdf-lib'
import { rgb } from 'pdf-lib'
import { LICENCE_LINES } from '../../shared/licence'
import { MARGIN_MM, mmToPt, PRINTABLE_WIDTH_MM } from './pdf-layout'

const MUTED = rgb(0.42, 0.42, 0.42)
const FOOTER_SIZE_PT = 8
const FIRST_LINE_MM = 9 // baseline of the lowest line, from the page bottom
const LINE_STEP_MM = 4.5

/**
 * The height (mm from the page bottom) the footer occupies — the floor other page content
 * must stay above. Exported so the cover can place its preview without overlapping it.
 */
export const LICENCE_FOOTER_TOP_MM = FIRST_LINE_MM + (LICENCE_LINES.length - 1) * LINE_STEP_MM + 3

/** Draw the licence notice at the foot of `page`. Call it on every page added to the chart. */
export function drawLicenceFooter(page: PDFPage, font: PDFFont): void {
  let y = mmToPt(FIRST_LINE_MM)
  for (const line of [...LICENCE_LINES].reverse()) {
    page.drawText(line, { x: mmToPt(MARGIN_MM), y, size: FOOTER_SIZE_PT, font, color: MUTED })
    y += mmToPt(LINE_STEP_MM)
  }
}

/**
 * "Page 4 of 12", as the footer states it (#92).
 *
 * **The cover counts but is not numbered** (Gemma, 2026-07-29). Numbering the pages *after*
 * the cover 1…n−1 would read like a booklet and disagree with every PDF viewer's page counter,
 * which is precisely the thing you reach for when you are trying to reprint page 7 of a chart
 * you dropped. So `total` is the whole document and the cover simply goes unlabelled.
 */
export function pageNumberLabel(pageNumber: number, total: number): string {
  return `Page ${pageNumber} of ${total}`
}

/**
 * Draw one page's number, right-aligned on the **bottom** footer line.
 *
 * It shares a baseline with the licence notice rather than taking a line of its own: two
 * separate bands of grey furniture at the foot of a chart page read as clutter, and the bottom
 * line is the short one (the copyrights URL), so there is room to the right of it. The licence
 * notice is left-aligned and the number right-aligned, which is the ordinary newspaper
 * arrangement and needs no rule between them.
 *
 * `LICENCE_FOOTER_TOP_MM` is untouched, so nothing else on the page has to move.
 */
export function drawPageNumber(
  page: PDFPage,
  font: PDFFont,
  pageNumber: number,
  total: number
): void {
  const label = pageNumberLabel(pageNumber, total)
  const rightEdge = mmToPt(MARGIN_MM + PRINTABLE_WIDTH_MM)
  page.drawText(label, {
    x: rightEdge - font.widthOfTextAtSize(label, FOOTER_SIZE_PT),
    y: mmToPt(FIRST_LINE_MM),
    size: FOOTER_SIZE_PT,
    font,
    color: MUTED
  })
}

/**
 * Number every page of an assembled chart except the first.
 *
 * **A post-pass, and it has to be.** The total is not known while the document is being built —
 * the key paginates on the palette and the chart tiles on the pattern — so "of 12" can only be
 * written once every page exists. Taking the pages as an array rather than the document keeps
 * that honest and testable: what it numbers is exactly what it is handed.
 *
 * Page 1 is the cover, which states the sprite's name at 22pt and needs no furniture.
 */
export function stampPageNumbers(pages: readonly PDFPage[], font: PDFFont): void {
  const total = pages.length
  pages.forEach((page, index) => {
    if (index === 0) return // the cover
    drawPageNumber(page, font, index + 1, total)
  })
}
