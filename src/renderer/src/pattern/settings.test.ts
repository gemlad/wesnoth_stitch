import { describe, expect, it } from 'vitest'
import { cssToRgb, DEFAULT_PATTERN_SETTINGS, isDefaultBackground, rgbToCss } from './settings'

describe('rgbToCss', () => {
  it('pads each channel to two hex digits', () => {
    expect(rgbToCss({ r: 0, g: 5, b: 255 })).toBe('#0005ff')
  })

  it('clamps and rounds out-of-range channels rather than emitting bad hex', () => {
    expect(rgbToCss({ r: -10, g: 127.6, b: 300 })).toBe('#0080ff')
  })

  it('renders the default fabric colour', () => {
    expect(rgbToCss(DEFAULT_PATTERN_SETTINGS.backgroundColour)).toBe('#f2ecdc')
  })
})

describe('cssToRgb', () => {
  it('parses the form <input type="color"> produces', () => {
    expect(cssToRgb('#0080ff')).toEqual({ r: 0, g: 128, b: 255 })
  })

  it('round-trips with rgbToCss', () => {
    const rgb = { r: 0x12, g: 0x34, b: 0x56 }
    expect(cssToRgb(rgbToCss(rgb))).toEqual(rgb)
  })
})

describe('isDefaultBackground', () => {
  it('is true for the default fabric colour', () => {
    expect(isDefaultBackground(DEFAULT_PATTERN_SETTINGS.backgroundColour)).toBe(true)
  })

  it('is true for a value that round-tripped through the colour input', () => {
    expect(isDefaultBackground(cssToRgb(rgbToCss(DEFAULT_PATTERN_SETTINGS.backgroundColour)))).toBe(
      true
    )
  })

  it('is false once any channel differs', () => {
    const { r, g, b } = DEFAULT_PATTERN_SETTINGS.backgroundColour
    expect(isDefaultBackground({ r, g, b: b - 1 })).toBe(false)
  })

  it('is false for white — the fabric the default deliberately is not', () => {
    expect(isDefaultBackground({ r: 255, g: 255, b: 255 })).toBe(false)
  })
})
