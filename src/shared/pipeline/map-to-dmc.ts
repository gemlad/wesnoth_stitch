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
 *
 * **Translucent pixels are composited over white before mapping (#20).** Wesnoth uses
 * partial alpha *semantically*, not as anti-aliasing coverage: 90% of sprites carry a
 * drop shadow drawn as flat black at alpha 153 (60% opaque), and it accounts for 12.6%
 * of every stitched cell in the checkout. Taken at face value, that pixel is `rgb(0,0,0)`
 * and gets stitched in DMC 310 Black — a hard black blob, because a stitch is either
 * there or it isn't. Composited first, it becomes the mid grey the shadow actually looks
 * like, in a floss you can buy.
 */
import { nearestDmc, srgbToLab } from '../colour'
import type { DecodedImage } from '../ipc'
import { trimToContent } from './trim'
import type { PaletteColour, QuantizedPalette, StitchPattern } from './types'

export interface MapToDmcOptions {
  /**
   * Alpha (0–255) at or above which a pixel counts as a stitch; below it the
   * pixel is treated as no-stitch (`null`). Defaults to 128: cross-stitch can't
   * do partial coverage, so a pixel that's more than half transparent is better
   * left unstitched than rendered as a full stitch of a mostly-fabric colour.
   *
   * Alpha decides *whether* there is a stitch; `MATTE` decides what colour it is.
   * Validated against all 7,118 sprites in #20 — see §5.2.
   */
  alphaThreshold?: number
}

export interface MappedSprite {
  palette: QuantizedPalette
  pattern: StitchPattern
}

const DEFAULT_ALPHA_THRESHOLD = 128

/**
 * What a translucent pixel is composited against: white, always.
 *
 * **Not the user's fabric colour**, though that is the physically faithful choice, and
 * not for want of the value — the preview knows it (`PatternSettings.backgroundColour`).
 * Two reasons. It would make the palette a function of a *view* setting, so nudging the
 * fabric picker would re-run quantization, invalidate the plan cache and churn every
 * colour and glyph on the chart. And it would put UI state inside this module, which is
 * deliberately a pure function of pixels and floss (§6). White is the conventional chart
 * reference — the fabric everyone's chart assumes — and it keeps a sprite's pattern the
 * same object whatever cloth it ends up on.
 */
const MATTE = 255

/** Pack an 8-bit RGB triple into one integer key for exact-colour dedup. */
function packRgb(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b
}

/**
 * One channel of `src` composited over `MATTE` at opacity `alpha`: `src·α + matte·(1−α)`.
 *
 * Exported for its own test. Asserting this through `mapSpriteToDmc` alone is too blunt:
 * DMC quantization is coarse enough to absorb a one-level channel error, so a subtly
 * wrong composite still lands on the right floss and the test passes anyway.
 */
export function overMatte(channel: number, alpha: number): number {
  return Math.round((channel * alpha + MATTE * (255 - alpha)) / 255)
}

/**
 * The colour a stitch at byte offset `i` should be, composited over `MATTE`, packed for
 * dedup. Returns `null` when the pixel is too transparent to be a stitch at all.
 *
 * Both passes below go through here, so the tally and the grid can't disagree about what
 * a pixel is.
 */
function stitchKey(data: DecodedImage['data'], i: number, alphaThreshold: number): number | null {
  const a = data[i + 3]
  if (a < alphaThreshold) return null
  // α=255 is the identity; skip the arithmetic for the overwhelming majority of pixels.
  if (a === 255) return packRgb(data[i], data[i + 1], data[i + 2])
  return packRgb(overMatte(data[i], a), overMatte(data[i + 1], a), overMatte(data[i + 2], a))
}

/**
 * Map a decoded sprite to its full-fidelity DMC palette + stitch grid.
 *
 * Deterministic: the returned palette is ordered by descending pixel count
 * (dominant floss first), ties broken by DMC code, so `cells` indices are stable
 * across runs.
 *
 * **The sprite is trimmed to its content first (#53).** Wesnoth sprites carry a wide
 * transparent border, which would otherwise pad every chart with empty stitches, so
 * `pattern.width`/`height` reflect the artwork, not the source canvas. Trimming uses the same
 * alpha threshold as the stitch/no-stitch rule below, so a border of no-stitch pixels is
 * cropped rather than left in place. No-stitch pixels *inside* the bounding box stay `null`.
 */
export function mapSpriteToDmc(image: DecodedImage, options: MapToDmcOptions = {}): MappedSprite {
  const alphaThreshold = options.alphaThreshold ?? DEFAULT_ALPHA_THRESHOLD
  const { width, height, data } = trimToContent(image, alphaThreshold)

  // Pass 1: tally distinct stitch colours by exact (composited) RGB.
  const counts = new Map<number, number>()
  for (let i = 0; i < data.length; i += 4) {
    const key = stitchKey(data, i, alphaThreshold)
    if (key === null) continue
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
      const key = stitchKey(data, (y * width + x) * 4, alphaThreshold)
      if (key === null) {
        row[x] = null
      } else {
        row[x] = indexByDmcCode.get(sourceToDmcCode.get(key)!)!
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
