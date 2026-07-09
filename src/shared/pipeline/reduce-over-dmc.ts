/**
 * Step 2 of the conversion pipeline (design §5.2): reduce the DMC-mapped palette
 * (#15) to the requested colour count `k` by **merging the perceptually closest
 * floss colours**, weighted by pixel frequency.
 *
 * Agglomerative (bottom-up) merge in Lab, with two deliberate choices:
 *
 * - **Ward-style linkage.** Merging clusters A and B costs
 *   `wA·wB / (wA + wB) · ΔE(repA, repB)²` — the standard Ward increase-in-error
 *   term, with pixel counts as the weights. That weight factor is what stops "a
 *   floss used once surviving at the expense of one used 500 times": absorbing a
 *   1-pixel cluster costs ≈1× its ΔE², while merging two 500-pixel clusters costs
 *   ≈250×, so rare colours fold into their neighbours long before dominant ones
 *   are touched. Distance alone would merge the two big clusters and keep the
 *   stray pixel as a whole palette entry.
 * - **Medoid representatives (k-medoids, not k-means).** A merged group's colour is
 *   the member floss minimising the pixel-weighted sum of ΔE across the group — a
 *   *real* DMC colour, so the final palette needs no second snap (§5.2). Weighting
 *   again favours the dominant floss, so merged pixels reassign to the thread that
 *   already covered most of them.
 *
 * **Slider stability (§5.2).** `planReduction` runs the merge once and records the
 * whole sequence; `reduceTo(plan, k)` replays the first `n - k` of those merges.
 * Cutting one merge sequence at different depths makes the partitions *nest* by
 * construction — the palette at `k - 1` is the palette at `k` with exactly two
 * entries merged, never a re-clustering. Dragging the colour-count slider is a
 * warm-started replay, not a re-run of the algorithm.
 *
 * Pure: nothing here mutates the `MappedSprite` it is given.
 */
import { labDistance } from '../colour'
import type { MappedSprite } from './map-to-dmc'
import type { PaletteColour, QuantizedPalette, StitchPattern } from './types'

/**
 * One step of the merge sequence, in the usual dendrogram encoding: cluster ids
 * `0..n-1` are the leaves (indices into the base palette's `colours`), and the
 * i-th merge creates cluster `n + i`. Applying merges `0..i` leaves `n - i - 1`
 * clusters standing.
 */
export interface PaletteMerge {
  /** Cluster ids merged by this step. */
  a: number
  b: number
  /** Base-palette index of the merged cluster's representative floss (its weighted medoid). */
  medoid: number
  /** Source pixels covered by the merged cluster — the two inputs' counts summed. */
  pixelCount: number
  /** Ward-style cost of this merge. Exposed for diagnostics (#20); not used by `reduceTo`. */
  cost: number
}

/**
 * A sprite's full merge sequence, computed once. Cut it at any `k` with `reduceTo`.
 * `merges` has `max(0, n - 1)` entries, enough to collapse the palette to one colour.
 */
export interface ReductionPlan {
  /** The full-fidelity mapped sprite this plan reduces (design's "fidelity ceiling"). */
  readonly base: MappedSprite
  readonly merges: readonly PaletteMerge[]
}

/** A reduced palette and the stitch grid reindexed onto it. Shape matches `MappedSprite`. */
export interface ReducedSprite {
  palette: QuantizedPalette
  pattern: StitchPattern
}

/** A live cluster during the merge. `leaves` are base-palette indices, kept sorted. */
interface Cluster {
  id: number
  leaves: number[]
  /** Base-palette index of this cluster's representative floss. */
  medoid: number
  /** Total pixel count across `leaves`. */
  weight: number
}

/** Full symmetric matrix of Lab ΔE between base palette entries. */
function pairwiseLabDistances(colours: readonly PaletteColour[]): number[][] {
  const n = colours.length
  const d = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      d[i][j] = d[j][i] = labDistance(colours[i].lab, colours[j].lab)
    }
  }
  return d
}

/**
 * Ward-style merge cost, using each cluster's medoid as its position in Lab.
 * Squared ΔE (as Ward's criterion is defined) so far-apart merges are penalised
 * sharply — visually distinct floss survives to low `k`.
 */
function mergeCost(a: Cluster, b: Cluster, d: number[][]): number {
  const deltaE = d[a.medoid][b.medoid]
  return ((a.weight * b.weight) / (a.weight + b.weight)) * deltaE * deltaE
}

/**
 * The member floss minimising the pixel-weighted sum of ΔE to the whole group.
 *
 * `leaves` is sorted ascending, and the base palette is ordered by descending pixel
 * count (ties by DMC code), so taking the first strict minimum resolves ties toward
 * the dominant floss — the same ordering rule the mapper uses.
 */
function weightedMedoid(
  leaves: readonly number[],
  colours: readonly PaletteColour[],
  d: number[][]
): number {
  let best = leaves[0]
  let bestCost = Infinity
  for (const i of leaves) {
    let cost = 0
    for (const j of leaves) cost += colours[j].pixelCount * d[i][j]
    if (cost < bestCost) {
      bestCost = cost
      best = i
    }
  }
  return best
}

