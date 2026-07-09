import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Layer, Shape, Stage } from 'react-konva'
import type { Context } from 'konva/lib/Context'
import type { Shape as KonvaShape } from 'konva/lib/Shape'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { QuantizedPalette, StitchPattern, StitchSymbol } from '../../../shared/pipeline'
import { cellBleed, contrastInk, drawCells, drawOverlay, visibleCellRange } from '../pattern/draw'
import { rgbToCss, type PatternSettings } from '../pattern/settings'

/**
 * Zoom is expressed as the Konva stage's scale, which makes one stage unit exactly one
 * source pixel — so `scale` *is* the on-screen cell size in px, and the drawing code
 * (`../pattern/draw`) works in whole cell coordinates and never sees a pixel. Symbols
 * are sized in cell units too; the transform scales them, which Chromium does exactly
 * (measured: a 0.72px font under `scale(16)` matches an 11.52px font glyph for glyph).
 */
const MIN_SCALE = 1
const MAX_SCALE = 48

/** Leaves a margin around a fitted pattern, so cells at the edge aren't flush with the pane. */
const FIT_MARGIN = 0.94

/** Wheel delta → zoom factor. Tuned so one notch of a typical wheel is a comfortable ~12%. */
const ZOOM_RATE = 0.0015

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n))

interface Props {
  pattern: StitchPattern
  palette: QuantizedPalette
  symbols: StitchSymbol[]
  settings: PatternSettings
  /** Viewport size in px, measured by the parent. */
  width: number
  height: number
  /** Lets the parent show the zoom level, and warn when symbols drop out below the cutoff. */
  onScaleChange?: (scale: number) => void
}

/**
 * The pattern as a Konva stage: a colour layer and a symbol/grid overlay, each a single
 * `Shape` whose `sceneFunc` draws every visible cell (see `../pattern/draw` for why one
 * shape and not one `Rect` per cell). Wheel zooms about the cursor, drag pans.
 *
 * The view resets by remounting — the parent bumps this component's `key`. With two
 * Konva nodes to rebuild that costs less than the imperative handle it replaces.
 */
