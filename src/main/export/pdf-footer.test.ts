import fontkit from '@pdf-lib/fontkit'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'
import { LICENCE_LINES } from '../../shared/licence'
import {
  drawLicenceFooter,
  drawPageNumber,
  LICENCE_FOOTER_TOP_MM,
  pageNumberLabel,
  stampPageNumbers
} from './pdf-footer'
import { MARGIN_MM, mmToPt, PRINTABLE_WIDTH_MM } from './pdf-layout'

const FONT_BYTES = readFileSync(
  fileURLToPath(new URL('../../../resources/fonts/DejaVuSans.ttf', import.meta.url))
)

let font: PDFFont
let baseDoc: PDFDocument

beforeAll(async () => {
  baseDoc = await PDFDocument.create()
  baseDoc.registerFontkit(fontkit)
  font = await baseDoc.embedFont(FONT_BYTES, { subset: true })
})

describe('LICENCE_LINES', () => {
  it('names the Wesnoth licence and points at the copyrights page', () => {
    expect(LICENCE_LINES.join(' ')).toMatch(/GPL v2\+ \/ CC-BY-SA 4\.0/)
    expect(LICENCE_LINES.some((l) => l.includes('wiki.wesnoth.org'))).toBe(true)
  })
})

describe('drawLicenceFooter', () => {
  it('reserves a footer band above the page bottom', () => {
    expect(LICENCE_FOOTER_TOP_MM).toBeGreaterThan(9)
    expect(LICENCE_FOOTER_TOP_MM).toBeLessThan(20) // stays within the bottom margin
  })

  it('writes the notice onto the page (the document grows by the drawn text)', async () => {
    const size = async (withFooter: boolean): Promise<number> => {
      const doc = await PDFDocument.create()
      doc.registerFontkit(fontkit)
      const f = await doc.embedFont(FONT_BYTES, { subset: true })
      const page = doc.addPage([595, 842])
      if (withFooter) drawLicenceFooter(page, f)
      return (await doc.save()).length
    }
    expect(await size(true)).toBeGreaterThan(await size(false))
  })

  it('does not throw on a normal page', () => {
    const page = baseDoc.addPage([595, 842])
    expect(() => drawLicenceFooter(page, font)).not.toThrow()
  })
})

interface Drawn {
  text: string
  x: number
  y: number
  size: number
}

/** A page that records `drawText` rather than drawing it — see pdf-header.test.ts. */
function recordingPage(): { page: PDFPage; drawn: Drawn[] } {
  const drawn: Drawn[] = []
  const page = {
    drawText: (text: string, options: { x: number; y: number; size: number }) => {
      drawn.push({ text, x: options.x, y: options.y, size: options.size })
    }
  } as unknown as PDFPage
  return { page, drawn }
}

describe('page numbers (#92)', () => {
  const FOOTER_PT = 8
  const RIGHT_EDGE = mmToPt(MARGIN_MM + PRINTABLE_WIDTH_MM)

  it('counts the cover, so the numbers agree with a PDF viewer', () => {
    // The decision (Gemma, 2026-07-29): the cover is page 1 and simply goes unlabelled. The
    // alternative — numbering after the cover — reads like a booklet and disagrees with the
    // viewer's counter, which is what you use when reprinting a page you dropped.
    expect(pageNumberLabel(2, 12)).toBe('Page 2 of 12')
    expect(pageNumberLabel(12, 12)).toBe('Page 12 of 12')
  })

  it('right-aligns the number to the margin, on the footer baseline', () => {
    const { page, drawn } = recordingPage()
    drawPageNumber(page, font, 2, 12)

    expect(drawn).toHaveLength(1)
    const [label] = drawn
    expect(label.text).toBe('Page 2 of 12')
    expect(label.size).toBe(FOOTER_PT)
    expect(label.x + font.widthOfTextAtSize(label.text, FOOTER_PT)).toBeCloseTo(RIGHT_EDGE, 5)
  })

  it('clears the licence notice it shares the line with', () => {
    // Both are drawn at the same baseline: the notice left-aligned, the number right-aligned.
    // If the notice's wording ever grows, this fails here rather than overprinting on paper.
    const bottomLine = LICENCE_LINES[LICENCE_LINES.length - 1]
    const noticeRight = mmToPt(MARGIN_MM) + font.widthOfTextAtSize(bottomLine, FOOTER_PT)

    const { page, drawn } = recordingPage()
    drawPageNumber(page, font, 999, 999) // the widest label this can realistically produce

    expect(drawn[0].x).toBeGreaterThan(noticeRight + 6)
  })

  it('numbers every page but the first', () => {
    const pages = Array.from({ length: 4 }, () => recordingPage())
    stampPageNumbers(
      pages.map((p) => p.page),
      font
    )

    expect(pages[0].drawn).toHaveLength(0) // the cover
    expect(pages.slice(1).map((p) => p.drawn[0].text)).toEqual([
      'Page 2 of 4',
      'Page 3 of 4',
      'Page 4 of 4'
    ])
  })

  it('leaves a single-page document unnumbered', () => {
    // Cover only: "Page 1 of 1" on a document you are holding all of is noise.
    const only = recordingPage()
    stampPageNumbers([only.page], font)
    expect(only.drawn).toHaveLength(0)
  })
})
