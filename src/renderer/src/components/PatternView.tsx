import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ConvertedSprite, SpriteSummary } from '../../../shared/ipc'
import { MIN_SYMBOL_SCALE } from '../pattern/draw'
import { latestOnly } from '../pattern/latest-only'
import {
  cssToRgb,
  rgbToCss,
  DEFAULT_PATTERN_SETTINGS,
  type PatternSettings,
  type SymbolDisplay
} from '../pattern/settings'
import { PatternGrid } from './PatternGrid'

interface Props {
  sprite: SpriteSummary | null
}

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
export function PatternView({ sprite }: Props): React.JSX.Element {
  const [converted, setConverted] = useState<ConvertedSprite | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<PatternSettings>(DEFAULT_PATTERN_SETTINGS)
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

  if (!sprite) {
    return (
      <section className="pattern-view pattern-view--empty">
        <p>Select a sprite to see its cross-stitch pattern.</p>
      </section>
    )
  }

  const symbolsHidden = settings.symbolDisplay !== 'colour' && scale > 0 && scale < MIN_SYMBOL_SCALE

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
              aria-pressed={settings.symbolDisplay === mode.value}
              className={
                'pattern-controls__toggle' +
                (settings.symbolDisplay === mode.value ? ' pattern-controls__toggle--on' : '')
              }
              onClick={() => setSettings((s) => ({ ...s, symbolDisplay: mode.value }))}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <label className="pattern-controls__field">
          Fabric
          <input
            type="color"
            className="pattern-controls__colour"
            value={rgbToCss(settings.backgroundColour)}
            onChange={(e) =>
              setSettings((s) => ({ ...s, backgroundColour: cssToRgb(e.target.value) }))
            }
          />
        </label>

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
      </div>

      <div className="pattern-view__stage" ref={stageRef}>
        {error && <p className="app-status app-status--error">Couldn’t convert: {error}</p>}
        {!error && !converted && <p className="app-status">Converting…</p>}
        {!error && converted && (
          <PatternGrid
            key={`${sprite.id}:${viewEpoch}`}
            pattern={converted.pattern}
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
        {symbolsHidden ? (
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
