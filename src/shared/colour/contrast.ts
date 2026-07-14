/**
 * Choosing an ink that stays readable on a given background (§5.3).
 *
 * **Why this is shared rather than a renderer detail.** It began life in the Konva preview
 * (#18), but the PDF chart (#34) has exactly the same problem and must reach the *same*
 * answer: a glyph printed in an ink the preview would not have chosen means what you
 * export is not what you previewed. Two implementations would drift. One cannot.
 */
import type { RGB } from './types'

/**
 * Black or white, whichever a glyph needs to stay readable on `bg`.
 *
 * A chart symbol is the only thing distinguishing two floss colours on a black-and-white
 * print (§5.3), so it cannot be allowed to disappear into a dark navy or a pale cream.
 * Compares WCAG contrast ratios against the two ink choices rather than thresholding
 * luminance, which gets the near-mid greys right.
 */
export function contrastInk(bg: RGB): string {
  const l = relativeLuminance(bg)
  const onWhite = 1.05 / (l + 0.05)
  const onBlack = (l + 0.05) / 0.05
  return onBlack >= onWhite ? '#000000' : '#ffffff'
}

/** WCAG 2.x relative luminance of an 8-bit sRGB colour. */
function relativeLuminance({ r, g, b }: RGB): number {
  const lin = (c: number): number => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
