/**
 * Shared colour utilities for the conversion pipeline (§5.2/§5.3).
 * Public entry point — import from here rather than the individual files.
 */
export type { RGB, LabColor, DMCEntry } from './types'
export { srgbToLab, labDistance } from './convert'
export { DMC_COLORS, DMC_REFERENCE, nearestDmc, nearestDmcToRgb, type DMCReference } from './dmc'
