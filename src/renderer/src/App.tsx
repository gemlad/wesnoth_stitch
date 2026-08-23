import { useCallback, useEffect, useRef, useState } from 'react'
import type { RGB } from '../../shared/colour'
import type {
  ConvertedSprite,
  SpriteDownloadProgress,
  SpriteStatus,
  SpriteSummary
} from '../../shared/ipc'
import { APP_LICENCE_LINES, LICENCE_LINES } from '../../shared/licence'
import { DEFAULT_PATTERN_SETTINGS } from './pattern/settings'
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

  /**
   * The fabric colour, held here rather than in `PatternView` (#50).
   *
   * `PatternView` is keyed by sprite id below, so selecting a sprite remounts it and resets
   * every piece of state it owns. That is what we want for the conversion and the zoom — and
   * exactly what we do not want for the fabric: picking a cloth is a decision about the
   * *project*, not about one unit, and having it snap back to unbleached Aida every time you
   * looked at another sprite silently threw that decision away.
   *
   * Only the fabric is lifted. `symbolDisplay` and `flip` stay inside `PatternView` and still
   * reset per sprite: they are decisions about how you are reading *this* chart, and the flip
   * in particular is a per-unit choice about which way a soldier should face.
   */
  const [backgroundColour, setBackgroundColour] = useState<RGB>(
    DEFAULT_PATTERN_SETTINGS.backgroundColour
  )

  /**
   * The conversion currently on the chart, reported up by `PatternView` so the preview pane
   * can draw the same reduction at sprite size beside the raw sprite (#108).
   *
   * It is held here rather than fetched twice because the two panes must be showing the same
   * thing: a second `convertSprite` call would be a second answer to the same question, and
   * the comparison is worthless the moment they can disagree.
   */
  const [converted, setConverted] = useState<ConvertedSprite | null>(null)

  // A single "download in progress" record drives both the first-run screen and the inline
  // "update sprites" control — which one is shown depends only on whether a set already exists.
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<SpriteDownloadProgress | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  // A confirmation shown after a successful "update sprites", so it doesn't just quietly
  // snap back to the button with no feedback.
  const [updateMessage, setUpdateMessage] = useState<string | null>(null)
  // Guard against the mount effect firing a second time (React 18 StrictMode double-invoke).
  const started = useRef(false)

  /**
   * Select a sprite, dropping the previous sprite's conversion in the same tick.
   *
   * Without the second setter the preview pane would render the *old* sprite's reduced image
   * against the new sprite for as long as the conversion takes — a frame or a hundred,
   * depending on how rich the sprite is. Clearing here rather than in an effect means that
   * frame never exists.
   */
  const selectSprite = useCallback((sprite: SpriteSummary): void => {
    setSelected(sprite)
    setConverted(null)
  }, [])

  const loadList = useCallback((): void => {
    window.api
      .getSpriteList()
      .then(setSprites)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const runDownload = useCallback((): void => {
    setDownloading(true)
    setDownloadError(null)
    setUpdateMessage(null)
    setProgress(null)
    const unsubscribe = window.api.onSpriteProgress(setProgress)
    window.api
      .downloadSprites()
      .then(({ version }) => {
        setStatus((s) => (s ? { ...s, state: 'ready', version } : s))
        setError(null)
        setUpdateMessage(`Sprites up to date (Wesnoth ${version}).`)
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
    !error &&
    !sprites &&
    (status === null || status.state === 'absent' || downloading || downloadError !== null)

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
            {!downloading && updateMessage && !downloadError && (
              <span className="sprite-update__ok">{updateMessage}</span>
            )}
            {downloadError && (
              <span className="sprite-update__error">Update failed: {downloadError}</span>
            )}
          </div>
        )}
      </header>

      {error && <p className="app-status app-status--error">Couldn’t load sprites: {error}</p>}

      {needsSetup && (
        <SpriteSetup
          progress={progress}
          error={downloadError}
          busy={downloading}
          onRetry={runDownload}
        />
      )}

      {!error && !needsSetup && !sprites && <p className="app-status">Loading sprites…</p>}

      {sprites && (
        <div className="app-body">
          <SpriteBrowser
            sprites={sprites}
            selectedId={selected?.id ?? null}
            onSelect={selectSprite}
          />
          {/* The pattern gets the centre: it is the thing being made, and zoom/pan needs
              the room. The raw sprite stays beside it — it is the reference you check the
              pattern against, so replacing it would cost the only side-by-side comparison
              in the app. */}
          <PatternView
            key={`pattern:${selected?.id ?? 'none'}`}
            sprite={selected}
            backgroundColour={backgroundColour}
            onBackgroundColourChange={setBackgroundColour}
            onConverted={setConverted}
          />
          <PreviewPane
            key={`preview:${selected?.id ?? 'none'}`}
            sprite={selected}
            converted={converted}
          />
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
