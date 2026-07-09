/**
 * Regenerates src/shared/colour/dmc-data.ts from the prototype's DMC chart.
 *
 * The dataset ships as a typed .ts module (not JSON loaded at runtime) so the
 * whole floss table is type-checked and bundles with no resolveJsonModule or
 * file-read plumbing. Re-run this if prototype/dmc_colors.csv ever changes:
 *
 *   node scripts/gen-dmc-data.mjs
 *
 * Source note (carried from the prototype): dmc_colors.csv is a community-sourced
 * chart, not an official DMC export — treat thread NAMES as indicative and trust
 * the printed DMC CODE on the skein. Swap the CSV (same code,name,hex columns)
 * and re-run to adopt a more complete list.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const CSV_PATH = resolve(here, '../prototype/dmc_colors.csv')
const OUT_PATH = resolve(here, '../src/shared/colour/dmc-data.ts')

const csv = readFileSync(CSV_PATH, 'utf8')
const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0)
const header = lines.shift() // "code,name,hex"
if (header.trim() !== 'code,name,hex') {
  throw new Error(`Unexpected CSV header: "${header}" (expected "code,name,hex")`)
}

/** Last row wins on duplicate codes — same uniform rule as the prototype. */
const byCode = new Map()
for (const line of lines) {
  // Split on the first and last comma only, so a name containing a comma survives.
  const first = line.indexOf(',')
  const last = line.lastIndexOf(',')
  if (first === -1 || first === last) {
    throw new Error(`Malformed CSV row (need 3 fields): "${line}"`)
  }
  const code = line.slice(0, first).trim()
  const name = line.slice(first + 1, last).trim()
  const hex =
    '#' +
    line
      .slice(last + 1)
      .trim()
      .replace(/^#/, '')
      .toUpperCase()
  if (!/^#[0-9A-F]{6}$/.test(hex)) {
    throw new Error(`Bad hex "${hex}" for DMC code "${code}"`)
  }
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  byCode.set(code, { code, name, hex, rgb: { r, g, b } })
}

const entries = [...byCode.values()]
const rows = entries
  .map(
    (e) =>
      `  { code: ${JSON.stringify(e.code)}, name: ${JSON.stringify(e.name)}, ` +
      `hex: ${JSON.stringify(e.hex)}, rgb: { r: ${e.rgb.r}, g: ${e.rgb.g}, b: ${e.rgb.b} } }`
  )
  .join(',\n')

const out = `/**
 * DMC floss reference table — GENERATED, do not edit by hand.
 *
 * Regenerate with \`node scripts/gen-dmc-data.mjs\` from prototype/dmc_colors.csv.
 * ${entries.length} floss colours. See scripts/gen-dmc-data.mjs for the source-data caveat.
 */
import type { DMCEntry } from './types'

export const DMC_COLORS: readonly DMCEntry[] = [
${rows}
]
`

writeFileSync(OUT_PATH, out)
console.log(`Wrote ${entries.length} DMC colours to ${OUT_PATH}`)
