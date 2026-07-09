import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { PNG } from 'pngjs'
import type { DecodedImage } from '../shared/ipc'

/**
 * Image decoding + thumbnailing for the sprite browser (§4: this work lives in
 * the main process; the renderer only ever receives already-decoded RGBA).
 *
 * pngjs is used over Electron's nativeImage on purpose: it yields deterministic,
 * cross-platform RGBA (no BGRA/byte-order surprises) and lets us downscale with
 * nearest-neighbour, which keeps pixel-art sprites crisp and preserves exact
 * source colours for the DMC quantizer later (§5.2). Kept Electron-free so it
 * stays unit-testable — the IPC handler owns path resolution.
 */

/** Decode one image file to raw RGBA. Only PNG is supported today (all mainline
 * unit sprites are .png); .webp would need a second decoder — see the scanner's
 * IMAGE_EXTS. Throws on unsupported extensions and on malformed files. */
export async function decodeImage(absPath: string): Promise<DecodedImage> {
  const ext = extname(absPath).toLowerCase()
  if (ext !== '.png') {
    throw new Error(`Unsupported image type "${ext}" (${absPath}); only PNG is decoded so far.`)
  }
  const buf = await readFile(absPath)
  const png = PNG.sync.read(buf) // { width, height, data: Buffer of RGBA }
  // Copy into a standalone Uint8Array so we don't hold a view onto pngjs's
  // (possibly pooled) buffer when this crosses IPC.
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) }
}

/**
 * Downscale `src` with nearest-neighbour so its longest side is at most `maxPx`,
 * preserving aspect ratio. Images already within `maxPx` are returned unchanged
 * (never upscaled — enlarging tiny sprites would just blur them in the grid).
 */
export function makeThumbnail(src: DecodedImage, maxPx: number): DecodedImage {
  const longest = Math.max(src.width, src.height)
  if (longest <= maxPx) return src

  const scale = maxPx / longest
  const dw = Math.max(1, Math.round(src.width * scale))
  const dh = Math.max(1, Math.round(src.height * scale))
  const out = new Uint8Array(dw * dh * 4)

  for (let y = 0; y < dh; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y * src.height) / dh))
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x * src.width) / dw))
      const si = (sy * src.width + sx) * 4
      const di = (y * dw + x) * 4
      out[di] = src.data[si]
      out[di + 1] = src.data[si + 1]
      out[di + 2] = src.data[si + 2]
      out[di + 3] = src.data[si + 3]
    }
  }

  return { width: dw, height: dh, data: out }
}
