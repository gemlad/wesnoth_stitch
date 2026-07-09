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
 * **Two rules decide what gets in**, both learned from glyphs that failed when the set
 * was actually rendered at chart scale:
 *
 * 1. **One orientation per shape family.** A rotated glyph is not a new glyph. The eye
 *    reads `▲ ▼ ◀ ▶` as one symbol pointing four ways and has to *decode* the direction,
 *    which is precisely the work a chart symbol exists to avoid. Only the upward
 *    triangle survives; likewise a single half-filled circle, with no mirror twin to be
 *    confused against.
 * 2. **No two glyphs may share an ink blob.** At 9px a solid glyph reads as its filled
 *    area and little else, so `★` and `◆` become the same dark lozenge. The star is
 *    kept only in outline, where its points actually register.
 *
 * The same reasoning excludes the size variants (`▲`/`▴`) and weight variants (`+`/`✚`)
 * the prototype shipped. Letters and digits are exempt from rule 2 — they are drawn by
 * type designers specifically to stay distinct at small sizes — but digits are dropped
 * wholesale, because `0`/`O`, `1`/`I`, `2`/`Z`, `5`/`S`, `6`/`G`, `8`/`B` and `9`/`P`
 * all collide with letters already in the set, and salvaging `3 4 7` is not worth a
 * mixed-class rule.
 *
 * **Why these code points.** Each is a single BMP code point drawn from Basic Latin,
 * Latin-1, Geometric Shapes, or the outline star — ranges with near-universal font
 * coverage, so neither Chromium's canvas (§5.4) nor a bundled PDF font (§5.5) falls back
 * to tofu.
 *
 * **Resolves §8's symbol-set question:** `MAX_COLOUR_COUNT` = 37. See §5.3 for what that
 * costs — measured against all 7,116 sprites, not guessed.
 */
import type { QuantizedPalette } from './types'

/** One chart glyph. `name` is for the floss key and for screen readers. */
export interface StitchSymbol {
  glyph: string
  name: string
}

export const STITCH_SYMBOLS: readonly StitchSymbol[] = [
  // 1. Solid geometrics — distinct by silhouette, the strongest cue there is.
  { glyph: '●', name: 'filled circle' },
  { glyph: '■', name: 'filled square' },
  { glyph: '▲', name: 'filled triangle' },
  { glyph: '◆', name: 'filled diamond' },
  // 2. Outline counterparts — same silhouettes, inverted fill. The star lives here
  //    only: filled, its points close up into the same blob as the diamond.
  { glyph: '○', name: 'open circle' },
  { glyph: '□', name: 'open square' },
  { glyph: '△', name: 'open triangle' },
  { glyph: '◇', name: 'open diamond' },
  { glyph: '☆', name: 'open star' },
  // 3. Half fill — a third fill state, and no mirror twin to confuse it with.
  { glyph: '◐', name: 'half-filled circle' },
  // 4. Strokes — thin and open, no enclosed area: a different visual class again.
  { glyph: '+', name: 'plus' },
  { glyph: '×', name: 'cross' },
  { glyph: '#', name: 'hash' },
  { glyph: '=', name: 'equals' },
  // 5. Letters — the fallback commercial charts have always used. A–Z less O and Q
  //    (against the open circle) and X (against the cross, which reads better small).
  { glyph: 'A', name: 'letter A' },
  { glyph: 'B', name: 'letter B' },
  { glyph: 'C', name: 'letter C' },
  { glyph: 'D', name: 'letter D' },
  { glyph: 'E', name: 'letter E' },
  { glyph: 'F', name: 'letter F' },
  { glyph: 'G', name: 'letter G' },
  { glyph: 'H', name: 'letter H' },
  { glyph: 'I', name: 'letter I' },
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
 *
 * This is also the effective colour cap for Req. 6 — it sits below the 40 §5.2 proposed,
 * so it, not that proposal, is what binds. Across all 7,116 Wesnoth sprites the full
 * distinct-DMC palette fits under it about 93% of the time; the rest reduce (#14), which
 * is exactly what reduction is for.
 *
 * **Before raising this,** read "Limitations of the hard limit" in §5.3. In short: it
 * caps charting, not stitching; 485 sprites already exceed it; and the glyph pool that
 * survives both legibility rules inside font-safe ranges is close to exhausted, so
 * growing the set means accepting either a font dependency or worse glyphs. The number
 * cannot be raised on its own — it *is* `STITCH_SYMBOLS.length`.
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
 * **Stable only for a fixed `k`.** Reduction keeps *colours* stable as the slider moves
 * (§5.2), but the palette reorders by pixel count, so a colour that survives a merge can
 * still be handed a different glyph. Measured on the dwarvish scout, 22 of 30 slider
 * steps reassign at least one surviving colour's symbol. Within any single `k` every
 * glyph is unique and stable, which is all an exported chart needs — but do not treat a
 * glyph as a colour's identity across colour counts, and do not persist one expecting it
 * to survive a re-quantization. See "Limitations of the hard limit" in §5.3.
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
