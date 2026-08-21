/**
 * The Pattern Keeper chart (#55, §5.5).
 *
 * What is worth testing here is *not* that the chart looks right — no test can settle that,
 * and the geometry is already covered next door in `pdf-layout.test.ts`. It is the handful of
 * properties the **importer** depends on, each of which is invisible on paper and would fail
 * silently:
 *
 * - the key's column headings are there, spelled exactly as Pattern Keeper looks for them, and
 *   recoverable *as text* rather than as anonymous glyph ids;
 * - a chart page fills nothing and sets no transparency, so the only marks in a cell are its
 *   glyph and the rules around it;
 * - the key and the chart name a glyph the same way — the bug that would waste a project.
 *
 * **Everything here reads the document back after `save()`, and that is not fussiness.**
 * pdf-lib buffers a page's operators and only flushes them into a content stream when the
 * document is saved, so a page inspected before that has an *empty* stream — against which
 * `not.toContain(…)` passes for entirely the wrong reason. The first draft of this file did
 * exactly that and reported three green tests that were checking nothing.
 *
 * Whether a real import actually succeeds is a human verdict taken on a phone, against the
 * artefact `npm run uat:chart` writes. See `uat/README.md`.
 */
import fontkit from '@pdf-lib/fontkit'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { PDFArray, PDFDocument, PDFName, PDFRawStream, type PDFFont, type PDFPage } from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  MAX_COLOUR_COUNT,
  symbolsFor,
  type QuantizedPalette,
  type StitchPattern
} from '../../shared/pipeline'
import { DEFAULT_CELL_MM, mmToPt, planTiles, A4_WIDTH_MM, A4_HEIGHT_MM } from './pdf-layout'
import {
  buildPatternKeeperPdf,
  drawPkChartPages,
  drawPkKeyPages,
  pkKeyRowsPerPage,
  PK_KEY_HEADINGS
} from './pdf-pk'

const FONT = fileURLToPath(new URL('../../../resources/fonts/DejaVuSans.ttf', import.meta.url))
const FONT_BYTES = readFileSync(FONT)
const TITLE = 'dwarvish-fighter'

/** `n` distinct greys with plausible DMC codes — enough to exercise the palette. */
function paletteOf(n: number): QuantizedPalette {
  return {
    colours: Array.from({ length: n }, (_, i) => {
      const v = (i * 7) % 256
      return {
        rgb: { r: v, g: v, b: v },
        lab: { l: 0, a: 0, b: 0 },
        dmc: {
          code: String(300 + i),
          name: `grey ${i}`,
          hex: '#000000',
          rgb: { r: v, g: v, b: v }
        },
        pixelCount: (i + 1) * 10
      }
    }),
    colourCount: n,
    sourceColourCount: n
  }
}

/**
 * A pattern wide enough to tile but small enough to stay cheap: 60 columns is past the 52 one
 * page holds, so it cuts into two tiles, while 20 rows keeps the glyph count — and every
 * assertion that has to save, reload and re-parse the document — an order of magnitude below a
 * full 72×72 sprite. The tiling is what is under test; the stitch count is not.
 */
const TILED = { width: 60, height: 20 }

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

/** A page's content stream, decompressed, as latin-1 so operator text stays byte-honest. */
function contentOf(page: PDFPage): string {
  const contents = page.node.get(PDFName.of('Contents'))
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents]

  let stream = ''
  for (const ref of refs) {
    const object = page.doc.context.lookup(ref)
    if (!(object instanceof PDFRawStream)) continue
    stream += streamBody(object)
  }
  return stream
}

function streamBody(object: PDFRawStream): string {
  const bytes = Buffer.from(object.getContents())
  if (!object.dict.get(PDFName.of('Filter'))) return bytes.toString('latin1')
  try {
    return inflateSync(bytes).toString('latin1')
  } catch {
    return ''
  }
}

