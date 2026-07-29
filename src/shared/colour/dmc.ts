/**
 * The DMC floss dataset plus the precomputed Lab reference table and
 * nearest-floss search that the mapping step (#15) runs against (§5.2/§5.3).
 *
 * Mapping to DMC is the *first* pipeline step (design §5.2): every opaque sprite
 * pixel is matched to its nearest floss before any colour reduction, so we don't
 * ditch fidelity to arbitrary centroids and snap later. That match is a Lab
 * nearest-neighbour search, so every floss colour's Lab value is precomputed once
 * here rather than per lookup.
 */
import { labDistance, srgbToLab } from './convert'
import { DMC_COLORS } from './dmc-data'
import type { DMCEntry, LabColor } from './types'

export { DMC_COLORS }
export type { DMCEntry }

/** A floss colour paired with its precomputed Lab value, for nearest-match search. */
export interface DMCReference {
  entry: DMCEntry
  lab: LabColor
}

/** Every DMC floss with its Lab value precomputed (built once at module load). */
export const DMC_REFERENCE: readonly DMCReference[] = DMC_COLORS.map((entry) => ({
  entry,
  lab: srgbToLab(entry.rgb)
}))

/**
 * Nearest DMC floss to a Lab colour, by perceptual (Lab ΔE) distance.
 *
 * Linear scan over the ~400-entry table — trivially fast, and callers dedupe by
 * exact source colour first (§5.2) so this runs per distinct colour, not per
 * pixel. Ties resolve to the earlier entry in the dataset.
 */
export function nearestDmc(lab: LabColor): DMCEntry {
  let best = DMC_REFERENCE[0]
  let bestDist = labDistance(lab, best.lab)
  for (let i = 1; i < DMC_REFERENCE.length; i++) {
    const d = labDistance(lab, DMC_REFERENCE[i].lab)
    if (d < bestDist) {
      bestDist = d
      best = DMC_REFERENCE[i]
    }
  }
  return best.entry
}

/** Convenience: nearest DMC floss to an 8-bit sRGB colour. */
export function nearestDmcToRgb(rgb: { r: number; g: number; b: number }): DMCEntry {
  return nearestDmc(srgbToLab(rgb))
}

/**
 * Order two DMC codes the way the catalogue does — and the way a shop's drawers are
 * filled (#90).
 *
 * **Not a string sort.** Codes are numbers written as text, so `localeCompare` puts `3865`
 * before `422` and `3` before `310`: an order that looks sorted and is useless to read down
 * with a floss box open. Numeric codes therefore compare by *value*.
 *
 * The three named codes in the dataset — `B5200`, `BLANC`, `ECRU` — have no numeric value, so
 * they sort alphabetically **after** every numbered floss rather than being wedged in at some
 * arbitrary point. Putting them at the end is a presentation call, not a fact about DMC; it is
 * this one comparator to change if the whites are wanted first.
 */
export function compareDmcCodes(a: string, b: string): number {
  const na = Number(a)
  const nb = Number(b)
  const aIsNumber = Number.isFinite(na)
  const bIsNumber = Number.isFinite(nb)

  if (aIsNumber && bIsNumber) return na - nb
  if (aIsNumber) return -1
  if (bIsNumber) return 1
  return a.localeCompare(b)
}
