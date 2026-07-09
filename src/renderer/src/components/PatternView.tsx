import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ConvertedSprite, SpriteSummary } from '../../../shared/ipc'
import { MIN_SYMBOL_SCALE } from '../pattern/draw'
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
 * result to the Konva grid, plus the controls that decide how it's drawn.
 *
 * Colour count is left at the Req. 6 default — the live slider is #19. This component is
 * where that slider lands, because it already owns the `convertSprite` call.
 */
export function PatternView({ sprite }: Props): React.JSX.Element {
  const [converted, setConverted] = useState<ConvertedSprite | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<PatternSettings>(DEFAULT_PATTERN_SETTINGS)
  const [scale, setScale] = useState(0)
  // Bumped to remount the grid, which re-fits it. See PatternGrid's doc comment.
  const [viewEpoch, setViewEpoch] = useState(0)
  const [stageRef, stageSize] = useElementSize()

  // App keys this component by sprite id, so each selection remounts it with fresh state
  // — no need to clear `converted`/`error` synchronously here.
  useEffect(() => {
    if (!sprite) return
    let cancelled = false
    window.api
      .convertSprite(sprite.id)
      .then((result) => {
        if (!cancelled) setConverted(result)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [sprite])

  if (!sprite) {
    return (
      <section className="pattern-view pattern-view--empty">
        <p>Select a sprite to see its cross-stitch pattern.</p>
      </section>
    )
  }

  const symbolsHidden = settings.symbolDisplay !== 'colour' && scale > 0 && scale < MIN_SYMBOL_SCALE

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
