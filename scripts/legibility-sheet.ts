/**
 * The print test for the stitch-symbol set (#28, §5.3) — the half a script cannot answer.
 *
 *   npm run uat:legibility                    # A4
 *   npm run uat:legibility -- --letter        # US Letter paper
 *   npm run uat:legibility -- --scale=1.064   # pre-compensate a printer that shrinks
 *
 * **Rewritten to use pdf-lib (was Chromium `printToPDF`).** The old sheet laid out in CSS
 * millimetres and asked Electron to turn that into a PDF, which meant two things it could not
 * fix: it rendered through the *system* font stack rather than the face the export embeds, and
 * its physical scale was only as trustworthy as Chromium's print path. This version draws
 * straight into PDF points with the same helpers and the same embedded DejaVu the real chart
 * uses (§5.5), so a cell here is the same object as a cell there — and `uat/chart-symbol.pdf`
 * and this sheet can no longer disagree about what 2.36 mm looks like.
 *
 * **On the 100 mm bar printing short.** The page geometry in this file is exact; if the
 * calibration bar measures under 100 mm, something between the PDF and the paper rescaled it.
 * By far the most common cause is a **paper-size mismatch** — an A4 page fitted onto US Letter
 * shrinks by `min(216/210, 279/297) = 93.9%`, which lands a 100 mm bar at ~94 mm. Hence
 * `--letter`. `--scale` is the fallback for anything else: measure the bar, pass
 * `100 / measured`, and the content is drawn that much larger so it *prints* at true size. The
 * layout keeps enough margin slack to absorb ~8% of that without clipping.
 */
import fontkit from '@pdf-lib/fontkit'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { PNG } from 'pngjs'
import {
  DEFAULT_ASSIGNMENT_STRATEGY,
  MAX_COLOUR_COUNT,
  STITCH_SYMBOLS,
  mapSpriteToDmc,
  planReduction,
  reduceTo,
  symbolsFor
} from '../src/shared/pipeline'
import type { DecodedImage } from '../src/shared/ipc'

const REPO = process.env.REPO_ROOT ?? resolve(import.meta.dirname, '..')
const SPRITE_ROOT = resolve(REPO, 'wesnoth-sprites', 'units')
const FONT_PATH = resolve(REPO, 'resources', 'fonts', 'DejaVuSans.ttf')
const UAT_DIR = resolve(REPO, 'uat')

const MM_PER_IN = 25.4
const PT_PER_IN = 72
const rawPt = (mm: number): number => (mm * PT_PER_IN) / MM_PER_IN

/** Glyph height as a fraction of the cell — the same 0.72 the chart and preview use. */
const GLYPH_SCALE = 0.72

const INK = rgb(0, 0, 0)
const MUTED = rgb(0.35, 0.35, 0.35)
const HAIR = rgb(0.6, 0.6, 0.6)

/**
 * Chart gridline weights — deliberately identical to `pdf-chart.ts`, because the whole point
 * of this rewrite is that a chart on this sheet and a chart from the export are the same
 * object. Every 10th line is heavy: the convention every commercial chart uses to count by.
 */
const CHART_MAJOR_EVERY = 10
const CHART_MINOR_PT = 0.2
const CHART_MAJOR_PT = 0.7

/** The scale that matters: a 72-cell sprite across A4's printable width. */
const REFERENCE_CELL_MM = 2.361
const SCALES: { mm: number; note: string }[] = [
  { mm: 1.81, note: '14-count Aida — the stitched size itself. Deliberately unfair.' },
  { mm: 2.12, note: 'an 80-cell chart across the page' },
  { mm: REFERENCE_CELL_MM, note: 'a 72-cell sprite across the page — THE REAL CASE' },
  { mm: 3.0, note: 'a chart given more room' }
]

/**
 * Pairs to judge. The three original marginal letters, plus every collision the widened set
 * (#30/D3) was suspected of introducing — the card suits against the geometrics they echo, the
 * crosshatch square against the solid and open ones, and the restored digits against their
 * nearest letters. Controls the design already resolved are mixed in unlabelled-as-such so the
 * eye is not primed.
 *
 * **Outcome of the print test (#28, 2026-07-23):** every letter pair and digit passed. The
 * two casualties were ♦ vs ◆ (kept ♦, dropped ◆) and the crosshatch ▦ vs ■/□ (dropped ▦).
 * ♠ vs ▲ passed, contrary to the guess. The dropped glyphs are kept in the pair list below so
 * the sheet still shows *why* they went, but neither is in `STITCH_SYMBOLS` any more.
 */
