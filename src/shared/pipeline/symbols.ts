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
 * type designers specifically to stay distinct at small sizes. Most digits stay out
 * because they collide with a letter already in the set (`0`/`O`, `1`/`I`, `2`/`Z`,
 * `5`/`S`, `6`/`G`, `8`/`B`, `9`/`P`) — but `3 4 7` have no letter twin and are kept
 * (#30 / D3).
 *
 * **Provisional additions (#30 / D3).** Beyond the original 37, a widened block appended
 * below reaches for card suits, print marks, one textured square and the three digits
 * above. These are used only above `k = 37` and are deliberately generous: the print test
 * (#28) is expected to remove the ones that blob-collide on paper (e.g. `♦` against `◆`,
 * `♠` against `▲`). Until it does, they raise the cap rather than being held back.
 *
 * **Why these code points.** Every glyph is a single BMP code point. The original 37 were
 * kept inside near-universal ranges (Basic Latin, Latin-1, Geometric Shapes, the outline
 * star) so the set survived *any* font. The provisional additions reach into
 * Miscellaneous Symbols and General Punctuation, which are **not** universal — that is now
 * safe because the export bundles and embeds DejaVu Sans (#32, §5.5) and
 * `font-coverage.test.ts` asserts every codepoint here resolves in it rather than falling
 * back to tofu. The bundled font, not the range, is the guarantee (#30 / D4).
 *
 * **§8's symbol-set question, revisited.** The set opened at 37 (the count that stays
 * legible in font-safe ranges); it is **provisionally 49** after #30 / D3 widened the pool
 * over the bundled font. `MAX_COLOUR_COUNT` tracks the array length either way, so the
 * print test can knock it back down one glyph at a time. See §5.3.
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
  { glyph: 'Z', name: 'letter Z' },
  // ── Provisional additions (#30 / D3 — Gemma's call, 2026-07-17) ──────────────────
  // Widening the pool now that a font is bundled (#32) and proven to cover it
  // (font-coverage.test.ts). Appended, not interleaved: the 37 above keep their validated
  // distinctness ranking, and the assignment/ordering rule is itself under review
  // (#30 / D1), so imposing a new ranking on these would be premature. They are used only
  // above k=37, and are deliberately generous — the print test (#28) is expected to cull
  // the blob-collisions (♦↔◆, ♠↔▲). Ordered within the block by rough boldness.
  // 6. Card suits — strong filled silhouettes; ♦/♠ are the expected #28 casualties.
  { glyph: '♥', name: 'heart' },
  { glyph: '♣', name: 'club' },
  { glyph: '♦', name: 'diamond suit' },
  { glyph: '♠', name: 'spade' },
  // 7. Textured square — a fill state distinct from solid ■ and open □; reads as a weave.
  { glyph: '▦', name: 'crosshatch square' },
  // 8. Print marks — typographic, drawn to stay distinct small; unlike anything above.
  { glyph: '†', name: 'dagger' },
  { glyph: '‡', name: 'double dagger' },
  { glyph: '§', name: 'section sign' },
  { glyph: '¶', name: 'pilcrow' },
  // 9. Restored numerals — the three digits with no letter twin in the set (#30 / D3).
  { glyph: '3', name: 'digit three' },
  { glyph: '4', name: 'digit four' },
  { glyph: '7', name: 'digit seven' }
]

/**
 * The colour-count slider's **hard maximum** (§5.3), read by #19.
 *
 * Not a stylistic preference: past this, two floss colours would have to share a glyph
 * and a black-and-white chart would become ambiguous. The slider must not offer it.
 *
 * This is also the effective colour cap for Req. 6. It opened at 37 and is **provisionally
 * 49** after #30 / D3 widened the glyph pool over the bundled font. Across all Wesnoth
 * sprites the full distinct-DMC palette fits under 49 about 99% of the time; the rest
 * reduce (#14), which is exactly what reduction is for. (Re-measured by
 * `npm run validate:cap`, which now reports `coverageAtCap`.)
 *
 * **This number is not settled.** It stays legible only if every provisional glyph in the
 * set survives the print test (#28); each one that fails is removed and the cap drops with
 * it. Read "Limitations of the hard limit" in §5.3 before treating 49 as final. The number
 * cannot be raised or lowered on its own — it *is* `STITCH_SYMBOLS.length`.
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
