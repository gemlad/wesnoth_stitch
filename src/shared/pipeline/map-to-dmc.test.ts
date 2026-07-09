import { describe, it, expect } from 'vitest'
import { mapSpriteToDmc } from './map-to-dmc'
import { srgbToLab } from '../colour'
import type { DecodedImage } from '../ipc'

type Pixel = [r: number, g: number, b: number, a: number]

/** Build a row-major RGBA DecodedImage from a flat pixel list. */
function makeImage(width: number, height: number, pixels: Pixel[]): DecodedImage {
  expect(pixels.length).toBe(width * height)
  const data = new Uint8Array(width * height * 4)
  pixels.forEach(([r, g, b, a], i) => {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  })
  return { width, height, data }
}

const BLACK: Pixel = [0, 0, 0, 255]
const NEAR_BLACK: Pixel = [5, 4, 6, 255]
const WHITE: Pixel = [255, 255, 255, 255]
const RED: Pixel = [220, 20, 30, 255]
const CLEAR: Pixel = [0, 0, 0, 0]

describe('mapSpriteToDmc', () => {
  it('maps distinct opaque colours to their nearest floss', () => {
    const { palette, pattern } = mapSpriteToDmc(makeImage(2, 2, [BLACK, WHITE, RED, CLEAR]))
    const codes = palette.colours.map((c) => c.dmc.code)
    expect(codes).toContain('310') // Black
    expect(codes).toContain('B5200') // White
    expect(codes).toContain('666') // Christmas Red Bright
    expect(palette.colourCount).toBe(3)
    expect(pattern.width).toBe(2)
    expect(pattern.height).toBe(2)
  })

  it('renders transparent pixels as no-stitch (null) and excludes them from the palette', () => {
    const { palette, pattern } = mapSpriteToDmc(makeImage(2, 2, [BLACK, CLEAR, CLEAR, CLEAR]))
    expect(palette.colourCount).toBe(1)
    expect(palette.sourceColourCount).toBe(1)
    // Only the first cell is a stitch; the rest are null.
    expect(pattern.cells[0][0]).toBe(0)
    expect(pattern.cells[0][1]).toBeNull()
    expect(pattern.cells[1][0]).toBeNull()
    expect(pattern.cells[1][1]).toBeNull()
  })

  it('returns an empty palette and an all-null grid for a fully transparent sprite', () => {
    const { palette, pattern } = mapSpriteToDmc(makeImage(2, 1, [CLEAR, CLEAR]))
    expect(palette.colours).toEqual([])
    expect(palette.colourCount).toBe(0)
    expect(palette.sourceColourCount).toBe(0)
    expect(pattern.cells).toEqual([[null, null]])
  })

  it('collapses different source shades that share a floss into one palette entry', () => {
    // #000000 and #050406 both map to DMC 310; distinct-DMC count is 1, not 2.
    const { palette, pattern } = mapSpriteToDmc(makeImage(2, 1, [BLACK, NEAR_BLACK]))
    expect(palette.colourCount).toBe(1)
    expect(palette.sourceColourCount).toBe(1)
    const only = palette.colours[0]
    expect(only.dmc.code).toBe('310')
    expect(only.pixelCount).toBe(2)
    // Both cells reference the single merged entry.
    expect(pattern.cells[0]).toEqual([0, 0])
  })

  it('uses the floss colour (not the source pixel) for a merged entry', () => {
    const { palette } = mapSpriteToDmc(makeImage(1, 1, [NEAR_BLACK]))
    const entry = palette.colours[0]
    // Entry carries DMC 310's colour #000000, not the source #050406.
    expect(entry.rgb).toEqual({ r: 0, g: 0, b: 0 })
    expect(entry.dmc.hex).toBe('#000000')
    expect(entry.lab).toEqual(srgbToLab({ r: 0, g: 0, b: 0 }))
  })

  it('orders the palette by descending pixel count (dominant floss first)', () => {
    // 3 black, 1 white → black must come first.
    const { palette, pattern } = mapSpriteToDmc(makeImage(2, 2, [BLACK, BLACK, BLACK, WHITE]))
    expect(palette.colours[0].dmc.code).toBe('310')
    expect(palette.colours[0].pixelCount).toBe(3)
    expect(palette.colours[1].dmc.code).toBe('B5200')
    expect(palette.colours[1].pixelCount).toBe(1)
    // Grid indices follow that order.
    expect(pattern.cells).toEqual([
      [0, 0],
      [0, 1]
    ])
  })

  it('honours the alpha threshold (default 128)', () => {
    const faint: Pixel = [220, 20, 30, 100] // below default threshold
    // Default: the faint pixel is excluded — palette is just black.
    const def = mapSpriteToDmc(makeImage(2, 1, [BLACK, faint]))
    expect(def.palette.colourCount).toBe(1)
    expect(def.pattern.cells[0][1]).toBeNull()
    // Lower the threshold to 50 and it becomes a stitch.
    const low = mapSpriteToDmc(makeImage(2, 1, [BLACK, faint]), { alphaThreshold: 50 })
    expect(low.palette.colourCount).toBe(2)
    expect(low.pattern.cells[0][1]).not.toBeNull()
  })

  it('produces a grid sized 1:1 with the sprite, and pixel counts summing to the stitch count', () => {
    const { palette, pattern } = mapSpriteToDmc(
      makeImage(3, 2, [BLACK, WHITE, RED, CLEAR, BLACK, WHITE])
    )
    expect(pattern.cells.length).toBe(2)
    expect(pattern.cells.every((row) => row.length === 3)).toBe(true)
    const totalStitches = palette.colours.reduce((n, c) => n + c.pixelCount, 0)
    expect(totalStitches).toBe(5) // 6 pixels, 1 transparent
  })
})
