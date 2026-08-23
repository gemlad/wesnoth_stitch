import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConvertedSprite, DecodedImage, SpriteSummary } from '../../../shared/ipc'
import { patternToRgba } from '../pattern/sprite-preview'

interface Props {
  sprite: SpriteSummary | null
  /**
   * The conversion currently on the chart, or `null` while one is in flight. Owned by `App`
   * so that this pane and the chart are looking at the same object (#108).
   */
  converted: ConvertedSprite | null
}

/**
 * Anything paintable 1:1: RGBA bytes and the dimensions they cover.
 *
 * Wider than `DecodedImage` on the byte array alone, so the same painter takes both what the
 * main process decoded (`Uint8Array`) and what {@link patternToRgba} builds here
 * (`Uint8ClampedArray`, the form `ImageData` wants).
 */
interface Rgba {
  width: number
  height: number
  data: Uint8Array | Uint8ClampedArray
}

/** Paint `image` onto `canvas` 1:1, sizing the canvas to it. */
function paint(canvas: HTMLCanvasElement | null, image: Rgba): void {
  if (!canvas) return
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
    0,
    0
  )
}

/**
 * Full-resolution preview of the selected sprite (§5.4), and — once the colour slider has
 * actually taken something away — the pattern beside it at the same scale (#108).
 *
 * **Why the comparison belongs here and not on the chart.** The chart fills its stage, so it
 * is normally somewhere north of 10× life size, and at that magnification every reduction
 * looks like vandalism. The question a stitcher is really asking of the slider is whether the
 * loss shows at the size the unit is drawn in the game, and the only place in the app that
 * draws anything at that size is this pane. Putting the reduced image next to the raw sprite
 * here answers it directly: same scale, same pixels, side by side.
 *
 * The second canvas appears **only when there is a reduction to see**. At full colour the two
 * images would differ only by the DMC mapping, which is not what the slider does and not what
 * this is for — so the pane goes back to the single sprite it has always shown.
 *
 * Neither image is flipped, for the same reason the raw sprite never was: this pane is the
 * reference you check the chart against, and a mirrored reference is no reference at all.
 */
export function PreviewPane({ sprite, converted }: Props): React.JSX.Element {
  const spriteCanvasRef = useRef<HTMLCanvasElement>(null)
  const patternCanvasRef = useRef<HTMLCanvasElement>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const palette = converted?.palette ?? null
  const pattern = converted?.pattern ?? null
  /** Has the slider actually taken a colour away? If not, there is nothing to compare. */
  const reduced = palette !== null && palette.colourCount < palette.sourceColourCount

  /**
   * The pattern as pixels. Recomputed only when the conversion changes — dragging the slider
   * changes it on every step, but that is one pass over a few thousand cells, an order of
   * magnitude below the IPC round trip that delivered them.
   */
  const patternImage = useMemo<Rgba | null>(() => {
    if (!reduced || pattern === null || palette === null) return null
    return {
      width: pattern.width,
      height: pattern.height,
      data: patternToRgba(
        pattern,
        palette.colours.map((c) => c.rgb)
      )
    }
  }, [reduced, pattern, palette])

  // App keys this component by sprite id, so each selection remounts it with
  // fresh state — no need to reset dims/error synchronously here.
  useEffect(() => {
    if (!sprite) return
    let cancelled = false
    window.api
      .getFullImage(sprite.id)
      .then((img: DecodedImage) => {
        if (cancelled) return
        paint(spriteCanvasRef.current, img)
        setDims({ w: img.width, h: img.height })
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [sprite])

  // Repainted rather than remounted: the canvas keeps its identity across slider steps and
  // only its bitmap changes, which is what `putImageData` is for.
  useEffect(() => {
    if (patternImage) paint(patternCanvasRef.current, patternImage)
  }, [patternImage])

  if (!sprite) {
    return (
      <aside className="preview-pane preview-pane--empty">
        <p>Select a sprite to preview it at full resolution.</p>
      </aside>
    )
  }

  return (
    <aside className="preview-pane">
      <div className="preview-pane__stage">
        {error ? (
          <p className="app-status--error">{error}</p>
        ) : (
          <div className="preview-pane__images">
            <figure className="preview-pane__image">
              <canvas ref={spriteCanvasRef} className="preview-pane__canvas" />
              {patternImage && <figcaption>Sprite</figcaption>}
            </figure>

            {patternImage && palette !== null && (
              <figure className="preview-pane__image">
                <canvas ref={patternCanvasRef} className="preview-pane__canvas" />
                <figcaption
                  title={`The pattern at sprite size: ${palette.colourCount} floss colours, reduced from ${palette.sourceColourCount}`}
                >
                  {palette.colourCount} colours
                </figcaption>
              </figure>
            )}
          </div>
        )}
      </div>
      <div className="preview-pane__meta">
        <div className="preview-pane__name">{sprite.name}</div>
        <div className="preview-pane__sub">
          {sprite.folder || '(ungrouped)'}
          {dims ? ` · ${dims.w}×${dims.h}px` : ''}
        </div>
      </div>
    </aside>
  )
}
