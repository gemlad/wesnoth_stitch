/**
 * #20's measurable half: run the finished pipeline over every sprite in the checkout and
 * answer, with numbers rather than assertions, the two questions §8 left open about the
 * colour cap — plus the `alphaThreshold` default §5.2 deferred here.
 *
 * The third question, whether 37 glyphs stay legible on paper, cannot be answered by a
 * script. `scripts/legibility-sheet.mjs` renders the print test for that one.
 *
 * Run (esbuild bundles the TS pipeline; no ts runner is installed):
 *
 *   npm run validate:cap
 *
 * Writes chart data for the print sheet to out/legibility/chart-data.json.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { PNG } from 'pngjs'
import {
  MAX_COLOUR_COUNT,
  STITCH_SYMBOLS,
  mapSpriteToDmc,
  planReduction,
  reduceTo,
  symbolsFor
} from '../src/shared/pipeline'
import { labDistance } from '../src/shared/colour'
import type { DecodedImage } from '../src/shared/ipc'

// Set by scripts/run-ts.mjs: this module executes as a bundle under out/, so it cannot
// find the repo from its own location.
const REPO = process.env.REPO_ROOT ?? resolve(import.meta.dirname, '..')
const SPRITE_ROOT = resolve(REPO, 'wesnoth-sprites', 'units')
const OUT_DIR = resolve(REPO, 'out', 'legibility')

/** Sprites the design doc names, so the numbers below can be checked against it. */
const RICH_SPRITE = 'merfolk/citizen.png'
const REFERENCE_SPRITE = 'dwarves/scout.png'

function listSprites(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listSprites(full))
    else if (entry.name.endsWith('.png')) out.push(full)
  }
  return out
}

function decode(absPath: string): DecodedImage {
  const png = PNG.sync.read(readFileSync(absPath))
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) }
}

const id = (absPath: string): string => relative(SPRITE_ROOT, absPath).split(sep).join('/')

const quantile = (sorted: number[], q: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]

/**
 * The perceptual price of a cap: for every opaque pixel, how far (Lab ΔE) is the floss it
 * ends up stitched in from the floss it would have had at full fidelity? Pixel-weighted,
 * because a shade covering 500 pixels matters 500× more than one covering 1.
 *
 * ΔE ≈ 2.3 is the classic "just noticeable difference" on adjacent flat patches; a chart
 * is stitched, not a flat patch, so treat it as a scale marker rather than a threshold.
 */
function capCost(
  absPath: string,
  k: number
): { meanDeltaE: number; p95DeltaE: number; maxDeltaE: number; pixels: number } | null {
  const base = mapSpriteToDmc(decode(absPath))
  const n = base.palette.colours.length
  if (n <= k) return null // nothing is lost; the cap does not bind

  const plan = planReduction(base)
  const reduced = reduceTo(plan, k)

  // Walk the grid once: cells[y][x] indexes each palette, so the two agree cell by cell.
  let weighted = 0
  let pixels = 0
  const deltas: number[] = []
  for (let y = 0; y < base.pattern.height; y++) {
    for (let x = 0; x < base.pattern.width; x++) {
      const before = base.pattern.cells[y][x]
      const after = reduced.pattern.cells[y][x]
      if (before === null || after === null) continue
      const d = labDistance(base.palette.colours[before].lab, reduced.palette.colours[after].lab)
      weighted += d
      deltas.push(d)
      pixels++
    }
  }
  deltas.sort((a, b) => a - b)
  return {
    meanDeltaE: weighted / pixels,
    p95DeltaE: quantile(deltas, 0.95),
    maxDeltaE: deltas[deltas.length - 1],
    pixels
  }
}

const THRESHOLDS = [1, 32, 64, 96, 128, 160, 192, 224] as const

const stitchCount = (img: DecodedImage, t: number): number =>
  mapSpriteToDmc(img, { alphaThreshold: t }).pattern.cells.reduce(
    (n, row) => n + row.filter((c) => c !== null).length,
    0
  )

/**
 * Does `alphaThreshold = 128` cut the silhouette in the right place?
 *
 * Two things decide it. First the *shape* of the alpha histogram: if sprite alpha is
 * bimodal — nearly all pixels fully opaque or fully clear — then any threshold inside the
 * empty middle gives the same silhouette, and 128 is safe by construction rather than by
 * luck. Second, whether the partial-alpha pixels carry floss colours the artist never
 * drew: a half-transparent pixel over a dark outline blends toward the background, and
 * stitching it spends a thread on a colour that exists nowhere in the sprite.
 */
