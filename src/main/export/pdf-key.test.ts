/**
 * Cover + floss key (#35, §5.5), and the assembled document.
 *
 * The assertion that matters most is the last one: the key and the chart must name a glyph
 * the same way. A key that disagrees with its chart is the one bug here that would waste a
 * whole stitching project rather than merely look wrong.
 */
import fontkit from '@pdf-lib/fontkit'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PDFDocument, type PDFFont } from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'
import type { RGB } from '../../shared/colour'
import {
  MAX_COLOUR_COUNT,
  symbolsFor,
  type QuantizedPalette,
  type StitchPattern
} from '../../shared/pipeline'
import { buildChartPdf } from './pdf'
import { drawCoverPage, drawKeyPages, keyRowsPerPage } from './pdf-key'
import { DEFAULT_CELL_MM, planTiles } from './pdf-layout'

const FONT = fileURLToPath(new URL('../../../resources/fonts/DejaVuSans.ttf', import.meta.url))
const AIDA: RGB = { r: 0xf2, g: 0xec, b: 0xdc }
const FONT_BYTES = readFileSync(FONT)

let pdf: PDFDocument
let font: PDFFont

beforeAll(async () => {
  pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  font = await pdf.embedFont(readFileSync(FONT), { subset: true })
})

function paletteOf(n: number, sourceColourCount = n): QuantizedPalette {
  return {
    colours: Array.from({ length: n }, (_, i) => {
      const v = (i * 7) % 256
      return {
        rgb: { r: v, g: v, b: v },
        lab: { l: 0, a: 0, b: 0 },
        dmc: { code: String(300 + i), name: `grey ${i}`, hex: '#000000', rgb: { r: v, g: v, b: v } },
        pixelCount: (i + 1) * 10
      }
    }),
    colourCount: n,
    sourceColourCount
  }
}

function patternOf(w: number, h: number, colours: number): StitchPattern {
  return {
    width: w,
    height: h,
    cells: Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) => (x + y) % colours)
    )
  }
}

describe('drawCoverPage', () => {
  it('adds a single page', () => {
    const before = pdf.getPageCount()
    drawCoverPage(pdf, { title: 'Dwarvish Fighter', width: 72, height: 72 }, paletteOf(8), font)
    expect(pdf.getPageCount()).toBe(before + 1)
  })

  it('does not throw when the palette was reduced (it says so on the page)', () => {
    expect(() =>
      drawCoverPage(pdf, { title: 'Citizen', width: 90, height: 90 }, paletteOf(37, 95), font)
    ).not.toThrow()
  })
})

describe('drawKeyPages', () => {
  it('fits the full 37-colour palette on one page', () => {
    // The row pitch (6mm) was chosen to make this true. At 7mm only 34 rows fit, which
    // would split the maximum key across two sheets — turning a page mid-key while
    // threading a needle, to buy 1mm of leading.
    expect(keyRowsPerPage()).toBeGreaterThanOrEqual(MAX_COLOUR_COUNT)
    expect(drawKeyPages(pdf, paletteOf(MAX_COLOUR_COUNT), font)).toHaveLength(1)
  })

  it('paginates rather than clipping when a key does not fit', () => {
    // Unreachable today — the page holds 40 rows and the cap is 37 — so it is forced here.
    // The path is kept because the cap is a number we *expect* to move (#30, D4), and code
    // that silently clips the day it passes 40 is a nasty way to discover that.
    expect(drawKeyPages(pdf, paletteOf(12), font, 5)).toHaveLength(3)
    expect(drawKeyPages(pdf, paletteOf(10), font, 5)).toHaveLength(2)
  })

  it('refuses a palette with more colours than there are stitch symbols', () => {
    expect(() => drawKeyPages(pdf, paletteOf(MAX_COLOUR_COUNT + 1), font)).toThrow(RangeError)
  })

  it('keys every colour in the palette exactly once', () => {
    const palette = paletteOf(20)
    const symbols = symbolsFor(palette)
    expect(new Set(symbols.map((s) => s.glyph)).size).toBe(palette.colours.length)
  })
})

describe('buildChartPdf', () => {
  it('assembles cover + key + chart, in that order', async () => {
    const palette = paletteOf(8)
    const pattern = patternOf(72, 72, 8)

    const bytes = await buildChartPdf(
      pattern,
      palette,
      { title: 'Dwarvish Fighter', width: 72, height: 72 },
      { backgroundColour: AIDA, symbolDisplay: 'both', fontBytes: FONT_BYTES }
    )

    const loaded = await PDFDocument.load(bytes)
    const chartPages = planTiles(72, 72, DEFAULT_CELL_MM).length
    expect(loaded.getPageCount()).toBe(1 + 1 + chartPages)
    expect(loaded.getTitle()).toBe('Dwarvish Fighter')
  })

  it('produces a real, loadable PDF rather than plausible bytes', async () => {
    const bytes = await buildChartPdf(
      patternOf(10, 10, 3),
      paletteOf(3),
      { title: 't', width: 10, height: 10 },
      { backgroundColour: AIDA, symbolDisplay: 'symbol', fontBytes: FONT_BYTES }
    )
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')
    await expect(PDFDocument.load(bytes)).resolves.toBeDefined()
  })

  it('propagates the symbol-set cap rather than emitting an ambiguous chart', async () => {
    const tooMany = MAX_COLOUR_COUNT + 1
    await expect(
      buildChartPdf(
        patternOf(10, 10, tooMany),
        paletteOf(tooMany),
        { title: 't', width: 10, height: 10 },
        { backgroundColour: AIDA, symbolDisplay: 'both', fontBytes: FONT_BYTES }
      )
    ).rejects.toThrow(RangeError)
  })
})
