import type { SpriteDownloadProgress } from '../../../shared/ipc'
import { downloadPercent, phaseLabel } from './sprite-progress-format'

/**
 * First-run download screen (#70). A packaged build has no sprites until it fetches them, so
 * instead of the missing-folder error the app shows this: what is happening, a progress bar,
 * and — if the download fails (offline, say) — a retry. Shown only while there is no set to
 * fall back to; the "update sprites" action reuses the same download but stays inline.
 */
export function SpriteSetup({
  progress,
  error,
  busy,
  onRetry
}: {
  progress: SpriteDownloadProgress | null
  error: string | null
  busy: boolean
  onRetry: () => void
}): React.JSX.Element {
  const pct = downloadPercent(progress)
  return (
    <div className="sprite-setup">
      <h2>Getting the Wesnoth sprites</h2>
      <p className="sprite-setup__lead">
        The unit sprites are downloaded from the official Battle for Wesnoth project the first
        time you run the app — a one-time download of a few megabytes. It needs an internet
        connection just this once.
      </p>

      {error ? (
        <div className="sprite-setup__error" role="alert">
          <p>Couldn’t download the sprites: {error}</p>
          <button onClick={onRetry} disabled={busy}>
            Try again
          </button>
        </div>
      ) : (
        <div className="sprite-setup__progress">
          <div className="sprite-progress" aria-hidden="true">
            <div
              className="sprite-progress__bar"
              style={pct === null ? { width: '100%', opacity: 0.4 } : { width: `${Math.round(pct * 100)}%` }}
            />
          </div>
          <p className="sprite-setup__phase">{phaseLabel(progress, pct)}</p>
        </div>
      )}
    </div>
  )
}
