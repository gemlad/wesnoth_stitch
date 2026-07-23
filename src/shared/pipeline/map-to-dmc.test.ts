import { describe, it, expect } from 'vitest'
import { mapSpriteToDmc, overMatte } from './map-to-dmc'
import { nearestDmcToRgb, srgbToLab } from '../colour'
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

  it('renders transparent pixels *inside* the bounding box as no-stitch (null)', () => {
    // The three opaque pixels pin the bounding box to the full 2×2, so the CLEAR corner is
    // interior to the content and survives trimming (#53) as a null — a genuine no-stitch hole.
    const { palette, pattern } = mapSpriteToDmc(makeImage(2, 2, [BLACK, WHITE, RED, CLEAR]))
    expect(palette.colourCount).toBe(3)
    expect(pattern.width).toBe(2)
    expect(pattern.height).toBe(2)
    expect(pattern.cells[0][0]).not.toBeNull()
    expect(pattern.cells[1][1]).toBeNull() // the transparent corner, retained as no-stitch
  })

  it('returns an empty palette and a 0×0 grid for a fully transparent sprite', () => {
    // Nothing is stitchable, so trimming (#53) crops to nothing rather than a canvas of nulls.
    const { palette, pattern } = mapSpriteToDmc(makeImage(2, 1, [CLEAR, CLEAR]))
    expect(palette.colours).toEqual([])
    expect(palette.colourCount).toBe(0)
    expect(palette.sourceColourCount).toBe(0)
    expect(pattern.width).toBe(0)
    expect(pattern.height).toBe(0)
    expect(pattern.cells).toEqual([])
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
    // Faint pixel between two blacks, so it stays interior to the bounding box and trimming
    // (#53) can't remove it — the assertion is about the threshold, not the crop.
    // Default: the faint pixel is excluded — palette is just black, faint cell is null.
    const def = mapSpriteToDmc(makeImage(3, 1, [BLACK, faint, BLACK]))
    expect(def.palette.colourCount).toBe(1)
    expect(def.pattern.cells[0][1]).toBeNull()
    // Lower the threshold to 50 and it becomes a stitch.
    const low = mapSpriteToDmc(makeImage(3, 1, [BLACK, faint, BLACK]), { alphaThreshold: 50 })
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

  it('trims the transparent border so the pattern reflects the artwork, not the canvas (#53)', () => {
    // One black pixel dead-centre of a 3×3 transparent canvas → a 1×1 pattern.
    const pixels: Pixel[] = [CLEAR, CLEAR, CLEAR, CLEAR, BLACK, CLEAR, CLEAR, CLEAR, CLEAR]
    const { pattern, palette } = mapSpriteToDmc(makeImage(3, 3, pixels))
    expect(pattern.width).toBe(1)
    expect(pattern.height).toBe(1)
    expect(pattern.cells).toEqual([[0]])
    expect(palette.colourCount).toBe(1)
  })

  it('trims an off-centre border down to a tight box while keeping interior holes', () => {
    // Content is a 2-wide band in the bottom-right of a 4×3 canvas, with a null in it.
    //   . . . .      → trims the top row and left two columns, leaving a 2×2 with one hole
    //   . . B W
    //   . . R .
    const pixels: Pixel[] = [
      CLEAR, CLEAR, CLEAR, CLEAR,
      CLEAR, CLEAR, BLACK, WHITE,
      CLEAR, CLEAR, RED, CLEAR
    ]
    const { pattern } = mapSpriteToDmc(makeImage(4, 3, pixels))
    expect(pattern.width).toBe(2)
    expect(pattern.height).toBe(2)
    expect(pattern.cells[0][0]).not.toBeNull() // BLACK
    expect(pattern.cells[0][1]).not.toBeNull() // WHITE
    expect(pattern.cells[1][0]).not.toBeNull() // RED
    expect(pattern.cells[1][1]).toBeNull() // the transparent corner inside the box
  })
})

/**
 * Wesnoth's drop shadow is flat black at alpha 153 (60% opaque) and sits under 90% of
 * sprites. Stitched at face value it is DMC 310 Black — a hard blob, because a stitch has
 * no opacity. Composited over white first, it becomes the grey it looks like (#20, §5.2).
 */
