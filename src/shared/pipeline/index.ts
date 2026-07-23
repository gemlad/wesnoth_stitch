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
export { MAX_COLOUR_COUNT, STITCH_SYMBOLS, symbolAt, type StitchSymbol } from './symbols'
export { GLYPH_INK, GLYPHS_BY_INK, inkOf } from './glyph-ink'
// `symbolsFor` lives here, not in ./symbols: which glyph a colour gets is a *choice* of
// assignment rule (#30/D1), and every consumer must go through the one function so the
// chart and its floss key cannot disagree.
export {
  assignSymbols,
  glyphOrder,
  symbolsFor,
  ASSIGNMENT_STRATEGIES,
  DEFAULT_ASSIGNMENT_STRATEGY,
  type AssignmentStrategy
} from './assignment'
