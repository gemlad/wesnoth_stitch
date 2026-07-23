import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpriteDownloadProgress, SpriteStatus, SpriteSummary } from '../../shared/ipc'
import { APP_LICENCE_LINES, LICENCE_LINES } from '../../shared/licence'
import { SpriteBrowser } from './components/SpriteBrowser'
import { PatternView } from './components/PatternView'
import { PreviewPane } from './components/PreviewPane'
import { SpriteSetup } from './components/SpriteSetup'
import { phaseLabel } from './components/sprite-progress-format'

function App(): React.JSX.Element {
  const [status, setStatus] = useState<SpriteStatus | null>(null)
  const [sprites, setSprites] = useState<SpriteSummary[] | null>(null)
  const [selected, setSelected] = useState<SpriteSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  // A single "download in progress" record drives both the first-run screen and the inline
  // "update sprites" control — which one is shown depends only on whether a set already exists.
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<SpriteDownloadProgress | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  // Guard against the mount effect firing a second time (React 18 StrictMode double-invoke).
  const started = useRef(false)

  const loadList = useCallback((): void => {
    window.api
      .getSpriteList()
      .then(setSprites)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const runDownload = useCallback((): void => {
    setDownloading(true)
    setDownloadError(null)
    setProgress(null)
    const unsubscribe = window.api.onSpriteProgress(setProgress)
    window.api
      .downloadSprites()
      .then(({ version }) => {
        setStatus((s) => (s ? { ...s, state: 'ready', version } : s))
        setError(null)
        loadList()
      })
      .catch((e: unknown) => setDownloadError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        unsubscribe()
        setDownloading(false)
        setProgress(null)
      })
  }, [loadList])

  useEffect(() => {
    if (started.current) return
    started.current = true
    window.api
      .getSpriteStatus()
      .then((s) => {
        setStatus(s)
        if (s.state === 'ready') loadList()
        else runDownload()
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [loadList, runDownload])

  // The first-run screen takes over only while there is no set to browse yet: still checking,
  // or downloading/errored with nothing loaded. Once sprites exist, downloads happen inline.
  const needsSetup =
    !error && !sprites && (status === null || status.state === 'absent' || downloading || downloadError !== null)

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Wesnoth Stitch</h1>
          <p className="subtitle">Pick a unit sprite to turn into a cross-stitch pattern.</p>
        </div>
        {status?.managed && sprites && (
          <div className="sprite-update">
            <button onClick={runDownload} disabled={downloading}>
              {downloading ? phaseLabel(progress, null) : 'Update sprites'}
            </button>
            {downloadError && <span className="sprite-update__error">Update failed: {downloadError}</span>}
          </div>
        )}
      </header>

      {error && <p className="app-status app-status--error">Couldn’t load sprites: {error}</p>}

      {needsSetup && (
        <SpriteSetup progress={progress} error={downloadError} busy={downloading} onRetry={runDownload} />
      )}

      {!error && !needsSetup && !sprites && <p className="app-status">Loading sprites…</p>}

      {sprites && (
        <div className="app-body">
          <SpriteBrowser sprites={sprites} selectedId={selected?.id ?? null} onSelect={setSelected} />
          {/* The pattern gets the centre: it is the thing being made, and zoom/pan needs
              the room. The raw sprite stays beside it — it is the reference you check the
              pattern against, so replacing it would cost the only side-by-side comparison
              in the app. */}
          <PatternView key={`pattern:${selected?.id ?? 'none'}`} sprite={selected} />
          <PreviewPane key={`preview:${selected?.id ?? 'none'}`} sprite={selected} />
        </div>
      )}

      {/* Two licence notices, kept distinct (#77): the app's own GPL licence, then the
          Wesnoth artwork attribution (#47, also on every exported page). Same wording as the
          PDF footer — one shared source in shared/licence.ts. */}
      <footer className="app-footer">
        {APP_LICENCE_LINES.map((line) => (
          <span key={line}>{line}</span>
        ))}
        <span className="app-footer__divider" aria-hidden="true">
          •
        </span>
        {LICENCE_LINES.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </footer>
    </div>
  )
}

export default App
