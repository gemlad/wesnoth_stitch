/**
 * PNG export (#33, §5.5).
 *
 * These tests decode the bytes back and read actual pixels, rather than asserting on a
 * buffer length or a snapshot — the failure this is guarding against is "the image looks
 * plausible but the colours are in the wrong cells", and only pixels catch that.
 */
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import type { RGB } from '../../shared/colour'
import type { QuantizedPalette, StitchPattern } from '../../shared/pipeline'
import { DEFAULT_CELL_PX, renderPatternPng } from './png'

const RED: RGB = { r: 0xff, g: 0x00, b: 0x00 }
const BLUE: RGB = { r: 0x00, g: 0x00, b: 0xff }
const AIDA: RGB = { r: 0xf2, g: 0xec, b: 0xdc }

/** Only `rgb` is read by the exporter; the rest of `PaletteColour` is along for the ride. */
function paletteOf(...rgbs: RGB[]): QuantizedPalette {
  return {
    colours: rgbs.map((rgb) => ({
      rgb,
      lab: { l: 0, a: 0, b: 0 },
      dmc: { code: '000', name: 'test', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } },
      pixelCount: 1
    })),
    colourCount: rgbs.length,
    sourceColourCount: rgbs.length
  }
}

function patternOf(cells: (number | null)[][]): StitchPattern {
  return { width: cells[0].length, height: cells.length, cells }
}

/** The pixel at (x, y) of an encoded PNG, as `{ r, g, b, a }`. */
function pixelAt(bytes: Buffer, x: number, y: number): RGB & { a: number } {
  const png = PNG.sync.read(bytes)
  const i = (png.width * y + x) * 4
  return { r: png.data[i], g: png.data[i + 1], b: png.data[i + 2], a: png.data[i + 3] }
}

describe('renderPatternPng', () => {
  it('scales each stitch to a cellSize block', () => {
    const bytes = renderPatternPng(patternOf([[0, 1]]), paletteOf(RED, BLUE), {
      cellSize: 4,
      backgroundColour: AIDA
    })
    const png = PNG.sync.read(bytes)

    expect([png.width, png.height]).toEqual([8, 4])
  })

  it('paints the whole block, not just its first pixel', () => {
    const bytes = renderPatternPng(patternOf([[0]]), paletteOf(RED), {
      cellSize: 3,
      backgroundColour: AIDA
    })

    // Every corner of the 3×3 block, so a copyWithin that stops a row short is caught.
    for (const [x, y] of [
      [0, 0],
      [2, 0],
      [0, 2],
      [2, 2],
      [1, 1]
    ]) {
      expect(pixelAt(bytes, x, y), `pixel (${x}, ${y})`).toEqual({ ...RED, a: 0xff })
    }
  })

  it('puts each colour in the right cell — not transposed, not mirrored', () => {
    // Deliberately asymmetric: a transposed write would swap the off-diagonal cells and
    // still produce an image with the right colours in it.
    const bytes = renderPatternPng(
      patternOf([
        [0, 1],
        [1, 1]
      ]),
      paletteOf(RED, BLUE),
      { cellSize: 2, backgroundColour: AIDA }
    )

    expect(pixelAt(bytes, 0, 0), 'top-left is red').toEqual({ ...RED, a: 0xff })
    expect(pixelAt(bytes, 2, 0), 'top-right is blue').toEqual({ ...BLUE, a: 0xff })
    expect(pixelAt(bytes, 0, 2), 'bottom-left is blue').toEqual({ ...BLUE, a: 0xff })
  })

  it('paints no-stitch cells as the fabric, fully opaque', () => {
    // §5.4/§8: a cell with no floss shows the fabric, and the fabric is not white and not
    // transparent. Getting this wrong misrepresents the finished piece.
    const bytes = renderPatternPng(patternOf([[null, 0]]), paletteOf(RED), {
      cellSize: 2,
      backgroundColour: AIDA
    })

    expect(pixelAt(bytes, 0, 0)).toEqual({ ...AIDA, a: 0xff })
    expect(pixelAt(bytes, 2, 0)).toEqual({ ...RED, a: 0xff })
  })

  it('honours the configured fabric colour rather than the prototype hardcoded cream', () => {
    const hotPink: RGB = { r: 0xff, g: 0x69, b: 0xb4 }
    const bytes = renderPatternPng(patternOf([[null]]), paletteOf(RED), {
      cellSize: 1,
      backgroundColour: hotPink
    })

    expect(pixelAt(bytes, 0, 0)).toEqual({ ...hotPink, a: 0xff })
  })

  it('defaults to DEFAULT_CELL_PX when no cellSize is given', () => {
    const bytes = renderPatternPng(patternOf([[0]]), paletteOf(RED), { backgroundColour: AIDA })
    const png = PNG.sync.read(bytes)

    expect([png.width, png.height]).toEqual([DEFAULT_CELL_PX, DEFAULT_CELL_PX])
  })

  it('throws when a cell indexes a colour the palette does not have', () => {
    // A pattern pointing outside its own palette is a pipeline bug. Painting it as
    // background would hide that behind a plausible-looking image — the same instinct
    // that makes symbolAt() throw rather than wrap.
    expect(() =>
      renderPatternPng(patternOf([[3]]), paletteOf(RED), { cellSize: 1, backgroundColour: AIDA })
    ).toThrow(RangeError)
  })

  it.each([0, -1, 1.5, NaN])('rejects cellSize %p', (cellSize) => {
    expect(() =>
      renderPatternPng(patternOf([[0]]), paletteOf(RED), { cellSize, backgroundColour: AIDA })
    ).toThrow(RangeError)
  })
})
