/**
 * What the cover says about size (#99).
 *
 * The bug these exist to prevent was not a bad calculation — the arithmetic was always right.
 * It was that the cover printed a size it had been *handed*, which a caller could get wrong
 * while everything else on the page went on describing the real pattern. So every assertion
 * here feeds a pattern and checks the sentence describes *that*.
 */
import { describe, expect, it } from 'vitest'
import type { QuantizedPalette, StitchPattern } from '../../shared/pipeline'
import { AIDA_COUNTS, coverStatsLine, finishedInches, finishedSizeLine } from './pdf-cover-text'

/** The dwarvish fighter: a 72×72 sprite whose artwork trims (#53) to 39×31. */
const TRIMMED: StitchPattern = { width: 39, height: 31, cells: [] }

function paletteOf(colourCount: number, pixelsEach: number): QuantizedPalette {
  return {
    colours: Array.from({ length: colourCount }, (_, i) => ({
      rgb: { r: i, g: i, b: i },
      lab: { l: 0, a: 0, b: 0 },
      dmc: { code: String(300 + i), name: `grey ${i}`, hex: '#000000', rgb: { r: i, g: i, b: i } },
      pixelCount: pixelsEach
    })),
    colourCount,
    sourceColourCount: colourCount
  }
}

describe('coverStatsLine', () => {
  it('states the dimensions of the pattern being charted', () => {
    // Not 72×72, which is the sprite the pattern was cut from — the chart is 39×31 and the
    // cover has to agree with it.
    expect(coverStatsLine(TRIMMED, paletteOf(12, 50))).toContain('39 × 31 stitches')
  })

  it('names the colour count and the total stitches to sew', () => {
    const line = coverStatsLine(TRIMMED, paletteOf(12, 50))
    expect(line).toContain('12 DMC floss colours')
    expect(line).toContain('600 stitches to sew') // 12 colours × 50 pixels
  })

  it('counts stitches from the palette, not from the grid', () => {
    // A pattern is mostly fabric: 39×31 is 1,209 cells, but only the opaque ones are stitched.
    // Quoting the cell count would overstate the work by a factor of two on a typical sprite.
    const line = coverStatsLine(TRIMMED, paletteOf(2, 100))
    expect(line).toContain('200 stitches to sew')
    expect(line).not.toContain('1,209')
  })
})

describe('finishedSizeLine', () => {
  it('measures the pattern on the named fabric count', () => {
    // 39 stitches ÷ 14 = 2.8", 31 ÷ 14 = 2.2".
    const line = finishedSizeLine(TRIMMED, 14)
    expect(line).toContain('14-count Aida')
    expect(line).toContain('2.8" × 2.2"')
  })

  it('gives centimetres alongside inches', () => {
    expect(finishedSizeLine(TRIMMED, 14)).toContain('(7.1 × 5.6 cm)')
  })

  it('gets smaller as the fabric gets finer', () => {
    const inchesAt = (count: number): number => finishedInches(TRIMMED.width, count)
    expect(inchesAt(11)).toBeGreaterThan(inchesAt(14))
    expect(inchesAt(14)).toBeGreaterThan(inchesAt(18))
  })

  it('would have overstated a trimmed pattern by the border it no longer has', () => {
    // The regression, stated as a number: charting 39×31 while quoting the 72×72 sprite told
    // you to buy fabric for a piece nearly twice the size in each direction.
    const untrimmed: StitchPattern = { width: 72, height: 72, cells: [] }
    expect(finishedSizeLine(untrimmed, 14)).toContain('5.1" × 5.1"')
    expect(finishedSizeLine(TRIMMED, 14)).not.toContain('5.1"')
  })
})

describe('AIDA_COUNTS', () => {
  it('covers the counts a cross-stitcher actually buys, finest last', () => {
    expect([...AIDA_COUNTS]).toEqual([11, 14, 16, 18])
    expect(AIDA_COUNTS).toContain(14) // the count the cover preview is true-size against (#68)
  })
})
