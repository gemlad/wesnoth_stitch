/**
 * Does the bundled export font actually contain every glyph the chart needs? (§5.3, §5.5)
 *
 * §5.3 has warned from the start that a codepoint the font lacks renders as a tofu box —
 * a chart cell that names no floss colour at all. Nothing checked. This is the check.
 *
 * It is deliberately a **pure function of font bytes**, not of a file path: the test feeds
 * it the real bundled asset (`resources/fonts/DejaVuSans.ttf`), so what gets verified is
 * the artefact that ships, not a stand-in. Keeping it free of `?asset` imports is what
 * lets it run under plain-Node vitest at all — those specifiers only resolve through
 * electron-vite.
 */
import fontkit from '@pdf-lib/fontkit'
import type { StitchSymbol } from '../../shared/pipeline/symbols'

/** A glyph the font cannot draw — i.e. one that would print as tofu. */
export interface MissingGlyph {
  glyph: string
  name: string
  /** `U+25CF`-style, since that is how you look it up in a font tool. */
  codepoint: string
}

/**
 * Every codepoint in the set is expected to be a **single** BMP codepoint (§5.3 chose the
 * set that way, so a glyph is one character in one font table). A multi-codepoint entry —
 * an emoji sequence, a combining pair — would silently defeat `hasGlyphForCodePoint`, so
 * treat it as a set error rather than a font error.
 */
function soleCodepoint(symbol: StitchSymbol): number {
  const points = [...symbol.glyph]
  if (points.length !== 1) {
    throw new Error(
      `Stitch symbol ${JSON.stringify(symbol.glyph)} (${symbol.name}) is ${points.length} codepoints; ` +
        'the set must hold single-codepoint glyphs (§5.3)'
    )
  }
  return points[0].codePointAt(0)!
}

/** `65` → `U+0041`. */
export function formatCodepoint(cp: number): string {
  return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * The glyphs in `symbols` that `fontBytes` cannot draw. Empty means the font covers the set.
 *
 * @throws if the font cannot be parsed at all, or a symbol is not a single codepoint.
 */
export function missingGlyphs(
  fontBytes: Uint8Array,
  symbols: readonly StitchSymbol[]
): MissingGlyph[] {
  const font = fontkit.create(fontBytes as Buffer)
  return symbols
    .filter((s) => !font.hasGlyphForCodePoint(soleCodepoint(s)))
    .map((s) => ({
      glyph: s.glyph,
      name: s.name,
      codepoint: formatCodepoint(soleCodepoint(s))
    }))
}
