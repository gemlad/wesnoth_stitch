/**
 * The whole chart PDF (§5.5) — cover, floss key, then the tiled chart pages.
 *
 * This is the seam #36 hangs the IPC channel off: one call, bytes out, no PDF knowledge
 * needed on the other side of the process boundary. It is also the seam the UAT script
 * (`npm run uat:chart`) drives, which matters — #28's verdict has to be taken against the
 * artefact the app actually produces, not a lookalike assembled by a test harness.
 *
 * **The font arrives as bytes, and that is deliberate.** It would read better to have this
 * module just call `loadExportFont()` itself. It cannot: that resolves the font through an
 * `?asset` import, which only electron-vite understands. Under plain-Node vitest the
 * specifier survives into the *path* — you get `…/DejaVuSans.ttf?asset`, an ENOENT, and a
 * module that can be built but never tested or scripted. Since the export is precisely the
 * thing that must be verifiable outside Electron (that is the whole argument for `pdf-lib`
 * over `printToPDF` in §3), the Electron-specific bit stays at the edge: `font.ts` resolves
 * the asset, everything below here takes bytes.
 */
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument } from 'pdf-lib'
import type { PatternSettings } from '../../shared/ipc'
import type { QuantizedPalette, StitchPattern } from '../../shared/pipeline'
import { drawChartPages, type ChartOptions } from './pdf-chart'
import { drawCoverPage, drawKeyPages, type ChartMeta } from './pdf-key'

export type { ChartMeta } from './pdf-key'

export interface PdfExportOptions extends PatternSettings {
  /** The export face (#32). Callers in Electron get these from `loadExportFont()`. */
  fontBytes: Uint8Array
  /** Physical cell size, mm. Defaults to §5.3's reference scale (~2.36mm). */
  cellMm?: number
}

/**
 * Build the printable chart.
 *
 * Page order is cover → key → chart, which is the order you use them in: decide whether to
 * stitch it, buy the floss, then sew.
 *
 * @throws RangeError if the palette holds more colours than the symbol set can name, or a
 * cell indexes a colour that is not in the palette. Both are pipeline bugs, and both would
 * otherwise produce a chart that looks right and is not.
 */
export async function buildChartPdf(
  pattern: StitchPattern,
  palette: QuantizedPalette,
  meta: ChartMeta,
  options: PdfExportOptions
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(options.fontBytes, { subset: true })

  pdf.setTitle(meta.title)
  pdf.setCreator('Wesnoth Stitch')

  drawCoverPage(pdf, meta, palette, font)
  drawKeyPages(pdf, palette, font)

  const chart: ChartOptions = {
    backgroundColour: options.backgroundColour,
    symbolDisplay: options.symbolDisplay,
    ...(options.cellMm === undefined ? {} : { cellMm: options.cellMm })
  }
  drawChartPages(pdf, pattern, palette, font, chart)

  return pdf.save()
}
