/**
 * Filtering and grouping for the sprite browser (#66).
 *
 * The set is ~7,000 sprites in a few dozen faction folders (§5.1), so "scroll until you see
 * the scout" is the only way to find anything and it is a bad one. This is the search.
 *
 * **It runs over the list already in memory.** `getSpriteList` hands the renderer every
 * summary at startup, so filtering is a substring test over a few thousand short strings —
 * microseconds, no IPC, nothing to debounce. Adding a search *channel* would mean a round trip
 * per keystroke to answer a question the renderer can already answer.
 *
 * Kept out of the component so the matching rules can be tested as rules, rather than through
 * a rendered tree.
 */
import type { SpriteSummary } from '../../../shared/ipc'

/** Label for sprites that sit directly under the root with no faction folder. */
export const UNGROUPED = '(ungrouped)'

/** A folder and the sprites in it, as the browser lists them. */
export interface SpriteGroup {
  folder: string
  sprites: SpriteSummary[]
}

/**
 * Split a query into terms.
 *
 * Terms are ANDed, which is what makes "dwarv fight" work — one term matching the folder and
 * the other the name. A single substring test over `folder/name` would need you to type them
 * in path order, and to know which order that is.
 */
export function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

/** Does `sprite` match every term, in its name or its folder? */
export function matchesTerms(sprite: SpriteSummary, terms: readonly string[]): boolean {
  if (terms.length === 0) return true
  const name = sprite.name.toLowerCase()
  const folder = sprite.folder.toLowerCase()
  return terms.every((term) => name.includes(term) || folder.includes(term))
}

/**
 * The browser's list: sprites matching `query`, bucketed by folder, folders alphabetical.
 *
 * The incoming list is already sorted by folder then name (see `scanSprites`), so bucketing is
 * a stable single pass and the sprites inside each group keep that order. A folder with no
 * matches does not appear at all — an empty heading is a row of noise between you and the
 * thing you are looking for.
 */
export function groupSprites(sprites: readonly SpriteSummary[], query = ''): SpriteGroup[] {
  const terms = searchTerms(query)
  const byFolder = new Map<string, SpriteSummary[]>()

  for (const sprite of sprites) {
    if (!matchesTerms(sprite, terms)) continue
    const key = sprite.folder || UNGROUPED
    const bucket = byFolder.get(key)
    if (bucket) bucket.push(sprite)
    else byFolder.set(key, [sprite])
  }

  return [...byFolder.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([folder, matched]) => ({ folder, sprites: matched }))
}

/** How many sprites the groups hold — what the browser reports as "n of m". */
export function countIn(groups: readonly SpriteGroup[]): number {
  return groups.reduce((total, group) => total + group.sprites.length, 0)
}
