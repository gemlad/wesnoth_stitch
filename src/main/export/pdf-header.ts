/**
 * The running head that names the sprite on **every page except the cover** (#91).
 *
 * A chart is printed, stapled or not, and then lived with for weeks. Pages come apart, and a
 * loose sheet of glyphs looks exactly like every other loose sheet of glyphs — the cover, which
 * is the only page that used to say what this is a chart *of*, is by then somewhere else. So
 * the name goes on all of them, the same way the licence footer does (#47).
 *
 * **It shares a line rather than taking one.** The obvious implementation gives the header its
 * own band above the grid; that would be a bug. `CHART_HEIGHT_MM` is derived by subtracting
 * `TITLE_BAND_MM` from the printable height, so a taller band means fewer rows per page, which
 * re-tiles the chart and changes the page count — a cosmetic change quietly reformatting the
 * document. Instead the name is drawn **right-aligned on the baseline the page heading already
 * occupies** ("Rows … / Cols …" on a chart page, "Floss key" on a key page), where there is
 * empty margin-to-margin space and nothing to displace.
 *
 * The cover is excluded because it already carries the name at 22pt, and repeating it as
 * furniture on the same page would just look like a mistake.
 */
import type { PDFFont, PDFPage } from 'pdf-lib'
import { rgb } from 'pdf-lib'
import { MARGIN_MM, mmToPt, PRINTABLE_WIDTH_MM } from './pdf-layout'

/** Muted, like the licence footer: page furniture should not compete with the chart. */
const MUTED = rgb(0.42, 0.42, 0.42)

/** Small enough to sit under a 14pt key heading, big enough to read across a room. */
export const RUNNING_HEAD_PT = 9

/** Gap kept between the page's own heading and the running head, so they never touch. */
const MIN_GAP_PT = 12

const ELLIPSIS = '…'

/**
 * `text`, shortened with an ellipsis until it fits `maxWidthPt` in `font` at `sizePt`.
 *
 * Returns `''` when not even the ellipsis fits — the caller then draws nothing, which is the
 * right answer: a sprite name is a nice-to-have on a page whose *heading* is load-bearing, and
 * overlapping the two would cost the reader both.
 *
 * Sprite names are short in practice ("dwarvish-fighter"), so this exists for the pathological
 * case rather than the common one. It is a linear walk from the end rather than a binary
 * search because it runs once per page on a string of a few dozen characters.
 */
export function truncateToWidth(
  text: string,
  font: PDFFont,
  sizePt: number,
  maxWidthPt: number
): string {
  if (maxWidthPt <= 0) return ''
  if (font.widthOfTextAtSize(text, sizePt) <= maxWidthPt) return text
  if (font.widthOfTextAtSize(ELLIPSIS, sizePt) > maxWidthPt) return ''

  // Trim by codepoint, not by UTF-16 unit: slicing a surrogate pair in half yields a lone
  // surrogate, which is not a character the font can be asked for.
  const points = [...text]
  for (let keep = points.length - 1; keep > 0; keep--) {
    const candidate = points.slice(0, keep).join('') + ELLIPSIS
    if (font.widthOfTextAtSize(candidate, sizePt) <= maxWidthPt) return candidate
  }
  return ELLIPSIS
}

/**
 * Draw `title` right-aligned at the right margin, on the baseline `y`.
 *
 * `headingRightPt` is the x the page's own heading text ends at; the running head is truncated
 * so it can never reach back past that plus a gap. Pass the left margin when the page has no
 * heading to share with.
 */
export function drawRunningHead(
  page: PDFPage,
  font: PDFFont,
  title: string,
  { y, headingRightPt }: { y: number; headingRightPt: number }
): void {
  if (title === '') return

  const rightEdge = mmToPt(MARGIN_MM + PRINTABLE_WIDTH_MM)
  const available = rightEdge - headingRightPt - MIN_GAP_PT
  const text = truncateToWidth(title, font, RUNNING_HEAD_PT, available)
  if (text === '') return

  page.drawText(text, {
    x: rightEdge - font.widthOfTextAtSize(text, RUNNING_HEAD_PT),
    y,
    size: RUNNING_HEAD_PT,
    font,
    color: MUTED
  })
}
