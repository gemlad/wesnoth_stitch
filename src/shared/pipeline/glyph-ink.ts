/**
 * How much ink each stitch glyph lays down in a chart cell (#30 / D1).
 *
 * A property of the glyph in the **bundled export font** (DejaVu Sans), not of any sprite:
 * the fraction of a cell the glyph fills when drawn at chart scale (glyph height = 0.72 ×
 * cell, §5.4). Measured once by rendering each glyph and counting dark pixels — regenerate
 * with `npm run measure:ink`, which writes `out/legibility/glyph-ink.json`; these numbers
 * are that file, rounded to 4dp.
 *
 * **Why this exists.** Today's assignment hands glyphs out by *distinctness* (§5.3), and the
 * palette is sorted dominant-floss-first, so the largest colour area gets the inkiest glyph.
 * `STITCH_SYMBOLS` opens with the inkiest glyphs in the set — `■` (0.30), `●` (0.24),
 * `▲` (0.16), the filled diamond `♦` (0.11) — which is exactly why a heavily-shaded sprite
 * collapses into a near-solid black field (#30, finding 1). An *inverse-density* rule needs
 * a number to sort by; this is it.
 *
 * Kept out of `StitchSymbol` itself: it is measurement, not identity, and only the
 * assignment strategies (`assignment.ts`) read it.
 */
import { STITCH_SYMBOLS } from './symbols'

/** Cell-fill fraction per glyph, in the bundled DejaVu Sans. Higher = darker in a cell. */
export const GLYPH_INK: Readonly<Record<string, number>> = {
  // tier 1 — solid geometrics (among the heaviest glyphs in the set). The filled diamond
  // is the card suit ♦ (kept over ◆ in the print test #28) — see tier 6, where it is listed.
  '●': 0.2389,
  '■': 0.3025,
  '▲': 0.1558,
  // tier 2 — outline counterparts (light: only their stroke inks)
  '○': 0.0719,
  '□': 0.0847,
  '△': 0.0656,
  '◇': 0.0574,
  '☆': 0.0417,
  // tier 3 — half fill
  '◐': 0.154,
  // tier 4 — strokes
  '+': 0.0518,
  '×': 0.0593,
  '#': 0.1026,
  '=': 0.0525,
  // tier 5 — letters
  A: 0.0886,
  B: 0.1102,
  C: 0.0745,
  D: 0.1041,
  E: 0.0846,
  F: 0.0651,
  G: 0.0974,
  H: 0.0933,
  I: 0.0394,
  J: 0.0539,
  K: 0.0899,
  L: 0.054,
  M: 0.1301,
  N: 0.1139,
  P: 0.081,
  R: 0.0988,
  S: 0.0847,
  T: 0.0613,
  U: 0.0875,
  V: 0.0787,
  W: 0.1399,
  Y: 0.0601,
  Z: 0.0858,
  // tier 6 — card suits (widened set, #30/D3). ♦ is charted as tier 1's filled diamond.
  '♥': 0.1749,
  '♣': 0.1431,
  '♦': 0.1078,
  '♠': 0.1209,
  // tier 7 — print marks (widened set)
  '†': 0.054,
  '‡': 0.0686,
  '§': 0.0806,
  '¶': 0.099,
  // tier 8 — restored numerals (widened set)
  '3': 0.0751,
  '4': 0.078,
  '7': 0.0569
}

/**
 * The ink fraction of a glyph, or throws if it has never been measured — a glyph in
 * `STITCH_SYMBOLS` with no entry here is a bug (the two must stay in lockstep, which
 * `glyph-ink.test.ts` pins), not something to paper over with a default.
 */
export function inkOf(glyph: string): number {
  const v = GLYPH_INK[glyph]
  if (v === undefined) throw new Error(`No measured ink for glyph ${JSON.stringify(glyph)}`)
  return v
}

/**
 * The set's glyphs, ordered lightest-ink first. This is the sequence an inverse-density
 * assignment spends, so the largest colour area gets the faintest glyph.
 */
export const GLYPHS_BY_INK: readonly string[] = STITCH_SYMBOLS.map((s) => s.glyph).sort(
  (a, b) => inkOf(a) - inkOf(b)
)
