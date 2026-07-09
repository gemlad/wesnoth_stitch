/**
 * Presentation settings for a pattern (§6's `PatternSettings`).
 *
 * **Why this lives in the renderer, not `shared/pipeline/types.ts`.** Design §6 sketches
 * `PatternSettings` alongside `QuantizedPalette` and `StitchPattern`, but nothing in the
 * pipeline reads or produces it: `mapSpriteToDmc`, `reduceTo` and `symbolsFor` are pure
 * functions of pixels and floss, and none of them care what colour the fabric is. Putting
 * a view setting in `pipeline/types.ts` would sit UI state inside the one module whose
 * selling point is being headless and reusable. Both fields here are consumed by the
 * preview (§5.4) and, later, by export (§5.5) — never by conversion. If export ends up
 * running in the main process it moves to `shared/ipc.ts` then, when it actually has to
 * cross a process boundary, and not before.
 */
import type { RGB } from '../../../shared/colour'

/**
 * Which layers of the chart are drawn (§5.4). `colour` is the on-screen preview,
 * `symbol` is what a black-and-white printed chart looks like, `both` is the working
 * chart you stitch from.
 */
export type SymbolDisplay = 'colour' | 'symbol' | 'both'

export interface PatternSettings {
  /** Fabric colour. "No stitch" cells render as this, rather than assumed-white Aida (§8). */
  backgroundColour: RGB
  symbolDisplay: SymbolDisplay
}

/** Unbleached Aida — the default fabric, and visibly not white, so the setting is discoverable. */
export const DEFAULT_PATTERN_SETTINGS: PatternSettings = {
  backgroundColour: { r: 0xf2, g: 0xec, b: 0xdc },
  symbolDisplay: 'colour'
}

const clampChannel = (n: number): number => Math.max(0, Math.min(255, Math.round(n)))

/** `{ r, g, b }` → `#rrggbb`, the form both `<input type="color">` and `fillStyle` want. */
export function rgbToCss({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map((c) => clampChannel(c).toString(16).padStart(2, '0')).join('')
}

/** `#rrggbb` → `{ r, g, b }`. Only ever fed by `<input type="color">`, which normalises. */
export function cssToRgb(hex: string): RGB {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  }
}
