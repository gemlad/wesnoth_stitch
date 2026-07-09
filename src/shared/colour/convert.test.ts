import { describe, it, expect } from 'vitest'
import { srgbToLab, labDistance } from './convert'

describe('srgbToLab', () => {
  it('maps pure white to L≈100 with no chroma', () => {
    const lab = srgbToLab({ r: 255, g: 255, b: 255 })
    expect(lab.l).toBeCloseTo(100, 3)
    expect(lab.a).toBeCloseTo(0, 3)
    expect(lab.b).toBeCloseTo(0, 3)
  })

  it('maps pure black to L≈0', () => {
    const lab = srgbToLab({ r: 0, g: 0, b: 0 })
    expect(lab.l).toBeCloseTo(0, 3)
    expect(lab.a).toBeCloseTo(0, 3)
    expect(lab.b).toBeCloseTo(0, 3)
  })

  it('maps sRGB red to the known CIELAB value (positive a and b)', () => {
    // Reference CIELAB (D65) for #FF0000 is ~ (53.24, 80.09, 67.20).
    const lab = srgbToLab({ r: 255, g: 0, b: 0 })
    expect(lab.l).toBeCloseTo(53.24, 1)
    expect(lab.a).toBeCloseTo(80.09, 1)
    expect(lab.b).toBeCloseTo(67.2, 1)
  })
})

describe('labDistance', () => {
  it('is zero for identical colours', () => {
    const c = srgbToLab({ r: 123, g: 45, b: 67 })
    expect(labDistance(c, c)).toBe(0)
  })

  it('equals the lightness gap for black vs white (ΔE = 100)', () => {
    const black = srgbToLab({ r: 0, g: 0, b: 0 })
    const white = srgbToLab({ r: 255, g: 255, b: 255 })
    expect(labDistance(black, white)).toBeCloseTo(100, 2)
  })

  it('is symmetric', () => {
    const a = srgbToLab({ r: 10, g: 200, b: 90 })
    const b = srgbToLab({ r: 200, g: 30, b: 150 })
    expect(labDistance(a, b)).toBeCloseTo(labDistance(b, a), 10)
  })

  it('ranks a near shade closer than a far one', () => {
    const green = srgbToLab({ r: 0, g: 128, b: 0 })
    const nearGreen = srgbToLab({ r: 10, g: 135, b: 5 })
    const red = srgbToLab({ r: 200, g: 0, b: 0 })
    expect(labDistance(green, nearGreen)).toBeLessThan(labDistance(green, red))
  })
})