/**
 * Glyph id → character, from every `ToUnicode` CMap in the document.
 *
 * **This is the mapping Pattern Keeper's import stands on.** A subset font encodes text as
 * glyph ids, which are meaningless numbers assigned in the order the glyphs happened to be
 * used; the `ToUnicode` CMap is the only thing that says a given id was the letter `S`. So
 * decoding the pages *through* it — rather than comparing against `font.encodeText`, which
 * would just re-derive the same arbitrary numbers — tests the property that matters: that the
 * characters can be got back out at all.
 */
function toUnicode(doc: PDFDocument): Map<string, string> {
  const map = new Map<string, string>()
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue
    const body = streamBody(object)

    // Only the bfchar sections — a bfrange entry has a third operand and would parse as a
    // second, bogus pair.
    for (const section of body.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const entry of section[1].matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>/g)) {
        const units = entry[2].match(/.{4}/g) ?? []
        map.set(entry[1].toUpperCase(), String.fromCharCode(...units.map((u) => parseInt(u, 16))))
      }
    }
  }
  return map
}

/** A saved document, opened for inspection: raw operators, and the text they draw. */
interface Rendered {
  pages: PDFPage[]
  /** One page's content stream — operators, not characters. */
  raw(page: PDFPage): string
  /** Every text run drawn on a page, decoded through the embedded font's `ToUnicode`. */
  text(page: PDFPage): string
  /** The same runs, unjoined and in the order they were drawn. */
  runs(page: PDFPage): string[]
  /** How many glyphs were drawn on a page, across all its text runs. */
  glyphCount(page: PDFPage): number
}

const HEX_RUN = /<([0-9A-Fa-f]+)>\s*Tj/g

async function open(bytes: Uint8Array): Promise<Rendered> {
  const doc = await PDFDocument.load(bytes)
  const unicode = toUnicode(doc)
  const codes = (page: PDFPage): string[][] =>
    [...contentOf(page).matchAll(HEX_RUN)].map((m) => m[1].match(/.{4}/g) ?? [])

  const runs = (page: PDFPage): string[] =>
    codes(page).map((run) => run.map((c) => unicode.get(c.toUpperCase()) ?? '�').join(''))

  return {
    pages: doc.getPages(),
    raw: contentOf,
    runs,
    text: (page) => runs(page).join('\n'),
    glyphCount: (page) => codes(page).reduce((n, run) => n + run.length, 0)
  }
}

/** Draw into a fresh document, save it, and open the result. */
async function render(draw: (doc: PDFDocument, font: PDFFont) => void): Promise<Rendered> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(FONT_BYTES, { subset: true })
  draw(doc, font)
  return open(await doc.save())
}

