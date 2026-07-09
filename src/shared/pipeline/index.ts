/**
 * Conversion pipeline (design §5.2). Public entry point.
 * Step 1 (map to DMC) lives here; reduction (#14) and symbols (#16) land next.
 */
export type { PaletteColour, QuantizedPalette, StitchPattern } from './types'
export { mapSpriteToDmc, type MapToDmcOptions, type MappedSprite } from './map-to-dmc'
