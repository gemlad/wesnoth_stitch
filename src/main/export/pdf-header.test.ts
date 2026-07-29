/**
 * The running head (#91).
 *
 * Drawn text cannot be read back out of a pdf-lib page — an embedded subset font encodes it as
 * glyph ids, not characters — so these tests hand `drawRunningHead` a **recording page**: a
 * stand-in that captures what would be drawn, with the real bundled font supplying the widths.
 * That is what makes the placement claims ("right-aligned to the margin", "never reaches back
 * into the heading") assertable at all, rather than merely asserted in a comment.
 */
import fontkit from '@pdf-lib/fontkit'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'
import { drawRunningHead, RUNNING_HEAD_PT, truncateToWidth } from './pdf-header'
import { MARGIN_MM, mmToPt, PRINTABLE_WIDTH_MM } from './pdf-layout'

const FONT = fileURLToPath(new URL('../../../resources/fonts/DejaVuSans.ttf', import.meta.url))
const FONT_BYTES = readFileSync(FONT)

const LEFT = mmToPt(MARGIN_MM)
const RIGHT_EDGE = mmToPt(MARGIN_MM + PRINTABLE_WIDTH_MM)

let font: PDFFont

beforeAll(async () => {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  font = await pdf.embedFont(FONT_BYTES, { subset: true })
})

interface Drawn {
  text: string
  x: number
  y: number
  size: number
}

/** A page that records `drawText` instead of drawing it. */
function recordingPage(): { page: PDFPage; drawn: Drawn[] } {
  const drawn: Drawn[] = []
  const page = {
    drawText: (text: string, options: { x: number; y: number; size: number }) => {
      drawn.push({ text, x: options.x, y: options.y, size: options.size })
    }
  } as unknown as PDFPage
  return { page, drawn }
}

describe('truncateToWidth', () => {
  it('returns the text unchanged when it fits', () => {
    const text = 'dwarvish-fighter'
    const width = font.widthOfTextAtSize(text, RUNNING_HEAD_PT)
    expect(truncateToWidth(text, font, RUNNING_HEAD_PT, width + 1)).toBe(text)
  })

  it('ellipsises to fit, and the result really does fit', () => {
    const text = 'an-extremely-long-sprite-name-that-will-not-fit-anywhere'
    const max = 60
    const out = truncateToWidth(text, font, RUNNING_HEAD_PT, max)

    expect(out).not.toBe(text)
    expect(out.endsWith('…')).toBe(true)
    expect(font.widthOfTextAtSize(out, RUNNING_HEAD_PT)).toBeLessThanOrEqual(max)
  })

  it('gives up rather than draw an ellipsis wider than the space', () => {
    expect(truncateToWidth('anything', font, RUNNING_HEAD_PT, 1)).toBe('')
    expect(truncateToWidth('anything', font, RUNNING_HEAD_PT, 0)).toBe('')
    expect(truncateToWidth('anything', font, RUNNING_HEAD_PT, -5)).toBe('')
  })

  it('does not split a surrogate pair into a lone half', () => {
    // Sprite names are ASCII, but a name pasted from elsewhere need not be; slicing UTF-16
    // units rather than codepoints would hand the font half a character.
    const out = truncateToWidth('𝔡𝔴𝔞𝔯𝔣𝔦𝔰𝔥', font, RUNNING_HEAD_PT, 20)
    for (const ch of out)
      expect(ch.codePointAt(0)! > 0xdfff || ch.codePointAt(0)! < 0xd800).toBe(true)
  })

  it('the bundled font can draw the ellipsis it uses', () => {
    // §5.3's tofu rule applies to page furniture too: a codepoint the font lacks prints as a
    // box, and a truncated name ending in a box looks like a broken export.
    expect(fontkit.create(FONT_BYTES).hasGlyphForCodePoint(0x2026)).toBe(true)
  })
})

describe('drawRunningHead', () => {
  const TITLE = 'dwarvish-fighter'

  it('right-aligns the name to the right margin', () => {
    const { page, drawn } = recordingPage()
    drawRunningHead(page, font, TITLE, { y: 100, headingRightPt: LEFT + 80 })

    expect(drawn).toHaveLength(1)
    const [head] = drawn
    expect(head.text).toBe(TITLE)
    expect(head.size).toBe(RUNNING_HEAD_PT)
    expect(head.y).toBe(100)
    expect(head.x + font.widthOfTextAtSize(head.text, RUNNING_HEAD_PT)).toBeCloseTo(RIGHT_EDGE, 5)
  })

  it('never reaches back into the page heading it shares a line with', () => {
    // A wide heading (a multi-page key's "Floss key (1–40 of 47)") plus a long name is the
    // case where the two would collide and both become unreadable.
    const headingRight = RIGHT_EDGE - 40
    const { page, drawn } = recordingPage()
    drawRunningHead(page, font, 'a-really-rather-long-sprite-name', {
      y: 0,
      headingRightPt: headingRight
    })

    for (const head of drawn) {
      expect(head.x).toBeGreaterThan(headingRight)
    }
  })

  it('draws nothing rather than overlap when there is no room at all', () => {
    const { page, drawn } = recordingPage()
    drawRunningHead(page, font, TITLE, { y: 0, headingRightPt: RIGHT_EDGE - 2 })
    expect(drawn).toHaveLength(0)
  })

  it('draws nothing for an empty title', () => {
    const { page, drawn } = recordingPage()
    drawRunningHead(page, font, '', { y: 0, headingRightPt: LEFT })
    expect(drawn).toHaveLength(0)
  })
})
