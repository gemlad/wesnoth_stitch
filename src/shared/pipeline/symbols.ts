/**
 * Stitch symbols for the chart (design §5.3), and the slider ceiling they imply (§8).
 *
 * Every colour in a reduced palette (#14) gets one glyph. On a printed chart — and
 * especially a black-and-white one — the glyph is the *only* thing telling two floss
 * colours apart, so the set has to stay legible at roughly 5pt, in a ~10px grid cell.
 * That constraint, not the size of Unicode, is what fixes the count.
 *
 * **Ordered by distinctness, not by codepoint** — the array runs from the boldest,
 * most unmistakable silhouettes down to the subtlest. That ordering is *input* to the
 * assignment rule, not the rule itself: `assignment.ts` decides which colour actually gets
 * which glyph, and since #30/D1 that rule is `interleaved` rather than "hand them out in
 * array order". Keep this array ranked by distinctness regardless — every strategy reads it.
 *
 * **Three rules decide what gets in.** The first is a standing decision; the other two were
 * learned from glyphs that failed when the set was actually rendered at chart scale:
 *
 * 1. **Distinguish by shape, not by shade** (Gemma, 2026-07-17). A glyph earns its place by
 *    being a *different mark*, not by laying down more or less of the same one. Distinct
 *    fills are fine where each reads as its own thing — `●`/`○`, the half-fill `◐` —
 *    because those are recognised, not measured. A graded ink ramp
 *    (`░ ▒ ▓ █`, or circle fill-states used as a series) is **rejected**: reading *how much*
 *    ink a 2.36 mm cell holds while counting stitches is the work a symbol should save you.
 *    Value-shading — glyph darkness standing in for the colour's darkness — is out too.
 * 2. **One orientation per shape family.** A rotated glyph is not a new glyph. The eye
 *    reads `▲ ▼ ◀ ▶` as one symbol pointing four ways and has to *decode* the direction,
 *    which is precisely the work a chart symbol exists to avoid. Only the upward
 *    triangle survives; likewise a single half-filled circle, with no mirror twin to be
 *    confused against.
 * 3. **No two glyphs may share an ink blob.** At 9px a solid glyph reads as its filled
 *    area and little else, so `★` and the filled diamond `♦` become the same dark lozenge.
 *    The star is kept only in outline, where its points actually register. The same trap
 *    retired the geometric diamond `◆` in print (#28) — indistinguishable from `♦`.
 *
 * The same reasoning excludes the size variants (`▲`/`▴`) and weight variants (`+`/`✚`)
 * the prototype shipped. Letters and digits are exempt from rule 2 — they are drawn by
 * type designers specifically to stay distinct at small sizes. Most digits stay out
 * because they collide with a letter already in the set (`0`/`O`, `1`/`I`, `2`/`Z`,
 * `5`/`S`, `6`/`G`, `8`/`B`, `9`/`P`) — but `3 4 7` have no letter twin and are kept
 * (#30 / D3).
 *
 * **The widened block (#30 / D3), settled by the print test (#28, 2026-07-23).** Beyond the
 * original 37, a block reaching for card suits, print marks and the three digits above was
 * added over the bundled font, deliberately generous, on the understanding that the print
 * test would cull whatever blob-collided on paper. It has now been taken. Two were culled —
 * the geometric diamond `◆` (the card suit `♦` kept in its place, and promoted into tier 1)
 * and the crosshatch square `▦` (against solid `■` and open `□`) — leaving **47**. The
 * survivors kept their appended positions; a full re-rank of the settled set by distinctness
 * is deferred post-launch (#57), where widening the pool further is also tracked.
 *
 * **Why these code points.** Every glyph is a single BMP code point. The original 37 were
 * kept inside near-universal ranges (Basic Latin, Latin-1, Geometric Shapes, the outline
 * star) so the set survived *any* font. The widened glyphs reach into Miscellaneous Symbols
 * (`♥ ♣ ♦ ♠`) and General Punctuation (`† ‡ § ¶`), which are **not** universal — that is
 * safe because the export bundles and embeds DejaVu Sans (#32, §5.5) and
 * `font-coverage.test.ts` asserts every codepoint here resolves in it rather than falling
 * back to tofu. The bundled font, not the range, is the guarantee (#30 / D4).
 *
 * **§8's symbol-set question, resolved.** The set opened at 37 (the count that stays
 * legible in font-safe ranges); it grew to 49 over the bundled font (#30 / D3), and the
 * print test (#28) then settled it at **47**. `MAX_COLOUR_COUNT` tracks the array length,
 * so it stays in lockstep. See §5.3.
 */

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
  // The set's filled diamond is the card suit ♦, kept over the geometric ◆ after the
  // print test (#28): the two were indistinguishable on paper, and Gemma chose ♦.
  { glyph: '♦', name: 'diamond suit' },
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
  // ── Widened block (#30 / D3), now settled by the print test (#28, 2026-07-23) ──────
  // These reach past the original font-safe ranges, safe because a font is bundled (#32)
  // and proven to cover them (font-coverage.test.ts). They kept their appended position
  // rather than being re-ranked into the tiers above: the print test settled *membership*,
  // but re-ranking the whole set by distinctness is deferred post-launch (#57). Two of the
  // originally-generous additions were culled by the print test — the geometric diamond ◆
  // (♦ kept in its place, tier 1) and the crosshatch square ▦ (against solid ■ and open □).
  // 6. Card suits — strong filled silhouettes. ♦ was promoted into tier 1 as the set's
  //    filled diamond; ♠ survived the print test against ▲, contrary to the earlier guess.
  { glyph: '♥', name: 'heart' },
  { glyph: '♣', name: 'club' },
  { glyph: '♠', name: 'spade' },
  // 7. Print marks — typographic, drawn to stay distinct small; unlike anything above.
  { glyph: '†', name: 'dagger' },
  { glyph: '‡', name: 'double dagger' },
  { glyph: '§', name: 'section sign' },
  { glyph: '¶', name: 'pilcrow' },
  // 8. Restored numerals — the three digits with no letter twin in the set (#30 / D3).
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
 * This is also the effective colour cap for Req. 6. It opened at 37, grew to 49 over the
 * bundled font (#30 / D3), and the print test (#28) settled it at **47**. Across all Wesnoth
 * sprites the full distinct-DMC palette fits under 47 about 99% of the time; the rest
 * reduce (#14), which is exactly what reduction is for. (Re-measured by
 * `npm run validate:cap`, which reports `coverageAtCap`.)
 *
 * **Settled by the print test (#28), but tracked for growth (#57).** The cap is legible
 * because every glyph in the set was judged distinct on paper. Widening the pool further —
 * more of DejaVu Sans — is post-launch work (#57), and would raise this number. It cannot
 * be raised or lowered on its own — it *is* `STITCH_SYMBOLS.length`.
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
 * **`symbolsFor` now lives in `assignment.ts`.** Which glyph a colour gets is no longer a
 * property of this module: #30/D1 turned it into a choice between rules, and Gemma chose
 * **interleaved**. This file owns the *set*; `assignment.ts` owns *who gets what*, and
 * exports `symbolsFor` as the app-wide entry point so the chart and the floss key cannot
 * drift apart.
 */
