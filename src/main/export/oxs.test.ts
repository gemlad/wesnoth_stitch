/**
 * OXS export (#94, §5.5).
 *
 * The failure to guard against here is not "the file looks wrong" — nobody reads an OXS file
 * by eye — it is "another program opens it and stitches the wrong thing": stitches off by one
 * cell, a palette index pointing at the neighbouring floss because the cloth took slot 0, or a
 * chart that faces the other way from its own preview. So these tests parse the elements back
 * out and assert on coordinates and indices, rather than matching the document as a string.
 */
import { describe, expect, it } from 'vitest'
import type { RGB } from '../../shared/colour'
import { symbolsFor, type QuantizedPalette, type StitchPattern } from '../../shared/pipeline'
import { buildChartOxs } from './oxs'

const BLACK: RGB = { r: 0x00, g: 0x00, b: 0x00 }
const RED: RGB = { r: 0xff, g: 0x00, b: 0x00 }
const AIDA: RGB = { r: 0xf2, g: 0xec, b: 0xdc }

const FLOSS = [
  { code: '310', name: 'Black', rgb: BLACK },
  { code: '666', name: 'Bright Red', rgb: RED }
]

/** A palette of the first `n` entries of {@link FLOSS}. */
function paletteOf(n: number): QuantizedPalette {
  return {
    colours: FLOSS.slice(0, n).map(({ code, name, rgb }) => ({
      rgb,
      lab: { l: 0, a: 0, b: 0 },
      dmc: { code, name, hex: '#000000', rgb },
      pixelCount: 1
    })),
    colourCount: n,
    sourceColourCount: n
  }
}

function patternOf(cells: (number | null)[][]): StitchPattern {
  return { width: cells[0].length, height: cells.length, cells }
}

/** Every `<tag ... />` in the document, as attribute maps in document order. */
function elements(xml: string, tag: string): Record<string, string>[] {
  const matches = xml.matchAll(new RegExp(`<${tag}\\s([^>]*?)/>`, 'g'))
  return [...matches].map(([, body]) => {
    const attributes: Record<string, string> = {}
    for (const [, name, value] of body.matchAll(/([a-z_0-9]+)="([^"]*)"/g)) {
      attributes[name] = value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
    }
    return attributes
  })
}

/** Each stitch as `x,y,palindex`, which is the whole of what a reader will act on. */
function stitches(xml: string): string[] {
  return elements(xml, 'stitch').map((s) => `${s.x},${s.y},${s.palindex}`)
}

const meta = { title: 'fighter', softwareVersion: '1.1.0' }
const options = { backgroundColour: AIDA, flip: false }

