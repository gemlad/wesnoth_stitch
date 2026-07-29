/**
 * The two lines on the cover that state how big the thing is (#35, #99).
 *
 * They are pulled out of the drawing code because they are the part that was **wrong**, and
 * text drawn into a PDF cannot be read back to prove otherwise: an embedded subset font encodes
 * it as glyph ids. As functions they can be tested for what they say.
 *
 * Both take the pattern rather than a stated size. That is the fix: the cover used to be handed
 * `width`/`height` and printed whatever it was told, so a caller that passed the *sprite's* size
 * while charting a pattern trimmed to its content (#53) produced a cover claiming 72×72 for a
 * 39×31 chart — with four finished-size figures underneath, all wrong to match. Measuring the
 * pattern it is drawing makes that class of bug unrepresentable.
 */
import type { QuantizedPalette, StitchPattern } from '../../shared/pipeline'

/** Fabric counts (stitches per inch) a cross-stitcher actually buys. */
export const AIDA_COUNTS = [11, 14, 16, 18] as const

/** Finished size in inches on `count`-count Aida — a stitch is 1/count of an inch. */
export function finishedInches(stitches: number, count: number): number {
  return stitches / count
}

/** "39 × 31 stitches · 12 DMC floss colours · 806 stitches to sew". */
export function coverStatsLine(pattern: StitchPattern, palette: QuantizedPalette): string {
  const stitches = palette.colours.reduce((sum, colour) => sum + colour.pixelCount, 0)
  return (
    `${pattern.width} × ${pattern.height} stitches · ` +
    `${palette.colourCount} DMC floss colours · ` +
    `${stitches.toLocaleString()} stitches to sew`
  )
}

/** One row of the finished-size table: how big this comes out on `count`-count Aida. */
export function finishedSizeLine(pattern: StitchPattern, count: number): string {
  const w = finishedInches(pattern.width, count)
  const h = finishedInches(pattern.height, count)
  return (
    `${count}-count Aida:   ` +
    `${w.toFixed(1)}" × ${h.toFixed(1)}"   ` +
    `(${(w * 2.54).toFixed(1)} × ${(h * 2.54).toFixed(1)} cm)`
  )
}
