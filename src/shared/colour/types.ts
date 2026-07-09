/**
 * Shared colour types for the conversion pipeline (§5.2, §6 of the design doc).
 *
 * These are the small value types the quantization (#14), DMC mapping (#15) and
 * preview (#18) code all speak in. Kept in `src/shared` so main and renderer
 * build against the same shapes, like the IPC contract next door.
 */

/** An 8-bit sRGB colour. Each channel is an integer in [0, 255]. */
export interface RGB {
  r: number
  g: number
  b: number
}

/**
 * A CIELAB colour (D65). `l` is roughly [0, 100]; `a`/`b` are unbounded but
 * typically within ±128. Euclidean distance here approximates perceived colour
 * difference — the whole reason the pipeline clusters and matches in Lab (§5.2).
 */
export interface LabColor {
  l: number
  a: number
  b: number
}

/** One DMC floss colour from the reference chart (§5.3). */
export interface DMCEntry {
  /** DMC catalogue code, e.g. "310" or "B5200". The part that must match at checkout. */
  code: string
  /** Human-readable name, e.g. "Black". Indicative only — see the dataset caveat. */
  name: string
  /** `#RRGGBB`, upper-case. */
  hex: string
  /** The same colour as 8-bit sRGB, precomputed from `hex`. */
  rgb: RGB
}
