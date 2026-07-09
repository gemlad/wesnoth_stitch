import { useEffect, useRef, useState } from 'react'
import type { DecodedImage, SpriteSummary } from '../../../shared/ipc'

interface Props {
  sprite: SpriteSummary
}

/**
 * One cell in the sprite grid. The thumbnail is fetched over IPC only once the
 * cell scrolls near the viewport (IntersectionObserver) — with ~7k sprites we
 * can't request every thumbnail up front. The decoded RGBA is painted to a
 * canvas at its natural size and left crisp via `image-rendering: pixelated`.
 */
export function SpriteThumb({ sprite }: Props): React.JSX.Element {
  const cellRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  const [failed, setFailed] = useState(false)

  // Reveal when the cell nears the viewport, then stop observing.
  useEffect(() => {
    const el = cellRef.current
    if (!el || visible) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '200px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  // Once visible, fetch + paint the thumbnail. Guarded against unmount races.
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    window.api
      .getThumbnail(sprite.id)
      .then((img: DecodedImage) => {
        const canvas = canvasRef.current
        if (cancelled || !canvas) return
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [visible, sprite.id])

  return (
    <button ref={cellRef} className="sprite-thumb" type="button" title={sprite.name}>
      <span className="sprite-thumb__frame">
        {failed ? (
          <span className="sprite-thumb__error" aria-label="failed to load">
            !
          </span>
        ) : (
          <canvas ref={canvasRef} className="sprite-thumb__canvas" />
        )}
      </span>
      <span className="sprite-thumb__name">{sprite.name}</span>
    </button>
  )
}
