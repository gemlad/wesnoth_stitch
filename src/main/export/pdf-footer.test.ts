import fontkit from '@pdf-lib/fontkit'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PDFDocument, type PDFFont } from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'
import { LICENCE_LINES } from '../../shared/licence'
import { drawLicenceFooter, LICENCE_FOOTER_TOP_MM } from './pdf-footer'

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
