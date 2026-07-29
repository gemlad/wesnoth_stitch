import { describe, it, expect } from 'vitest'
import { compareDmcCodes, DMC_COLORS, DMC_REFERENCE, nearestDmc, nearestDmcToRgb } from './dmc'
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

describe('compareDmcCodes', () => {
  it('orders numbered codes by value, not as strings', () => {
    // The failure this exists to prevent: a string sort puts 3865 before 422 and 3 before 310.
    expect(['3865', '422', '310', '3'].sort(compareDmcCodes)).toEqual(['3', '310', '422', '3865'])
  })

  it('puts the named codes after every numbered floss, alphabetically', () => {
    expect(['ECRU', '3865', 'BLANC', '310', 'B5200'].sort(compareDmcCodes)).toEqual([
      '310',
      '3865',
      'B5200',
      'BLANC',
      'ECRU'
    ])
  })

  it('sorts the whole real dataset without leaving a code behind', () => {
    // Every code in the chart goes through the comparator — including the three named ones,
    // which is the case a value-only comparator would return NaN for and silently mis-sort.
    const sorted = DMC_COLORS.map((e) => e.code).sort(compareDmcCodes)
    expect(sorted).toHaveLength(DMC_COLORS.length)
    expect(sorted.slice(-3)).toEqual(['B5200', 'BLANC', 'ECRU'])
    const numbers = sorted.filter((c) => /^\d+$/.test(c)).map(Number)
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b))
  })

  it('is a total order: equal codes compare equal', () => {
    expect(compareDmcCodes('310', '310')).toBe(0)
    expect(compareDmcCodes('ECRU', 'ECRU')).toBe(0)
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
