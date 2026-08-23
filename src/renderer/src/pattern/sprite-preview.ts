/**
 * The pattern, painted back out at sprite size (#108).
 *
 * The chart in the middle of the app is zoomed to fill the stage, which is the wrong scale
 * for the one question the colour slider raises: *does this reduction actually show?* A
 * dozen floss colours can look brutal at 14× and be indistinguishable at the size the unit
 * is drawn in the game. So the preview pane puts this beside the raw sprite at 1:1, where
 * the two can be compared at the size that matters.
 *
 * Kept out of `draw.ts` on purpose. That module draws the *chart* — cells scaled to a zoom,
 * grid rules, symbol glyphs, overdrawn seams — and every one of those is a thing this must
 * not do. Here one cell is one pixel, so there is no scale to bleed across and nothing to
 * rule; what comes out is an image, not a drawing.
 */
import type { RGB } from '../../../shared/colour'
import type { StitchPattern } from '../../../shared/pipeline'

/**
 * `pattern` as raw RGBA, one pixel per stitch, ready for `ImageData`.
 *
 * No-stitch cells come out **fully transparent** rather than filled with the fabric colour.
 * The raw sprite it sits beside is transparent there too, so this is what lets the two read
 * as the same picture twice rather than as a picture and a swatch — and it is the fabric
 * that shows through in both cases, which is the truth of it.
 *
 * `colours` is index-aligned with `QuantizedPalette.colours` — pass `colours.map(c => c.rgb)`.
 * An index with no colour behind it would be a pipeline bug, not a user action, so it is left
 * to throw rather than quietly painting a hole.
 */
export function patternToRgba(pattern: StitchPattern, colours: readonly RGB[]): Uint8ClampedArray {
  const { width, height, cells } = pattern
  const data = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y++) {
    const row = cells[y]
    for (let x = 0; x < width; x++) {
      const index = row[x]
      if (index === null) continue // already transparent — the array starts zeroed
      const { r, g, b } = colours[index]
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }

  return data
}
