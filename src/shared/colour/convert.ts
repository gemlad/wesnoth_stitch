/**
 * sRGB ↔ Lab conversion and perceptual distance, backed by `culori` (§5.2).
 *
 * The pipeline works in CIELAB because Euclidean distance there approximates
 * *perceived* colour difference, which raw-RGB distance does not — this is the
 * fix for the prototype flattening images too much (design §5.2). `culori` owns
 * the (non-trivial, gamma-correct) sRGB→Lab maths; we just adapt our 0–255 `RGB`
 * to its 0–1 model and expose the two operations the rest of the app needs.
 */
import { converter, differenceEuclidean } from 'culori'
import type { LabColor, RGB } from './types'

// culori's `lab` mode is D50-referenced; `lab65` is the D65 CIELAB that matches
// the standard sRGB→Lab tables (e.g. #FF0000 → L≈53.24), which is what we want.
const toLab = converter('lab65')
const euclideanLab = differenceEuclidean('lab65')

/** Convert an 8-bit sRGB colour to CIELAB (D65). */
export function srgbToLab({ r, g, b }: RGB): LabColor {
  const lab = toLab({ mode: 'rgb', r: r / 255, g: g / 255, b: b / 255 })
  return { l: lab.l, a: lab.a, b: lab.b }
}

/**
 * Perceptual distance between two Lab colours — Euclidean ΔE (CIE76).
 *
 * The design (§5.2) models perceived difference as straight-line distance in
 * Lab, so that is what we use. CIEDE2000 would be marginally more accurate but
 * is not needed for clustering/nearest-floss on limited-palette pixel art; it's
 * an easy swap (`differenceCiede2000`) if #20 ever shows it matters.
 */
export function labDistance(a: LabColor, b: LabColor): number {
  return euclideanLab({ mode: 'lab65', ...a }, { mode: 'lab65', ...b })
}
