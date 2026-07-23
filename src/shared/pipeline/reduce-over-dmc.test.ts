import { describe, it, expect } from 'vitest'
import { mapSpriteToDmc, type MappedSprite } from './map-to-dmc'
import { planReduction, reduceSprite, reduceTo, type ReducedSprite } from './reduce-over-dmc'
import { DMC_COLORS } from '../colour'
import type { DecodedImage } from '../ipc'

type Pixel = [r: number, g: number, b: number, a: number]

/** Build a single-row RGBA DecodedImage from a flat pixel list. */
function makeImage(pixels: Pixel[]): DecodedImage {
  const data = new Uint8Array(pixels.length * 4)
  pixels.forEach(([r, g, b, a], i) => {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  })
  return { width: pixels.length, height: 1, data }
}

const repeat = (p: Pixel, n: number): Pixel[] => Array.from({ length: n }, () => p)

// Source pixels and the floss they map to (verified against the #13 reference table).
const BLACK: Pixel = [0, 0, 0, 255] // → 310   Black
const DARK_GREY: Pixel = [60, 60, 60, 255] // → 3799  Charcoal Gray DK
const MID_GREY: Pixel = [130, 130, 130, 255] // → 645   Beaver Gray MD DK
const WHITE: Pixel = [255, 255, 255, 255] // → B5200 White
const RED: Pixel = [220, 20, 30, 255] // → 666   Christmas Red Bright
const DARK_RED: Pixel = [150, 15, 20, 255] // → 3830  Pumpkin Pale DK
const BLUE: Pixel = [20, 40, 200, 255] // → 792   Cornflower Blue DK
const CLEAR: Pixel = [0, 0, 0, 0]
// Two near-identical dark browns: distinct floss, but only ΔE 1.09 apart.
const BROWN_A: Pixel = [0x41, 0x30, 0x22, 255] // → 413   Pewter Gray DK
const BROWN_B: Pixel = [0x3f, 0x30, 0x22, 255] // → 3031  Mocha Brown VD

const codesOf = (r: ReducedSprite): string[] => r.palette.colours.map((c) => c.dmc.code)

/**
 * Recover which reduced palette entry each base entry ended up in, by zipping the
 * two 1:1 grids. Gives us the *partition of base colours* a given `k` induces —
 * the thing the nesting property is actually about.
 */
function leafToReduced(base: MappedSprite, reduced: ReducedSprite): number[] {
  const map = new Array<number>(base.palette.colours.length).fill(-1)
  for (let y = 0; y < base.pattern.height; y++) {
    for (let x = 0; x < base.pattern.width; x++) {
      const leaf = base.pattern.cells[y][x]
      const cell = reduced.pattern.cells[y][x]
      if (leaf === null) {
        expect(cell).toBeNull()
        continue
      }
      map[leaf] = cell!
    }
  }
  expect(map).not.toContain(-1) // every base colour appears in the grid
  return map
}

