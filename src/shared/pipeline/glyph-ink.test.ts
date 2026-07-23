import { describe, it, expect } from 'vitest'
import { STITCH_SYMBOLS } from './symbols'
import { GLYPH_INK, GLYPHS_BY_INK, inkOf } from './glyph-ink'

describe('GLYPH_INK', () => {
  it('has a measured value for every glyph in the set, and no strays', () => {
    // Lockstep with STITCH_SYMBOLS: a glyph added to the set without re-measuring, or a
    // measurement left behind after a glyph is removed, is a bug the assignment code would
    // trip over. This is what pins that.
    const setGlyphs = new Set(STITCH_SYMBOLS.map((s) => s.glyph))
    const inkGlyphs = new Set(Object.keys(GLYPH_INK))
    expect(inkGlyphs).toEqual(setGlyphs)
  })

  it('reads every value as a fraction of a cell in (0, 1)', () => {
    for (const [g, v] of Object.entries(GLYPH_INK)) {
      expect(v, `${g}`).toBeGreaterThan(0)
      expect(v, `${g}`).toBeLessThan(1)
    }
  })

  it('ranks the solids heaviest and the outlines/strokes lightest', () => {
    // The measurement must agree with the eye, or the inverse-density rule optimises for
    // noise. Filled square/circle are the darkest; a thin plus and an open star the lightest.
    expect(inkOf('■')).toBeGreaterThan(inkOf('□'))
    expect(inkOf('●')).toBeGreaterThan(inkOf('○'))
    expect(inkOf('♦')).toBeGreaterThan(inkOf('◇'))
    expect(inkOf('■')).toBeGreaterThan(0.25)
    expect(inkOf('+')).toBeLessThan(0.07)
    expect(inkOf('☆')).toBeLessThan(0.07)
  })

  it('captures the #30 defect: the distinctness-first glyphs are among the inkiest', () => {
    // STITCH_SYMBOLS opens with ● ■ ▲ ♦ — the point of the whole spike is that these, the
    // most distinctive glyphs, are also nearly the darkest, so dominant-first assignment
    // piles ink onto the biggest areas.
    const lightest = GLYPHS_BY_INK.slice(0, 8)
    expect(lightest).not.toContain('■')
    expect(lightest).not.toContain('●')
  })

  it('orders GLYPHS_BY_INK lightest first, covering the whole set once', () => {
    for (let i = 1; i < GLYPHS_BY_INK.length; i++) {
      expect(inkOf(GLYPHS_BY_INK[i])).toBeGreaterThanOrEqual(inkOf(GLYPHS_BY_INK[i - 1]))
    }
    expect(new Set(GLYPHS_BY_INK)).toEqual(new Set(STITCH_SYMBOLS.map((s) => s.glyph)))
  })

  it('throws for a glyph it has never measured', () => {
    expect(() => inkOf('Q')).toThrow()
  })
})
