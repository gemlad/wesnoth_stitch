/**
 * How big the cover preview is drawn, and at what resolution (#68, #46).
 *
 * **The point of the change: the preview is printed at the size it will be stitched.** A
 * picture of a pattern tells you what it looks like; a picture at *true size* tells you what
 * you are committing to — whether the finished piece fits the hoop, the card, the frame you
 * bought it for. Held against a square of Aida it answers that in a second, which no table of
 * inches quite does.
 *
 * True size is quoted **on 14-count Aida**: one stitch is 1/14", or ~1.814mm. 14-count is the
 * default fabric in every shop and the middle of the range the cover already tabulates, so it
 * is the one a reader is most likely holding.
 *
 * **When it does not fit, it shrinks and says so.** A big sprite at 1.814mm a stitch outgrows
 * the space between the finished-size block and the licence footer. The preview then falls
 * back to fitting the box, exactly as it always did — but the page *states* which of the two
 * you are looking at. A preview that is sometimes true size and never says so is worse than
 * one that never is: it invites a measurement that is quietly wrong.
 */
import { MM_PER_INCH, mmToPt } from './pdf-layout'

/** The fabric count true size is quoted against. See the module note. */
export const TRUE_SIZE_AIDA_COUNT = 14

/** ~1.814mm — one stitch on 14-count Aida. */
export const TRUE_SIZE_MM_PER_STITCH = MM_PER_INCH / TRUE_SIZE_AIDA_COUNT

/**
 * Raster resolution to aim for at the drawn size. 300dpi is the ordinary floor for print; the
 * preview is flat blocks of colour, so this is about keeping stitch edges crisp when a PDF
 * viewer resamples the image, not about tonal detail.
 */
const TARGET_DPI = 300

/**
 * Bounds on pixels per stitch. The floor keeps a tiny sprite from becoming a smudge; the
 * ceiling stops a large pattern from embedding a needlessly enormous raster — at 24px a
 * 200×300 pattern is already a 4,800×7,200 image.
 */
const MIN_CELL_PX = 4
const MAX_CELL_PX = 24

/** A pattern's size in stitches. */
export interface StitchSize {
  width: number
  height: number
}

/** The space the preview may occupy on the page, in points. */
export interface PreviewBox {
  maxWidthPt: number
  maxHeightPt: number
}

export interface PreviewFit {
  widthPt: number
  heightPt: number
  /** Whether `widthPt`/`heightPt` are the true 14-count size, or a reduction to fit. */
  trueSize: boolean
}

/**
 * How large to draw the preview: true 14-count size if it fits `box`, otherwise scaled down to
 * fit, preserving aspect.
 *
 * Never scales *up*: a small sprite is drawn at true size and left there. Blowing it up to
 * fill the page would be the same lie the fallback is careful to admit to.
 */
export function fitPreview(stitches: StitchSize, box: PreviewBox): PreviewFit {
  const trueWidth = mmToPt(stitches.width * TRUE_SIZE_MM_PER_STITCH)
  const trueHeight = mmToPt(stitches.height * TRUE_SIZE_MM_PER_STITCH)

  if (trueWidth <= box.maxWidthPt && trueHeight <= box.maxHeightPt) {
    return { widthPt: trueWidth, heightPt: trueHeight, trueSize: true }
  }

  const scale = Math.min(box.maxWidthPt / trueWidth, box.maxHeightPt / trueHeight)
  return { widthPt: trueWidth * scale, heightPt: trueHeight * scale, trueSize: false }
}

/**
 * Pixels per stitch for the embedded raster, so the image lands near {@link TARGET_DPI} at the
 * size it is actually drawn.
 *
 * Derived from the drawn width rather than fixed (as the old `PREVIEW_TARGET_PX` was), because
 * true size makes the drawn size vary by an order of magnitude: the same 700px raster is ample
 * for a thumbnail-sized preview and visibly soft across 130mm of paper.
 */
export function previewCellPx(stitchesWide: number, drawnWidthPt: number): number {
  if (stitchesWide < 1) return MIN_CELL_PX
  const drawnInches = drawnWidthPt / 72
  const perStitch = Math.round((TARGET_DPI * drawnInches) / stitchesWide)
  return Math.min(MAX_CELL_PX, Math.max(MIN_CELL_PX, perStitch))
}

/** What the cover says the preview is, next to the "Preview" heading. */
export function previewScaleNote(trueSize: boolean): string {
  return trueSize
    ? `actual size on ${TRUE_SIZE_AIDA_COUNT}-count Aida`
    : 'reduced to fit — not actual size'
}
