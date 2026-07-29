/**
 * Mirror a pattern left-to-right (#56).
 *
 * Wesnoth unit sprites nearly all face the same way, and a stitcher may want the unit looking
 * the other way — into the page rather than off it, or to face its pair in a set of two.
 *
 * **The cells move; the palette and the glyphs do not.** A cell holds an *index* into
 * `QuantizedPalette.colours`, so reversing rows moves colours around the grid without changing
 * what any index means. That is the whole reason this is safe to do late, on the pattern alone:
 * the floss key, the symbol assignment (§5.3) and the colour counts are all untouched, and a
 * flipped chart cannot disagree with its key.
 *
 * Vertical axis, so rows are reversed and their order is kept. Flipping the *rows* instead
 * would turn the unit upside down, which nobody asked for.
 */
import type { StitchPattern } from './types'

/**
 * `pattern` mirrored about its vertical axis: a new pattern, with each row reversed.
 *
 * Pure — the input is not modified, because the renderer holds the unflipped conversion and
 * re-derives the flipped view on every render. Mutating in place would flip it again on every
 * pass and leave the pattern oscillating.
 *
 * Its own inverse: flipping twice returns the original grid.
 */
export function flipHorizontal(pattern: StitchPattern): StitchPattern {
  return {
    width: pattern.width,
    height: pattern.height,
    cells: pattern.cells.map((row) => [...row].reverse())
  }
}