describe('reduceSprite', () => {
  it('merges the perceptually closest floss pair first', () => {
    // 666 and 3830 are ΔE 19.33 apart — far closer than any other pair here.
    const mapped = mapSpriteToDmc(makeImage([...repeat(RED, 3), DARK_RED, BLACK, WHITE]))
    expect(mapped.palette.colourCount).toBe(4)

    const reduced = reduceSprite(mapped, 3)
    expect(reduced.palette.colourCount).toBe(3)
    // The two reds became one entry; black and white are untouched.
    expect(codesOf(reduced)).toEqual(['666', '310', 'B5200'])
    expect(reduced.palette.colours[0].pixelCount).toBe(4) // 3 red + 1 dark red
  })

  it('weights by pixel frequency, so a rare floss cannot survive at a dominant one’s expense', () => {
    // ΔE(3799, 645) = 26.54 is *smaller* than ΔE(310, 3799) = 28.66, so an unweighted
    // nearest-pair merge would fuse the two 20-pixel greys and leave the single black
    // pixel occupying a whole palette entry. Weighting inverts that: absorbing the
    // 1-pixel cluster is cheap, fusing two 20-pixel clusters is not.
    const mapped = mapSpriteToDmc(
      makeImage([...repeat(DARK_GREY, 20), ...repeat(MID_GREY, 20), BLACK])
    )
    expect(mapped.palette.colourCount).toBe(3)

    const reduced = reduceSprite(mapped, 2)
    expect(codesOf(reduced)).toEqual(['3799', '645'])
    expect(codesOf(reduced)).not.toContain('310') // the rare floss was absorbed
    // Black folded into charcoal, which keeps its own colour and gains the pixel.
    expect(reduced.palette.colours[0].pixelCount).toBe(21)
    expect(reduced.palette.colours[1].pixelCount).toBe(20)
  })

  it('reassigns merged pixels to the group representative (the dominant floss, not an average)', () => {
    const mapped = mapSpriteToDmc(makeImage([...repeat(DARK_GREY, 20), BLACK]))
    const reduced = reduceSprite(mapped, 1)

    const only = reduced.palette.colours[0]
    expect(only.dmc.code).toBe('3799') // the 20-pixel floss, not the 1-pixel one
    expect(only.pixelCount).toBe(21)
    // Every stitch now points at that single entry.
    expect(reduced.pattern.cells[0].every((c) => c === 0)).toBe(true)
  })

  it('picks the group representative by weighted medoid, not by geometric centrality', () => {
    // 310 — 3799 — 645 sit almost collinear on the L axis (ΔE 28.7 and 26.5 apart, 55.1
    // end to end), so 3799 is the *unweighted* medoid: it minimises plain summed ΔE.
    // Weighting by pixel count must instead elect 645, the floss 50 of the 52 stitches
    // already are — the whole point of "merged pixels reassign to their group's rep".
    const mapped = mapSpriteToDmc(makeImage([...repeat(MID_GREY, 50), DARK_GREY, BLACK]))
    expect(mapped.palette.colourCount).toBe(3)

    const reduced = reduceSprite(mapped, 1)
    expect(reduced.palette.colours[0].dmc.code).toBe('645')
    expect(reduced.palette.colours[0].pixelCount).toBe(52)
  })

  it('re-elects the representative of a group formed from an earlier merge', () => {
    // 413 and 3031 are ΔE 1.09 apart, so they pair off first and the resulting
    // 50-pixel cluster is the *second* operand of the final merge — the stray white
    // highlight is the first. Collapsing to one colour must yield the brown that
    // covers the sprite, which is only true if the final merge re-elects a medoid
    // over the whole group rather than inheriting either operand's.
    const mapped = mapSpriteToDmc(
      makeImage([...repeat(BROWN_A, 25), ...repeat(BROWN_B, 25), WHITE])
    )
    expect(mapped.palette.colourCount).toBe(3)

    const only = reduceSprite(mapped, 1).palette.colours[0]
    expect(only.dmc.code).toBe('413')
    expect(only.dmc.code).not.toBe('B5200') // never the 1-pixel highlight
    expect(only.pixelCount).toBe(51)
  })

  it('only ever emits real DMC floss — every entry is a dataset colour, never a blend', () => {
    const mapped = mapSpriteToDmc(
      makeImage([...repeat(RED, 4), ...repeat(BLUE, 3), DARK_RED, DARK_GREY, MID_GREY, WHITE])
    )
    for (let k = 1; k <= mapped.palette.colourCount; k++) {
      for (const colour of reduceSprite(mapped, k).palette.colours) {
        const real = DMC_COLORS.find((c) => c.code === colour.dmc.code)
        expect(real).toBeDefined()
        // The entry carries the floss's own colour, so no second snap is needed.
        expect(colour.rgb).toEqual(real!.rgb)
        expect(colour.dmc.hex).toBe(real!.hex)
      }
    }
  })

  it('preserves the stitch count, the transparent cells, and the source colour count', () => {
    // CLEARs sit interior (before BLACK), not as a trailing border, so trimming (#53) keeps
    // them: the point here is that reduction preserves no-stitch cells and the stitch count.
    const mapped = mapSpriteToDmc(
      makeImage([...repeat(RED, 3), DARK_RED, CLEAR, CLEAR, BLACK, WHITE, BLUE])
    )
    const reduced = reduceSprite(mapped, 2)

    const stitches = reduced.palette.colours.reduce((n, c) => n + c.pixelCount, 0)
    expect(stitches).toBe(7) // 9 pixels, 2 transparent
    expect(reduced.pattern.cells[0].filter((c) => c === null).length).toBe(2)
    // The Req. 6 default stays the sprite's own distinct-DMC count, not the reduced k.
    expect(reduced.palette.sourceColourCount).toBe(mapped.palette.sourceColourCount)
    expect(reduced.palette.colourCount).toBe(2)
    // Grid indices stay in range for the reduced palette.
    for (const cell of reduced.pattern.cells[0]) {
      if (cell !== null) expect(cell).toBeLessThan(2)
    }
    expect(reduced.pattern.width).toBe(9)
    expect(reduced.pattern.height).toBe(1)
  })

  it('orders the reduced palette by descending pixel count, like the mapper', () => {
    const mapped = mapSpriteToDmc(
      makeImage([...repeat(RED, 5), ...repeat(BLUE, 3), DARK_RED, WHITE])
    )
    const counts = reduceSprite(mapped, 3).palette.colours.map((c) => c.pixelCount)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
  })

  it('is a no-op when k is at or above the distinct-DMC count', () => {
    const mapped = mapSpriteToDmc(makeImage([BLACK, WHITE, RED]))
    expect(reduceSprite(mapped, 3)).toBe(mapped) // exactly k
    expect(reduceSprite(mapped, 40)).toBe(mapped) // slider above the sprite's count
  })

  it('handles a fully transparent sprite', () => {
    // Trimming (#53) crops an all-transparent sprite to nothing: an empty pattern, not a
    // canvas of nulls.
    const mapped = mapSpriteToDmc(makeImage([CLEAR, CLEAR]))
    const reduced = reduceSprite(mapped, 1)
    expect(reduced.palette.colours).toEqual([])
    expect(reduced.pattern.cells).toEqual([])
    expect(reduced.pattern.width).toBe(0)
    expect(reduced.pattern.height).toBe(0)
  })

  it('rejects a colour count that is not a positive integer', () => {
    const mapped = mapSpriteToDmc(makeImage([BLACK, WHITE, RED]))
    expect(() => reduceSprite(mapped, 0)).toThrow(RangeError)
    expect(() => reduceSprite(mapped, -1)).toThrow(RangeError)
    expect(() => reduceSprite(mapped, 1.5)).toThrow(RangeError)
  })

  it('is deterministic across runs', () => {
    const pixels = [...repeat(RED, 3), ...repeat(BLUE, 2), DARK_RED, DARK_GREY, MID_GREY, WHITE]
    const a = reduceSprite(mapSpriteToDmc(makeImage(pixels)), 3)
    const b = reduceSprite(mapSpriteToDmc(makeImage(pixels)), 3)
    expect(a).toEqual(b)
  })
})