const PAIRS: [string, string, string][] = [
  ['C', 'G', 'marginal (§5.3) — passed'],
  ['E', 'F', 'marginal (§5.3) — passed'],
  ['P', 'R', 'marginal (§5.3) — passed'],
  ['♦', '◆', 'DROPPED ◆ — indistinct, kept ♦'],
  ['♠', '▲', 'passed — both kept'],
  ['▦', '■', 'DROPPED ▦ — fill vs solid'],
  ['▦', '□', 'DROPPED ▦ — fill vs outline'],
  ['†', '‡', 'print marks — passed'],
  ['§', '¶', 'print marks — passed'],
  ['♣', '♠', 'suits — passed'],
  ['3', 'B', 'digit vs letter — passed'],
  ['7', 'T', 'digit vs letter — passed'],
  ['4', 'A', 'digit vs letter — passed'],
  ['●', '◆', 'control'],
  ['○', '◇', 'control'],
  ['+', '×', 'control'],
  ['◐', '●', 'control']
]

// ---------------------------------------------------------------------------
// CLI

const argv = process.argv.slice(2)
const wantsLetter = argv.includes('--letter')
const scaleArg = argv.find((a) => a.startsWith('--scale='))
const SCALE = scaleArg ? Number(scaleArg.split('=')[1]) : 1
if (!Number.isFinite(SCALE) || SCALE <= 0) {
  console.error(`--scale must be a positive number, got ${scaleArg}`)
  process.exit(2)
}

const PAPER = wantsLetter
  ? { name: 'US Letter', w: 215.9, h: 279.4 }
  : { name: 'A4', w: 210, h: 297 }
const MARGIN = 18

// ---------------------------------------------------------------------------
// A tiny top-origin, millimetre-first drawing surface over pdf-lib.

class Sheet {
  readonly pdf: PDFDocument
  readonly font: PDFFont
  private readonly cx: number
  private readonly cy: number
  page!: PDFPage

  constructor(pdf: PDFDocument, font: PDFFont) {
    this.pdf = pdf
    this.font = font
    this.cx = rawPt(PAPER.w) / 2
    this.cy = rawPt(PAPER.h) / 2
  }

  /** A new page at the true paper size. Content is scaled about the page centre (see --scale). */
  newPage(): PDFPage {
    this.page = this.pdf.addPage([rawPt(PAPER.w), rawPt(PAPER.h)])
    return this.page
  }

  /** Horizontal mm (from the left edge) → PDF points. */
  X(mm: number): number {
    return this.cx + (rawPt(mm) - this.cx) * SCALE
  }

  /** Vertical mm **measured down from the top edge** → PDF points (which count up). */
  Y(mm: number): number {
    return this.cy + (rawPt(PAPER.h - mm) - this.cy) * SCALE
  }

  /** A length in mm → points. */
  L(mm: number): number {
    return rawPt(mm) * SCALE
  }

  /** Point sizes scale too, or text would not match the geometry it labels. */
  pt(size: number): number {
    return size * SCALE
  }

  /** How wide a string renders, back in millimetres — for right-aligning labels. */
  textWidthMm(s: string, sizePt: number): number {
    return (this.font.widthOfTextAtSize(s, sizePt) * MM_PER_IN) / PT_PER_IN
  }

  text(s: string, xMm: number, baselineMm: number, sizePt: number, color = INK): void {
    this.page.drawText(s, {
      x: this.X(xMm),
      y: this.Y(baselineMm),
      size: this.pt(sizePt),
      font: this.font,
      color
    })
  }

