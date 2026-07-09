/**
 * Stitch symbols for the chart (design §5.3), and the slider ceiling they imply (§8).
 *
 * Every colour in a reduced palette (#14) gets one glyph. On a printed chart — and
 * especially a black-and-white one — the glyph is the *only* thing telling two floss
 * colours apart, so the set has to stay legible at roughly 5pt, in a ~10px grid cell.
 * That constraint, not the size of Unicode, is what fixes the count.
 *
 * **Ordered by distinctness, not by codepoint.** Symbols are handed out in array order,
 * and the palette is sorted dominant-floss-first (#14), so a low-`k` pattern spends only
 * the top of the list: bold, unmistakable silhouettes. Detail degrades gracefully as `k`
 * climbs rather than every chart drawing from the same undifferentiated pool.
 *
 * The tiers, in order:
 *
 * 1. **Solid geometrics** — separable by silhouette alone, the strongest cue there is.
 * 2. **Outline counterparts** — same silhouettes, inverted fill; a second strong cue.
 * 3. **Strokes** — a different visual class again (thin, open, no enclosed area).
 * 4. **Letters** — the fallback commercial charts have always used. A–Z minus `I` and
 *    `O` (confusable with digits and with `○`), `Q` (with `O`), and `X` (with `×`,
 *    which is already in tier 3 and reads better small).
 *
 * **Why these glyphs and no others.** Each is a single BMP code point drawn from Basic
 * Latin, Latin-1, Geometric Shapes, or the two star characters — ranges with near-
 * universal font coverage, so neither Chromium's canvas (§5.4) nor a bundled PDF font
 * (§5.5) falls back to tofu. Deliberately excluded: size variants (`▲`/`▴`, `■`/`▪`),
 * weight variants (`+`/`✚`), and mirrored halves (`◐`/`◑`) — all of which the prototype
 * shipped and none of which survive being printed at 5pt.
 *
 * **Resolves §8's symbol-set question:** the set holds `MAX_COLOUR_COUNT` = 40 glyphs,
 * which is exactly the colour cap §5.2 proposes. The two ceilings agree, so neither
 * silently binds before the other. If #20 finds the colour cap should rise above 40,
 * this set must grow *first* — it is the hard limit, and a chart cannot show more
 * colours than it has symbols to name them with.
 */
import type { QuantizedPalette } from './types'

/** One chart glyph. `name` is for the floss key and for screen readers. */
export interface StitchSymbol {
  glyph: string
  name: string
}

export const STITCH_SYMBOLS: readonly StitchSymbol[] = [
  // 1. Solid geometrics — distinct by silhouette.
  { glyph: '●', name: 'filled circle' },
  { glyph: '■', name: 'filled square' },
  { glyph: '▲', name: 'filled triangle up' },
  { glyph: '▼', name: 'filled triangle down' },
  { glyph: '◆', name: 'filled diamond' },
  { glyph: '★', name: 'filled star' },
  { glyph: '◀', name: 'filled triangle left' },
  { glyph: '▶', name: 'filled triangle right' },
  // 2. Outline counterparts — same silhouettes, inverted fill.
  { glyph: '○', name: 'open circle' },
  { glyph: '□', name: 'open square' },
  { glyph: '△', name: 'open triangle up' },
  { glyph: '▽', name: 'open triangle down' },
  { glyph: '◇', name: 'open diamond' },
  { glyph: '☆', name: 'open star' },
  { glyph: '◁', name: 'open triangle left' },
  { glyph: '▷', name: 'open triangle right' },
  // 3. Strokes — thin and open, no enclosed area.
  { glyph: '+', name: 'plus' },
  { glyph: '×', name: 'cross' },
  // 4. Letters — A–Z less I, O, Q, X.
  { glyph: 'A', name: 'letter A' },
  { glyph: 'B', name: 'letter B' },
  { glyph: 'C', name: 'letter C' },
  { glyph: 'D', name: 'letter D' },
  { glyph: 'E', name: 'letter E' },
  { glyph: 'F', name: 'letter F' },
  { glyph: 'G', name: 'letter G' },
  { glyph: 'H', name: 'letter H' },
  { glyph: 'J', name: 'letter J' },
  { glyph: 'K', name: 'letter K' },
  { glyph: 'L', name: 'letter L' },
  { glyph: 'M', name: 'letter M' },
  { glyph: 'N', name: 'letter N' },
  { glyph: 'P', name: 'letter P' },
  { glyph: 'R', name: 'letter R' },
  { glyph: 'S', name: 'letter S' },
  { glyph: 'T', name: 'letter T' },
  { glyph: 'U', name: 'letter U' },
  { glyph: 'V', name: 'letter V' },
  { glyph: 'W', name: 'letter W' },
  { glyph: 'Y', name: 'letter Y' },
  { glyph: 'Z', name: 'letter Z' }
]

/**
 * The colour-count slider's **hard maximum** (§5.3), read by #19.
 *
 * Not a stylistic preference: past this, two floss colours would have to share a glyph
 * and a black-and-white chart would become ambiguous. The slider must not offer it.
 */
export const MAX_COLOUR_COUNT = STITCH_SYMBOLS.length

/**
 * The symbol for the palette entry at `index` (i.e. `palette.colours[index]`).
 *
 * @throws RangeError if `index` is outside the symbol set — a caller asking for more
 * colours than there are symbols is a bug, not something to paper over by wrapping.
 * (The prototype wrapped with `i % len`, silently reusing glyphs.)
 */
export function symbolAt(index: number): StitchSymbol {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_COLOUR_COUNT) {
    throw new RangeError(`No stitch symbol for palette index ${index} (have ${MAX_COLOUR_COUNT})`)
  }
  return STITCH_SYMBOLS[index]
}

/**
 * One symbol per palette colour, index-aligned with `palette.colours` — so the dominant
 * floss gets the most distinctive glyph.
 *
 * Kept out of `PaletteColour` itself (§6): symbols are chart presentation, not part of
 * the colour data, and the pipeline stages stay pure without them.
 *
 * @throws RangeError if the palette holds more colours than the symbol set can name.
 */
export function symbolsFor(palette: QuantizedPalette): readonly StitchSymbol[] {
  if (palette.colours.length > MAX_COLOUR_COUNT) {
    throw new RangeError(
      `Palette has ${palette.colours.length} colours but only ${MAX_COLOUR_COUNT} stitch symbols exist`
    )
  }
  return palette.colours.map((_, i) => STITCH_SYMBOLS[i])
}
