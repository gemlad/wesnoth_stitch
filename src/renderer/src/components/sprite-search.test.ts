import { describe, expect, it } from 'vitest'
import type { SpriteSummary } from '../../../shared/ipc'
import { countIn, groupSprites, matchesTerms, searchTerms, UNGROUPED } from './sprite-search'

/** As `scanSprites` hands them over: sorted by folder, then name. */
const SPRITES: SpriteSummary[] = [
  { id: 'drakes/burner.png', folder: 'drakes', name: 'burner' },
  { id: 'drakes/fighter.png', folder: 'drakes', name: 'fighter' },
  { id: 'dwarves/fighter.png', folder: 'dwarves', name: 'fighter' },
  { id: 'dwarves/scout.png', folder: 'dwarves', name: 'dwarvish-scout' },
  { id: 'human-loyalists/spearman.png', folder: 'human-loyalists', name: 'spearman' },
  { id: 'loose.png', folder: '', name: 'loose' }
]

const namesIn = (groups: ReturnType<typeof groupSprites>): string[] =>
  groups.flatMap((g) => g.sprites.map((s) => s.name))

describe('searchTerms', () => {
  it('lowercases and splits on whitespace, ignoring padding', () => {
    expect(searchTerms('  Dwarvish   Scout ')).toEqual(['dwarvish', 'scout'])
  })

  it('treats an empty or blank query as no terms', () => {
    expect(searchTerms('')).toEqual([])
    expect(searchTerms('   ')).toEqual([])
  })
})

describe('matchesTerms', () => {
  const sprite = SPRITES[2] // dwarves/fighter

  it('matches on the name', () => {
    expect(matchesTerms(sprite, ['fight'])).toBe(true)
  })

  it('matches on the folder', () => {
    expect(matchesTerms(sprite, ['dwar'])).toBe(true)
  })

  it('requires every term, across name and folder together', () => {
    // The reason terms are ANDed rather than concatenated into one substring: this is how you
    // narrow "every fighter" down to "the dwarvish one" without knowing the path order.
    expect(matchesTerms(sprite, ['dwar', 'fight'])).toBe(true)
    expect(matchesTerms(sprite, ['fight', 'dwar'])).toBe(true)
    expect(matchesTerms(sprite, ['dwar', 'archer'])).toBe(false)
  })

  it('matches everything when there are no terms', () => {
    expect(matchesTerms(sprite, [])).toBe(true)
  })
})

describe('groupSprites', () => {
  it('groups by folder, alphabetically, keeping the incoming order within a group', () => {
    const groups = groupSprites(SPRITES)
    expect(groups.map((g) => g.folder)).toEqual([UNGROUPED, 'drakes', 'dwarves', 'human-loyalists'])
    expect(groups[1].sprites.map((s) => s.name)).toEqual(['burner', 'fighter'])
  })

  it('filters across folders and names at once', () => {
    expect(namesIn(groupSprites(SPRITES, 'fighter'))).toEqual(['fighter', 'fighter'])
    expect(namesIn(groupSprites(SPRITES, 'dwarves fighter'))).toEqual(['fighter'])
  })

  it('is case-insensitive', () => {
    expect(namesIn(groupSprites(SPRITES, 'SPEAR'))).toEqual(['spearman'])
  })

  it('drops folders with no matches rather than showing empty headings', () => {
    const groups = groupSprites(SPRITES, 'scout')
    expect(groups.map((g) => g.folder)).toEqual(['dwarves'])
    expect(namesIn(groups)).toEqual(['dwarvish-scout'])
  })

  it('returns nothing at all when nothing matches', () => {
    const groups = groupSprites(SPRITES, 'wose')
    expect(groups).toEqual([])
    expect(countIn(groups)).toBe(0)
  })

  it('treats a blank query as no filter', () => {
    expect(countIn(groupSprites(SPRITES, '   '))).toBe(SPRITES.length)
  })

  it('keeps root-level sprites under one bucket', () => {
    const groups = groupSprites(SPRITES, 'loose')
    expect(groups).toHaveLength(1)
    expect(groups[0].folder).toBe(UNGROUPED)
  })
})

describe('countIn', () => {
  it('totals the sprites across groups', () => {
    expect(countIn(groupSprites(SPRITES))).toBe(SPRITES.length)
    expect(countIn(groupSprites(SPRITES, 'fighter'))).toBe(2)
  })
})
