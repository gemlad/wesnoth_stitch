import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RGB } from '../../../shared/colour'
import type { ConvertedSprite, SpriteSummary } from '../../../shared/ipc'
// Imported from the module rather than the pipeline barrel: that index re-exports the DMC
// dataset, and pulling 392 floss colours into the renderer bundle for one array reverse is
// exactly the trade `ConvertedSprite.maxColourCount` exists to avoid.
import { flipHorizontal } from '../../../shared/pipeline/flip'
import { MIN_SYMBOL_SCALE } from '../pattern/draw'
import { latestOnly } from '../pattern/latest-only'
import {
  cssToRgb,
  isDefaultBackground,
  rgbToCss,
  DEFAULT_PATTERN_SETTINGS,
  type PatternSettings,
  type SymbolDisplay
} from '../pattern/settings'
import { PatternGrid } from './PatternGrid'

interface Props {
  sprite: SpriteSummary | null
  /**
   * The fabric colour, owned by `App` so it survives this component's remount-per-sprite
   * (#50). The other two `PatternSettings` are local state here — see the `settings` memo.
   */
  backgroundColour: RGB
  onBackgroundColourChange: (colour: RGB) => void
}

/**
 * The three files a chart can leave the app as: the printable PDF (#34/#35), the Pattern
 * Keeper PDF (#55), and OXS (#94). Named rather than inlined because the same union types the
 * in-flight marker and the export call, so a fourth export cannot be added to one and not the
 * other.
 */
type ExportKind = 'pdf' | 'pk' | 'oxs'

const DISPLAY_MODES: { value: SymbolDisplay; label: string; title: string }[] = [
  { value: 'colour', label: 'Colour', title: 'Floss colours only' },
  { value: 'symbol', label: 'Symbol', title: 'Symbols on bare fabric — a printed chart' },
  { value: 'both', label: 'Both', title: 'Symbols over floss colours — the working chart' }
]

/** Tracks a resizing element, so the Konva stage can be sized in px rather than CSS. */
function useElementSize(): [
  React.RefObject<HTMLDivElement | null>,
  { width: number; height: number }
] {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width: Math.floor(width), height: Math.floor(height) })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, size]
}

/**
 * The pattern preview (§5.4): converts the selected sprite over IPC (#17) and hands the
 * result to the Konva grid, plus the controls that decide how it's drawn — including the
 * colour-count slider (#19), which re-runs the pipeline live on every step.
 *
 * The slider is only rendered once the first conversion has returned, which is also what
 * makes dragging cheap: that first call is the cold one (~48 ms on a rich sprite) and it
 * populates the main process's per-sprite plan cache, so every slider step afterwards is
 * a warm ~1.9 ms re-cut of the same merge sequence (§5.2). Selecting a sprite is
 * therefore the prewarm the design asks for; no separate one is needed.
 */
