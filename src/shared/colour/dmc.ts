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
