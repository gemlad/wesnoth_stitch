/**
 * Chart pages (#34, §5.5).
 *
 * The geometry is tested next door in `pdf-layout.test.ts`, which is where the legibility
 * numbers live. What is tested *here* is what the drawing code adds on top: that it emits
 * one A4 page per tile, and that it **refuses** rather than degrades when the pattern and
 * the palette disagree — the failure modes that produce a chart which looks fine and is
 * wrong.
 *
 * These do not prove the chart is visually right; nothing automated can. It was rendered
 * from a real sprite and inspected on paper — see #28.
 */
import fontkit from '@pdf-lib/fontkit'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PDFDocument, type PDFFont } from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'
import type { RGB } from '../../shared/colour'
import { MAX_COLOUR_COUNT, type QuantizedPalette, type StitchPattern } from '../../shared/pipeline'
import { drawChartPages, glyphInk } from './pdf-chart'
import { DEFAULT_CELL_MM, mmToPt, planTiles, A4_WIDTH_MM, A4_HEIGHT_MM } from './pdf-layout'

const FONT = fileURLToPath(new URL('../../../resources/fonts/DejaVuSans.ttf', import.meta.url))
const AIDA: RGB = { r: 0xf2, g: 0xec, b: 0xdc }

let pdf: PDFDocument
let font: PDFFont

beforeAll(async () => {
  pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  font = await pdf.embedFont(readFileSync(FONT), { subset: true })
})

/** `n` distinct greys — enough to exercise the palette without caring what colour they are. */
function paletteOf(n: number): QuantizedPalette {
  return {
    colours: Array.from({ length: n }, (_, i) => {
      const v = (i * 7) % 256
      return {
        rgb: { r: v, g: v, b: v },
        lab: { l: 0, a: 0, b: 0 },
        dmc: { code: String(i), name: `grey ${i}`, hex: '#000000', rgb: { r: v, g: v, b: v } },
        pixelCount: 1
      }
    }),
    colourCount: n,
    sourceColourCount: n
  }
}

/** A `w × h` pattern whose cells cycle through the palette. */
function patternOf(w: number, h: number, colours: number): StitchPattern {
  return {
    width: w,
    height: h,
    cells: Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) => (x + y) % colours)
    )
  }
}

describe('drawChartPages', () => {
  it('emits one A4 page per tile', () => {
    const pattern = patternOf(52, 52, 8)
    const pages = drawChartPages(pdf, pattern, paletteOf(8), font, {
      backgroundColour: AIDA,
      symbolDisplay: 'both'
    })

    expect(pages).toHaveLength(1) // a 52-wide sprite is exactly one page at the default scale — see pdf-layout
    const { width, height } = pages[0].getSize()
    expect(width).toBeCloseTo(mmToPt(A4_WIDTH_MM), 1)
    expect(height).toBeCloseTo(mmToPt(A4_HEIGHT_MM), 1)
  })

  it('tiles a pattern too big for one page, agreeing with planTiles', () => {
    const pattern = patternOf(150, 200, 4)
    const pages = drawChartPages(pdf, pattern, paletteOf(4), font, {
      backgroundColour: AIDA,
      symbolDisplay: 'both'
    })

    expect(pages).toHaveLength(planTiles(150, 200, DEFAULT_CELL_MM).length)
    expect(pages.length).toBeGreaterThan(1)
  })

  it.each(['colour', 'symbol', 'both'] as const)('renders in %s mode', (symbolDisplay) => {
    expect(() =>
      drawChartPages(pdf, patternOf(20, 20, 5), paletteOf(5), font, {
        backgroundColour: AIDA,
        symbolDisplay
      })
    ).not.toThrow()
  })

  // The fix at the heart of it: in symbol-only mode (no colour fill) the chart is a
  // black-and-white print, so a glyph is always black — a dark fabric setting must not make it
  // white, which would print white-on-white. In both mode it still contrasts with the floss.
  const rgbOf = (ink: ReturnType<typeof glyphInk>): [number, number, number] => [ink.red, ink.green, ink.blue]

  it('inks symbol-only glyphs black regardless of the fabric — never white-on-paper', () => {
    expect(rgbOf(glyphInk(false, { r: 10, g: 10, b: 30 }))).toEqual([0, 0, 0]) // dark fabric
    expect(rgbOf(glyphInk(false, { r: 250, g: 250, b: 250 }))).toEqual([0, 0, 0]) // light fabric
  })

  it('contrasts glyphs against the floss colour in both mode', () => {
    expect(rgbOf(glyphInk(true, { r: 0, g: 0, b: 0 }))).toEqual([1, 1, 1]) // white on a dark floss
    expect(rgbOf(glyphInk(true, { r: 255, g: 255, b: 255 }))).toEqual([0, 0, 0]) // black on a light floss
  })

  it('refuses a palette with more colours than there are stitch symbols', () => {
    // Via symbolsFor. The alternative — wrapping, as the prototype's chart.py does — hands
    // two floss colours the same glyph, and on a black-and-white chart the glyph is the
    // only thing telling them apart. A chart that lies is worse than no chart.
    const tooMany = MAX_COLOUR_COUNT + 1
    expect(() =>
      drawChartPages(pdf, patternOf(10, 10, tooMany), paletteOf(tooMany), font, {
        backgroundColour: AIDA,
        symbolDisplay: 'both'
      })
    ).toThrow(RangeError)
  })

  it('refuses a cell that indexes a colour the palette does not have', () => {
    const pattern: StitchPattern = { width: 1, height: 1, cells: [[9]] }
    expect(() =>
      drawChartPages(pdf, pattern, paletteOf(2), font, {
        backgroundColour: AIDA,
        symbolDisplay: 'both'
      })
    ).toThrow(RangeError)
  })

  it('accepts a pattern of no-stitch cells — they are fabric, not an error', () => {
    const pattern: StitchPattern = { width: 2, height: 1, cells: [[null, null]] }
    expect(() =>
      drawChartPages(pdf, pattern, paletteOf(1), font, {
        backgroundColour: AIDA,
        symbolDisplay: 'both'
      })
    ).not.toThrow()
  })
})
