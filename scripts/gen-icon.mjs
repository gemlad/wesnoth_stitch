/**
 * Generate the app's placeholder icon (#71).
 *
 * A deliberately simple, on-theme mark — a cross-stitch "X" on a cream Aida-style ground,
 * drawn on a 16×16 stitch grid so it reads as both cross-stitch and pixel art. It is a
 * stand-in for a first release; the plan is to crowdsource a proper icon from the community
 * once they've seen v1. Kept as a script (no new dependency — uses pngjs, already present) so
 * whoever designs the real one can see how these were made, or regenerate from tweaked colours.
 *
 *   node scripts/gen-icon.mjs
 *
 * Writes build/icon.png + resources/icon.png (256px) and a multi-size build/icon.ico.
 */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const N = 16 // stitch grid
const MARGIN = 2 // cream border, in cells
const CREAM = [244, 239, 227]
const GRID = [214, 205, 188]
const FLOSS = [199, 42, 59] // a DMC-ish red
const EDGE = [120, 110, 95]

/** Colour of stitch cell (r, c): the inset X in floss red, otherwise cream. */
function cellColour(r, c) {
  const lo = MARGIN
  const hi = N - 1 - MARGIN
  if (r < lo || r > hi || c < lo || c > hi) return CREAM
  const ir = r - lo
  const ic = c - lo
  const inner = hi - lo
  const onX = Math.abs(ir - ic) <= 1 || Math.abs(ir - (inner - ic)) <= 1
  return onX ? FLOSS : CREAM
}

/** Render the icon at `size` px into a PNG buffer. */
function drawIcon(size) {
  const cell = size / N
  const png = new PNG({ width: size, height: size })
  const showGrid = cell >= 6 // grid lines only help at larger sizes
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = Math.floor(x / cell)
      const r = Math.floor(y / cell)
      let [rr, gg, bb] = cellColour(r, c)
      // Subtle Aida grid at cell boundaries.
      if (showGrid && (x % Math.round(cell) === 0 || y % Math.round(cell) === 0)) {
        if (rr === CREAM[0] && gg === CREAM[1] && bb === CREAM[2]) [rr, gg, bb] = GRID
      }
      // 1px darker edge so the icon reads against a white background.
      const edge = Math.max(1, Math.round(size / 64))
      if (x < edge || y < edge || x >= size - edge || y >= size - edge) [rr, gg, bb] = EDGE
      const i = (size * y + x) << 2
      png.data[i] = rr
      png.data[i + 1] = gg
      png.data[i + 2] = bb
      png.data[i + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

/** Pack PNG buffers into a Vista-style .ico (PNG-compressed entries). */
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  const entries = Buffer.alloc(16 * images.length)
  let offset = 6 + 16 * images.length
  const blobs = []
  images.forEach((img, i) => {
    const e = i * 16
    entries.writeUInt8(img.size >= 256 ? 0 : img.size, e) // width (0 = 256)
    entries.writeUInt8(img.size >= 256 ? 0 : img.size, e + 1) // height
    entries.writeUInt8(0, e + 2) // palette
    entries.writeUInt8(0, e + 3) // reserved
    entries.writeUInt16LE(1, e + 4) // colour planes
    entries.writeUInt16LE(32, e + 6) // bits per pixel
    entries.writeUInt32LE(img.png.length, e + 8)
    entries.writeUInt32LE(offset, e + 12)
    offset += img.png.length
    blobs.push(img.png)
  })
  return Buffer.concat([header, entries, ...blobs])
}

const png256 = drawIcon(256)
writeFileSync(resolve(root, 'build/icon.png'), png256)
writeFileSync(resolve(root, 'resources/icon.png'), png256)

const ico = buildIco([16, 32, 48, 64, 128, 256].map((size) => ({ size, png: drawIcon(size) })))
writeFileSync(resolve(root, 'build/icon.ico'), ico)

console.log('Wrote build/icon.png, resources/icon.png (256px) and build/icon.ico (16–256px).')
