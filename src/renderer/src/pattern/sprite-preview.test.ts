import { describe, expect, it } from 'vitest'
import type { RGB } from '../../../shared/colour'
import type { StitchPattern } from '../../../shared/pipeline'
import { patternToRgba } from './sprite-preview'

const RED: RGB = { r: 255, g: 0, b: 0 }
const BLUE: RGB = { r: 0, g: 0, b: 255 }

const pattern = (cells: (number | null)[][]): StitchPattern => ({
  width: cells[0].length,
  height: cells.length,
  cells
})

/** The four bytes of pixel `(x, y)`. */
const pixel = (data: Uint8ClampedArray, width: number, x: number, y: number): number[] => [
  ...data.slice((y * width + x) * 4, (y * width + x) * 4 + 4)
]

describe('patternToRgba', () => {
  it('paints one opaque pixel per stitch, in its palette colour', () => {
    const data = patternToRgba(pattern([[0, 1]]), [RED, BLUE])
    expect(pixel(data, 2, 0, 0)).toEqual([255, 0, 0, 255])
    expect(pixel(data, 2, 1, 0)).toEqual([0, 0, 255, 255])
  })

  it('leaves no-stitch cells fully transparent, so the fabric shows through', () => {
    const data = patternToRgba(pattern([[null, 0]]), [RED])
    expect(pixel(data, 2, 0, 0)).toEqual([0, 0, 0, 0])
    expect(pixel(data, 2, 1, 0)).toEqual([255, 0, 0, 255])
  })

  it('is row-major, matching cells[y][x]', () => {
    const data = patternToRgba(
      pattern([
        [0, null],
        [null, 1]
      ]),
      [RED, BLUE]
    )
    expect(pixel(data, 2, 0, 0)).toEqual([255, 0, 0, 255])
    expect(pixel(data, 2, 1, 1)).toEqual([0, 0, 255, 255])
    expect(pixel(data, 2, 1, 0)).toEqual([0, 0, 0, 0])
    expect(pixel(data, 2, 0, 1)).toEqual([0, 0, 0, 0])
  })

  it('returns exactly width × height × 4 bytes, as ImageData requires', () => {
    const data = patternToRgba(pattern([[0, 0, 0]]), [RED])
    expect(data.length).toBe(3 * 1 * 4)
  })

  it('handles a fully transparent sprite without inventing pixels', () => {
    const data = patternToRgba(pattern([[null, null]]), [])
    expect([...data]).toEqual(new Array(8).fill(0))
  })
})