/**
 * Compute a sprite's full merge sequence — the expensive half, run once per sprite.
 *
 * O(n³) distance *lookups* over a precomputed n×n ΔE matrix, where n is the sprite's
 * distinct-DMC count (23–37 on real Wesnoth sprites, capped at 40 by Req. 6). The
 * only trigonometry-grade work is the n² Lab distances, computed up front.
 */
export function planReduction(base: MappedSprite): ReductionPlan {
  const colours = base.palette.colours
  const n = colours.length
  const d = pairwiseLabDistances(colours)

  const active: Cluster[] = colours.map((c, i) => ({
    id: i,
    leaves: [i],
    medoid: i,
    weight: c.pixelCount
  }))

  const merges: PaletteMerge[] = []
  let nextId = n

  while (active.length > 1) {
    // Cheapest pair wins; scanning i < j ascending makes ties resolve deterministically.
    let bestI = 0
    let bestJ = 1
    let bestCost = Infinity
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const cost = mergeCost(active[i], active[j], d)
        if (cost < bestCost) {
          bestCost = cost
          bestI = i
          bestJ = j
        }
      }
    }

    const a = active[bestI]
    const b = active[bestJ]
    const leaves = [...a.leaves, ...b.leaves].sort((x, y) => x - y)
    const merged: Cluster = {
      id: nextId++,
      leaves,
      medoid: weightedMedoid(leaves, colours, d),
      weight: a.weight + b.weight
    }

    merges.push({
      a: a.id,
      b: b.id,
      medoid: merged.medoid,
      pixelCount: merged.weight,
      cost: bestCost
    })

    active.splice(bestJ, 1) // bestJ > bestI, so remove the later index first
    active.splice(bestI, 1)
    active.push(merged)
  }

  return { base, merges }
}

/**
 * Cut a plan at `k` colours — the cheap half, safe to call on every slider frame.
 *
 * Replays the first `n - k` merges (pure bookkeeping; every representative was
 * chosen when the plan was built), then re-sorts and reindexes the grid. Because
 * all cuts come from one sequence, `reduceTo(plan, k - 1)` is always
 * `reduceTo(plan, k)` with exactly two entries merged.
 *
 * When `k` is at or above the sprite's distinct-DMC count there is nothing to merge
 * and the base sprite is returned as-is.
 *
 * @throws RangeError if `k` is not a positive integer.
 */
export function reduceTo(plan: ReductionPlan, k: number): ReducedSprite {
  if (!Number.isInteger(k) || k < 1) {
    throw new RangeError(`Colour count must be a positive integer, got ${k}`)
  }

  const base = plan.base.palette
  const n = base.colours.length
  if (k >= n) return plan.base

  // Replay merges. Map iteration order is insertion order, so this stays deterministic.
  const clusters = new Map<number, { leaves: number[]; medoid: number; pixelCount: number }>()
  for (let i = 0; i < n; i++) {
    clusters.set(i, { leaves: [i], medoid: i, pixelCount: base.colours[i].pixelCount })
  }
  for (let step = 0; step < n - k; step++) {
    const { a, b, medoid, pixelCount } = plan.merges[step]
    const left = clusters.get(a)!
    const right = clusters.get(b)!
    clusters.delete(a)
    clusters.delete(b)
    clusters.set(n + step, { leaves: [...left.leaves, ...right.leaves], medoid, pixelCount })
  }

  // Each group takes its medoid's floss colour, carrying the group's total pixel count.
  const groups = [...clusters.values()].map((g) => ({
    leaves: g.leaves,
    colour: { ...base.colours[g.medoid], pixelCount: g.pixelCount } satisfies PaletteColour
  }))

  // Same deterministic order as the mapper: dominant floss first, ties by DMC code.
  groups.sort(
    (x, y) =>
      y.colour.pixelCount - x.colour.pixelCount ||
      x.colour.dmc.code.localeCompare(y.colour.dmc.code)
  )

  const reducedIndexByLeaf = new Array<number>(n)
  groups.forEach((g, reducedIndex) => {
    for (const leaf of g.leaves) reducedIndexByLeaf[leaf] = reducedIndex
  })

  const { width, height, cells } = plan.base.pattern
  return {
    palette: {
      colours: groups.map((g) => g.colour),
      colourCount: groups.length,
      sourceColourCount: base.sourceColourCount
    },
    pattern: {
      width,
      height,
      cells: cells.map((row) =>
        row.map((cell) => (cell === null ? null : reducedIndexByLeaf[cell]))
      )
    }
  }
}

/**
 * Reduce a mapped sprite to `k` floss colours in one call.
 *
 * Convenience for one-shot conversions. Callers that vary `k` — the colour-count
 * slider (#19) — should hold a `planReduction` result and call `reduceTo` instead,
 * so the merge runs once per sprite rather than once per frame.
 */
export function reduceSprite(base: MappedSprite, k: number): ReducedSprite {
  return reduceTo(planReduction(base), k)
}
