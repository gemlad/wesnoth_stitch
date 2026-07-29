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
import { inflateSync } from 'node:zlib'
import { PDFArray, PDFDocument, PDFName, PDFRawStream, type PDFFont, type PDFPage } from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'
import type { RGB } from '../../shared/colour'
import {
  MAX_COLOUR_COUNT,
  symbolsFor,
  type QuantizedPalette,
  type StitchPattern
} from '../../shared/pipeline'
import { buildChartPdf } from './pdf'
import { drawCoverPage, drawKeyPages, keyRows, keyRowsPerPage } from './pdf-key'
import { DEFAULT_CELL_MM, MARGIN_MM, mmToPt, planTiles, PRINTABLE_WIDTH_MM } from './pdf-layout'

const FONT = fileURLToPath(new URL('../../../resources/fonts/DejaVuSans.ttf', import.meta.url))
const AIDA: RGB = { r: 0xf2, g: 0xec, b: 0xdc }
/** The running head every page after the cover carries (#91). */
const TITLE = 'dwarvish-fighter'
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

/**
 * A palette whose code order and palette order **disagree** — the only fixture that can tell
 * a sorted key from an unsorted one. Codes are listed dominant-floss-first, as reduction
 * leaves them (§5.2); pixel counts descend to match.
 */
function paletteOfCodes(codes: string[]): QuantizedPalette {
  return {
    colours: codes.map((code, i) => {
      const v = (i * 31) % 256
      return {
        rgb: { r: v, g: v, b: v },
        lab: { l: 0, a: 0, b: 0 },
        dmc: { code, name: `floss ${code}`, hex: '#000000', rgb: { r: v, g: v, b: v } },
        pixelCount: (codes.length - i) * 10
      }
    }),
    colourCount: codes.length,
    sourceColourCount: codes.length
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
      { title: 'Dwarvish Fighter' },
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
      { title: 'Citizen' },
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
      await drawCoverPage(doc, { title: 'X' }, pattern, paletteOf(colours), f, {
        backgroundColour: WHITE
      })
      return (await doc.save()).length
    }
    const withPreview = await cover(patternOf(24, 24, 6), 6)
    const empty = await cover({ width: 0, height: 0, cells: [] }, 0)
    // The embedded raster makes the document substantially larger than the same cover with
    // nothing to preview — proof the image bytes actually landed in the document.
    expect(withPreview).toBeGreaterThan(empty + 500)
  })
})

describe('keyRows (#90)', () => {
  // Deliberately out of code order, and with the two named codes in the middle.
  const CODES = ['3865', '310', 'ECRU', '422', 'B5200', '3', '898']

  it('prints in DMC code order, numbers by value and named codes last', () => {
    const rows = keyRows(paletteOfCodes(CODES))
    expect(rows.map((r) => r.colour.dmc.code)).toEqual([
      '3',
      '310',
      '422',
      '898',
      '3865',
      'B5200',
      'ECRU'
    ])
  })

  it('keeps each colour with the glyph the chart draws for it', () => {
    // The dangerous version of this change sorts the palette and re-derives symbols from the
    // sorted array — a key that is beautifully ordered and wrong about every glyph. Sorting
    // must move rows, never re-letter them, so every row is checked against `symbolsFor` at
    // its *original* palette index.
    const palette = paletteOfCodes(CODES)
    const symbols = symbolsFor(palette)
    const rows = keyRows(palette)

    for (const row of rows) {
      const original = palette.colours.indexOf(row.colour)
      expect(row.symbol.glyph).toBe(symbols[original].glyph)
    }
  })

  it('keys every colour exactly once, and leaves the palette untouched', () => {
    const palette = paletteOfCodes(CODES)
    const before = palette.colours.map((c) => c.dmc.code)
    const rows = keyRows(palette)

    expect(rows).toHaveLength(palette.colours.length)
    expect(new Set(rows.map((r) => r.symbol.glyph)).size).toBe(palette.colours.length)
    // The chart reads `palette.colours` in this order; sorting the key must not disturb it.
    expect(palette.colours.map((c) => c.dmc.code)).toEqual(before)
  })

  it('refuses a palette with more colours than there are stitch symbols', () => {
    expect(() => keyRows(paletteOf(MAX_COLOUR_COUNT + 1))).toThrow(RangeError)
  })
})

describe('drawKeyPages', () => {
  it('fits a palette up to one page (40 rows) on a single sheet', () => {
    // The row pitch (6mm) puts 40 rows on a page — enough for the original 37-colour cap.
    expect(keyRowsPerPage()).toBe(40)
    expect(drawKeyPages(pdf, paletteOf(40), font, TITLE)).toHaveLength(1)
  })

  it('spills a full 47-colour cap key onto a second page rather than clipping', () => {
    // #30/D3 widened the set and #28 settled it at 47, past the 40 one page holds, so the
    // pagination is now live on a real chart. Row pitch was deliberately not shrunk to
    // reclaim the page.
    expect(MAX_COLOUR_COUNT).toBeGreaterThan(keyRowsPerPage())
    expect(drawKeyPages(pdf, paletteOf(MAX_COLOUR_COUNT), font, TITLE)).toHaveLength(2)
  })

  it('paginates by the row budget it is given', () => {
    expect(drawKeyPages(pdf, paletteOf(12), font, TITLE, 5)).toHaveLength(3)
    expect(drawKeyPages(pdf, paletteOf(10), font, TITLE, 5)).toHaveLength(2)
  })

  it('refuses a palette with more colours than there are stitch symbols', () => {
    expect(() => drawKeyPages(pdf, paletteOf(MAX_COLOUR_COUNT + 1), font, TITLE)).toThrow(
      RangeError
    )
  })

  it('carries the running head without costing a row (#91)', () => {
    // The name shares the "Floss key" baseline, so the row budget is untouched however long
    // the sprite is called.
    const long = 'an-absurdly-long-sprite-name-that-would-run-off-the-page-if-unchecked'
    expect(drawKeyPages(pdf, paletteOf(40), font, long)).toHaveLength(1)
  })

  it('keys every colour in the palette exactly once', () => {
    const palette = paletteOf(20)
    const symbols = symbolsFor(palette)
    expect(new Set(symbols.map((s) => s.glyph)).size).toBe(palette.colours.length)
  })
})

