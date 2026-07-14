/**
 * Render real chart PDFs into `uat/`, for the print judgement #28 needs (§5.3).
 *
 * This exists because the thing #28 asks for cannot be automated: whether 37 glyphs
 * actually read on paper at stitching scale is a human verdict, and it has to be taken
 * against the *real* export path — the embedded font (#32), the real A4 geometry (#34) —
 * not a stand-in. So the artefacts are regenerable rather than one-off files someone
 * happened to produce once and checked in.
 *
 *   npm run uat:chart                       # default sprite
 *   npm run uat:chart -- path/to/sprite.png
 */
import fontkit from '@pdf-lib/fontkit'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { PNG } from 'pngjs'
import { drawChartPages } from '../src/main/export/pdf-chart'
import { DEFAULT_CELL_MM, glyphSizePt } from '../src/main/export/pdf-layout'
import { MAX_COLOUR_COUNT, mapSpriteToDmc, reduceSprite } from '../src/shared/pipeline'
import type { SymbolDisplay } from '../src/shared/ipc'

const DEFAULT_SPRITE = 'wesnoth-sprites/units/dwarves/fighter.png'
const OUT_DIR = 'uat'
/** Unbleached Aida — the default fabric (§6), and what the preview assumes. */
const FABRIC = { r: 0xf2, g: 0xec, b: 0xdc }

const sprite = process.argv[2] ?? DEFAULT_SPRITE

const src = PNG.sync.read(readFileSync(sprite))
const mapped = mapSpriteToDmc({
  width: src.width,
  height: src.height,
  data: new Uint8Array(src.data)
})

// Chart at the sprite's own colour count (Req. 6), capped at what the symbol set can name.
const k = Math.min(mapped.palette.sourceColourCount, MAX_COLOUR_COUNT)
const reduced = reduceSprite(mapped, k)

console.log(`${sprite}  ${src.width}×${src.height}`)
console.log(`  distinct DMC: ${mapped.palette.sourceColourCount}  → charted at k=${k}`)
console.log(
  `  cell ${DEFAULT_CELL_MM.toFixed(3)}mm  glyph ${glyphSizePt(DEFAULT_CELL_MM).toFixed(2)}pt  (§5.3's reference scale)`
)

mkdirSync(OUT_DIR, { recursive: true })

for (const symbolDisplay of ['both', 'symbol'] as SymbolDisplay[]) {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(readFileSync('resources/fonts/DejaVuSans.ttf'), {
    subset: true
  })

  const pages = drawChartPages(pdf, reduced.pattern, reduced.palette, font, {
    backgroundColour: FABRIC,
    symbolDisplay
  })

  const out = `${OUT_DIR}/chart-${symbolDisplay}.pdf`
  writeFileSync(out, await pdf.save())
  console.log(`  ${symbolDisplay.padEnd(6)} → ${out}  (${pages.length} page${pages.length === 1 ? '' : 's'})`)
}

console.log('\nPrint at 100% / Actual Size. Anything else and the scale — the whole point — is void.')