export function PatternGrid({
  pattern,
  palette,
  symbols,
  settings,
  width,
  height,
  onScaleChange
}: Props): React.JSX.Element {
  // Scale and offset are one piece of state because zoom updates both together, from both
  // of their previous values. Kept apart, a burst of wheel events inside a single React
  // batch would each read the same stale scale and only the last would land — measured:
  // 24 zoom-out notches moved the view by exactly one. `null` means "not yet fitted".
  const [view, setView] = useState<{ scale: number; x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const scale = view?.scale ?? 0

  const showColour = settings.symbolDisplay !== 'symbol'
  const showSymbols = settings.symbolDisplay !== 'colour'
  const background = rgbToCss(settings.backgroundColour)

  const fills = useMemo(() => palette.colours.map((c) => c.dmc.hex), [palette])
  const glyphs = useMemo(() => symbols.map((s) => s.glyph), [symbols])

  // In `both` mode each glyph sits on its own floss, so each needs its own contrast ink.
  // In `symbol` mode they all sit on bare fabric, so they all take the fabric's ink.
  const inks = useMemo(() => {
    const ink = contrastInk(settings.backgroundColour)
    return showColour
      ? palette.colours.map((c) => contrastInk(c.rgb))
      : palette.colours.map(() => ink)
  }, [palette, settings.backgroundColour, showColour])

  // Grid rules have to read against the fabric too — dark lines vanish on a black cloth.
  const [gridColour, gridMajorColour] = useMemo(
    () =>
      contrastInk(settings.backgroundColour) === '#000000'
        ? ['rgba(0,0,0,0.18)', 'rgba(0,0,0,0.5)']
        : ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.55)'],
    [settings.backgroundColour]
  )

  // Fit once the pane has been measured. A later resize must not throw away the zoom the
  // user has since chosen, so this runs exactly once per mount.
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || !width || !height) return
    fitted.current = true
    const next = clamp(
      Math.min(width / pattern.width, height / pattern.height) * FIT_MARGIN,
      MIN_SCALE,
      MAX_SCALE
    )
    setView({
      scale: next,
      x: (width - pattern.width * next) / 2,
      y: (height - pattern.height * next) / 2
    })
  }, [width, height, pattern.width, pattern.height])

  useEffect(() => {
    onScaleChange?.(scale)
  }, [scale, onScaleChange])

  const handleWheel = useCallback((e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const pointer = e.target.getStage()?.getPointerPosition()
    if (!pointer) return
    const { deltaY } = e.evt

    setView((v) => {
      if (!v) return v
      const next = clamp(v.scale * Math.exp(-deltaY * ZOOM_RATE), MIN_SCALE, MAX_SCALE)
      if (next === v.scale) return v
      // Keep the cell under the cursor under the cursor: zoom towards what you're looking at.
      const anchor = { x: (pointer.x - v.x) / v.scale, y: (pointer.y - v.y) / v.scale }
      return { scale: next, x: pointer.x - anchor.x * next, y: pointer.y - anchor.y * next }
    })
  }, [])

  /**
   * Both scene functions read the stage's *live* transform rather than closing over
   * `scale`/`pos`. During a Konva-native drag the stage moves and redraws before React
   * re-renders, so a closed-over offset would cull against last frame's viewport and
   * blank the leading edge of the pan.
   */
  const viewOf = (
    shape: KonvaShape
  ): { range: ReturnType<typeof visibleCellRange>; scale: number } | null => {
    const stage = shape.getStage()
    if (!stage) return null
    const stageScale = stage.scaleX()
    return {
      scale: stageScale,
      range: visibleCellRange(pattern, {
        scale: stageScale,
        offsetX: stage.x(),
        offsetY: stage.y(),
        width: stage.width(),
        height: stage.height()
      })
    }
  }

  const drawColourLayer = (ctx: Context, shape: KonvaShape): void => {
    const view = viewOf(shape)
    if (!view) return
    drawCells(ctx, {
      pattern,
      fills,
      background,
      range: view.range,
      showColour,
      bleed: cellBleed(view.scale)
    })
  }

  const drawOverlayLayer = (ctx: Context, shape: KonvaShape): void => {
    const view = viewOf(shape)
    if (!view) return
    drawOverlay(ctx, {
      pattern,
      range: view.range,
      scale: view.scale,
      glyphs,
      inks,
      showSymbols,
      gridColour,
      gridMajorColour
    })
  }

  if (!view) return <div className="pattern-grid" style={{ width, height }} />

  // Konva moves the stage itself during a drag; mirror it back into state, or the next
  // React render would snap it home and wheel-zoom would anchor to a stale offset.
  const syncPos = (e: KonvaEventObject<DragEvent>): void =>
    setView((v) => (v ? { ...v, x: e.target.x(), y: e.target.y() } : v))

  return (
    <Stage
      className="pattern-grid"
      width={width}
      height={height}
      x={view.x}
      y={view.y}
      scaleX={view.scale}
      scaleY={view.scale}
      draggable
      onWheel={handleWheel}
      onDragStart={() => setDragging(true)}
      onDragMove={syncPos}
      onDragEnd={(e) => {
        setDragging(false)
        syncPos(e)
      }}
      style={{ cursor: dragging ? 'grabbing' : 'grab' }}
    >
      <Layer listening={false}>
        <Shape
          width={pattern.width}
          height={pattern.height}
          sceneFunc={drawColourLayer}
          perfectDrawEnabled={false}
        />
      </Layer>
      <Layer listening={false}>
        <Shape
          width={pattern.width}
          height={pattern.height}
          sceneFunc={drawOverlayLayer}
          perfectDrawEnabled={false}
        />
      </Layer>
    </Stage>
  )
}
