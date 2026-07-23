/**
 * Default save-dialog name for a chart PDF (#48).
 *
 * The same sprite exported in symbol mode and in colour mode used to suggest the identical
 * `<sprite>-chart.pdf`, so the second export silently overwrote the first. Tagging the chart
 * mode keeps them distinct in the same folder. Pure and Electron-free, so it is unit-tested
 * without pulling in the IPC layer.
 */
import type { SymbolDisplay } from '../../shared/ipc'

/** How each chart mode reads in a filename. */
const MODE_SLUG: Record<SymbolDisplay, string> = {
  colour: 'colour',
  symbol: 'symbols',
  both: 'colour-symbols'
}

/**
 * The default filename (no extension — the save dialog adds `.pdf`) for `spriteName`'s chart
 * in `symbolDisplay` mode, e.g. `fighter-chart-symbols`.
 */
export function chartExportName(spriteName: string, symbolDisplay: SymbolDisplay): string {
  return `${spriteName}-chart-${MODE_SLUG[symbolDisplay]}`
}
