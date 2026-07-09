/**
 * Data-model types for the conversion pipeline (design §6).
 *
 * The pipeline runs map-to-DMC first (#15, this module) then reduces over floss
 * (#14): both stages produce a `QuantizedPalette` + `StitchPattern`, so those
 * shapes live here, shared by main and renderer like the IPC contract.
 */
import type { DMCEntry, LabColor, RGB } from '../colour'

/**
 * One colour in a pattern's palette. After mapping, `rgb`/`lab` are the DMC
 * floss's own colour (what gets stitched and previewed), not the original source
 * pixel — several source shades can share one floss and collapse to one entry.
 */
export interface PaletteColour {
  lab: LabColor
  rgb: RGB
  dmc: DMCEntry
  /** How many opaque source pixels map to this floss. */
  pixelCount: number
}

/**
 * The set of floss colours a pattern uses (§6). Post-mapping and pre-reduction
 * `colourCount === sourceColourCount === colours.length`; reduction (#14) shrinks
 * `colours` and lowers `colourCount` while `sourceColourCount` stays as the
 * sprite's own distinct-DMC count (the Req. 6 default).
 */
export interface QuantizedPalette {
  colours: PaletteColour[]
  /** Number of entries in `colours` — the user-chosen k after reduction. */
  colourCount: number
  /** Distinct DMC colours the sprite maps to, before any reduction (§5.2, Req. 6). */
  sourceColourCount: number
}

/**
 * The grid itself: one cell per source pixel, 1:1 (Req. 4). Each cell is an index
 * into the matching `QuantizedPalette.colours`, or `null` for a no-stitch
 * (transparent) pixel. Row-major: `cells[y][x]`.
 */
export interface StitchPattern {
  width: number
  height: number
  cells: (number | null)[][]
}
