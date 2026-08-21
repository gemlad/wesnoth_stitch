/**
 * Default save-dialog names for the chart PDFs (#48, #55).
 *
 * The same sprite exported in symbol mode and in colour mode used to suggest the identical
 * `<sprite>-chart.pdf`, so the second export silently overwrote the first. Tagging the chart
 * mode keeps them distinct in the same folder. The Pattern Keeper chart (#55) is a third file
 * again, and names itself the way that issue asks. Pure and Electron-free, so both are
 * unit-tested without pulling in the IPC layer.
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

/**
 * The default filename (no extension) for `spriteName`'s Pattern Keeper chart (#55), e.g.
 * `fighter_chart_PK`.
 *
 * **Underscores and a capital `PK`, against this file's own hyphenated house style**, because
 * #55 specifies the name character for character. Two exports of one sprite end up side by
 * side in a downloads folder and then on a phone, and "which of these is the one the app
 * imports" is answered by the suffix — so the suffix is the one the issue asked for rather
 * than the one that matches its neighbours.
 *
 * No chart mode in the name: the Pattern Keeper document is always symbols on bare paper (see
 * `pdf-pk.ts`), so unlike {@link chartExportName} there is nothing here for a mode to
 * distinguish.
 */
export function patternKeeperExportName(spriteName: string): string {
  return `${spriteName}_chart_PK`
}
