import { useEffect, useRef, useState } from 'react'
import type { DecodedImage, SpriteSummary } from '../../../shared/ipc'

interface Props {
  sprite: SpriteSummary | null
}

/**
 * Full-resolution preview of the selected sprite (§5.4). Fetches the undownscaled
 * image via getFullImage and paints it 1:1 onto a canvas (crisp via
 * `image-rendering: pixelated`). Wiring a grid click to `sprite` is #7; until then
 * this shows its empty state.
 */
export function PreviewPane({ sprite }: Props): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // App keys this component by sprite id, so each selection remounts it with
  // fresh state — no need to reset dims/error synchronously here.
  useEffect(() => {
    if (!sprite) return
    let cancelled = false
    window.api
      .getFullImage(sprite.id)
      .then((img: DecodedImage) => {
        const canvas = canvasRef.current
        if (cancelled || !canvas) return
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0)
        setDims({ w: img.width, h: img.height })
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
          <canvas ref={canvasRef} className="preview-pane__canvas" />
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