export function PatternView({
  sprite,
  backgroundColour,
  onBackgroundColourChange
}: Props): React.JSX.Element {
  const [converted, setConverted] = useState<ConvertedSprite | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [symbolDisplay, setSymbolDisplay] = useState<SymbolDisplay>(
    DEFAULT_PATTERN_SETTINGS.symbolDisplay
  )
  const [flip, setFlip] = useState(DEFAULT_PATTERN_SETTINGS.flip)
  const [scale, setScale] = useState(0)
  // Bumped to remount the grid, which re-fits it. See PatternGrid's doc comment.
  const [viewEpoch, setViewEpoch] = useState(0)
  const [stageRef, stageSize] = useElementSize()

  /**
   * The `k` the slider is on. Held separately from `converted.palette.colourCount` so the
   * control tracks the pointer at once, without waiting for its round-trip — and so it
   * stays put when a sprite's palette is smaller than the `k` that was asked for.
   */
  const [colourCount, setColourCount] = useState<number | null>(null)

  /**
   * Which export is running, if any. Building a chart takes long enough to notice, and a
   * second click while the save dialog is already up would open a second dialog — so the
   * buttons disable rather than queue. Held as *which* rather than a flag so only the button
   * you pressed says it is working, while both stay unclickable until it is done.
   */
  const [exporting, setExporting] = useState<ExportKind | null>(null)
  /** Last export outcome, shown briefly. `null` after a cancel — that is not worth saying. */
  const [exported, setExported] = useState<string | null>(null)

  // Conversions overlap while dragging, and IPC replies are not ordered. See latest-only.
  const requests = useRef(latestOnly<ConvertedSprite>())
  useEffect(() => {
    const inFlight = requests.current
    return () => inFlight.cancel()
  }, [])

  const convert = useCallback((id: string, k?: number) => {
    requests.current.run(
      () => window.api.convertSprite(id, k),
      (result) => {
        setConverted(result)
        // The first conversion has no `k` to echo: adopt the Req. 6 default it chose.
        setColourCount((current) => current ?? result.palette.colourCount)
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e))
    )
  }, [])

  // App keys this component by sprite id, so each selection remounts it with fresh state
  // — no need to clear `converted`/`error` synchronously here.
  useEffect(() => {
    if (sprite) convert(sprite.id)
  }, [sprite, convert])

  /**
   * The settings the grid and the exports read, reassembled from the two that are local to
   * this chart and the one `App` holds across sprites (#50).
   *
   * Kept as a single `PatternSettings` because that is what crosses the IPC boundary to the
   * exports — splitting it at the call sites would let the chart on screen and the chart on
   * disk be built from different sets of settings, which is the one thing `ExportRequest` is
   * shaped to prevent.
   */
  const settings = useMemo<PatternSettings>(
    () => ({ backgroundColour, symbolDisplay, flip }),
    [backgroundColour, symbolDisplay, flip]
  )

  /**
   * What the grid draws: the conversion, mirrored if the flip is on (#56).
   *
   * Derived rather than stored, so `converted` stays the thing main sent and toggling the flip
   * costs an array reverse instead of a round trip. The export does its own flip from the same
   * setting, which is why the two cannot drift.
   */
  const shown = useMemo(
    () =>
      converted === null ? null : flip ? flipHorizontal(converted.pattern) : converted.pattern,
    [converted, flip]
  )

  if (!sprite) {
    return (
      <section className="pattern-view pattern-view--empty">
        <p>Select a sprite to see its cross-stitch pattern.</p>
      </section>
    )
  }

  const symbolsHidden = symbolDisplay !== 'colour' && scale > 0 && scale < MIN_SYMBOL_SCALE
  const atDefaultFabric = isDefaultBackground(backgroundColour)

  /**
   * The slider stops at the sprite's own distinct-DMC count, not at the symbol-set
   * ceiling. `convertSprite` treats "more colours than the sprite has" as a no-op rather
   * than an error, so a wider slider would have a dead zone at the top where dragging
   * changed nothing and the readout disagreed with the handle. Where the sprite outruns
   * the ceiling (~1 sprite in 15), the ceiling binds instead.
   */
  const sliderMax = converted
    ? Math.min(converted.palette.sourceColourCount, converted.maxColourCount)
    : 0

  /**
   * Export the chart as it is on screen — the printable PDF, the Pattern Keeper PDF (#55),
   * or the OXS file other cross-stitch software reads (#94).
   *
   * Main re-derives the pattern from `(id, colourCount)` — see `ExportRequest`. What is sent
   * is the *current* `k` and settings, so what lands on disk is what you are looking at. All
   * three exports send the same request, which is what keeps the files agreeing; each one
   * decides for itself which of the settings its format can carry.
   */
  const onExport = async (kind: ExportKind): Promise<void> => {
    if (exporting || !sprite) return
    setExporting(kind)
    setExported(null)
    try {
      const request = {
        id: sprite.id,
        ...(colourCount === null ? {} : { colourCount }),
        settings
      }
      const outcome = await (kind === 'pdf'
        ? window.api.exportPdf(request)
        : kind === 'pk'
          ? window.api.exportPatternKeeperPdf(request)
          : window.api.exportOxs(request))

      // Cancelling is not a failure — say nothing at all.
      if (outcome.status === 'saved') setExported(outcome.path)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(null)
    }
  }

  const onColourCount = (k: number): void => {
    if (k === colourCount) return // a drag fires an event per pixel, not per step
    setColourCount(k)
    convert(sprite.id, k)
  }

  return (
    <section className="pattern-view">
      <div className="pattern-controls">
        <div className="pattern-controls__group" role="group" aria-label="Chart display">
          {DISPLAY_MODES.map((mode) => (
            <button
              key={mode.value}
              type="button"
              title={mode.title}
              aria-pressed={symbolDisplay === mode.value}
              className={
                'pattern-controls__toggle' +
                (symbolDisplay === mode.value ? ' pattern-controls__toggle--on' : '')
              }
              onClick={() => setSymbolDisplay(mode.value)}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* The fabric colour now outlives the sprite you picked it on (#50), so the only way
            back to unbleached Aida is to ask for it — hence the reset beside the swatch (#51).
            It is disabled, not hidden, when there is nothing to reset: a control that appears
            only once you have already changed the thing it resets is a control you never find
            when you are looking for it. */}
        <span className="pattern-controls__fabric">
          <label className="pattern-controls__field">
            Fabric
            <input
              type="color"
              className="pattern-controls__colour"
              value={rgbToCss(backgroundColour)}
              onChange={(e) => onBackgroundColourChange(cssToRgb(e.target.value))}
            />
          </label>
          <button
            type="button"
            className="pattern-controls__reset"
            title="Reset the fabric colour to unbleached Aida"
            aria-label="Reset fabric colour"
            disabled={atDefaultFabric}
            onClick={() => onBackgroundColourChange(DEFAULT_PATTERN_SETTINGS.backgroundColour)}
          >
            Reset
          </button>
        </span>

        {/* Mirrors the chart, and the export with it (#56). The raw sprite in the preview pane
            deliberately does not flip: it is the reference you check the pattern against. */}
        <button
          type="button"
          className={'pattern-controls__toggle' + (flip ? ' pattern-controls__toggle--on' : '')}
          title="Mirror the pattern left to right"
          aria-pressed={flip}
          onClick={() => setFlip((on) => !on)}
        >
          Flip
        </button>

        <button
          type="button"
          className="pattern-controls__button"
          onClick={() => setViewEpoch((n) => n + 1)}
        >
          Fit
        </button>

        <span className="pattern-controls__spacer" />

        {/* A sprite with no opaque pixels has no palette to slice, so there is no k to pick. */}
        {converted && colourCount !== null && sliderMax > 0 && (
          <label className="pattern-controls__field pattern-controls__field--slider">
            Colours
            <input
              type="range"
              className="pattern-controls__slider"
              min={1}
              max={sliderMax}
              step={1}
              value={colourCount}
              aria-valuetext={`${colourCount} of ${sliderMax} floss colours`}
              onChange={(e) => onColourCount(Number(e.target.value))}
            />
            <output className="pattern-controls__count">
              {colourCount}
              <span className="pattern-controls__count-max">/{sliderMax}</span>
            </output>
          </label>
        )}
        {/* `scale` is px per source pixel, so it reads directly as a zoom factor. */}
        {scale > 0 && (
          <span className="pattern-controls__zoom">{Math.round(scale * 10) / 10}×</span>
        )}

        {/* Export is only meaningful once there is a pattern to export (§5.5). */}
        {converted && (
          <div className="pattern-controls__group" role="group" aria-label="Export">
            <button
              type="button"
              className="pattern-controls__button"
              title="Save the printable chart: cover, floss key, and chart pages"
              disabled={exporting !== null}
              onClick={() => void onExport('pdf')}
            >
              {exporting === 'pdf' ? 'Building…' : 'Chart PDF'}
            </button>

            {/* The same chart laid out for Pattern Keeper's PDF importer (#55), so it can be
                stitched off a phone. A second PDF rather than a mode of the first: the two
                have opposing layouts — see export/pdf-pk.ts. */}
            <button
              type="button"
              className="pattern-controls__button"
              title="Save a PDF laid out for the Pattern Keeper app to import"
              disabled={exporting !== null}
              onClick={() => void onExport('pk')}
            >
              {exporting === 'pk' ? 'Building…' : 'Chart PDF (PK)'}
            </button>

            {/* The same chart as data (#94), for stitching from other software — KXStitch,
                WinStitch and the like — rather than off paper. */}
            <button
              type="button"
              className="pattern-controls__button"
              title="Save as .oxs, the open format other cross-stitch software reads"
              disabled={exporting !== null}
              onClick={() => void onExport('oxs')}
            >
              {exporting === 'oxs' ? 'Saving…' : 'Chart OXS'}
            </button>
          </div>
        )}
      </div>

      <div className="pattern-view__stage" ref={stageRef}>
        {error && <p className="app-status app-status--error">Couldn’t convert: {error}</p>}
        {!error && !converted && <p className="app-status">Converting…</p>}
        {!error && converted && shown && (
          <PatternGrid
            key={`${sprite.id}:${viewEpoch}`}
            pattern={shown}
            palette={converted.palette}
            symbols={converted.symbols}
            settings={settings}
            width={stageSize.width}
            height={stageSize.height}
            onScaleChange={setScale}
          />
        )}
      </div>

      <div className="pattern-view__meta">
        {exported ? (
          // Where it went. Otherwise a save dialog closes and nothing visibly happens.
          <span className="pattern-view__hint">Saved to {exported}</span>
        ) : symbolsHidden ? (
          <span className="pattern-view__hint">Zoom in to read the symbols.</span>
        ) : (
          converted && (
            <span>
              {converted.pattern.width}×{converted.pattern.height} stitches ·{' '}
              {converted.palette.colourCount} floss colours
              {converted.palette.sourceColourCount > converted.palette.colourCount &&
                ` (reduced from ${converted.palette.sourceColourCount})`}
            </span>
          )
        )}
      </div>
    </section>
  )
}
