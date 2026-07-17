/**
 * #30 / D1: render the same real chart under each assignment strategy, and measure how each
 * one distributes ink, so the near-solid-black field problem can be judged rather than argued.
 *
 *   npm run assign:compare
 *
 * For the two sprites the design doc keeps citing — the dwarvish scout (a typical chart) and
 * the merfolk citizen (the richest sprite in the checkout, where the field collapses) — this
 * runs the real pipeline, assigns glyphs three ways (§ assignment.ts), and emits both the
 * glyph grids and a chart-level ink measurement to `out/legibility/assignment-compare.json`.
 * The UAT artifact renders that at real cell size in the export font.
 *
 * The ink measurement is the #30-suggested one: tile the chart into 10×10 blocks (the
 * gridline spacing) and, per block, average the ink of its stitched cells. The *worst* block
 * is what a stitcher's eye lands on — a strategy that concentrates ink there is the one that
 * blobs. Lower is flatter, and flatter is the goal.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PNG } from 'pngjs'
import {
  ASSIGNMENT_STRATEGIES,
  assignSymbols,
  inkOf,
  mapSpriteToDmc,
  planReduction,
  reduceTo,
  type AssignmentStrategy
} from '../src/shared/pipeline'
import type { DecodedImage } from '../src/shared/ipc'

const REPO = process.env.REPO_ROOT ?? resolve(import.meta.dirname, '..')
const SPRITE_ROOT = resolve(REPO, 'wesnoth-sprites', 'units')
const OUT_DIR = resolve(REPO, 'out', 'legibility')

const decode = (absPath: string): DecodedImage => {
  const png = PNG.sync.read(readFileSync(absPath))
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) }
}

interface StrategyResult {
  strategy: AssignmentStrategy
  /** One string per row; each char is a glyph, or a space for "no stitch". */
  rows: string[]
  meanCellInk: number
  /** Per-10×10-block mean ink, worst block and 90th percentile — the concentration measure. */
  worstBlockInk: number
  p90BlockInk: number
}

/** Mean ink over the stitched cells of each 10×10 block. */
function blockInk(
  cells: readonly (number | null)[][],
  glyphs: readonly string[],
  width: number,
  height: number
): { mean: number; worst: number; p90: number } {
  const blocks: number[] = []
  let total = 0
  let stitched = 0
  for (let by = 0; by < height; by += 10) {
    for (let bx = 0; bx < width; bx += 10) {
      let ink = 0
      let n = 0
      for (let y = by; y < Math.min(by + 10, height); y++) {
        for (let x = bx; x < Math.min(bx + 10, width); x++) {
          const c = cells[y][x]
          if (c === null) continue
          const v = inkOf(glyphs[c])
          ink += v
          n++
          total += v
          stitched++
        }
      }
      if (n > 0) blocks.push(ink / n)
    }
  }
  blocks.sort((a, b) => a - b)
  return {
    mean: stitched ? total / stitched : 0,
    worst: blocks.length ? blocks[blocks.length - 1] : 0,
    p90: blocks.length ? blocks[Math.min(blocks.length - 1, Math.floor(blocks.length * 0.9))] : 0
  }
}

interface SpriteComparison {
  id: string
  width: number
  height: number
  k: number
  sourceColourCount: number
  palette: { code: string; name: string; hex: string; pixelCount: number }[]
  /** Palette index per cell, row-major; -1 = no stitch. Lets a renderer assign glyphs
   *  its own way (e.g. an ink ramp mapped to colour value) rather than only replay ours. */
  cells: number[][]
  strategies: StrategyResult[]
}

function chartOf(relPath: string, k: number): SpriteComparison {
  const base = mapSpriteToDmc(decode(resolve(SPRITE_ROOT, relPath)))
  const reduced = reduceTo(planReduction(base), Math.min(k, base.palette.colours.length))
  const { width, height, cells } = reduced.pattern

  const strategies: StrategyResult[] = ASSIGNMENT_STRATEGIES.map((strategy) => {
    const glyphs = assignSymbols(reduced.palette, strategy).map((s) => s.glyph)
    const rows = cells.map((row) => row.map((c) => (c === null ? ' ' : glyphs[c])).join(''))
    const { mean, worst, p90 } = blockInk(cells, glyphs, width, height)
    return {
      strategy,
      rows,
      meanCellInk: +mean.toFixed(4),
      worstBlockInk: +worst.toFixed(4),
      p90BlockInk: +p90.toFixed(4)
    }
  })

  return {
    id: relPath,
    width,
    height,
    k: reduced.palette.colourCount,
    sourceColourCount: reduced.palette.sourceColourCount,
    palette: reduced.palette.colours.map((c) => ({
      code: c.dmc.code,
      name: c.dmc.name,
      hex: c.dmc.hex,
      pixelCount: c.pixelCount
    })),
    cells: cells.map((row) => row.map((c) => (c === null ? -1 : c))),
    strategies
  }
}

const report = {
  cellMm: 2.36,
  scout: chartOf('dwarves/scout.png', 20),
  citizen: chartOf('merfolk/citizen.png', 49)
}

mkdirSync(OUT_DIR, { recursive: true })
const outPath = resolve(OUT_DIR, 'assignment-compare.json')
writeFileSync(outPath, JSON.stringify(report, null, 2))

process.stdout.write(`Wrote ${outPath}\n\n`)
for (const sprite of [report.scout, report.citizen]) {
  process.stdout.write(`${sprite.id} — ${sprite.width}×${sprite.height}, k=${sprite.k}\n`)
  process.stdout.write('  strategy          mean   worst-block   p90-block\n')
  for (const s of sprite.strategies) {
    process.stdout.write(
      `  ${s.strategy.padEnd(16)}  ${s.meanCellInk.toFixed(3)}   ${s.worstBlockInk.toFixed(3).padStart(9)}   ${s.p90BlockInk.toFixed(3).padStart(9)}\n`
    )
  }
  process.stdout.write('\n')
}
