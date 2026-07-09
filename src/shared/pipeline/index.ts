/**
 * Conversion pipeline (design §5.2). Public entry point.
 * Steps 1–2 (map to DMC, reduce over floss) plus the chart symbols they feed (§5.3).
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
export {
  MAX_COLOUR_COUNT,
  STITCH_SYMBOLS,
  symbolAt,
  symbolsFor,
  type StitchSymbol
} from './symbols'
