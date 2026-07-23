import { describe, it, expect } from 'vitest'
import { MAX_COLOUR_COUNT, STITCH_SYMBOLS, symbolAt } from './symbols'

const glyphs = STITCH_SYMBOLS.map((s) => s.glyph)
const codepoint = (g: string): number => g.codePointAt(0)!

describe('STITCH_SYMBOLS', () => {
  it('caps the slider at 47 — the widened 49 less the two print-test (#28) casualties', () => {
    // The print test settled the set: ◆ (kept ♦ instead) and ▦ were culled from the 49.
    expect(MAX_COLOUR_COUNT).toBe(47)
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
    // The original 37 stayed inside near-universal ranges; the widened glyphs do not, so
    // "font-safe by range" is retired. Coverage is now guaranteed against the actual bundled
    // DejaVu Sans by font-coverage.test.ts, not asserted here by codepoint.
    for (const g of ['3', '4', '7']) expect(glyphs).toContain(g)
    for (const g of ['♥', '♣', '♦', '♠']) expect(glyphs).toContain(g)
    for (const g of ['†', '‡', '§', '¶']) expect(glyphs).toContain(g)
    // The crosshatch square ▦ was culled by the print test (#28) — indistinct from ■ and □.
    expect(glyphs).not.toContain('▦')
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
    // so the star is kept in outline only, where its points actually register. The set's
    // filled diamond is now the card suit ♦; the geometric ◆ was culled in print (#28).
    expect(glyphs).toContain('♦')
    expect(glyphs).not.toContain('◆')
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
    // The #30/D3 widened block sits after the original 37, in a fixed order — less the two
    // print-test casualties (◆, and ▦ which lived in this block). ♦ was promoted to tier 1.
    expect(glyphs.slice(37)).toEqual(['♥', '♣', '♠', '†', '‡', '§', '¶', '3', '4', '7'])
    // Solid before outline: a filled circle outranks an open one.
    expect(glyphs.indexOf('●')).toBeLessThan(glyphs.indexOf('○'))
    expect(glyphs.indexOf('■')).toBeLessThan(glyphs.indexOf('□'))
    // The filled diamond ♦ (tier 1) outranks the open diamond ◇ (tier 2).
    expect(glyphs.indexOf('♦')).toBeLessThan(glyphs.indexOf('◇'))
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

// `symbolsFor` is tested in assignment.test.ts — it belongs to the assignment rule (#30/D1),
// not to the set. This file covers membership and ordering of STITCH_SYMBOLS only.
