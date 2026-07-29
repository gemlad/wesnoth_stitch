import { describe, expect, it } from 'vitest'
import { flipHorizontal } from './flip'
import type { StitchPattern } from './types'

const patternOf = (cells: (number | null)[][]): StitchPattern => ({
  width: cells[0]?.length ?? 0,
  height: cells.length,
  cells
})

describe('flipHorizontal', () => {
  it('reverses each row, keeping the rows in order', () => {
    // Rows in order, columns mirrored: the unit faces the other way, not upside down.
    const flipped = flipHorizontal(
      patternOf([
        [0, 1, 2],
        [3, 4, 5]
      ])
    )
    expect(flipped.cells).toEqual([
      [2, 1, 0],
      [5, 4, 3]
    ])
  })

  it('keeps the dimensions', () => {
    const flipped = flipHorizontal(patternOf([[0, 1, 2, 3]]))
    expect(flipped.width).toBe(4)
    expect(flipped.height).toBe(1)
  })

  it('carries no-stitch cells across', () => {
    // `null` is fabric, not a colour; it must mirror like any other cell rather than be
    // dropped or become a stitch.
    expect(flipHorizontal(patternOf([[null, 1, null]])).cells).toEqual([[null, 1, null]])
    expect(flipHorizontal(patternOf([[null, 1, 2]])).cells).toEqual([[2, 1, null]])
  })

  it('is its own inverse', () => {
    const original = patternOf([
      [0, 1, 2, null],
      [null, 2, 1, 0],
      [1, 1, null, 2]
    ])
    expect(flipHorizontal(flipHorizontal(original))).toEqual(original)
  })

  it('leaves a left-right symmetric pattern alone', () => {
    const symmetric = patternOf([
      [1, 2, 1],
      [0, null, 0]
    ])
    expect(flipHorizontal(symmetric)).toEqual(symmetric)
  })

  it('does not mutate the pattern it is given', () => {
    // The renderer holds the unflipped conversion and re-derives the flipped view on every
    // render; mutating in place would flip it again each pass and leave it oscillating.
    const original = patternOf([[0, 1, 2]])
    const before = original.cells.map((row) => [...row])
    flipHorizontal(original)
    expect(original.cells).toEqual(before)
  })

  it('survives the degenerate patterns', () => {
    expect(flipHorizontal(patternOf([[7]])).cells).toEqual([[7]]) // 1 wide
    expect(flipHorizontal({ width: 0, height: 0, cells: [] })).toEqual({
      width: 0,
      height: 0,
      cells: []
    }) // a fully transparent sprite, trimmed to nothing (#53)
  })

  it('moves cells without touching what an index means', () => {
    // The safety property the whole feature rests on: cells hold palette *indices*, so a
    // mirror rearranges colours on the grid and changes nothing about the palette, the floss
    // key or the symbol assignment.
    const original = patternOf([
      [0, 1, 2],
      [2, 2, null]
    ])
    const flipped = flipHorizontal(original)
    const census = (p: StitchPattern): Record<string, number> =>
      p.cells.flat().reduce<Record<string, number>>((counts, cell) => {
        const key = String(cell)
        counts[key] = (counts[key] ?? 0) + 1
        return counts
      }, {})

    expect(census(flipped)).toEqual(census(original))
  })
})
