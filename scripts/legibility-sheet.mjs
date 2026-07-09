/**
 * #20's other half: the part a script cannot answer.
 *
 * Renders a print test for the 37-glyph stitch-symbol set (§5.3) as a PDF at exact
 * physical size, so the marginal pairs — `C`/`G`, `E`/`F`, `P`/`R` — can finally be judged
 * on paper rather than on a screen at 9px.
 *
 *   npm run legibility:sheet         (after npm run validate:cap, which writes chart-data.json)
 *
 * **Why a PDF and not an HTML page.** Legibility here is a question about physical
 * millimetres, and "open it in a browser and hit print" leaves the scale at the mercy of
 * the print dialog's fit-to-page. Electron's printToPDF with `preferCSSPageSize` maps CSS
 * mm to PDF mm exactly, so as long as the sheet is printed at 100% / Actual Size the
 * glyphs are the size the app would chart them. Page 1 carries a 100mm ruler to check.
 *
 * **What scale matters.** Not the fabric's. A printed chart is read at whatever size the
 * grid lands on the page: a 72-cell Wesnoth sprite across A4's ~170mm printable width is
 * ~2.36mm per cell, which puts the glyph at ~0.72 × 2.36mm ≈ 4.8pt. That is where §5.3's
 * "legible at ~5pt" number actually comes from, and it is the scale to judge. The sheet
 * brackets it with 1.8mm (14-count Aida, i.e. stitched size — a deliberately unfair
 * worst case) up to 3.0mm (a chart printed across two pages).
 *
 * **Caveat this sheet cannot remove.** The PDF export (§5.5) does not exist yet, so this
 * renders through Chromium with the app's own font stack. It tests the glyph *shapes* at
 * print size, not the eventual embedded PDF font. If §5.5 later bundles a different face,
 * the marginal pairs are worth re-checking.
 */
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const REPO = resolve(import.meta.dirname, '..')
const OUT_DIR = resolve(REPO, 'out', 'legibility')
const DATA = resolve(OUT_DIR, 'chart-data.json')

const FONT = 'DejaVu Sans, Segoe UI Symbol, Arial, sans-serif'
const GLYPH_RATIO = 0.72 // matches src/renderer/src/pattern/draw.ts

/** Cell sizes to test, in mm, with what each corresponds to in the real world. */
const SCALES = [
  { mm: 1.81, label: '1.81 mm', note: '14-count Aida — the stitched size itself. Unfairly small.' },
  { mm: 2.12, label: '2.12 mm', note: 'a 80-cell chart across A4' },
  { mm: 2.36, label: '2.36 mm', note: 'a 72-cell sprite across A4 — the real case' },
  { mm: 3.0, label: '3.00 mm', note: 'a chart given more room' }
]

/** The pairs §5.3 flags as the marginal survivors, plus resolved pairs as controls. */
const PAIRS = [
  ['C', 'G', 'marginal (§5.3)'],
  ['E', 'F', 'marginal (§5.3)'],
  ['P', 'R', 'marginal (§5.3)'],
  ['●', '◆', 'control — solid blob rule'],
  ['○', '◇', 'control — outline'],
  ['+', '×', 'control — strokes'],
  ['#', '=', 'control — strokes'],
  ['◐', '●', 'control — half fill']
]

/** Deterministic PRNG, so the blind test and its answer key always agree. */
function rng(seed) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function glyphGrid(glyphs, cellMm, { numbered = false, startAt = 1 } = {}) {
  const cells = glyphs
    .map((g, i) => {
      const n = numbered ? `<span class="tick">${startAt + i}</span>` : ''
      return `<span class="cell" style="width:${cellMm}mm;height:${cellMm}mm;font-size:${(cellMm * GLYPH_RATIO).toFixed(3)}mm">${n}${esc(g)}</span>`
    })
    .join('')
  return `<div class="grid">${cells}</div>`
}

function chartBlock(chart, cellMm, title) {
  const rows = chart.rows
    .map(
      (row) =>
        `<div class="chartrow">${[...row]
          .map((ch) => `<span class="ccell">${ch === ' ' ? '' : esc(ch)}</span>`)
          .join('')}</div>`
    )
    .join('')
  return `
    <h3>${esc(title)}</h3>
    <p class="cap">${chart.width}×${chart.height} stitches · k = ${chart.k} floss colours · ${cellMm} mm cells.
       Read it as you would stitch it: can you tell every symbol apart, and follow a row without losing your place?</p>
    <div class="chart" style="--cell:${cellMm}mm;--glyph:${(cellMm * GLYPH_RATIO).toFixed(3)}mm">${rows}</div>`
}

