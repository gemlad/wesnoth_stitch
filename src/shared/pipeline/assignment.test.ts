import { describe, it, expect } from 'vitest'
import {
  ASSIGNMENT_STRATEGIES,
  assignSymbols,
  glyphOrder,
  type AssignmentStrategy
} from './assignment'
import { MAX_COLOUR_COUNT, STITCH_SYMBOLS, symbolsFor } from './symbols'
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

describe('assignSymbols', () => {
  it('distinctness reproduces symbolsFor exactly', () => {
    const palette = paletteOf(20)
    expect(assignSymbols(palette, 'distinctness')).toEqual(symbolsFor(palette))
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
