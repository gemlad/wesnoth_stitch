/**
 * Trim the fully-transparent border off a sprite before charting (#53).
 *
 * Wesnoth unit sprites sit on a generous transparent canvas, so a strict 1:1 pixel→stitch
 * mapping would pad every exported chart with empty rows and columns. Cropping to the
 * artwork's bounding box makes `pattern.width`/`height` (and the finished stitch size) reflect
 * what's actually stitched, without touching the 1:1 rule for the pixels that remain.
 *
 * **"Transparent" here is the stitch/no-stitch rule, not `alpha === 0`.** A pixel is content
 * exactly when its alpha is at or above `alphaThreshold` — the same test `mapSpriteToDmc` uses
 * to decide whether a pixel becomes a stitch (`map-to-dmc.ts`). So a border of semi-transparent
 * pixels that already map to no-stitch is trimmed too, rather than being left to pad the chart.
 */
import type { DecodedImage } from '../ipc'

/** A crop rectangle in source-pixel coordinates. */
export interface ContentBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The tight bounding box of the sprite's stitchable content (alpha ≥ `alphaThreshold`), or
 * `null` when nothing is stitchable — a fully transparent image has no content to bound.
 */
export function contentBounds(image: DecodedImage, alphaThreshold: number): ContentBounds | null {
  const { width, height, data } = image
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] >= alphaThreshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * The sprite cropped to its content bounds. Returns the image unchanged when it is already
 * tight (the common case is cheap — no copy), and a 0×0 image when nothing is stitchable, so a
 * fully transparent sprite yields an empty pattern rather than a canvas of no-stitch cells.
 */
export function trimToContent(image: DecodedImage, alphaThreshold: number): DecodedImage {
  const bounds = contentBounds(image, alphaThreshold)
  if (!bounds) return { width: 0, height: 0, data: new Uint8Array(0) }
  if (
    bounds.x === 0 &&
    bounds.y === 0 &&
    bounds.width === image.width &&
    bounds.height === image.height
  ) {
    return image
  }
  const { data, width } = image
  const rowBytes = bounds.width * 4
  const out = new Uint8Array(bounds.height * rowBytes)
  for (let y = 0; y < bounds.height; y++) {
    const srcStart = ((bounds.y + y) * width + bounds.x) * 4
    out.set(data.subarray(srcStart, srcStart + rowBytes), y * rowBytes)
  }
  return { width: bounds.width, height: bounds.height, data: out }
}
