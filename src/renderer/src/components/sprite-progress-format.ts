import type { SpriteDownloadProgress } from '../../../shared/ipc'

/**
 * Formatting for the sprite-download progress (#70), split out of SpriteSetup so that
 * component file only exports a component (react-refresh) and so App's inline "update" label
 * can reuse the same wording.
 */

/** Download fraction 0..1, or null when there is no measurable byte progress yet. */
export function downloadPercent(progress: SpriteDownloadProgress | null): number | null {
  if (!progress || progress.phase !== 'download') return null
  if (!progress.totalBytes || progress.receivedBytes === undefined) return null
  return Math.min(1, progress.receivedBytes / progress.totalBytes)
}

/** A human line for the current phase. */
export function phaseLabel(progress: SpriteDownloadProgress | null, pct: number | null): string {
  switch (progress?.phase) {
    case 'download':
      return pct === null ? 'Downloading sprites…' : `Downloading sprites… ${Math.round(pct * 100)}%`
    case 'extract':
      return 'Installing sprites…'
    case 'manifest':
    default:
      return 'Checking for the sprite set…'
  }
}
