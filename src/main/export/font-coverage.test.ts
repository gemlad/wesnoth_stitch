/**
 * The font-coverage guarantee (§5.3, #32).
 *
 * This test exists to catch two failures that are invisible until someone prints a chart:
 * a glyph the bundled font cannot draw (tofu), and a glyph added to the set later that the
 * font has never been checked against. It reads the **actual bundled asset**, so it fails
 * if the font is swapped, truncated, or removed from `resources/`.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { STITCH_SYMBOLS } from '../../shared/pipeline/symbols'
import { formatCodepoint, missingGlyphs } from './font-coverage'

/**
 * Resolved from this file, not from `process.cwd()` — the point is to assert against the
 * asset that ships, wherever vitest happens to be invoked from.
 */
const FONT_PATH = fileURLToPath(new URL('../../../resources/fonts/DejaVuSans.ttf', import.meta.url))
const fontBytes = readFileSync(FONT_PATH)

describe('bundled export font', () => {
  it('can draw every glyph in the stitch-symbol set', () => {
    const missing = missingGlyphs(fontBytes, STITCH_SYMBOLS)

    // Named rather than counted: a bare `toHaveLength(0)` would tell you the font is wrong
    // but not which glyph to blame, and the whole point is to make tofu diagnosable.
    expect(
      missing.map((m) => `${m.glyph} ${m.codepoint} (${m.name})`),
      'these glyphs would print as tofu boxes'
    ).toEqual([])
  })

  it('covers the ranges §5.3 keeps in reserve, so the glyph pool can be reopened (#30 D4)', () => {
    // Not currently in the set — this is the headroom that justified DejaVu over a face
    // that merely covers today's 37. If this ever fails, D4's "reopen the pool" option has
    // quietly died and the font choice needs revisiting, not the test deleting.
    const reserve = [
      { glyph: '✚', name: 'heavy greek cross (dingbat)' },
      { glyph: '✦', name: 'black four-pointed star (dingbat)' },
      { glyph: '┼', name: 'box drawings light vertical and horizontal' }
    ]

    expect(missingGlyphs(fontBytes, reserve)).toEqual([])
  })

  it('rejects a multi-codepoint symbol rather than silently passing it', () => {
    // hasGlyphForCodePoint only ever sees the first codepoint, so an emoji sequence or a
    // combining pair would report as "covered" and then print as something else entirely.
    expect(() => missingGlyphs(fontBytes, [{ glyph: '👍🏽', name: 'not a chart glyph' }])).toThrow(
      /single-codepoint/
    )
  })
})

describe('formatCodepoint', () => {
  it('renders the U+ form you would paste into a font tool', () => {
    expect(formatCodepoint(0x25cf)).toBe('U+25CF')
    expect(formatCodepoint(0x41)).toBe('U+0041')
  })
})