describe('buildChartOxs', () => {
  it('is a UTF-8 XML document rooted at <chart>', () => {
    const xml = buildChartOxs(patternOf([[0]]), paletteOf(1), meta, options)

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<chart>')).toBe(true)
    expect(xml.trimEnd().endsWith('</chart>')).toBe(true)
  })

  it('states the chart size, title and software in properties', () => {
    const xml = buildChartOxs(
      patternOf([
        [0, null, 1],
        [1, 1, null]
      ]),
      paletteOf(2),
      meta,
      options
    )
    const [properties] = elements(xml, 'properties')

    expect(properties).toMatchObject({
      chartwidth: '3',
      chartheight: '2',
      charttitle: 'fighter',
      software: 'Wesnoth Stitch',
      software_version: '1.1.0'
    })
  })

  it('leaves software_version out when the caller has no version to give', () => {
    const xml = buildChartOxs(patternOf([[0]]), paletteOf(1), { title: 'fighter' }, options)
    const [properties] = elements(xml, 'properties')

    expect(properties.software_version).toBeUndefined()
    expect(properties.software).toBe('Wesnoth Stitch')
  })

  it('counts the floss in palettecount, excluding the cloth at index 0', () => {
    const xml = buildChartOxs(patternOf([[0, 1]]), paletteOf(2), meta, options)
    const [properties] = elements(xml, 'properties')

    expect(properties.palettecount).toBe('2')
    expect(elements(xml, 'palette_item')).toHaveLength(3)
  })

  it('credits the Wesnoth artwork licence, as every printed page does (#47)', () => {
    const xml = buildChartOxs(patternOf([[0]]), paletteOf(1), meta, options)
    const [properties] = elements(xml, 'properties')

    expect(properties.copyright).toContain('CC-BY-SA 4.0')
    expect(properties.copyright).toContain('https://wiki.wesnoth.org/Wesnoth:Copyrights')
  })

  it('puts the fabric colour in palette item 0, the cloth', () => {
    const xml = buildChartOxs(patternOf([[0]]), paletteOf(1), meta, options)
    const [cloth] = elements(xml, 'palette_item')

    expect(cloth).toMatchObject({ index: '0', number: 'cloth', name: 'cloth', color: 'F2ECDC' })
  })

  it('lists each floss with its DMC code, colour and chart glyph', () => {
    const xml = buildChartOxs(patternOf([[0, 1]]), paletteOf(2), meta, options)
    const palette = paletteOf(2)
    const [, first, second] = elements(xml, 'palette_item')
    const symbols = symbolsFor(palette)

    expect(first).toMatchObject({
      index: '1',
      number: '310',
      name: 'DMC 310 Black',
      color: '000000',
      printcolor: '000000',
      symbol: symbols[0].glyph
    })
    expect(second).toMatchObject({
      index: '2',
      number: '666',
      name: 'DMC 666 Bright Red',
      color: 'FF0000',
      symbol: symbols[1].glyph
    })
    // The glyphs are what tell two colours apart on the chart; sharing one is the bug.
    expect(first.symbol).not.toBe(second.symbol)
  })

  it('writes one stitch per cell, 1-based, with the cloth-shifted palette index', () => {
    const xml = buildChartOxs(
      patternOf([
        [0, 1],
        [1, 0]
      ]),
      paletteOf(2),
      meta,
      options
    )

    // Row-major from the top-left cell, which is (1, 1) — not (0, 0).
    expect(stitches(xml)).toEqual(['1,1,1', '2,1,2', '1,2,2', '2,2,1'])
  })

  it('leaves no-stitch cells out entirely, so the cloth shows through', () => {
    const xml = buildChartOxs(
      patternOf([
        [null, 0],
        [null, null]
      ]),
      paletteOf(1),
      meta,
      options
    )

    expect(stitches(xml)).toEqual(['2,1,1'])
  })

  it('mirrors the stitches when the flip is on (#56)', () => {
    const pattern = patternOf([[0, null, 1]])
    const flipped = buildChartOxs(pattern, paletteOf(2), meta, { ...options, flip: true })

    // The palette is untouched by a mirror — only where the stitches sit changes.
    expect(stitches(flipped)).toEqual(['1,1,2', '3,1,1'])
    expect(elements(flipped, 'properties')[0].chartwidth).toBe('3')
  })

  it('writes the mandatory containers even when they are empty', () => {
    const xml = buildChartOxs(patternOf([[null]]), paletteOf(1), meta, options)

    // A sprite is whole cross stitches only: no part stitches, backstitch, knots or beads.
    expect(xml).toContain('<fullstitches>')
    expect(xml).toContain('</fullstitches>')
    expect(xml).toContain('<partstitches />')
    expect(xml).toContain('<backstitches />')
    expect(xml).toContain('<ornaments_inc_knots_and_beads />')
    expect(stitches(xml)).toEqual([])
  })

  it('escapes a title that would otherwise break the XML', () => {
    const xml = buildChartOxs(patternOf([[0]]), paletteOf(1), { title: 'a&b "c" <d>' }, options)

    expect(xml).toContain('charttitle="a&amp;b &quot;c&quot; &lt;d&gt;"')
    expect(elements(xml, 'properties')[0].charttitle).toBe('a&b "c" <d>')
  })

  it('refuses a cell that indexes a colour the palette does not have', () => {
    // A chart pointing at floss nobody listed would import as a plausible-looking pattern.
    expect(() => buildChartOxs(patternOf([[0, 2]]), paletteOf(2), meta, options)).toThrow(
      RangeError
    )
  })

  it('records the fabric count, defaulting to 14-count Aida', () => {
    const xml = buildChartOxs(patternOf([[0]]), paletteOf(1), meta, options)
    const [properties] = elements(xml, 'properties')

    expect(properties).toMatchObject({ stitchesperinch: '14', stitchesperinch_y: '14' })

    const on18 = buildChartOxs(patternOf([[0]]), paletteOf(1), meta, {
      ...options,
      stitchesPerInch: 18
    })
    expect(elements(on18, 'properties')[0].stitchesperinch).toBe('18')
  })
})