function alphaProfile(sprites: string[]): {
  sampled: number
  pixels: number
  histogram: Record<string, number>
  fullyOpaquePct: number
  fullyClearPct: number
  partialPct: number
  stitchesByThreshold: Record<string, number>
  stitchesRelativeTo128: Record<string, string>
} {
  // 8 buckets of 32. Bucket 7 holds 224..255, so fully-opaque is counted separately.
  const buckets = new Array(8).fill(0)
  let opaque = 0
  let clear = 0
  let pixels = 0
  const stitches: Record<string, number> = {}
  for (const t of THRESHOLDS) stitches[t] = 0

  for (const absPath of sprites) {
    const img = decode(absPath)
    for (let i = 3; i < img.data.length; i += 4) {
      const a = img.data[i]
      pixels++
      if (a === 0) clear++
      else if (a === 255) opaque++
      else buckets[a >> 5]++
    }
    for (const t of THRESHOLDS) stitches[t] += stitchCount(img, t)
  }

  const histogram: Record<string, number> = {}
  buckets.forEach((n, i) => {
    histogram[`${i * 32}-${i * 32 + 31}`] = n
  })

  const rel: Record<string, string> = {}
  for (const t of THRESHOLDS) {
    rel[t] = (((stitches[t] - stitches[128]) / stitches[128]) * 100).toFixed(2) + '%'
  }

  return {
    sampled: sprites.length,
    pixels,
    histogram,
    fullyOpaquePct: +((opaque / pixels) * 100).toFixed(2),
    fullyClearPct: +((clear / pixels) * 100).toFixed(2),
    partialPct: +(((pixels - opaque - clear) / pixels) * 100).toFixed(2),
    stitchesByThreshold: stitches,
    stitchesRelativeTo128: rel
  }
}

/**
 * The partial-alpha band turned out to be a single spike, not a smooth fringe. This finds
 * which exact alpha value dominates it, and then identifies what that value *is*: a flat
 * colour, in the rows at and below the sprite's feet, in most of the checkout — a shadow.
 */
function shadowSignature(sprites: string[]): {
  dominantAlpha: number
  dominantAlphaPixels: number
  spritesContainingIt: string
  shareOfStitchedCells: { median: string; p90: string; max: string }
  examples: Record<string, unknown>[]
} {
  const exact = new Map<number, number>()
  for (const p of sprites) {
    const img = decode(p)
    for (let i = 3; i < img.data.length; i += 4) {
      const a = img.data[i]
      if (a > 0 && a < 255) exact.set(a, (exact.get(a) ?? 0) + 1)
    }
  }
  const [dominantAlpha, dominantAlphaPixels] = [...exact.entries()].sort((a, b) => b[1] - a[1])[0]

  let containing = 0
  const shares: number[] = []
  for (const p of sprites) {
    const img = decode(p)
    let band = 0
    let stitched = 0
    for (let i = 3; i < img.data.length; i += 4) {
      if (img.data[i] === dominantAlpha) band++
      if (img.data[i] >= 128) stitched++
    }
    if (band > 0) {
      containing++
      shares.push((band / stitched) * 100)
    }
  }
  shares.sort((a, b) => a - b)

  // Is it a flat colour, and does it sit under the figure?
  const examples = [RICH_SPRITE, REFERENCE_SPRITE].map((name) => {
    const png = PNG.sync.read(readFileSync(resolve(SPRITE_ROOT, name)))
    const colours = new Map<string, number>()
    let minY = Infinity
    let maxY = -Infinity
    let lowestOpaqueY = -Infinity
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const i = (y * png.width + x) * 4
        const a = png.data[i + 3]
        if (a === 255) lowestOpaqueY = Math.max(lowestOpaqueY, y)
        if (a !== dominantAlpha) continue
        colours.set(`${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`, 1)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
    }
    return {
      id: name,
      distinctColoursAtThatAlpha: colours.size,
      colour: [...colours.keys()][0] ?? null,
      rows: `${minY}..${maxY}`,
      lowestOpaqueRow: lowestOpaqueY,
      extendsBelowTheFigure: maxY > lowestOpaqueY
    }
  })

  const pct = (q: number): string => shares[Math.floor(shares.length * q)].toFixed(1) + '%'
  return {
    dominantAlpha,
    dominantAlphaPixels,
    spritesContainingIt: `${containing}/${sprites.length}`,
    shareOfStitchedCells: { median: pct(0.5), p90: pct(0.9), max: pct(0.999) },
    examples
  }
}

/**
 * With translucency composited (rather than taken at face value), how much of the chart is
 * the shadow, and what floss does it become?
 */
