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
  it('caps the slider at 49 — the original 37 plus the #30/D3 provisional additions', () => {
    // Provisional: the print test (#28) may remove blob-collisions and lower this.
    expect(MAX_COLOUR_COUNT).toBe(49)
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

  it('restores 3/4/7 and the widened families (#30/D3), tofu-safety delegated to the font', () => {
    // The original 37 stayed inside near-universal ranges; the provisional additions do
    // not, so "font-safe by range" is retired. Coverage is now guaranteed against the
    // actual bundled DejaVu Sans by font-coverage.test.ts, not asserted here by codepoint.
    for (const g of ['3', '4', '7']) expect(glyphs).toContain(g)
    for (const g of ['♥', '♣', '♦', '♠']) expect(glyphs).toContain(g)
    for (const g of ['†', '‡', '§', '¶']) expect(glyphs).toContain(g)
    expect(glyphs).toContain('▦')
  })

  it('rule 1: carries one orientation per shape family — a rotation is not a new glyph', () => {
    // Only the upward triangle. Down/left/right are the same symbol pointing elsewhere,
    // and the reader has to decode the direction instead of recognising the shape.
    expect(glyphs).toContain('▲')
    expect(glyphs).toContain('△')
    for (const rotated of ['▼', '◀', '▶', '▽', '◁', '▷']) expect(glyphs).not.toContain(rotated)
    // One half-filled circle, so it has no mirror twin to be confused against.
    expect(glyphs.filter((g) => ['◐', '◑', '◒', '◓'].includes(g))).toEqual(['◐'])
  })

  it('rule 2: no two solid glyphs share an ink blob at chart size', () => {
    // A filled star closes up into the same dark lozenge as a filled diamond at 9px,
    // so the star is kept in outline only, where its points actually register.
    expect(glyphs).toContain('◆')
    expect(glyphs).not.toContain('★')
    expect(glyphs).toContain('☆')
  })

  it('excludes glyphs that collide at chart size', () => {
    // Letter X vs the multiplication sign: identical at 5pt, so only × survives.
    expect(glyphs).toContain('×')
    expect(glyphs).not.toContain('X')
    // O and Q against the open circle.
    for (const banned of ['O', 'Q']) expect(glyphs).not.toContain(banned)
    // The colliding digits stay out — each has a letter twin in the set.
    for (const banned of ['0', '1', '2', '5', '6', '8', '9']) expect(glyphs).not.toContain(banned)
    // …but the three without a twin are restored (#30/D3).
    for (const kept of ['3', '4', '7']) expect(glyphs).toContain(kept)
    // Size and weight variants the prototype shipped — indistinguishable printed.
    for (const banned of ['▴', '▪', '✚']) expect(glyphs).not.toContain(banned)
  })

  it('spends its most distinctive glyphs first, so low colour counts read clearly', () => {
    // The first 10 are geometric shapes (solid, outline, half) — silhouette + fill cues.
    for (const g of glyphs.slice(0, 10)) expect(codepoint(g)).toBeGreaterThanOrEqual(0x25a0)
    // Then the strokes, then the original 23 letters.
    expect(glyphs.slice(10, 14)).toEqual(['+', '×', '#', '='])
    expect(glyphs.slice(14, 37).every((g) => /[A-Z]/.test(g))).toBe(true)
    // The #30/D3 provisional block sits after the validated 37, in a fixed order.
    expect(glyphs.slice(37)).toEqual([
      '♥',
      '♣',
      '♦',
      '♠',
      '▦',
      '†',
      '‡',
      '§',
      '¶',
      '3',
      '4',
      '7'
    ])
    // Solid before outline: a filled circle outranks an open one.
    expect(glyphs.indexOf('●')).toBeLessThan(glyphs.indexOf('○'))
    expect(glyphs.indexOf('■')).toBeLessThan(glyphs.indexOf('□'))
    expect(glyphs.indexOf('◆')).toBeLessThan(glyphs.indexOf('◇'))
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

  it('names a full palette at the cap without running out', () => {
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
