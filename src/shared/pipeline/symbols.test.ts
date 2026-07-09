import { describe, it, expect } from 'vitest'
import { MAX_COLOUR_COUNT, STITCH_SYMBOLS, symbolAt, symbolsFor } from './symbols'
import { mapSpriteToDmc } from './map-to-dmc'
import { reduceSprite } from './reduce-over-dmc'
import { DMC_COLORS } from '../colour'
import type { DecodedImage } from '../ipc'
import type { QuantizedPalette } from './types'

const glyphs = STITCH_SYMBOLS.map((s) => s.glyph)
const codepoint = (g: string): number => g.codePointAt(0)!

/** Build a 1-row opaque sprite from a list of RGB triples. */
function imageOf(colours: readonly { r: number; g: number; b: number }[]): DecodedImage {
  const data = new Uint8Array(colours.length * 4)
  colours.forEach(({ r, g, b }, i) => {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  })
  return { width: colours.length, height: 1, data }
}

describe('STITCH_SYMBOLS', () => {
  it('caps the slider at 40 — the colour cap §5.2 proposes, so neither ceiling binds first', () => {
    expect(MAX_COLOUR_COUNT).toBe(40)
    expect(STITCH_SYMBOLS.length).toBe(MAX_COLOUR_COUNT)
  })

  it('holds no duplicate glyphs — a repeat would make a B&W chart ambiguous', () => {
    expect(new Set(glyphs).size).toBe(glyphs.length)
  })

  it('names every glyph, with no duplicate names', () => {
    const names = STITCH_SYMBOLS.map((s) => s.name)
    expect(names.every((n) => n.length > 0)).toBe(true)
    expect(new Set(names).size).toBe(names.length)
  })

  it('uses only single-code-point BMP glyphs, so one cell renders one character', () => {
    for (const g of glyphs) {
      expect([...g].length).toBe(1) // one code point
      expect(g.length).toBe(1) // …and one UTF-16 unit: no surrogate pairs
    }
  })

  it('stays inside font-safe Unicode ranges, so no glyph falls back to tofu', () => {
    // Basic Latin, the Latin-1 multiplication sign, Geometric Shapes, and the two stars.
    const safe = (c: number): boolean =>
      (c >= 0x20 && c <= 0x7e) ||
      c === 0x00d7 ||
      (c >= 0x25a0 && c <= 0x25ff) ||
      c === 0x2605 ||
      c === 0x2606
    for (const g of glyphs) {
      expect(
        safe(codepoint(g)),
        `${g} (U+${codepoint(g).toString(16)}) outside font-safe ranges`
      ).toBe(true)
    }
  })

  it('excludes glyphs that collide at chart size', () => {
    // Letter X vs the multiplication sign: identical at 5pt, so only × survives.
    expect(glyphs).toContain('×')
    expect(glyphs).not.toContain('X')
    // O/Q against the open circle, I against digit one.
    for (const banned of ['O', 'Q', 'I']) expect(glyphs).not.toContain(banned)
    // Size, weight, and mirror variants the prototype shipped — indistinguishable printed.
    for (const banned of ['▴', '▪', '✚', '◐', '◑']) expect(glyphs).not.toContain(banned)
  })

  it('spends its most distinctive glyphs first, so low colour counts read clearly', () => {
    // The first 16 are geometric shapes (solid, then outline) — silhouette + fill cues.
    for (const g of glyphs.slice(0, 16)) expect(codepoint(g)).toBeGreaterThanOrEqual(0x25a0)
    // Then the two strokes, then letters all the way out.
    expect(glyphs.slice(16, 18)).toEqual(['+', '×'])
    expect(glyphs.slice(18).every((g) => /[A-Z]/.test(g))).toBe(true)
    // Solid before outline: a filled circle outranks an open one.
    expect(glyphs.indexOf('●')).toBeLessThan(glyphs.indexOf('○'))
    expect(glyphs.indexOf('■')).toBeLessThan(glyphs.indexOf('□'))
  })
})

describe('symbolAt', () => {
  it('returns the glyph at a palette index', () => {
    expect(symbolAt(0).glyph).toBe('●')
    expect(symbolAt(MAX_COLOUR_COUNT - 1)).toBe(STITCH_SYMBOLS[MAX_COLOUR_COUNT - 1])
  })

  it('throws rather than silently reusing a glyph past the end', () => {
    // The prototype wrapped with `i % len`, which quietly aliases two colours.
    expect(() => symbolAt(MAX_COLOUR_COUNT)).toThrow(RangeError)
    expect(() => symbolAt(-1)).toThrow(RangeError)
    expect(() => symbolAt(1.5)).toThrow(RangeError)
  })
})

describe('symbolsFor', () => {
  const paletteOf = (n: number): QuantizedPalette =>
    reduceSprite(
      mapSpriteToDmc(imageOf(DMC_COLORS.filter((_, i) => i % 6 === 0).map((c) => c.rgb))),
      n
    ).palette

  it('gives one distinct symbol per colour, aligned with the palette order', () => {
    const palette = paletteOf(12)
    const symbols = symbolsFor(palette)
    expect(symbols.length).toBe(palette.colours.length)
    expect(new Set(symbols.map((s) => s.glyph)).size).toBe(12)
    // Index-aligned: the dominant floss takes the first, most distinctive glyph.
    expect(symbols[0].glyph).toBe('●')
    expect(symbols).toEqual(palette.colours.map((_, i) => symbolAt(i)))
  })

  it('names a full 40-colour palette without running out', () => {
    const symbols = symbolsFor(paletteOf(MAX_COLOUR_COUNT))
    expect(symbols.length).toBe(MAX_COLOUR_COUNT)
    expect(new Set(symbols.map((s) => s.glyph)).size).toBe(MAX_COLOUR_COUNT)
  })

  it('refuses a palette larger than the symbol set — the ceiling is hard', () => {
    const oversized = paletteOf(MAX_COLOUR_COUNT + 1)
    expect(oversized.colours.length).toBe(MAX_COLOUR_COUNT + 1) // the fixture really is over
    expect(() => symbolsFor(oversized)).toThrow(RangeError)
  })

  it('handles an empty palette', () => {
    expect(symbolsFor({ colours: [], colourCount: 0, sourceColourCount: 0 })).toEqual([])
  })
})
