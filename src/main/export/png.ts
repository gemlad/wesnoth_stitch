/**
 * PNG export (§5.5) — the "quick look" half of the milestone, and the one an exported
 * chart is *not*: no glyphs, no gridlines, just the pattern as colour.
 *
 * Written with `pngjs`, which is already the decoder (§3) — so the export needs no canvas,
 * no new dependency, and no DOM. That is what keeps it a pure function of
 * pattern + palette + options → bytes, unit-testable alongside the rest of the pipeline.
 *
 * **"No stitch" is not "transparent".** A cell with no floss shows the *fabric*, and the
 * fabric is not assumed-white (§5.4, §6, §8): unbleached Aida is visibly cream, and a
 * preview that pretends otherwise misrepresents what the finished piece will look like.
 * So no-stitch cells are painted in `backgroundColour` and the image ships fully opaque.
 * The prototype hardcoded `#F4EFE3` here; this honours the user's actual setting.
 */
import { PNG } from 'pngjs'
import type { RGB } from '../../shared/colour'
import type { QuantizedPalette, StitchPattern } from '../../shared/pipeline'

/**
 * Pixels per stitch. 12 matches the prototype — big enough that a 72×72 sprite is a
 * legible ~864px image, small enough not to be silly.
 */
export const DEFAULT_CELL_PX = 12

export interface PngExportOptions {
  /** Pixels per stitch, both axes. Must be a positive integer. */
  cellSize?: number
  /** The fabric. No-stitch cells take this colour (§6 `PatternSettings.backgroundColour`). */
  backgroundColour: RGB
}

/** RGB → the four bytes pngjs wants, opaque. */
function rgba({ r, g, b }: RGB): [number, number, number, number] {
  return [r, g, b, 0xff]
}

/**
 * Render `pattern` as a PNG, one `cellSize`×`cellSize` block per stitch.
 *
 * @throws RangeError if `cellSize` is not a positive integer, or a cell indexes a colour
 * the palette does not have. A pattern that points outside its own palette is a pipeline
 * bug; painting it as background (or as black) would hide that behind a plausible-looking
 * image, which is exactly how a silently-wrong chart gets stitched.
 */
export function renderPatternPng(
  pattern: StitchPattern,
  palette: QuantizedPalette,
  { cellSize = DEFAULT_CELL_PX, backgroundColour }: PngExportOptions
): Buffer {
  if (!Number.isInteger(cellSize) || cellSize < 1) {
    throw new RangeError(`cellSize must be a positive integer, got ${cellSize}`)
  }

  const { width: cols, height: rows, cells } = pattern
  const png = new PNG({ width: cols * cellSize, height: rows * cellSize })
  const stride = png.width * 4

  // Resolve each palette entry's bytes once rather than per pixel — a 72×72 sprite at
  // cellSize 12 is ~750k pixels, and the inner loop is the whole cost of this function.
  const inks = palette.colours.map((c) => rgba(c.rgb))
  const fabric = rgba(backgroundColour)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = cells[row][col]

      let ink: readonly number[]
      if (index === null) {
        ink = fabric
      } else {
        const resolved = inks[index]
        if (resolved === undefined) {
          throw new RangeError(
            `Cell (${col}, ${row}) indexes palette colour ${index}, but the palette has ${inks.length}`
          )
        }
        ink = resolved
      }

      // Paint the block. Fill the first row of the cell, then memcpy it down — copyWithin
      // beats re-writing the same four bytes cellSize² times.
      const left = col * cellSize * 4
      const top = row * cellSize
      const firstRowStart = top * stride + left
      for (let px = 0; px < cellSize; px++) {
        png.data.set(ink, firstRowStart + px * 4)
      }
      const firstRowEnd = firstRowStart + cellSize * 4
      for (let line = 1; line < cellSize; line++) {
        png.data.copyWithin(firstRowStart + line * stride, firstRowStart, firstRowEnd)
      }
    }
  }

  return PNG.sync.write(png)
}
