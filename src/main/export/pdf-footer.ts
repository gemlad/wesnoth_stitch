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
import { MARGIN_MM, mmToPt } from './pdf-layout'

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