  /** Word-wrapped paragraph. Returns the y (mm from top) just past the last line. */
  para(
    s: string,
    xMm: number,
    topMm: number,
    widthMm: number,
    sizePt: number,
    color = MUTED,
    leading = 1.45
  ): number {
    const maxW = rawPt(widthMm)
    const words = s.split(/\s+/)
    let line = ''
    let y = topMm + sizePt * 0.352778 // first baseline sits one cap-height down
    const lineMm = sizePt * 0.352778 * leading
    for (const w of words) {
      const test = line ? line + ' ' + w : w
      if (this.font.widthOfTextAtSize(test, sizePt) > maxW && line) {
        this.text(line, xMm, y, sizePt, color)
        line = w
        y += lineMm
      } else {
        line = test
      }
    }
    if (line) this.text(line, xMm, y, sizePt, color)
    return y + lineMm * 0.4
  }

  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    thickness = 0.4,
    color = INK,
    opacity = 1
  ): void {
    this.page.drawLine({
      start: { x: this.X(x1), y: this.Y(y1) },
      end: { x: this.X(x2), y: this.Y(y2) },
      thickness: this.pt(thickness),
      color,
      opacity
    })
  }

  rect(
    xMm: number,
    topMm: number,
    wMm: number,
    hMm: number,
    opts: { border?: number; borderColor?: typeof INK; fill?: typeof INK } = {}
  ): void {
    this.page.drawRectangle({
      x: this.X(xMm),
      y: this.Y(topMm + hMm),
      width: this.L(wMm),
      height: this.L(hMm),
      borderWidth: opts.border === undefined ? undefined : this.pt(opts.border),
      borderColor: opts.borderColor ?? (opts.border ? HAIR : undefined),
      color: opts.fill
    })
  }

  /**
   * One chart cell: optional hairline box, glyph centred exactly as `pdf-chart.ts` centres
   * it — on the cap-height box, not the baseline, or every glyph sits low in its cell.
   */
  glyphCell(glyph: string, xMm: number, topMm: number, cellMm: number, boxed = true): void {
    if (boxed) this.rect(xMm, topMm, cellMm, cellMm, { border: 0.25, borderColor: HAIR })
    if (!glyph || glyph === ' ') return
    const cellPt = this.L(cellMm)
    const glyphPt = cellPt * GLYPH_SCALE
    const w = this.font.widthOfTextAtSize(glyph, glyphPt)
    const h = this.font.heightAtSize(glyphPt, { descender: false })
    this.page.drawText(glyph, {
      x: this.X(xMm) + (cellPt - w) / 2,
      y: this.Y(topMm + cellMm) + (cellPt - h) / 2,
      size: glyphPt,
      font: this.font,
      color: INK
    })
  }

  /** A row of cells starting at `xMm`. Returns the width used, in mm. */
  glyphRow(glyphs: readonly string[], xMm: number, topMm: number, cellMm: number): number {
    glyphs.forEach((g, i) => this.glyphCell(g, xMm + i * cellMm, topMm, cellMm))
    return glyphs.length * cellMm
  }

  /** An underline to write an answer on. */
  answerRule(xMm: number, baselineMm: number, widthMm: number): void {
    this.line(xMm, baselineMm + 1, xMm + widthMm, baselineMm + 1, 0.3, MUTED)
  }
}

// ---------------------------------------------------------------------------
// Real charts, through the real pipeline and the real assignment rule.

const decode = (absPath: string): DecodedImage => {
  const png = PNG.sync.read(readFileSync(absPath))
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) }
}

interface Chart {
  id: string
  width: number
  height: number
  k: number
  sourceColourCount: number
  rows: string[]
}

function chartOf(relPath: string, k: number): Chart {
  const base = mapSpriteToDmc(decode(resolve(SPRITE_ROOT, relPath)))
  const reduced = reduceTo(planReduction(base), Math.min(k, base.palette.colours.length))
  const glyphs = symbolsFor(reduced.palette).map((s) => s.glyph)
  return {
    id: relPath,
    width: reduced.pattern.width,
    height: reduced.pattern.height,
    k: reduced.palette.colourCount,
    sourceColourCount: reduced.palette.sourceColourCount,
    rows: reduced.pattern.cells.map((row) => row.map((c) => (c === null ? ' ' : glyphs[c])).join(''))
  }
}

