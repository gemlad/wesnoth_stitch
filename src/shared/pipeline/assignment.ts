/**
 * Symbol-assignment strategies for the chart (#30 / D1).
 *
 * The palette is sorted dominant-floss-first (§5.2), and every strategy here returns one
 * symbol per colour, **index-aligned** with `palette.colours` — so what differs between them
 * is only *which glyph the largest colour area gets*. That single choice is the whole of the
 * #30 field problem: today's rule gives it the inkiest glyph.
 *
 * Three strategies, to be judged against real charts (`npm run assign:compare`):
 *
 * - **distinctness** — the status quo (§5.3). Array order, so the dominant floss takes the
 *   most distinctive glyph. Identical to `symbolsFor`; kept here so the comparison has a
 *   baseline that goes through the same code path.
 * - **inverse-density** — the opposite. Glyphs ordered lightest-ink first (`GLYPHS_BY_INK`),
 *   so the *largest* area gets the *faintest* glyph and the densest regions stop reading as a
 *   black blob. The direct fix for finding 1.
 * - **interleaved** — Gemma's idea: most distinct, then least dense, then second most
 *   distinct, then second least dense, … The single hero colour still gets a bold mark, but
 *   the next-largest areas are pushed to faint glyphs, so the field breaks up without losing
 *   a strong anchor.
 *
 * Not here: a *stability* strategy (assign against the base palette so a colour keeps its
 * glyph as `k` changes). That addresses churn across the slider (#30 / D2), a different axis
 * that is invisible on any single exported chart — and one Gemma has deprioritised. It needs
 * the reduction plan, not just the reduced palette, so it lands separately if wanted.
 */
import type { QuantizedPalette } from './types'
import { MAX_COLOUR_COUNT, STITCH_SYMBOLS, type StitchSymbol } from './symbols'
import { GLYPHS_BY_INK } from './glyph-ink'

export type AssignmentStrategy = 'distinctness' | 'inverse-density' | 'interleaved'

export const ASSIGNMENT_STRATEGIES: readonly AssignmentStrategy[] = [
  'distinctness',
  'inverse-density',
  'interleaved'
]

const BY_GLYPH: ReadonlyMap<string, StitchSymbol> = new Map(STITCH_SYMBOLS.map((s) => [s.glyph, s]))

/** Distinctness order (§5.3): the array as authored. */
const DISTINCTNESS_ORDER: readonly string[] = STITCH_SYMBOLS.map((s) => s.glyph)

/** Lightest-ink first, so the dominant floss gets the faintest glyph. */
const INVERSE_DENSITY_ORDER: readonly string[] = GLYPHS_BY_INK

/**
 * Most distinct, then least dense, then second most distinct, … deduped. Zips the
 * distinctness order against the ink-ascending order and takes each glyph the first time it
 * appears, so every glyph still appears exactly once.
 */
const INTERLEAVED_ORDER: readonly string[] = (() => {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (g: string): void => {
    if (!seen.has(g)) {
      seen.add(g)
      out.push(g)
    }
  }
  for (let i = 0; i < DISTINCTNESS_ORDER.length; i++) {
    push(DISTINCTNESS_ORDER[i])
    push(GLYPHS_BY_INK[i])
  }
  return out
})()

const ORDER: Record<AssignmentStrategy, readonly string[]> = {
  distinctness: DISTINCTNESS_ORDER,
  'inverse-density': INVERSE_DENSITY_ORDER,
  interleaved: INTERLEAVED_ORDER
}

const symbolForGlyph = (glyph: string): StitchSymbol => {
  const s = BY_GLYPH.get(glyph)
  if (!s) throw new Error(`No StitchSymbol for glyph ${JSON.stringify(glyph)}`)
  return s
}

/**
 * One symbol per palette colour, index-aligned with `palette.colours`, under the chosen
 * strategy. `distinctness` reproduces `symbolsFor` exactly.
 *
 * @throws RangeError if the palette holds more colours than the symbol set can name.
 */
export function assignSymbols(
  palette: QuantizedPalette,
  strategy: AssignmentStrategy
): readonly StitchSymbol[] {
  if (palette.colours.length > MAX_COLOUR_COUNT) {
    throw new RangeError(
      `Palette has ${palette.colours.length} colours but only ${MAX_COLOUR_COUNT} stitch symbols exist`
    )
  }
  const order = ORDER[strategy]
  return palette.colours.map((_, i) => symbolForGlyph(order[i]))
}

/**
 * The glyph order a strategy spends, as bare glyphs — handy for measurement and for the
 * comparison renderer, which cares about the sequence rather than per-colour names.
 */
export function glyphOrder(strategy: AssignmentStrategy): readonly string[] {
  return ORDER[strategy]
}
