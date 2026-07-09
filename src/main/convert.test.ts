import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resolve } from 'node:path'
import { MAX_COLOUR_COUNT } from '../shared/pipeline'

// Count real decodes so the plan cache can be proven to skip work, not merely to
// return the same answer twice.
const decodes = vi.fn<(p: string) => void>()
vi.mock('./images', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./images')>()
  return {
    ...actual,
    decodeImage: (p: string) => {
      decodes(p)
      return actual.decodeImage(p)
    }
  }
})

const { convertSprite, defaultColourCount, clearPlanCache, PLAN_CACHE_MAX } =
  await import('./convert')

const ROOT = resolve(__dirname, '../../')
const sprite = (rel: string): string => resolve(ROOT, rel)

/** A 72×72 dwarvish scout: 31 distinct floss, comfortably under the ceiling. */
const SCOUT = sprite('prototype/wesnoth_cache/data/core/images/units/dwarves/scout-melee-4.png')
/** 94 distinct floss — the census outlier, above the symbol ceiling. */
const MERFOLK = sprite('wesnoth-sprites/units/merfolk/citizen.png')
/** 13 distinct floss. */
const BAT = sprite('wesnoth-sprites/units/bats/bat-ne-1.png')

beforeEach(() => {
  clearPlanCache()
  decodes.mockClear()
})

describe('convertSprite', () => {
  it('runs the whole pipeline: floss palette, 1:1 grid, one symbol per colour', async () => {
    const out = await convertSprite('scout', SCOUT, 12)

    expect(out.palette.colourCount).toBe(12)
    expect(out.palette.colours).toHaveLength(12)
    expect(out.symbols).toHaveLength(12)
    expect(new Set(out.symbols.map((s) => s.glyph)).size).toBe(12)
    // Symbols are index-aligned with the palette, dominant floss first.
    expect(out.symbols[0].glyph).toBe('●')
    // Every colour is real floss; the grid is 1:1 with the sprite.
    expect(out.palette.colours.every((c) => c.dmc.code.length > 0)).toBe(true)
    expect(out.pattern.width).toBe(72)
    expect(out.pattern.height).toBe(72)
    expect(out.pattern.cells).toHaveLength(72)
    expect(out.maxColourCount).toBe(MAX_COLOUR_COUNT)
  })

  it('defaults to the sprite’s own distinct-DMC count (Req. 6)', async () => {
    const out = await convertSprite('scout', SCOUT)
    expect(out.palette.sourceColourCount).toBe(31)
    expect(out.palette.colourCount).toBe(31) // under the ceiling, so no reduction
  })

  it('caps the default at the symbol ceiling for a sprite that exceeds it', async () => {
    const out = await convertSprite('merfolk', MERFOLK)
    // 95, where the pre-#20 census said 94: compositing the drop shadow over white (§5.2)
    // lifts its flat black off DMC 310 — where it used to collapse onto the sprite's own
    // black pixels — and onto a grey of its own.
    expect(out.palette.sourceColourCount).toBe(95) // the census outlier
    expect(out.palette.colourCount).toBe(MAX_COLOUR_COUNT) // capped, so it reduced
    expect(out.symbols).toHaveLength(MAX_COLOUR_COUNT)
    expect(defaultColourCount(95)).toBe(MAX_COLOUR_COUNT)
  })

  it('treats a colour count above the sprite’s own as a no-op, not an error', async () => {
    // Keeps the slider well-behaved at its top end.
    const out = await convertSprite('bat', BAT, MAX_COLOUR_COUNT)
    expect(out.palette.sourceColourCount).toBe(13)
    expect(out.palette.colourCount).toBe(13)
    expect(out.symbols).toHaveLength(13)
  })

  it('rejects a colour count outside 1..maxColourCount', async () => {
    for (const bad of [0, -1, 1.5, MAX_COLOUR_COUNT + 1, NaN]) {
      await expect(convertSprite('scout', SCOUT, bad)).rejects.toThrow(RangeError)
    }
  })

  it('conserves stitches and transparency at every colour count', async () => {
    const full = await convertSprite('scout', SCOUT)
    const stitches = full.palette.colours.reduce((n, c) => n + c.pixelCount, 0)

    for (const k of [1, 2, 8, 20, 31]) {
      const out = await convertSprite('scout', SCOUT, k)
      expect(out.palette.colours.reduce((n, c) => n + c.pixelCount, 0)).toBe(stitches)
      // Nulls stay exactly where the full-fidelity pattern had them; indices stay in range.
      for (let y = 0; y < out.pattern.height; y++) {
        for (let x = 0; x < out.pattern.width; x++) {
          const cell = out.pattern.cells[y][x]
          expect(cell === null).toBe(full.pattern.cells[y][x] === null)
          if (cell !== null) expect(cell).toBeLessThan(out.palette.colourCount)
        }
      }
    }
  })
})

describe('the plan cache (what makes the slider affordable)', () => {
  it('decodes and maps a sprite once, however many colour counts are asked for', async () => {
    // Simulates a slider drag: 20 calls, one sprite. mapToDmc costs ~40ms on the worst
    // sprite and is independent of k, so re-running it per frame would be unusable.
    for (let k = 20; k >= 1; k--) await convertSprite('scout', SCOUT, k)
    expect(decodes).toHaveBeenCalledTimes(1)
  })

  it('serves a cache hit identically to a cold build', async () => {
    const cold = await convertSprite('scout', SCOUT, 9)
    clearPlanCache()
    decodes.mockClear()
    const rebuilt = await convertSprite('scout', SCOUT, 9)
    expect(decodes).toHaveBeenCalledTimes(1) // really was cold again
    expect(rebuilt).toEqual(cold)
  })

  it('keys on sprite id, so a different sprite is decoded separately', async () => {
    await convertSprite('scout', SCOUT)
    await convertSprite('bat', BAT)
    await convertSprite('scout', SCOUT, 5)
    expect(decodes).toHaveBeenCalledTimes(2)
  })

  it('evicts least-recently-used once full, and keeps the hot sprite warm', async () => {
    // Fill the cache, touching 'hot' first.
    await convertSprite('hot', SCOUT)
    for (let i = 1; i < PLAN_CACHE_MAX; i++) await convertSprite(`filler-${i}`, BAT)
    expect(decodes).toHaveBeenCalledTimes(PLAN_CACHE_MAX)

    // Re-touch 'hot' so it is most-recently-used, then overflow by one.
    await convertSprite('hot', SCOUT, 4)
    expect(decodes).toHaveBeenCalledTimes(PLAN_CACHE_MAX) // still cached
    await convertSprite('overflow', BAT)
    expect(decodes).toHaveBeenCalledTimes(PLAN_CACHE_MAX + 1)

    // 'hot' survived; the oldest filler was evicted.
    await convertSprite('hot', SCOUT, 6)
    expect(decodes).toHaveBeenCalledTimes(PLAN_CACHE_MAX + 1)
    await convertSprite('filler-1', BAT)
    expect(decodes).toHaveBeenCalledTimes(PLAN_CACHE_MAX + 2)
  })

  it('gives the same answer for a k whether reached cold or by dragging down to it', async () => {
    // The nesting property (#14) must survive the cache: cuts are pure slices of one plan.
    const direct = await convertSprite('a', SCOUT, 6)
    clearPlanCache()
    for (let k = 31; k > 6; k--) await convertSprite('b', SCOUT, k)
    const dragged = await convertSprite('b', SCOUT, 6)
    expect(dragged).toEqual(direct)
  })
})