describe('drawPkChartPages', () => {
  let scratch: PDFDocument
  let font: PDFFont

  beforeAll(async () => {
    scratch = await PDFDocument.create()
    scratch.registerFontkit(fontkit)
    font = await scratch.embedFont(FONT_BYTES, { subset: true })
  })

  it('emits one A4 page per tile, agreeing with planTiles', () => {
    const pattern = patternOf(TILED.width, TILED.height, 8)
    const pages = drawPkChartPages(scratch, pattern, paletteOf(8), font, { title: TITLE })

    expect(pages.length).toBeGreaterThan(1) // the fixture really does tile
    expect(pages).toHaveLength(planTiles(TILED.width, TILED.height, DEFAULT_CELL_MM).length)
    const { width, height } = pages[0].getSize()
    expect(width).toBeCloseTo(mmToPt(A4_WIDTH_MM), 1)
    expect(height).toBeCloseTo(mmToPt(A4_HEIGHT_MM), 1)
  })

  it('fills nothing and sets no transparency', async () => {
    // Two properties in one stream, because they are the same claim: a cell holds its glyph
    // and nothing else. `re` is pdf-lib's rectangle — a colour block under the symbol — and
    // `gs` is the ExtGState the print chart's 60%-opacity gridlines need. Neither belongs in
    // a document whose reader has to pick the glyph out of the cell.
    const { pages, raw } = await render((doc, f) =>
      drawPkChartPages(doc, patternOf(20, 20, 6), paletteOf(6), f, { title: TITLE })
    )
    const stream = raw(pages[0])

    expect(stream).toMatch(/\bTj\b/) // the page was really drawn, so the negatives mean something
    expect(stream).not.toMatch(/\bre\b/)
    expect(stream).not.toMatch(/\bgs\b/)
  })

  it('draws a glyph for every stitched cell and none for a blank one', async () => {
    // A 4×1 pattern with one hole, against the same page with the hole filled in. Every other
    // glyph on the page — rulers, heading, footer — is identical between the two, so the
    // difference can only be that one cell.
    const count = async (cells: (number | null)[]): Promise<number> => {
      const { pages, glyphCount } = await render((doc, f) =>
        drawPkChartPages(doc, { width: 4, height: 1, cells: [cells] }, paletteOf(4), f, {
          title: TITLE
        })
      )
      return glyphCount(pages[0])
    }
    expect((await count([0, 3, 1, 2])) - (await count([0, null, 1, 2]))).toBe(1)
  })

  it('refuses a palette with more colours than there are stitch symbols', () => {
    expect(() =>
      drawPkChartPages(scratch, patternOf(10, 10, 3), paletteOf(MAX_COLOUR_COUNT + 1), font, {
        title: TITLE
      })
    ).toThrow(RangeError)
  })
})

describe('drawPkKeyPages', () => {
  const key = (colours: number, rowsPerPage?: number): Promise<Rendered> =>
    render((doc, f) => drawPkKeyPages(doc, paletteOf(colours), f, TITLE, rowsPerPage))

  it('heads the table exactly as Pattern Keeper looks for it', async () => {
    const { pages, text } = await key(6)
    const drawn = text(pages[0])
    for (const heading of PK_KEY_HEADINGS) {
      expect(drawn).toContain(heading)
    }
  })

  it('spells the headings Symbol / Number / Name and nothing else', () => {
    // A guard on the constant rather than on the drawing: these strings are how the table is
    // found at all, so "improving" them to Colour / DMC / Shade would produce a chart that
    // imports with no colours. If this test is what stops a rename, it has done its job.
    expect(PK_KEY_HEADINGS).toEqual(['Symbol', 'Number', 'Name'])
  })

  it('brands the code in the Number column, as the OXS export does (§5.5)', async () => {
    const { pages, text } = await key(3)
    const drawn = text(pages[0])
    // A bare code would be ambiguous to software that knows more than one floss range.
    expect(drawn).toContain('DMC 300')
    expect(drawn).toContain('DMC 302')
  })

  it('repeats the headings on a spilled second page, not only the first', async () => {
    // A table found halfway down a document is only a table if it says what its columns are.
    const { pages, text } = await key(12, 5)
    expect(pages).toHaveLength(3)
    for (const page of pages) {
      for (const heading of PK_KEY_HEADINGS) {
        expect(text(page)).toContain(heading)
      }
    }
  })

  it('fits a full 47-colour cap key in the pages the row budget allows', async () => {
    expect(pkKeyRowsPerPage()).toBeGreaterThan(0)
    const { pages } = await key(MAX_COLOUR_COUNT)
    expect(pages).toHaveLength(Math.ceil(MAX_COLOUR_COUNT / pkKeyRowsPerPage()))
  })

  it('refuses a palette with more colours than there are stitch symbols', async () => {
    await expect(key(MAX_COLOUR_COUNT + 1)).rejects.toThrow(RangeError)
  })
})

