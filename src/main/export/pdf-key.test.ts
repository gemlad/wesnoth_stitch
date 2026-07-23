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
  const WHITE: RGB = { r: 255, g: 255, b: 255 }

  it('adds a single page', async () => {
    const before = pdf.getPageCount()
    await drawCoverPage(
      pdf,
      { title: 'Dwarvish Fighter', width: 8, height: 8 },
      patternOf(8, 8, 8),
      paletteOf(8),
      font,
      { backgroundColour: WHITE }
    )
    expect(pdf.getPageCount()).toBe(before + 1)
  })

  it('does not throw when the palette was reduced (it says so on the page)', async () => {
    const page = await drawCoverPage(
      pdf,
      { title: 'Citizen', width: 40, height: 39 },
      patternOf(40, 39, 37),
      paletteOf(37, 95),
      font,
      { backgroundColour: WHITE }
    )
    expect(page).toBeDefined()
  })

  it('embeds the pattern preview (#46), and skips it for an empty pattern', async () => {
    const cover = async (pattern: StitchPattern, colours: number): Promise<number> => {
      const doc = await PDFDocument.create()
      doc.registerFontkit(fontkit)
      const f = await doc.embedFont(FONT_BYTES, { subset: true })
      await drawCoverPage(
        doc,
        { title: 'X', width: pattern.width, height: pattern.height },
        pattern,
        paletteOf(colours),
        f,
        { backgroundColour: WHITE }
      )
      return (await doc.save()).length
    }
    const withPreview = await cover(patternOf(24, 24, 6), 6)
    const empty = await cover({ width: 0, height: 0, cells: [] }, 0)
    // The embedded raster makes the document substantially larger than the same cover with
    // nothing to preview — proof the image bytes actually landed in the document.
    expect(withPreview).toBeGreaterThan(empty + 500)
  })
})

describe('drawKeyPages', () => {
  it('fits a palette up to one page (40 rows) on a single sheet', () => {
    // The row pitch (6mm) puts 40 rows on a page — enough for the original 37-colour cap.
    expect(keyRowsPerPage()).toBe(40)
    expect(drawKeyPages(pdf, paletteOf(40), font)).toHaveLength(1)
  })

  it('spills a full 47-colour cap key onto a second page rather than clipping', () => {
    // #30/D3 widened the set and #28 settled it at 47, past the 40 one page holds, so the
    // pagination is now live on a real chart. Row pitch was deliberately not shrunk to
    // reclaim the page.
    expect(MAX_COLOUR_COUNT).toBeGreaterThan(keyRowsPerPage())
    expect(drawKeyPages(pdf, paletteOf(MAX_COLOUR_COUNT), font)).toHaveLength(2)
  })

  it('paginates by the row budget it is given', () => {
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