/**
 * The x positions of every text run drawn on `page` at the footer baseline.
 *
 * The one thing unit tests cannot reach is whether `buildChartPdf` actually *calls* the
 * numbering pass — so this reads the assembled document back. Drawn characters are
 * unrecoverable (an embedded subset font encodes them as glyph ids), but the text matrix
 * `1 0 0 1 x y Tm` that positions each run is plain in the content stream, and position is
 * exactly what is being claimed: left margin for the licence notice, right-aligned for the
 * page number.
 */
function footerTextXs(page: PDFPage): number[] {
  const contents = page.node.get(PDFName.of('Contents'))
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents]

  let stream = ''
  for (const ref of refs) {
    const object = page.doc.context.lookup(ref)
    if (!(object instanceof PDFRawStream)) continue
    const bytes = Buffer.from(object.getContents())
    stream += object.dict.get(PDFName.of('Filter'))
      ? inflateSync(bytes).toString('latin1')
      : bytes.toString('latin1')
  }

  const baseline = mmToPt(9) // FIRST_LINE_MM, where both the notice and the number sit
  return [...stream.matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/g)]
    .filter((m) => Math.abs(Number(m[2]) - baseline) < 0.5)
    .map((m) => Number(m[1]))
}

describe('buildChartPdf', () => {
  it('assembles cover + key + chart, in that order', async () => {
    const palette = paletteOf(8)
    const pattern = patternOf(72, 72, 8)

    const bytes = await buildChartPdf(
      pattern,
      palette,
      { title: 'Dwarvish Fighter' },
      { backgroundColour: AIDA, symbolDisplay: 'both', flip: false, fontBytes: FONT_BYTES }
    )

    const loaded = await PDFDocument.load(bytes)
    const chartPages = planTiles(72, 72, DEFAULT_CELL_MM).length
    expect(loaded.getPageCount()).toBe(1 + 1 + chartPages)
    expect(loaded.getTitle()).toBe('Dwarvish Fighter')
  })

  it('numbers every page but the cover (#92)', async () => {
    const bytes = await buildChartPdf(
      patternOf(72, 72, 8),
      paletteOf(8),
      { title: TITLE },
      { backgroundColour: AIDA, symbolDisplay: 'both', flip: false, fontBytes: FONT_BYTES }
    )
    const loaded = await PDFDocument.load(bytes)
    const [cover, ...rest] = loaded.getPages()
    const leftMargin = mmToPt(MARGIN_MM)
    const rightEdge = mmToPt(MARGIN_MM + PRINTABLE_WIDTH_MM)

    // The cover carries the licence notice and nothing else on that line.
    expect(footerTextXs(cover)).toEqual([expect.closeTo(leftMargin, 1)])

    expect(rest.length).toBeGreaterThan(0)
    for (const page of rest) {
      const xs = footerTextXs(page)
      expect(xs).toHaveLength(2)
      expect(xs[0]).toBeCloseTo(leftMargin, 1) // the notice, still left-aligned
      expect(xs[1]).toBeGreaterThan(leftMargin) // the number, over on the right
      expect(xs[1]).toBeLessThan(rightEdge)
    }
  })

  it('mirrors the whole document when the flip is on (#56)', async () => {
    // An asymmetric pattern: every cell in a row is a different colour, so a mirror changes
    // what is drawn. Byte equality is the assertion because the same input twice gives the
    // same bytes — so a difference can only come from the flip, and its absence proves a
    // symmetric pattern is left alone.
    const asymmetric: StitchPattern = {
      width: 4,
      height: 2,
      cells: [
        [0, 1, 2, 3],
        [3, 2, 1, 0]
      ]
    }
    const build = (flip: boolean): Promise<Uint8Array> =>
      buildChartPdf(
        asymmetric,
        paletteOf(4),
        { title: TITLE },
        { backgroundColour: AIDA, symbolDisplay: 'both', flip, fontBytes: FONT_BYTES }
      )

    const [plain, again, flipped] = await Promise.all([build(false), build(false), build(true)])

    expect(Buffer.from(again)).toEqual(Buffer.from(plain)) // the export is deterministic…
    expect(Buffer.from(flipped)).not.toEqual(Buffer.from(plain)) // …so this is the flip
  })

  it('produces a real, loadable PDF rather than plausible bytes', async () => {
    const bytes = await buildChartPdf(
      patternOf(10, 10, 3),
      paletteOf(3),
      { title: 't' },
      { backgroundColour: AIDA, symbolDisplay: 'symbol', flip: false, fontBytes: FONT_BYTES }
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
        { title: 't' },
        { backgroundColour: AIDA, symbolDisplay: 'both', flip: false, fontBytes: FONT_BYTES }
      )
    ).rejects.toThrow(RangeError)
  })
})
