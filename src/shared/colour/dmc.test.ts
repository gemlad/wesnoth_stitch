import { describe, it, expect } from 'vitest'
import { DMC_COLORS, DMC_REFERENCE, nearestDmc, nearestDmcToRgb } from './dmc'
import { srgbToLab } from './convert'

describe('DMC dataset', () => {
  it('loads the full chart', () => {
    expect(DMC_COLORS.length).toBe(392)
  })

  it('has well-formed entries (code, name, #RRGGBB hex, matching rgb)', () => {
    for (const e of DMC_COLORS) {
      expect(e.code).toBeTruthy()
      expect(e.name).toBeTruthy()
      expect(e.hex).toMatch(/^#[0-9A-F]{6}$/)
      const r = parseInt(e.hex.slice(1, 3), 16)
      const g = parseInt(e.hex.slice(3, 5), 16)
      const b = parseInt(e.hex.slice(5, 7), 16)
      expect(e.rgb).toEqual({ r, g, b })
    }
  })

  it('has unique codes', () => {
    const codes = new Set(DMC_COLORS.map((e) => e.code))
    expect(codes.size).toBe(DMC_COLORS.length)
  })

  it('precomputes a Lab reference for every floss colour', () => {
    expect(DMC_REFERENCE.length).toBe(DMC_COLORS.length)
    expect(DMC_REFERENCE[0].lab).toEqual(srgbToLab(DMC_COLORS[0].rgb))
  })
})

describe('nearestDmc', () => {
  it('returns a floss colour exactly for an exact chart colour', () => {
    // "310" Black is #000000 in the chart; pure black must resolve to it.
    const black = DMC_COLORS.find((e) => e.code === '310')!
    expect(black.hex).toBe('#000000')
    expect(nearestDmcToRgb({ r: 0, g: 0, b: 0 }).code).toBe('310')
  })

  it('accepts a Lab colour directly (matches the rgb convenience wrapper)', () => {
    const lab = srgbToLab({ r: 0, g: 0, b: 0 })
    expect(nearestDmc(lab).code).toBe('310')
  })

  it('snaps a near-white to a white/off-white floss', () => {
    const match = nearestDmcToRgb({ r: 254, g: 254, b: 250 })
    expect(['White', 'Snow White', 'Ecru']).toContain(match.name)
  })

  it('maps a saturated red to a red-family floss (positive a)', () => {
    const match = nearestDmcToRgb({ r: 220, g: 20, b: 30 })
    const lab = srgbToLab(match.rgb)
    expect(lab.a).toBeGreaterThan(40) // clearly in the red half of the a-axis
  })

  it('agrees with a brute-force nearest scan on random colours', () => {
    const brute = (rgb: { r: number; g: number; b: number }): string => {
      const lab = srgbToLab(rgb)
      let best = DMC_REFERENCE[0]
      let bestD = Infinity
      for (const ref of DMC_REFERENCE) {
        const d = (lab.l - ref.lab.l) ** 2 + (lab.a - ref.lab.a) ** 2 + (lab.b - ref.lab.b) ** 2
        if (d < bestD) {
          bestD = d
          best = ref
        }
      }
      return best.entry.code
    }
    for (let i = 0; i < 25; i++) {
      const rgb = {
        r: Math.floor(Math.random() * 256),
        g: Math.floor(Math.random() * 256),
        b: Math.floor(Math.random() * 256)
      }
      expect(nearestDmcToRgb(rgb).code).toBe(brute(rgb))
    }
  })
})
