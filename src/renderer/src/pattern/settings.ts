/**
 * Pattern presentation settings — the renderer's view of them.
 *
 * **The types moved to `shared/ipc.ts` (#34).** They used to be declared here, on the
 * reasoning that nothing outside the renderer consumed them: the preview read them, the
 * pipeline did not, and a view setting had no business sitting in a headless module. That
 * reasoning carried an explicit expiry — §6 said the types move to `shared/ipc.ts` *"if and
 * when export runs in the main process and it actually has to cross a process boundary"*.
 * The PDF chart is that export, so they have moved, and they are re-exported here so the
 * preview's callers keep their existing import.
 *
 * What stays renderer-side is what is genuinely renderer-side: the default, and the
 * `<input type="color">` ↔ `RGB` conversions.
 */
import type { RGB } from '../../../shared/colour'

export type { PatternSettings, SymbolDisplay } from '../../../shared/ipc'
import type { PatternSettings } from '../../../shared/ipc'

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