describe('overMatte', () => {
  // Tested directly, because DMC quantization is coarse enough to absorb a one-level
  // channel error: a subtly wrong composite still lands on the right floss.
  it('is the identity at full opacity, for every channel value', () => {
    for (const c of [0, 1, 23, 127, 128, 220, 254, 255]) expect(overMatte(c, 255)).toBe(c)
  })

  it('is the matte itself at zero opacity', () => {
    expect(overMatte(0, 0)).toBe(255)
    expect(overMatte(123, 0)).toBe(255)
  })

  it('blends src·α + white·(1−α), rounded', () => {
    expect(overMatte(0, 153)).toBe(102) // the drop shadow: 60% black on white
    expect(overMatte(0, 128)).toBe(127) // (0·128 + 255·127) / 255
    expect(overMatte(10, 200)).toBe(63) // (10·200 + 255·55) / 255 = 62.84
  })

  it('never leaves the 8-bit range', () => {
    for (let a = 0; a <= 255; a += 17) {
      for (const c of [0, 128, 255]) {
        const v = overMatte(c, a)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(255)
      }
    }
  })

  it('moves monotonically toward the matte as alpha falls', () => {
    let previous = -1
    for (const a of [255, 200, 153, 100, 50, 0]) {
      const v = overMatte(0, a)
      expect(v).toBeGreaterThan(previous)
      previous = v
    }
  })
})

describe('mapSpriteToDmc — translucency is composited over white', () => {
  /** Exactly what Wesnoth draws under a unit. */
  const SHADOW: Pixel = [0, 0, 0, 153]

  it('leaves fully opaque pixels untouched — compositing at α=255 is the identity', () => {
    for (const px of [RED, BLACK, WHITE, NEAR_BLACK]) {
      const [r, g, b] = px
      const { palette } = mapSpriteToDmc(makeImage(1, 1, [px]))
      // Exactly the floss a direct, un-composited lookup of the source pixel would give.
      expect(palette.colours[0].dmc.code).toBe(nearestDmcToRgb({ r, g, b }).code)
    }
  })

  it('turns the drop shadow into a mid grey, not black', () => {
    const shadow = mapSpriteToDmc(makeImage(1, 1, [SHADOW]))
    const black = mapSpriteToDmc(makeImage(1, 1, [BLACK]))

    // 0·(153/255) + 255·(102/255) = 102 → a mid grey, nowhere near black.
    expect(shadow.palette.colours[0].dmc.code).not.toBe(black.palette.colours[0].dmc.code)
    const { r, g, b } = shadow.palette.colours[0].rgb
    const lightness = (r + g + b) / 3
    expect(lightness).toBeGreaterThan(60)
    expect(lightness).toBeLessThan(160)
  })

  it('composites toward white as alpha falls, monotonically', () => {
    const lightnessAt = (a: number): number => {
      const { palette } = mapSpriteToDmc(makeImage(1, 1, [[0, 0, 0, a]]), { alphaThreshold: 1 })
      const { r, g, b } = palette.colours[0].rgb
      return (r + g + b) / 3
    }
    expect(lightnessAt(255)).toBeLessThan(lightnessAt(153))
    expect(lightnessAt(153)).toBeLessThan(lightnessAt(64))
  })

  it('still uses alpha only to decide whether a stitch exists at all', () => {
    // Variable pixel kept between two blacks so it stays interior to the box: this is about
    // the alpha threshold, not the border trim (#53).
    // Below the threshold the pixel is no-stitch, however it would have composited.
    const off = mapSpriteToDmc(makeImage(3, 1, [BLACK, [0, 0, 0, 127], BLACK]))
    expect(off.pattern.cells[0][1]).toBeNull()
    expect(off.palette.colourCount).toBe(1)
    // One step above, it is a stitch — and not a black one.
    const on = mapSpriteToDmc(makeImage(3, 1, [BLACK, [0, 0, 0, 128], BLACK]))
    expect(on.pattern.cells[0][1]).not.toBeNull()
    expect(on.palette.colourCount).toBe(2)
  })

  it('composites before dedup, so one source colour at two alphas stays two shades', () => {
    // Face-value mapping packs both as rgb(0,0,0) and collapses them into one floss.
    const { palette } = mapSpriteToDmc(makeImage(2, 1, [BLACK, SHADOW]))
    expect(palette.colourCount).toBe(2)
  })

  it('composites identically in the grid and in the palette tally', () => {
    // If the two passes disagreed, the grid would index into the wrong floss.
    const { palette, pattern } = mapSpriteToDmc(makeImage(3, 1, [BLACK, SHADOW, SHADOW]))
    const shadowIndex = pattern.cells[0][1]!
    expect(pattern.cells[0][2]).toBe(shadowIndex)
    expect(palette.colours[shadowIndex].pixelCount).toBe(2)
    expect(palette.colours[pattern.cells[0][0]!].pixelCount).toBe(1)
  })

  it('never overshoots the 8-bit range — translucent white stays white', () => {
    const { palette } = mapSpriteToDmc(makeImage(1, 1, [[255, 255, 255, 153]]))
    const plainWhite = mapSpriteToDmc(makeImage(1, 1, [WHITE]))
    expect(palette.colours[0].dmc.code).toBe(plainWhite.palette.colours[0].dmc.code)
  })
})