/** Deterministic PRNG, so the blind test and its key always agree. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000
}

// ---------------------------------------------------------------------------

async function build(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(readFileSync(FONT_PATH), { subset: false })
  const s = new Sheet(pdf, font)

  const glyphs = STITCH_SYMBOLS.map((g) => g.glyph)
  const contentW = PAPER.w - 2 * MARGIN
  const today = new Date().toISOString().slice(0, 10)

  // ---- Page 1 — calibrate ----------------------------------------------------
  s.newPage()
  let y = MARGIN + 4
  s.text('Stitch-symbol legibility test', MARGIN, y, 17)
  y += 6
  s.text(
    `${MAX_COLOUR_COUNT} glyphs · ${DEFAULT_ASSIGNMENT_STRATEGY} assignment · ${PAPER.name}` +
      (SCALE !== 1 ? ` · pre-scaled ×${SCALE.toFixed(4)}` : '') +
      ` · ${today}`,
    MARGIN,
    y,
    8.5,
    MUTED
  )
  y += 8

  s.text('1 · Check the scale before you read anything', MARGIN, y, 11.5)
  y += 4
  y = s.para(
    'Print at 100% / Actual Size — not "fit to page", not "shrink oversized pages". Then measure ' +
      'the bar below with a ruler. It must be exactly 100 mm. If it is not, the print was rescaled ' +
      'and every judgement on the following pages is void, because this whole test is an argument ' +
      'about physical millimetres.',
    MARGIN,
    y,
    contentW,
    9
  )
  y += 3

  // 100 mm ruler
  const rulerTop = y
  s.line(MARGIN, rulerTop, MARGIN + 100, rulerTop, 0.5)
  for (let i = 0; i <= 100; i++) {
    const major = i % 10 === 0
    const mid = i % 5 === 0
    if (!major && !mid) continue
    const len = major ? 4.5 : 2.5
    s.line(MARGIN + i, rulerTop, MARGIN + i, rulerTop + len, major ? 0.5 : 0.3)
    if (major) s.text(String(i), MARGIN + i - (i === 0 ? 0 : i === 100 ? 4 : 2), rulerTop + 8, 6.5, MUTED)
  }
  y = rulerTop + 12
  s.text('↑ this must measure exactly 100 mm.    Measured:', MARGIN, y, 9)
  s.answerRule(MARGIN + 62, y, 22)
  s.text('mm', MARGIN + 86, y, 9)
  y += 7

  // 50mm cross-check
  s.line(MARGIN, y, MARGIN + 50, y, 0.5)
  for (let i = 0; i <= 50; i += 10) s.line(MARGIN + i, y, MARGIN + i, y + 3, 0.4)
  s.text('and this one, 50 mm (a cross-check against a mis-set ruler).', MARGIN + 54, y + 2.5, 8, MUTED)
  y += 9

  s.text('2 · If the bar is short — the usual cause, and the fix', MARGIN, y, 11.5)
  y += 4
  y = s.para(
    `This PDF is ${PAPER.name}. If your printer is loaded with (or set to) a different paper size, ` +
      'the viewer silently fits the page to the paper even on "Actual Size". Fitting A4 onto US ' +
      'Letter shrinks everything to 93.9%, which lands this bar at about 94 mm — the single most ' +
      'likely explanation for a short bar.',
    MARGIN,
    y,
    contentW,
    9
  )
  y += 1
  y = s.para(
    'Fix 1, preferred — regenerate at your actual paper size:   npm run uat:legibility -- --letter',
    MARGIN,
    y,
    contentW,
    9,
    INK
  )
  y = s.para(
    'Fix 2, fallback — pre-compensate for whatever the scaling is. Divide 100 by the length you ' +
      'measured and pass it back. Measured 94 mm? Run:   npm run uat:legibility -- --scale=1.0638   ' +
      'Then print again and re-measure: the bar should now be 100 mm.',
    MARGIN,
    y,
    contentW,
    9
  )
  y += 4

  s.text('3 · The scale that actually matters', MARGIN, y, 11.5)
  y += 4
  y = s.para(
    `Not the fabric's. A chart is read at whatever size its grid lands on the page: a 72-cell ` +
      `Wesnoth sprite across this page's printable width gives cells of about ` +
      `${REFERENCE_CELL_MM.toFixed(2)} mm, putting each glyph at roughly 4.8 pt. That is the row to ` +
      'judge on page 2, and the size the real charts on pages 5–6 are drawn at. The sheet brackets ' +
      'it either side so you can see which way it fails.',
    MARGIN,
    y,
    contentW,
    9
  )
  y += 4

  s.text('4 · How to record your answers', MARGIN, y, 11.5)
  y += 4
  s.para(
    'Page 2 is a reference — just look. Page 3 is the drill: tick "same" only if you cannot tell ' +
      'the pair apart without comparing them side by side. Page 4 is a blind test — write what you ' +
      'see and do not turn to the key on page 7 until you are done. Pages 5–6 are real charts. ' +
      'Anything that reads as the same glyph gets removed from the set, and the colour cap drops ' +
      'by one for each: the two numbers are the same number.',
    MARGIN,
    y,
    contentW,
    9
  )

  // ---- Page 2 — the whole set at four scales ---------------------------------
  s.newPage()
  y = MARGIN + 4
  s.text(`Page 2 · All ${MAX_COLOUR_COUNT} glyphs, at four cell sizes`, MARGIN, y, 13)
  y += 5
  y = s.para(
    'In chart order (most distinctive first). Glyph height is 0.72 × the cell, exactly as the app ' +
      'draws it. Look for any glyph that stops being itself as the cells shrink.',
    MARGIN,
    y,
    contentW,
    8.5
  )
  y += 3

  for (const sc of SCALES) {
    const isReal = sc.mm === REFERENCE_CELL_MM
    s.text(`${sc.mm.toFixed(2)} mm`, MARGIN, y, 9.5, isReal ? INK : MUTED)
    s.text(sc.note, MARGIN + 20, y, 8, MUTED)
    y += 2.5
    // 47 cells at 3mm = 141mm, inside the 174mm content width: one row per scale.
    s.glyphRow(glyphs, MARGIN, y, sc.mm)
    y += sc.mm + 7
  }

  y += 2
  s.text('The same set again, in one block, to judge as a field:', MARGIN, y, 9)
  y += 3
  {
    const cell = REFERENCE_CELL_MM
    const perRow = Math.floor(contentW / cell)
    let i = 0
    let ry = y
    while (i < glyphs.length) {
      const slice = glyphs.slice(i, i + perRow)
      s.glyphRow(slice, MARGIN, ry, cell)
      ry += cell
      i += perRow
    }
    y = ry + 6
  }
  s.para(
    'If that block reads as texture rather than as symbols, the set is too large or too subtle — ' +
      'which is a finding in itself, and belongs on #30 rather than #28.',
    MARGIN,
    y,
    contentW,
    8.5
  )

  // ---- Page 3 — the confusion drill ------------------------------------------
  s.newPage()
  y = MARGIN + 4
  s.text('Page 3 · The confusion drill', MARGIN, y, 13)
  y += 5
  y = s.para(
    'Each pair adjacent at three sizes, then separated by three other glyphs — which is how a chart ' +
      'actually presents them; you rarely get to compare side by side. Tick "same" only if you ' +
      'cannot reliably tell them apart at 2.36 mm.',
    MARGIN,
    y,
    contentW,
    8.5
  )
  y += 3

  // column layout
  const cLabel = MARGIN
  const c181 = MARGIN + 30
  const c236 = c181 + 12
  const c300 = c236 + 14
  const cSep = c300 + 17
  const cVerdict = cSep + 22
  s.text('pair', cLabel, y, 7.5, MUTED)
  s.text('1.81', c181, y, 7.5, MUTED)
  s.text('2.36', c236, y, 7.5, MUTED)
  s.text('3.00', c300, y, 7.5, MUTED)
  s.text('separated, 2.36', cSep, y, 7.5, MUTED)
  s.text('verdict at 2.36', cVerdict, y, 7.5, MUTED)
  y += 2

  const filler = ['▲', 'M', '□']
  for (const [a, b, kind] of PAIRS) {
    const rowH = 7.6
    s.line(MARGIN, y, MARGIN + contentW, y, 0.2, HAIR)
    const cellTop = y + 1.4
    s.text(`${a} / ${b}`, cLabel, cellTop + 3, 10)
    s.text(kind, cLabel, cellTop + 6.2, 6, MUTED)
    s.glyphRow([a, b], c181, cellTop, 1.81)
    s.glyphRow([a, b], c236, cellTop, 2.36)
    s.glyphRow([a, b], c300, cellTop, 3.0)
    s.glyphRow([a, ...filler, b], cSep, cellTop, 2.36)
    // verdict boxes
    s.rect(cVerdict, cellTop + 0.6, 3, 3, { border: 0.4, borderColor: INK })
    s.text('same', cVerdict + 4, cellTop + 3.2, 8)
    s.rect(cVerdict + 17, cellTop + 0.6, 3, 3, { border: 0.4, borderColor: INK })
    s.text('distinct', cVerdict + 21, cellTop + 3.2, 8)
    y += rowH
  }
  s.line(MARGIN, y, MARGIN + contentW, y, 0.2, HAIR)
  y += 5
  s.para(
    'Any pair you ticked "same": name it here. Each glyph removed lowers the colour cap by one.',
    MARGIN,
    y,
    contentW,
    8.5
  )
  y += 6
  s.answerRule(MARGIN, y, contentW)
  y += 6
  s.answerRule(MARGIN, y, contentW)

  // ---- Page 4 — blind identification -----------------------------------------
  s.newPage()
  y = MARGIN + 4
  s.text('Page 4 · Blind identification', MARGIN, y, 13)
  y += 5
  y = s.para(
    'Write the glyph you see — draw it, or name it ("solid circle", "capital G"). Do not look at ' +
      'the key on page 7 first. Errors here matter more than the drill above: this is the task a ' +
      'stitcher actually performs.',
    MARGIN,
    y,
    contentW,
    8.5
  )
  y += 3

  const pick = rng(20260721)
  const blind: { mm: number; chosen: string[]; startAt: number }[] = [1.81, 2.36, 3.0].map(
    (mm, block) => ({
      mm,
      chosen: Array.from({ length: 12 }, () => glyphs[Math.floor(pick() * glyphs.length)]),
      startAt: block * 12 + 1
    })
  )

  for (const b of blind) {
    s.text(`${b.mm.toFixed(2)} mm cells — numbers ${b.startAt}–${b.startAt + 11}`, MARGIN, y, 9.5)
    y += 3
    // numbered cells, generously spaced so the number is not mistaken for the glyph
    const pitch = 13
    b.chosen.forEach((g, i) => {
      const x = MARGIN + i * pitch
      s.text(String(b.startAt + i), x, y - 0.5, 6, MUTED)
      s.glyphCell(g, x, y, b.mm)
    })
    y += Math.max(b.mm, 4) + 5
    // answer lines
    for (let i = 0; i < 12; i++) {
      const x = MARGIN + i * pitch
      s.text(String(b.startAt + i) + '.', x, y, 7, MUTED)
      s.answerRule(x + 4, y, 8)
    }
    y += 9
  }

  // ---- Pages 5 & 6 — real charts ---------------------------------------------
  const charts = [
    { chart: chartOf('dwarves/scout.png', 20), blurb: 'A typical sprite, comfortably under the cap.' },
    {
      chart: chartOf('merfolk/citizen.png', MAX_COLOUR_COUNT),
      blurb: 'The richest sprite in the checkout — reduced to the cap. This is the hard case.'
    }
  ]

  for (const { chart, blurb } of charts) {
    s.newPage()
    y = MARGIN + 4
    s.text(`Real chart · ${chart.id}`, MARGIN, y, 13)
    y += 5
    y = s.para(
      `${chart.width}×${chart.height} stitches · k = ${chart.k} floss` +
        (chart.sourceColourCount > chart.k ? ` (reduced from ${chart.sourceColourCount})` : '') +
        ` · ${REFERENCE_CELL_MM.toFixed(2)} mm cells · ${DEFAULT_ASSIGNMENT_STRATEGY} assignment. ` +
        blurb +
        ' Read it as you would stitch it: can you follow a row without losing your place, and can ' +
        'you tell every symbol apart?',
      MARGIN,
      y,
      contentW,
      8.5
    )
    y += 2

    const cell = Math.min(REFERENCE_CELL_MM, contentW / chart.width)
    const top = y
    for (let r = 0; r < chart.height; r++) {
      const row = chart.rows[r]
      for (let c = 0; c < chart.width; c++) {
        const g = row.charAt(c)
        if (g !== ' ') s.glyphCell(g, MARGIN + c * cell, top + r * cell, cell, false)
      }
    }
    // The cell grid — **every** line, not just the tens. In symbol-only mode the grid is the
    // only thing separating one stitch from the next (§5.4), so a chart without it is not the
    // thing being judged. Same weights, colour and opacity as pdf-chart.ts, so the sheet's
    // chart and the exported chart are the same object.
    for (let c = 0; c <= chart.width; c++) {
      const t = c % CHART_MAJOR_EVERY === 0 ? CHART_MAJOR_PT : CHART_MINOR_PT
      s.line(MARGIN + c * cell, top, MARGIN + c * cell, top + chart.height * cell, t, INK, 0.6)
    }
    for (let r = 0; r <= chart.height; r++) {
      const t = r % CHART_MAJOR_EVERY === 0 ? CHART_MAJOR_PT : CHART_MINOR_PT
      s.line(MARGIN, top + r * cell, MARGIN + chart.width * cell, top + r * cell, t, INK, 0.6)
    }

    // Row/column rulers on the tens, as the exported chart carries — they are how you find
    // your place, and their absence would change what you are judging.
    for (let c = 0; c < chart.width; c += CHART_MAJOR_EVERY) {
      s.text(String(c), MARGIN + c * cell + 0.4, top - 1.2, 5.5, MUTED)
    }
    for (let r = 0; r < chart.height; r += CHART_MAJOR_EVERY) {
      const label = String(r)
      s.text(label, MARGIN - s.textWidthMm(label, 5.5) - 1, top + r * cell + 1.6, 5.5, MUTED)
    }
  }

  // ---- Page 7 — key -----------------------------------------------------------
  s.newPage()
  y = MARGIN + 4
  s.text('Page 7 · Answer key — do not read before page 4', MARGIN, y, 13)
  y += 6
  for (const b of blind) {
    s.text(`${b.mm.toFixed(2)} mm`, MARGIN, y, 9)
    b.chosen.forEach((g, i) => {
      const x = MARGIN + 18 + i * 13
      s.text(`${b.startAt + i}.`, x, y, 7, MUTED)
      s.text(g, x + 5.5, y, 9)
    })
    y += 7
  }
  y += 4
  s.text(`The full set, named (${MAX_COLOUR_COUNT} glyphs)`, MARGIN, y, 11.5)
  y += 5
  {
    const colW = contentW / 3
    const perCol = Math.ceil(STITCH_SYMBOLS.length / 3)
    STITCH_SYMBOLS.forEach((sym, i) => {
      const col = Math.floor(i / perCol)
      const row = i % perCol
      const x = MARGIN + col * colW
      const ry = y + row * 4.6
      s.text(sym.glyph, x, ry, 9)
      s.text(sym.name, x + 6, ry, 7.5, MUTED)
    })
    y += perCol * 4.6 + 6
  }
  s.para(
    `Generated ${today} · ${PAPER.name}` +
      (SCALE !== 1 ? ` · content pre-scaled ×${SCALE.toFixed(4)}` : '') +
      ' · glyphs drawn in the bundled DejaVu Sans, the same face the exported chart embeds, at the ' +
      'same 0.72 × cell height. Regenerate with npm run uat:legibility.',
    MARGIN,
    y,
    contentW,
    8
  )

  return pdf.save()
}

const bytes = await build()
mkdirSync(UAT_DIR, { recursive: true })
const suffix = (wantsLetter ? '-letter' : '') + (SCALE !== 1 ? `-scale${SCALE.toFixed(4)}` : '')
const outPath = resolve(UAT_DIR, `glyph-legibility-test${suffix}.pdf`)
writeFileSync(outPath, bytes)
process.stdout.write(
  `Wrote ${outPath} (${(bytes.length / 1024).toFixed(0)} KB)\n` +
    `  paper ${PAPER.name} ${PAPER.w}×${PAPER.h} mm · ${MAX_COLOUR_COUNT} glyphs · ` +
    `${DEFAULT_ASSIGNMENT_STRATEGY} assignment${SCALE !== 1 ? ` · pre-scaled ×${SCALE}` : ''}\n`
)
