/**
 * The cover preview's size (#68).
 *
 * The claim being tested is a physical one — "hold this against a square of 14-count Aida and
 * it is the size you will stitch" — so the assertions are in millimetres of paper, and the last
 * one reads the drawn size back out of a rendered cover rather than trusting the arithmetic
 * above it. A preview that is *nearly* true size is not a smaller version of the feature; it is
 * a measurement that lies.
 */
import fontkit from '@pdf-lib/fontkit'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { inflateSync } from 'node:zlib'
import { PDFArray, PDFDocument, PDFName, PDFRawStream, type PDFPage } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import type { RGB } from '../../shared/colour'
import type { QuantizedPalette, StitchPattern } from '../../shared/pipeline'
import { drawCoverPage } from './pdf-key'
import { mmToPt, PRINTABLE_WIDTH_MM } from './pdf-layout'
import {
  fitPreview,
  previewCellPx,
  previewScaleNote,
  TRUE_SIZE_AIDA_COUNT,
  TRUE_SIZE_MM_PER_STITCH
} from './pdf-preview'

const FONT_BYTES = readFileSync(
  fileURLToPath(new URL('../../../resources/fonts/DejaVuSans.ttf', import.meta.url))
)
const AIDA: RGB = { r: 0xf2, g: 0xec, b: 0xdc }

/** Roughly what the cover leaves for the preview: the full column, most of the page's height. */
const BOX = { maxWidthPt: mmToPt(PRINTABLE_WIDTH_MM), maxHeightPt: mmToPt(166) }

/** One stitch, in points, at true 14-count size. 72/14 exactly. */
const STITCH_PT = 72 / TRUE_SIZE_AIDA_COUNT

describe('TRUE_SIZE_MM_PER_STITCH', () => {
  it('is one fourteenth of an inch', () => {
    expect(TRUE_SIZE_MM_PER_STITCH).toBeCloseTo(1.8143, 4)
    expect(TRUE_SIZE_MM_PER_STITCH * TRUE_SIZE_AIDA_COUNT).toBeCloseTo(25.4, 10)
  })
})

describe('fitPreview', () => {
  it('draws a sprite at true size when it fits', () => {
    // 72×72 is the common Wesnoth unit sprite: 130.6mm square on 14-count, which the cover has
    // room for. This is the case the feature exists for.
    const fit = fitPreview({ width: 72, height: 72 }, BOX)

    expect(fit.trueSize).toBe(true)
    expect(fit.widthPt).toBeCloseTo(72 * STITCH_PT, 6)
    expect(fit.widthPt / mmToPt(1)).toBeCloseTo(130.6, 1) // mm on paper
  })

  it('reduces a pattern too wide for the column, and says it is not true size', () => {
    const fit = fitPreview({ width: 200, height: 50 }, BOX)

    expect(fit.trueSize).toBe(false)
    expect(fit.widthPt).toBeCloseTo(BOX.maxWidthPt, 6)
    expect(fit.heightPt / fit.widthPt).toBeCloseTo(50 / 200, 6) // aspect preserved
  })

  it('reduces a pattern too tall for the space', () => {
    const fit = fitPreview({ width: 40, height: 300 }, BOX)

    expect(fit.trueSize).toBe(false)
    expect(fit.heightPt).toBeCloseTo(BOX.maxHeightPt, 6)
    expect(fit.widthPt).toBeLessThan(BOX.maxWidthPt)
  })

  it('never enlarges a small sprite to fill the space', () => {
    // Blowing a 16×16 icon up to half a page would be the same lie the fallback is careful to
    // own up to, in the other direction.
    const fit = fitPreview({ width: 16, height: 16 }, BOX)

    expect(fit.trueSize).toBe(true)
    expect(fit.widthPt).toBeCloseTo(16 * STITCH_PT, 6)
  })

  it('fits exactly at the boundary rather than reducing by a hair', () => {
    const stitches = { width: 20, height: 20 }
    const exact = { maxWidthPt: 20 * STITCH_PT, maxHeightPt: 20 * STITCH_PT }
    expect(fitPreview(stitches, exact).trueSize).toBe(true)
  })
})

describe('previewCellPx', () => {
  it('targets ~300dpi at the size the preview is actually drawn', () => {
    // 72 stitches across 370.3pt (130.6mm) is 5.14pt per stitch — 21px each at 300dpi.
    expect(previewCellPx(72, 72 * STITCH_PT)).toBe(21)
  })

  it('drops the resolution for a pattern drawn small, rather than embedding a huge raster', () => {
    expect(previewCellPx(300, BOX.maxWidthPt)).toBeLessThan(10)
  })

  it('clamps both ends', () => {
    expect(previewCellPx(1, 500)).toBeLessThanOrEqual(24)
    expect(previewCellPx(5000, 100)).toBeGreaterThanOrEqual(4)
    expect(previewCellPx(0, 100)).toBeGreaterThanOrEqual(4) // an empty pattern is not a crash
  })
})

describe('previewScaleNote', () => {
  it('names the fabric count when it is true size', () => {
    expect(previewScaleNote(true)).toContain('14-count')
    expect(previewScaleNote(true)).toContain('actual size')
  })

  it('says plainly that a reduced preview is not actual size', () => {
    expect(previewScaleNote(false)).toContain('not actual size')
  })
})

/** The drawn width/height, in points, of every image placed on `page`. */
function drawnImageSizes(page: PDFPage): { widthPt: number; heightPt: number }[] {
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

  // pdf-lib places an image with `w 0 0 h 0 0 cm` immediately before `/Name Do`.
  return [...stream.matchAll(/([\d.]+) 0 0 ([\d.]+) 0 0 cm\n1 0 0 1 0 0 cm\n\/\S+ Do/g)].map(
    (m) => ({ widthPt: Number(m[1]), heightPt: Number(m[2]) })
  )
}

function solidPattern(width: number, height: number): StitchPattern {
  return {
    width,
    height,
    cells: Array.from({ length: height }, () => Array.from({ length: width }, () => 0))
  }
}

const ONE_COLOUR: QuantizedPalette = {
  colours: [
    {
      rgb: { r: 10, g: 20, b: 30 },
      lab: { l: 0, a: 0, b: 0 },
      dmc: { code: '310', name: 'Black', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } },
      pixelCount: 100
    }
  ],
  colourCount: 1,
  sourceColourCount: 1
}

async function coverImageSizes(
  width: number,
  height: number
): Promise<{ widthPt: number; heightPt: number }[]> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(FONT_BYTES, { subset: true })
  await drawCoverPage(
    doc,
    { title: 'fighter' },
    solidPattern(width, height),
    ONE_COLOUR,
    font,
    { backgroundColour: AIDA }
  )
  const loaded = await PDFDocument.load(await doc.save())
  return drawnImageSizes(loaded.getPages()[0])
}

describe('the cover actually draws it that big', () => {
  it('places a 72×72 preview at 130.6mm — true size on 14-count Aida', async () => {
    const [image] = await coverImageSizes(72, 72)

    expect(image).toBeDefined()
    expect(image.widthPt).toBeCloseTo(72 * STITCH_PT, 3)
    expect(image.heightPt).toBeCloseTo(72 * STITCH_PT, 3)
  })

  it('shrinks an oversized pattern into the column instead of running off the page', async () => {
    const [image] = await coverImageSizes(300, 300)

    expect(image.widthPt).toBeLessThanOrEqual(mmToPt(PRINTABLE_WIDTH_MM) + 0.01)
    expect(image.widthPt).toBeLessThan(300 * STITCH_PT) // i.e. genuinely reduced
  })
})