function buildHtml(data) {
  const glyphs = data.symbols.map((s) => s.glyph)

  const scaleSections = SCALES.map(
    (s) => `
      <section class="scale">
        <h3>${s.label} cells <span class="note">${esc(s.note)}</span></h3>
        ${glyphGrid(glyphs, s.mm)}
      </section>`
  ).join('')

  const pairRows = PAIRS.map(([a, b, kind]) => {
    const at = (mm) =>
      `<span class="pairbox" style="--c:${mm}mm;--g:${(mm * GLYPH_RATIO).toFixed(3)}mm">` +
      `<span class="cell2">${esc(a)}</span><span class="cell2">${esc(b)}</span></span>`
    // Separated: the same two glyphs with three others between them, which is how a chart
    // actually presents them — you rarely get to compare side by side.
    const sep = (mm) => {
      const filler = ['▲', 'M', '□', 'w', '△']
      const seq = [a, ...filler.slice(0, 3), b]
      return `<span class="pairbox" style="--c:${mm}mm;--g:${(mm * GLYPH_RATIO).toFixed(3)}mm">${seq
        .map((g) => `<span class="cell2">${esc(g)}</span>`)
        .join('')}</span>`
    }
    return `<tr>
      <td class="pairname">${esc(a)} / ${esc(b)}<div class="kind">${esc(kind)}</div></td>
      <td>${at(1.81)}</td><td>${at(2.36)}</td><td>${at(3.0)}</td>
      <td>${sep(2.36)}</td>
      <td class="verdict"><span class="box"></span> same <span class="box"></span> distinct</td>
    </tr>`
  }).join('')

  // Blind identification: 12 glyphs at each of three scales, order fixed by seed.
  const pick = rng(20240720)
  const blind = [1.81, 2.36, 3.0].map((mm, block) => {
    const chosen = Array.from({ length: 12 }, () => glyphs[Math.floor(pick() * glyphs.length)])
    return { mm, chosen, startAt: block * 12 + 1 }
  })

  const blindSections = blind
    .map(
      (b) => `
      <section class="scale">
        <h3>${b.mm.toFixed(2)} mm cells — numbers ${b.startAt}–${b.startAt + 11}</h3>
        ${glyphGrid(b.chosen, b.mm, { numbered: true, startAt: b.startAt })}
        <div class="answers">${b.chosen
          .map((_, i) => `<span class="ans">${b.startAt + i}. <span class="rule"></span></span>`)
          .join('')}</div>
      </section>`
    )
    .join('')

  const key = blind
    .flatMap((b) => b.chosen.map((g, i) => `${b.startAt + i}. ${g}`))
    .map((s) => `<span class="keyitem">${esc(s)}</span>`)
    .join('')

  const legend = data.symbols
    .map((s) => `<span class="keyitem"><b>${esc(s.glyph)}</b> ${esc(s.name)}</span>`)
    .join('')

  return `<meta charset="utf-8">
<style>
  @page { size: A4; margin: 14mm 20mm; }
  html, body { margin: 0; padding: 0; }
  body { font: 10pt/1.45 Georgia, 'Times New Roman', serif; color: #000; background: #fff; }
  h1 { font-size: 16pt; margin: 0 0 2mm; }
  h2 { font-size: 12pt; margin: 6mm 0 2mm; border-bottom: 0.4pt solid #000; padding-bottom: 1mm; }
  h3 { font-size: 10pt; margin: 4mm 0 1.5mm; font-weight: 600; }
  p  { margin: 0 0 2.5mm; }
  .lead { font-size: 9.5pt; }
  .note, .cap, .kind { font-size: 8pt; color: #444; font-weight: 400; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }

  /* Calibration ruler */
  .ruler { position: relative; width: 100mm; height: 8mm; border: 0.4pt solid #000; border-top: none; }
  .ruler i { position: absolute; top: 0; width: 0; border-left: 0.4pt solid #000; height: 2.5mm; }
  .ruler i.major { height: 5mm; }
  .ruler b { position: absolute; top: 5mm; font: 6pt sans-serif; transform: translateX(-50%); }

  /* Glyph grids, drawn as a real chart grid would be */
  .grid { display: flex; flex-wrap: wrap; width: fit-content; border-top: 0.3pt solid #000; border-left: 0.3pt solid #000; }
  .cell { position: relative; display: flex; align-items: center; justify-content: center;
          border-right: 0.3pt solid #000; border-bottom: 0.3pt solid #000;
          font-family: ${FONT}; line-height: 1; }
  .tick { position: absolute; top: -2.6mm; left: 0; font: 4pt sans-serif; color: #666; }

  .pairbox { display: inline-flex; border-top: 0.3pt solid #000; border-left: 0.3pt solid #000; vertical-align: middle; }
  .cell2 { display: flex; align-items: center; justify-content: center; width: var(--c); height: var(--c);
           font-size: var(--g); font-family: ${FONT}; line-height: 1;
           border-right: 0.3pt solid #000; border-bottom: 0.3pt solid #000; }

  table { border-collapse: collapse; width: 100%; }
  td { padding: 1.5mm 2mm 1.5mm 0; vertical-align: middle; border-bottom: 0.2pt solid #bbb; }
  .pairname { font: 11pt ${FONT}; white-space: nowrap; }
  .verdict { font-size: 8pt; white-space: nowrap; }
  .box { display: inline-block; width: 3mm; height: 3mm; border: 0.4pt solid #000; vertical-align: -0.4mm; margin-left: 2mm; }

  .answers { display: flex; flex-wrap: wrap; gap: 1.5mm 4mm; margin-top: 2.5mm; }
  .ans { font: 8pt sans-serif; display: inline-flex; align-items: baseline; gap: 1mm; }
  .rule { display: inline-block; width: 14mm; border-bottom: 0.4pt solid #000; }

  /* Real chart, at true cell size */
  .chart { width: fit-content; border-top: 0.3pt solid #000; border-left: 0.3pt solid #000; }
  .chartrow { display: flex; }
  .chartrow:nth-child(10n) .ccell { border-bottom-width: 0.7pt; }
  .ccell { display: flex; align-items: center; justify-content: center;
           width: var(--cell); height: var(--cell); font-size: var(--glyph);
           font-family: ${FONT}; line-height: 1;
           border-right: 0.3pt solid #999; border-bottom: 0.3pt solid #999; }
  .ccell:nth-child(10n) { border-right-width: 0.7pt; border-right-color: #000; }

  .keys { display: flex; flex-wrap: wrap; gap: 1mm 4mm; }
  .keyitem { font: 9pt ${FONT}; white-space: nowrap; }
  .fontcheck { font: 8pt sans-serif; color: #444; margin-top: 3mm; }
</style>

<div class="page">
  <h1>Wesnoth Stitch — stitch-symbol legibility test (#20)</h1>
  <p class="lead">This sheet exists to answer one question the code cannot: <b>do all 37 chart symbols
  stay distinguishable when printed at the size a real chart is read at?</b> §5.3 flags three marginal
  pairs — <span style="font-family:${FONT}">C/G, E/F, P/R</span> — and notes that the rules behind the
  set were validated on a screen, never on paper. If a pair fails here, that glyph is removed and the
  colour cap <code>MAX_COLOUR_COUNT</code> drops by one: the two numbers are the same number.</p>

  <h2>1 · Check the scale before you read anything</h2>
  <p>Print at <b>100% / Actual Size</b>, not "fit to page". Then measure the bar below. It must be
  exactly 100 mm. If it is not, the print was scaled and every judgement on the following pages is void.</p>
  <div class="ruler">
    ${Array.from({ length: 101 }, (_, i) => {
      const major = i % 10 === 0
      return (
        `<i class="${major ? 'major' : ''}" style="left:${i}mm"></i>` +
        (major ? `<b style="left:${i}mm">${i}</b>` : '')
      )
    }).join('')}
  </div>
  <p style="margin-top:7mm"><b>Measured length: <span class="rule" style="width:24mm"></span> mm</b></p>

  <h2>2 · What scale is being tested, and why</h2>
  <p>Not the fabric's. A chart is read at whatever size its grid lands on the page. A 72-cell Wesnoth
  sprite printed across A4's ~170 mm of printable width gives cells of about <b>2.36 mm</b>, which puts
  each glyph at roughly <b>4.8 pt</b> — that is where §5.3's "legible at ~5 pt" comes from, and it is the
  row to judge. The sheet brackets it: 1.81 mm is the stitched size on 14-count Aida (deliberately unfair),
  3.00 mm is a chart given more room.</p>

  <h2>3 · How to record your answers</h2>
  <p>Page 2 is a reference — just look. Page 3 is the drill: for each pair, tick <i>distinct</i> only if you
  can tell them apart <i>without</i> comparing them side by side. Page 4 is a blind test: write what you see,
  and do not turn to the key on page 6 until you are done. Page 5 is two real charts.</p>

  <p class="fontcheck">Rendered through Chromium with the app's font stack
  (<code>${esc(FONT)}</code>). The PDF export (§5.5) does not exist yet, so this tests glyph
  <i>shapes</i> at print size, not the eventual embedded font. Resolved font is reported at the foot of page 6.</p>
</div>

<div class="page">
  <h2>Page 2 · The whole set, at four scales</h2>
  <p class="cap">All 37 glyphs, in chart order (most distinctive first — a low-colour chart only ever spends
  the top of this list). Glyph height is 0.72 × the cell, exactly as the app draws it.</p>
  ${scaleSections}
</div>

<div class="page">
  <h2>Page 3 · The confusion drill</h2>
  <p class="cap">Three marginal pairs and five controls the design already resolved. The fifth column is the
  honest test: the same two glyphs with three others between them, which is how a chart presents them.</p>
  <table>
    <tr><td class="pairname" style="border:none"></td>
        <td class="note">1.81 mm</td><td class="note">2.36 mm</td><td class="note">3.00 mm</td>
        <td class="note">separated, 2.36 mm</td><td class="note">at 2.36 mm, verdict</td></tr>
    ${pairRows}
  </table>
  <p style="margin-top:5mm" class="cap">If any of <b>C/G</b>, <b>E/F</b>, <b>P/R</b> reads <i>same</i>, name it here —
  each one removed lowers the colour cap from 37 by one:</p>
  <p><span class="rule" style="width:120mm"></span></p>
</div>

<div class="page">
  <h2>Page 4 · Blind identification</h2>
  <p class="cap">Write the glyph you see (draw it, or name it: "solid circle", "capital G"). Do not look at the
  key on page 6 first. Errors here matter more than the drill above — this is the task a stitcher actually performs.</p>
  ${blindSections}
</div>

<div class="page">
  <h2>Page 5 · Two real charts, at the true printed scale</h2>
  ${chartBlock(data.scout, 2.36, 'Dwarvish scout, k = 20 — a typical sprite, comfortably under the cap')}
  <div style="page-break-before: always"></div>
  <h2>Page 5b · The hard case</h2>
  ${chartBlock(data.citizen, 2.36, `Merfolk citizen, k = ${data.citizen.k} — the richest sprite in the checkout (94 distinct floss, reduced to the cap)`)}
</div>

<div class="page">
  <h2>Page 6 · Answer key — do not read before page 4</h2>
  <div class="keys">${key}</div>
  <h2>The full set, named</h2>
  <div class="keys">${legend}</div>
  <p class="fontcheck">Resolved font: <span id="resolved"></span></p>
  <script>
    // Which face actually rendered matters: the set was chosen for coverage, not for one font.
    const faces = ['DejaVu Sans', 'Segoe UI Symbol', 'Arial']
    const have = faces.filter(f => document.fonts.check('12px "' + f + '"'))
    document.getElementById('resolved').textContent =
      (have.length ? have.join(', ') : 'none of the preferred faces') + ' available; first available wins.'
  </script>
</div>`
}

app.whenReady().then(async () => {
  let data
  try {
    data = JSON.parse(readFileSync(DATA, 'utf8'))
  } catch {
    console.error(`Missing ${DATA}. Run: npm run validate:cap`)
    app.exit(2)
    return
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const htmlPath = resolve(OUT_DIR, 'glyph-legibility-test.html')
  writeFileSync(htmlPath, buildHtml(data))

  const win = new BrowserWindow({ show: false, width: 900, height: 1200 })
  await win.loadFile(htmlPath)
  // Let the font stack settle before the page is rasterised into the PDF.
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')

  const pdf = await win.webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: true, // honour @page { size: A4 } → CSS mm map to PDF mm exactly
    scale: 1
  })
  const pdfPath = resolve(OUT_DIR, 'glyph-legibility-test.pdf')
  writeFileSync(pdfPath, pdf)
  console.log(`Wrote ${pdfPath} (${(pdf.length / 1024).toFixed(0)} KB)`)
  console.log(`      ${htmlPath}`)
  app.exit(0)
})
