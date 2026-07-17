/**
 * #30 / D1: measure the **ink fraction** of every stitch glyph, so an assignment rule can
 * optimise for ink-against-area rather than distinctness alone.
 *
 *   npm run measure:ink        (runs validate:cap first for the glyph list)
 *
 * The finding behind D1 (see #30) is that today's rule hands the *inkiest* glyph to the
 * *largest* colour area — the four solids do the bulk of the work, so a heavily-shaded
 * sprite collapses into a near-solid black field. To do anything smarter than "most
 * distinctive first", the assignment code needs a number for how dark each glyph reads in a
 * cell. That is what this measures: the fraction of a chart cell a glyph inks in, rendered
 * in the **bundled export font** (DejaVu Sans, embedded here as a data URI so it matches the
 * PDF exactly — the legibility sheet's one weakness was rendering through the system stack).
 *
 * Output is baked into `src/shared/pipeline/glyph-ink.ts` as a constant. It is a property of
 * the font, not of any sprite, so it is measured once and committed rather than recomputed.
 * Regenerate whenever `STITCH_SYMBOLS` or the bundled font changes.
 */
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO = resolve(import.meta.dirname, '..')
const OUT_DIR = resolve(REPO, 'out', 'legibility')
const CHART_DATA = resolve(OUT_DIR, 'chart-data.json')
const FONT_PATH = resolve(REPO, 'resources', 'fonts', 'DejaVuSans.ttf')

/** Glyph height as a fraction of the cell — matches src/renderer/src/pattern/draw.ts. */
const GLYPH_RATIO = 0.72
/** Render each cell big, for an accurate fraction; the absolute size cancels out. */
const CELL_PX = 120

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function buildHtml(glyphs, fontB64) {
  return `<meta charset="utf-8">
<style>
  @font-face {
    font-family: "ExportChart";
    src: url(data:font/ttf;base64,${fontB64}) format("truetype");
  }
  body { margin: 0; background: #fff; }
  canvas { display: block; }
</style>
<canvas id="c" width="${CELL_PX}" height="${CELL_PX}"></canvas>
<script>
  window.__glyphs = ${JSON.stringify(glyphs)};
  window.__measure = async function () {
    await document.fonts.ready;
    // Force the face to load at the size we render at.
    await document.fonts.load('${Math.round(CELL_PX * GLYPH_RATIO)}px "ExportChart"');
    const cv = document.getElementById('c');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const size = ${CELL_PX};
    const font = Math.round(size * ${GLYPH_RATIO});
    const out = {};
    for (const g of window.__glyphs) {
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#000';
      ctx.font = font + 'px "ExportChart"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(g, size / 2, size / 2);
      const data = ctx.getImageData(0, 0, size, size).data;
      let dark = 0;
      for (let i = 0; i < data.length; i += 4) {
        // Luminance of the pixel; anything meaningfully grey-or-darker counts as ink.
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (lum < 200) dark++;
      }
      out[g] = dark / (size * size);
    }
    return out;
  };
</script>`
}

app.whenReady().then(async () => {
  let symbols
  try {
    symbols = JSON.parse(readFileSync(CHART_DATA, 'utf8')).symbols
  } catch {
    console.error(`Missing ${CHART_DATA}. Run: npm run validate:cap`)
    app.exit(2)
    return
  }
  const glyphs = symbols.map((s) => s.glyph)
  const fontB64 = readFileSync(FONT_PATH).toString('base64')

  mkdirSync(OUT_DIR, { recursive: true })
  const htmlPath = resolve(OUT_DIR, 'glyph-ink.html')
  writeFileSync(htmlPath, buildHtml(glyphs, fontB64))

  const win = new BrowserWindow({
    show: false,
    width: CELL_PX,
    height: CELL_PX,
    webPreferences: { offscreen: true }
  })
  await win.loadFile(htmlPath)
  const ink = await win.webContents.executeJavaScript('window.__measure()')

  // Round to 4dp: the measurement is exact-per-render but false precision helps nobody.
  const rounded = {}
  for (const [g, v] of Object.entries(ink)) rounded[g] = Math.round(v * 1e4) / 1e4

  const ranked = symbols
    .map((s) => ({ glyph: s.glyph, name: s.name, ink: rounded[s.glyph] }))
    .sort((a, b) => a.ink - b.ink)

  const outPath = resolve(OUT_DIR, 'glyph-ink.json')
  writeFileSync(outPath, JSON.stringify({ cellPx: CELL_PX, glyphRatio: GLYPH_RATIO, ranked }, null, 2))

  console.log(`Wrote ${outPath}`)
  console.log('\nlightest → heaviest:')
  for (const r of ranked) console.log(`  ${r.ink.toFixed(4)}  ${esc(r.glyph)}  ${r.name}`)
  app.exit(0)
})