function shadowFloss(absPath: string): { flossAt128: number; shadowFloss: string | null } {
  const img = decode(absPath)
  const { palette, pattern } = mapSpriteToDmc(img)
  // The bottom-most stitched rows are shadow if anything is.
  const tally = new Map<number, number>()
  for (let y = pattern.height - 1; y >= 0; y--) {
    for (let x = 0; x < pattern.width; x++) {
      const i = pattern.cells[y][x]
      if (i !== null && y > pattern.height * 0.8) tally.set(i, (tally.get(i) ?? 0) + 1)
    }
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
  return {
    flossAt128: palette.colours.length,
    shadowFloss: top
      ? `${palette.colours[top[0]].dmc.code} ${palette.colours[top[0]].dmc.name}`
      : null
  }
}

/** A black-and-white chart, as glyph rows, for the print sheet. */
function chartOf(
  absPath: string,
  k: number
): { width: number; height: number; k: number; rows: string[]; codes: string[] } {
  const base = mapSpriteToDmc(decode(absPath))
  const reduced = reduceTo(planReduction(base), Math.min(k, base.palette.colours.length))
  const glyphs = symbolsFor(reduced.palette).map((s) => s.glyph)
  return {
    width: reduced.pattern.width,
    height: reduced.pattern.height,
    k: reduced.palette.colourCount,
    // ' ' = no stitch. One character per cell, so the sheet can lay it out on a grid.
    rows: reduced.pattern.cells.map((row) =>
      row.map((c) => (c === null ? ' ' : glyphs[c])).join('')
    ),
    codes: reduced.palette.colours.map((c) => c.dmc.code)
  }
}

// ---------------------------------------------------------------------------

const sprites = listSprites(SPRITE_ROOT)
process.stdout.write(`Scanning ${sprites.length} sprites…\n`)

const counts: number[] = []
const overCap: { id: string; distinct: number }[] = []
let failed = 0

for (const absPath of sprites) {
  try {
    const { palette } = mapSpriteToDmc(decode(absPath))
    const distinct = palette.sourceColourCount
    counts.push(distinct)
    if (distinct > MAX_COLOUR_COUNT) overCap.push({ id: id(absPath), distinct })
  } catch {
    failed++
  }
}

counts.sort((a, b) => a - b)
const coverage = (cap: number): number =>
  (counts.filter((c) => c <= cap).length / counts.length) * 100

const census = {
  sprites: counts.length,
  undecodable: failed,
  median: quantile(counts, 0.5),
  p90: quantile(counts, 0.9),
  p99: quantile(counts, 0.99),
  max: counts[counts.length - 1],
  coverageAt37: +coverage(37).toFixed(1),
  coverageAt40: +coverage(40).toFixed(1),
  // The live cap, whatever it is now — 37 was the original, #30/D3 widened it.
  cap: MAX_COLOUR_COUNT,
  coverageAtCap: +coverage(MAX_COLOUR_COUNT).toFixed(1),
  spritesOverCap: overCap.length,
  spritesOverCapPct: +((overCap.length / counts.length) * 100).toFixed(1)
}

// What would the three extra colours of the original 40 have bought? Only sprites that
// sit in 38..40 are rescued; everything above still reduces.
const rescuedBy40 = counts.filter((c) => c > 37 && c <= 40).length

// The perceptual price of the cap, on the sprites where it actually binds. Sampled: the
// full set of 485 would take minutes and the distribution is not the point.
const worst = [...overCap].sort((a, b) => b.distinct - a.distinct).slice(0, 12)
const capCosts = worst.map((s) => ({
  id: s.id,
  distinct: s.distinct,
  at37: capCost(resolve(SPRITE_ROOT, s.id), 37),
  at40: capCost(resolve(SPRITE_ROOT, s.id), 40)
}))

// Every 24th sprite: ~300 sprites, spread across every faction folder, without waiting on
// a threshold sweep over all 7,118.
const sample = sprites.filter((_, i) => i % 24 === 0)

const report = {
  census,
  capIsTheSymbolSet: MAX_COLOUR_COUNT,
  rescuedByRaisingCapTo40: rescuedBy40,
  rescuedPct: +((rescuedBy40 / counts.length) * 100).toFixed(2),
  capCostOnWorstSprites: capCosts,
  alphaThreshold: {
    sampleProfile: alphaProfile(sample),
    shadow: shadowSignature(sample),
    shadowFlossAfterCompositing: {
      rich: { id: RICH_SPRITE, ...shadowFloss(resolve(SPRITE_ROOT, RICH_SPRITE)) },
      reference: { id: REFERENCE_SPRITE, ...shadowFloss(resolve(SPRITE_ROOT, REFERENCE_SPRITE)) }
    }
  },
  jndDeltaE: 2.3
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(resolve(OUT_DIR, 'cap-report.json'), JSON.stringify(report, null, 2))
writeFileSync(
  resolve(OUT_DIR, 'chart-data.json'),
  JSON.stringify(
    {
      symbols: STITCH_SYMBOLS.map((s) => ({ glyph: s.glyph, name: s.name })),
      maxColourCount: MAX_COLOUR_COUNT,
      scout: chartOf(resolve(SPRITE_ROOT, REFERENCE_SPRITE), 20),
      citizen: chartOf(resolve(SPRITE_ROOT, RICH_SPRITE), MAX_COLOUR_COUNT)
    },
    null,
    2
  )
)

process.stdout.write(JSON.stringify(report, null, 2) + '\n')
process.stdout.write(`\nWrote ${OUT_DIR}\n`)
