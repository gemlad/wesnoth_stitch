/**
 * Step 1 of the conversion pipeline (design §5.2): map a decoded sprite to DMC
 * floss *before* any colour reduction, so we don't ditch fidelity to arbitrary
 * centroids and snap later.
 *
 * Every opaque pixel is matched to its nearest floss by Lab ΔE (via #13's
 * reference table). We dedupe by exact source colour first, so the nearest-floss
 * search runs once per *distinct* colour, not once per pixel — cheap at 64–144px.
 * Several source shades can land on the same floss; those collapse into one
 * palette entry, so the palette's length is the sprite's **distinct-DMC count** —
 * the "true" colour count for Req. 6 and the reduction step's starting point (#14).
 */
import { nearestDmc, srgbToLab } from '../colour'
import type { DecodedImage } from '../ipc'
import type { PaletteColour, QuantizedPalette, StitchPattern } from './types'

export interface MapToDmcOptions {
  /**
   * Alpha (0–255) at or above which a pixel counts as a stitch; below it the
   * pixel is treated as no-stitch (`null`). Defaults to 128: cross-stitch can't
   * do partial coverage, so a pixel that's more than half transparent is better
   * left unstitched than rendered as a full stitch of a blended fringe colour.
   * Tunable — #20 validates it against real sprites (see §5.2).
   */
  alphaThreshold?: number
}

export interface MappedSprite {
  palette: QuantizedPalette
  pattern: StitchPattern
}

const DEFAULT_ALPHA_THRESHOLD = 128

/** Pack an 8-bit RGB triple into one integer key for exact-colour dedup. */
function packRgb(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b
}

/**
 * Map a decoded sprite to its full-fidelity DMC palette + stitch grid.
 *
 * Deterministic: the returned palette is ordered by descending pixel count
 * (dominant floss first), ties broken by DMC code, so `cells` indices are stable
 * across runs.
 */
export function mapSpriteToDmc(image: DecodedImage, options: MapToDmcOptions = {}): MappedSprite {
  const { width, height, data } = image
  const alphaThreshold = options.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD

  // Pass 1: tally distinct opaque source colours by exact RGB.
  const counts = new Map<number, number>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < alphaThreshold) continue
    const key = packRgb(data[i], data[i + 1], data[i + 2])
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  // Resolve each distinct source colour to a floss, accumulating per-floss
  // pixel counts (many source shades can share one floss). Remember which floss
  // each source colour resolved to, to index the grid without re-searching.
  const byDmcCode = new Map<string, PaletteColour>()
  const sourceToDmcCode = new Map<number, string>()
  for (const [key, count] of counts) {
    const rgb = { r: (key >> 16) & 0xff, g: (key >> 8) & 0xff, b: key & 0xff }
    const dmc = nearestDmc(srgbToLab(rgb))
    sourceToDmcCode.set(key, dmc.code)
    const existing = byDmcCode.get(dmc.code)
    if (existing) {
      existing.pixelCount += count
    } else {
      byDmcCode.set(dmc.code, {
        lab: srgbToLab(dmc.rgb),
        rgb: dmc.rgb,
        dmc,
        pixelCount: count
      })
    }
  }

  // Order the palette deterministically: dominant floss first.
  const colours = [...byDmcCode.values()].sort(
    (a, b) => b.pixelCount - a.pixelCount || a.dmc.code.localeCompare(b.dmc.code)
  )

  // Map each floss code to its final palette index for grid lookup.
  const indexByDmcCode = new Map<string, number>()
  colours.forEach((c, i) => indexByDmcCode.set(c.dmc.code, i))

  // Pass 2: build the 1:1 grid; transparent pixels become null.
  const cells: (number | null)[][] = []
  for (let y = 0; y < height; y++) {
    const row: (number | null)[] = new Array(width)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (data[i + 3] < alphaThreshold) {
        row[x] = null
      } else {
        const code = sourceToDmcCode.get(packRgb(data[i], data[i + 1], data[i + 2]))!
        row[x] = indexByDmcCode.get(code)!
      }
    }
    cells.push(row)
  }

  return {
    palette: {
      colours,
      colourCount: colours.length,
      sourceColourCount: colours.length
    },
    pattern: { width, height, cells }
  }
}
