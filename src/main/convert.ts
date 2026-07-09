/**
 * Sprite → stitch pattern, in the main process (#17).
 *
 * Runs the whole pipeline behind one call: decode (§4) → map to DMC (§5.2 step 2) →
 * reduce over floss (step 3) → assign chart symbols (§5.3).
 *
 * **Why the main process, and not a renderer web worker.** The preview re-runs live as
 * the colour-count slider drags, so the question is what a warm re-run actually costs.
 * Measured through real IPC in the running app (72×72 scout, k=20, steady state):
 *
 * | | ms |
 * |---|---|
 * | IPC round-trip, trivial payload | 0.157 |
 * | main-process compute (`reduceTo` + `symbolsFor`) | **0.077** |
 * | renderer-observed warm tick | 1.877 |
 * | ⇒ payload serialization | **1.643** |
 *
 * Compute is 4% of a slider frame; serialising the palette + 5,184-cell grid is 88%. A
 * web worker would pay that same serialization on `postMessage`, so moving the compute
 * off the main process buys back at most 0.077 ms — nothing. The choice is therefore
 * free to be made on architecture, and §4 wants the pipeline in the main process so that
 * export (§5.5) and batch processing (§7.2) can reuse it headlessly while the renderer
 * stays a UI layer. So: main process.
 *
 * A 13-floss sprite costs the same 1.6 ms as a 31-floss one, so the payload is dominated
 * by the **grid**, not the palette. If a future grid outgrows the budget, the lever is
 * `StitchPattern.cells` — a flat `Int16Array` (with `-1` for no-stitch) clones far more
 * cheaply than `(number | null)[][]` — not moving the compute. Not worth doing at 1.9 ms.
 *
 * #19 priced that lever rather than guessing: cloning the 5,184-cell nested array costs
 * 0.6 ms against 0.0 ms for the equivalent `Int16Array` (41 KB → 10 KB). Real, but it is
 * 0.6 ms off a 4.2 ms slider step, paid for with a change to a type the pipeline, the IPC
 * contract, the grid and their tests all speak. Still not worth doing. The round trip is
 * at the *floor* of IPC latency, not above it: a trivial call on the same wire costs
 * 1.8 ms.
 *
 * **What is cached, and why it has to be.** The cold path is dominated by `mapToDmc`,
 * which does a nearest-floss search per *distinct source colour*: ~2 ms for a simple
 * sprite, but 48.6 ms end-to-end for `merfolk/citizen.png` (94 distinct floss). Running
 * that on every slider frame would be unusable — 25× the frame budget. It is also
 * entirely independent of `k`, so the decode + map + merge plan are computed once per
 * sprite and cached; only `reduceTo` runs per frame. This is exactly the split
 * `planReduction`/`reduceTo` was built for (#14) — the cache is what turns it into a warm
 * start across IPC calls.
 *
 * That cold cost is a real hitch on selecting a rich sprite, and it is not hidden: the
 * preview pane (§5.4) already has the raw image on screen while it runs. #19 needed no
 * separate prewarm in the end: selecting a sprite converts it at the default `k`, which
 * fills this cache, and the slider only appears once that returns — so the first drag
 * step is already warm.
 */
import {
  MAX_COLOUR_COUNT,
  mapSpriteToDmc,
  planReduction,
  reduceTo,
  symbolsFor,
  type ReductionPlan
} from '../shared/pipeline'
import type { ConvertedSprite } from '../shared/ipc'
import { decodeImage } from './images'

/**
 * How many sprites' plans to keep. A plan holds the base palette, the merge sequence and
 * the full-fidelity grid — order 100 KB for a 72×72 sprite — so this is a small, bounded
 * cost. Sized for the realistic access pattern: the user drags the slider on one sprite,
 * and clicking back to a recently-viewed one should still be warm.
 */
export const PLAN_CACHE_MAX = 12

/**
 * Insertion-ordered, so the oldest key is `keys().next()` — a Map is an LRU as long as we
 * re-insert on hit. Keyed by sprite id; sprite files are read-only assets for the app's
 * lifetime, so there is nothing to invalidate against.
 */
const planCache = new Map<string, ReductionPlan>()

/** Drop every cached plan. Exists for tests; the app never needs it. */
export function clearPlanCache(): void {
  planCache.clear()
}

async function planFor(id: string, absPath: string): Promise<ReductionPlan> {
  const hit = planCache.get(id)
  if (hit) {
    planCache.delete(id) // re-insert to mark most-recently-used
    planCache.set(id, hit)
    return hit
  }

  const plan = planReduction(mapSpriteToDmc(await decodeImage(absPath)))
  planCache.set(id, plan)
  if (planCache.size > PLAN_CACHE_MAX) {
    planCache.delete(planCache.keys().next().value as string)
  }
  return plan
}

/**
 * The Req. 6 default colour count: the sprite's own distinct-DMC count, capped at the
 * symbol-set ceiling (§5.3). Roughly one sprite in fifteen is capped here.
 */
export function defaultColourCount(sourceColourCount: number): number {
  return Math.min(sourceColourCount, MAX_COLOUR_COUNT)
}

/**
 * Convert the sprite at `absPath` to a pattern of `colourCount` floss colours.
 *
 * `id` is the cache key; `absPath` must already have been validated against the sprite
 * root by the caller (the IPC handler owns that trust boundary, as it does for the other
 * channels). Omit `colourCount` for the Req. 6 default.
 *
 * @throws RangeError if `colourCount` is not an integer in `1..MAX_COLOUR_COUNT`.
 */
export async function convertSprite(
  id: string,
  absPath: string,
  colourCount?: number
): Promise<ConvertedSprite> {
  if (
    colourCount !== undefined &&
    (!Number.isInteger(colourCount) || colourCount < 1 || colourCount > MAX_COLOUR_COUNT)
  ) {
    throw new RangeError(
      `colourCount must be an integer in 1..${MAX_COLOUR_COUNT}, got ${colourCount}`
    )
  }

  const plan = await planFor(id, absPath)
  const { sourceColourCount } = plan.base.palette

  // A fully transparent sprite has no colours to reduce or name, and `reduceTo` rejects
  // k < 1 — hand back the empty base rather than inventing a colour count for it.
  if (sourceColourCount === 0) {
    return {
      palette: plan.base.palette,
      pattern: plan.base.pattern,
      symbols: [],
      maxColourCount: MAX_COLOUR_COUNT
    }
  }

  // Asking for more colours than the sprite has is a no-op, not an error: `reduceTo`
  // returns the full-fidelity base. That keeps the slider well-behaved at its top end.
  const { palette, pattern } = reduceTo(plan, colourCount ?? defaultColourCount(sourceColourCount))
  return { palette, pattern, symbols: [...symbolsFor(palette)], maxColourCount: MAX_COLOUR_COUNT }
}