describe('buildPatternKeeperPdf', () => {
  const build = (
    pattern: StitchPattern,
    palette: QuantizedPalette,
    flip = false
  ): Promise<Uint8Array> =>
    buildPatternKeeperPdf(pattern, palette, { title: TITLE }, { flip, fontBytes: FONT_BYTES })

  it('assembles chart pages then the key, with no cover', async () => {
    const bytes = await build(patternOf(TILED.width, TILED.height, 8), paletteOf(8))
    const { pages, text } = await open(bytes)

    const chartPages = planTiles(TILED.width, TILED.height, DEFAULT_CELL_MM).length
    expect(pages).toHaveLength(chartPages + 1)

    // The chart comes first and the key last — the order the #55 reference export uses.
    expect(text(pages[0])).toContain('Rows 0–')
    expect(text(pages[pages.length - 1])).toContain('Floss key')
    expect((await PDFDocument.load(bytes)).getTitle()).toBe(TITLE)
  })

  it('names a glyph the same way in the key as on the chart', async () => {
    // The bug this guards is the one that wastes a stitching project rather than merely
    // looking wrong. Both halves come from `symbolsFor(palette)`, so every glyph the key
    // prints must be one the chart actually drew.
    const palette = paletteOf(6)
    const { pages, text } = await open(await build(patternOf(12, 4, 6), palette))
    const keyText = text(pages[pages.length - 1])
    const chartText = text(pages[0])

    for (const symbol of symbolsFor(palette)) {
      expect(keyText).toContain(symbol.glyph)
      expect(chartText).toContain(symbol.glyph)
    }
  })

  it('numbers every page, including the first (there is no cover to exempt)', async () => {
    const { pages, raw, text } = await open(
      await build(patternOf(TILED.width, TILED.height, 8), paletteOf(8))
    )

    // Two text runs share the bottom footer baseline on a numbered page: the licence notice
    // on the left, the page number on the right. See pdf-footer.
    const baseline = mmToPt(9)
    pages.forEach((page, index) => {
      const xs = [...raw(page).matchAll(/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/g)]
        .filter((m) => Math.abs(Number(m[2]) - baseline) < 0.5)
        .map((m) => Number(m[1]))
      expect(xs).toHaveLength(2)
      expect(xs[1]).toBeGreaterThan(xs[0]) // the notice left, the number right
      expect(text(page)).toContain(`Page ${index + 1} of ${pages.length}`)
    })
  })

  it('mirrors the document when the flip is on (#56)', async () => {
    // Rows of distinct glyphs, so a mirror is visible rather than merely probable.
    const asymmetric: StitchPattern = {
      width: 4,
      height: 2,
      cells: [
        [0, 1, 2, 3],
        [3, 2, 1, 0]
      ]
    }
    const palette = paletteOf(4)

    // Glyphs are drawn before anything else on a chart page, in row-major order, so the first
    // eight runs are this 4×2 pattern and nothing else.
    const charted = async (flip: boolean): Promise<string[][]> => {
      const { pages, runs } = await open(await build(asymmetric, palette, flip))
      const glyphs = runs(pages[0]).slice(0, 8)
      return [glyphs.slice(0, 4), glyphs.slice(4, 8)]
    }

    const [plain, flipped] = await Promise.all([charted(false), charted(true)])

    // Compared as *content*, not as bytes. A PDF carries its own creation time, so two builds
    // either side of a second boundary differ without either being wrong — and byte equality
    // would only ever have said "something changed". This says what the flip actually does:
    // every row read backwards, and nothing else touched.
    expect(flipped).toEqual(plain.map((row) => [...row].reverse()))
    expect(flipped).not.toEqual(plain)
  })

  it('produces a real, loadable PDF rather than plausible bytes', async () => {
    const bytes = await build(patternOf(10, 10, 3), paletteOf(3))
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')
    await expect(PDFDocument.load(bytes)).resolves.toBeDefined()
  })

  it('propagates the symbol-set cap rather than emitting an ambiguous chart', async () => {
    const tooMany = MAX_COLOUR_COUNT + 1
    await expect(build(patternOf(10, 10, tooMany), paletteOf(tooMany))).rejects.toThrow(RangeError)
  })
})