describe('planReduction / reduceTo — slider stability (§5.2)', () => {
  // Seven distinct floss with lopsided counts: enough structure for the merge order
  // to be non-obvious, which is the point.
  const pixels = [
    ...repeat(RED, 9),
    ...repeat(BLUE, 6),
    ...repeat(DARK_GREY, 4),
    ...repeat(MID_GREY, 3),
    ...repeat(DARK_RED, 2),
    WHITE,
    BLACK,
    CLEAR
  ]
  const mapped = mapSpriteToDmc(makeImage(pixels))
  const n = mapped.palette.colourCount
  const plan = planReduction(mapped)

  it('maps the seven distinct floss the fixture intends', () => {
    expect(n).toBe(7)
    expect(plan.merges.length).toBe(n - 1) // enough merges to collapse to one colour
  })

  it('yields exactly k colours at every cut', () => {
    for (let k = 1; k <= n; k++) {
      const reduced = reduceTo(plan, k)
      expect(reduced.palette.colourCount).toBe(k)
      expect(reduced.palette.colours.length).toBe(k)
    }
  })

  it('nests: dropping k by one merges exactly two entries and moves nothing else', () => {
    for (let k = n; k > 1; k--) {
      const at = leafToReduced(mapped, reduceTo(plan, k))
      const below = leafToReduced(mapped, reduceTo(plan, k - 1))

      // Coarsening: base colours grouped together at k stay together at k - 1.
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (at[i] === at[j]) expect(below[i]).toBe(below[j])
        }
      }

      // …and exactly one pair of groups fused: one k-1 group absorbs two k groups,
      // every other k group maps to a k-1 group of its own.
      const absorbedInto = new Map<number, Set<number>>()
      for (let leaf = 0; leaf < n; leaf++) {
        const target = absorbedInto.get(below[leaf]) ?? new Set<number>()
        target.add(at[leaf])
        absorbedInto.set(below[leaf], target)
      }
      const fused = [...absorbedInto.values()].filter((group) => group.size > 1)
      expect(fused.length).toBe(1)
      expect(fused[0].size).toBe(2)
    }
  })

  it('conserves every stitch at every cut', () => {
    const stitches = mapped.palette.colours.reduce((sum, c) => sum + c.pixelCount, 0)
    for (let k = 1; k <= n; k++) {
      const reduced = reduceTo(plan, k)
      expect(reduced.palette.colours.reduce((sum, c) => sum + c.pixelCount, 0)).toBe(stitches)
    }
  })

  it('is a pure slice: cuts are repeatable, in any order, and never mutate the plan', () => {
    const first = reduceTo(plan, 3)
    reduceTo(plan, 6)
    reduceTo(plan, 1)
    expect(reduceTo(plan, 3)).toEqual(first)
    // The base sprite the plan wraps is untouched by any of that.
    expect(mapped.palette.colourCount).toBe(n)
    expect(mapped.palette.colours.map((c) => c.pixelCount)).toEqual([9, 6, 4, 3, 2, 1, 1])
  })

  it('agrees with the one-shot reduceSprite convenience wrapper', () => {
    for (let k = 1; k <= n; k++) {
      expect(reduceTo(plan, k)).toEqual(reduceSprite(mapped, k))
    }
  })
})
