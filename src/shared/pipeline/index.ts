/**
 * Conversion pipeline (design §5.2). Public entry point.
 * Steps 1–2 (map to DMC, reduce over floss) live here; symbols (#16) land next.
 */
export type { PaletteColour, QuantizedPalette, StitchPattern } from './types'
export { mapSpriteToDmc, type MapToDmcOptions, type MappedSprite } from './map-to-dmc'
export {
  planReduction,
  reduceTo,
  reduceSprite,
  type PaletteMerge,
  type ReducedSprite,
  type ReductionPlan
} from './reduce-over-dmc'
