import { describe, it, expect } from 'vitest'
import {
  ASSIGNMENT_STRATEGIES,
  DEFAULT_ASSIGNMENT_STRATEGY,
  assignSymbols,
  glyphOrder,
  symbolsFor,
  type AssignmentStrategy
} from './assignment'
import { MAX_COLOUR_COUNT, STITCH_SYMBOLS } from './symbols'
import { GLYPHS_BY_INK, inkOf } from './glyph-ink'
import type { QuantizedPalette } from './types'

/**
 * A synthetic palette of `n` colours, dominant-floss-first (pixelCount descending) — which
 * is the order the real pipeline guarantees and every strategy assumes. The colour values
 * are irrelevant here; only the ordering and the count drive assignment.
 */
function paletteOf(n: number): QuantizedPalette {
  return {
    colours: Array.from({ length: n }, (_, i) => ({
      rgb: { r: i, g: i, b: i },
      lab: { l: 0, a: 0, b: 0 },
      dmc: { code: String(300 + i), name: `grey ${i}`, hex: '#000000', rgb: { r: i, g: i, b: i } },
      pixelCount: (n - i) * 10 // descending: colour 0 is the largest area
    })),
    colourCount: n,
    sourceColourCount: n
  }
}

const glyphsOf = (strategy: AssignmentStrategy, n: number): string[] =>
  assignSymbols(paletteOf(n), strategy).map((s) => s.glyph)

describe('the app-wide rule (symbolsFor)', () => {
  it('is interleaved — Gemma’s #30/D1 decision', () => {
    // The one constant that re-charts the whole app. If this changes, it is a design
    // decision being made, not an implementation detail drifting.
    expect(DEFAULT_ASSIGNMENT_STRATEGY).toBe('interleaved')
  })

  it('routes through the chosen strategy, so chart and floss key cannot disagree', () => {
    const palette = paletteOf(20)
    expect(symbolsFor(palette)).toEqual(assignSymbols(palette, DEFAULT_ASSIGNMENT_STRATEGY))
  })

  it('gives one distinct symbol per colour, and still leads with a bold anchor', () => {
    const palette = paletteOf(12)
    const symbols = symbolsFor(palette)
    expect(symbols).toHaveLength(12)
    expect(new Set(symbols.map((s) => s.glyph)).size).toBe(12)
    // Interleaved keeps the dominant floss on the most distinctive glyph — that is the
    // whole reason it was preferred over inverse-density.
    expect(symbols[0].glyph).toBe('●')
    // …but the second-largest area drops straight to the faintest glyph in the set.
    expect(symbols[1].glyph).toBe(GLYPHS_BY_INK[0])
  })

  it('names a full palette at the cap without running out', () => {
    const symbols = symbolsFor(paletteOf(MAX_COLOUR_COUNT))
    expect(symbols).toHaveLength(MAX_COLOUR_COUNT)
    expect(new Set(symbols.map((s) => s.glyph)).size).toBe(MAX_COLOUR_COUNT)
  })

  it('refuses a palette larger than the symbol set — the ceiling is hard', () => {
    expect(() => symbolsFor(paletteOf(MAX_COLOUR_COUNT + 1))).toThrow(RangeError)
  })

  it('handles an empty palette', () => {
    expect(symbolsFor({ colours: [], colourCount: 0, sourceColourCount: 0 })).toEqual([])
  })
})

describe('assignSymbols', () => {
  it('distinctness hands out the set in authored order', () => {
    const palette = paletteOf(20)
    const glyphs = assignSymbols(palette, 'distinctness').map((s) => s.glyph)
    expect(glyphs).toEqual(STITCH_SYMBOLS.slice(0, 20).map((s) => s.glyph))
  })

  for (const strategy of ASSIGNMENT_STRATEGIES) {
    it(`${strategy}: one distinct symbol per colour, index-aligned`, () => {
      const palette = paletteOf(30)
      const symbols = assignSymbols(palette, strategy)
      expect(symbols).toHaveLength(30)
      expect(new Set(symbols.map((s) => s.glyph)).size).toBe(30)
      // Every symbol is a real member of the set.
      const known = new Set(STITCH_SYMBOLS.map((s) => s.glyph))
      for (const s of symbols) expect(known.has(s.glyph)).toBe(true)
    })
  }

  it('inverse-density gives the largest area the faintest glyph', () => {
    const glyphs = glyphsOf('inverse-density', MAX_COLOUR_COUNT)
    // Dominant colour (index 0) gets the lightest glyph in the whole set…
    expect(glyphs[0]).toBe(GLYPHS_BY_INK[0])
    // …and ink rises monotonically down the palette, so detail (small areas) gets the solids.
    for (let i = 1; i < glyphs.length; i++) {
      expect(inkOf(glyphs[i])).toBeGreaterThanOrEqual(inkOf(glyphs[i - 1]))
    }
    // The heaviest glyph lands on the *smallest* area — the opposite of the status quo.
    expect(inkOf(glyphs[glyphs.length - 1])).toBeGreaterThan(inkOf(glyphs[0]))
  })

  it('inverse-density spends much less ink on the dominant colour than distinctness', () => {
    // The whole point, stated as a number: on the biggest area, the faint glyph inks far
    // less than the bold one the status quo would put there.
    const inv = glyphsOf('inverse-density', 10)
    const dist = glyphsOf('distinctness', 10)
    expect(inkOf(inv[0])).toBeLessThan(inkOf(dist[0]))
  })

  it('interleaved leads with the most distinct glyph, then the least dense', () => {
    const glyphs = glyphsOf('interleaved', MAX_COLOUR_COUNT)
    // Gemma's ordering: most distinct (the head of the distinctness list), then least dense.
    expect(glyphs[0]).toBe(STITCH_SYMBOLS[0].glyph) // ●
    expect(glyphs[1]).toBe(GLYPHS_BY_INK[0]) // the lightest glyph
    // A genuine compromise: the hero colour keeps a bold anchor the pure inverse rule drops.
    expect(inkOf(glyphs[0])).toBeGreaterThan(inkOf(glyphsOf('inverse-density', 2)[0]))
  })

  it('refuses a palette larger than the symbol set, whatever the strategy', () => {
    for (const strategy of ASSIGNMENT_STRATEGIES) {
      expect(() => assignSymbols(paletteOf(MAX_COLOUR_COUNT + 1), strategy)).toThrow(RangeError)
    }
  })

  it('handles an empty palette', () => {
    for (const strategy of ASSIGNMENT_STRATEGIES) {
      expect(assignSymbols(paletteOf(0), strategy)).toEqual([])
    }
  })
})

describe('glyphOrder', () => {
  for (const strategy of ASSIGNMENT_STRATEGIES) {
    it(`${strategy} is a permutation of the whole set`, () => {
      const order = glyphOrder(strategy)
      expect(order).toHaveLength(MAX_COLOUR_COUNT)
      expect(new Set(order)).toEqual(new Set(STITCH_SYMBOLS.map((s) => s.glyph)))
    })
  }
})
