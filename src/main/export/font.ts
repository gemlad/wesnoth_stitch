/**
 * The chart's export font (§3, §5.5) — bundled, embedded, and not negotiable at runtime.
 *
 * **Why bundle at all,** when §5.3 deliberately confined the symbol set to font-safe ranges
 * so that *any* of DejaVu / Segoe UI Symbol / Arial would render it? Because "it will
 * probably look right on your machine" is not the same promise as "this PDF prints the same
 * everywhere". Embedding the face makes the chart a self-contained artefact, and it is the
 * only way #28's print verdict means anything — you cannot judge glyph legibility against a
 * font stack that varies per machine.
 *
 * **Why DejaVu specifically: coverage headroom.** It carries the dingbat and box-drawing
 * ranges the current set avoids, so §5.3's glyph pool can be reopened later (#30, D4)
 * without also having to change fonts. A face that covered exactly today's 37 glyphs would
 * quietly foreclose the one lever that could raise `MAX_COLOUR_COUNT`.
 *
 * **Licence:** DejaVu is under the Bitstream Vera Fonts License (see
 * `resources/fonts/LICENSE.txt`) — *not* the OFL, as an earlier note in this repo claimed.
 * It permits redistribution and bundling, which is what matters here; the notable condition
 * is that a *modified* font may not keep the "DejaVu"/"Bitstream Vera" names. We ship it
 * unmodified, so that does not bite.
 */
import { readFileSync } from 'node:fs'
import fontPath from '../../../resources/fonts/DejaVuSans.ttf?asset'

/**
 * Absolute path to the bundled face, resolved by electron-vite in dev and when packaged.
 *
 * **This module is the edge, and nothing below it may import this.** The `?asset` specifier
 * is understood only by electron-vite: under plain-Node vitest it survives into the string,
 * so you get `…/DejaVuSans.ttf?asset` and an ENOENT. Anything that wants the font takes
 * *bytes* (see `buildChartPdf`), so the export stays testable outside Electron — which is
 * the entire reason §3 chose `pdf-lib` over `printToPDF`.
 */
export const EXPORT_FONT_PATH: string = fontPath

/** The bundled face's bytes. Read from disk — Electron's `fs` reads through asar. */
export function loadExportFont(): Uint8Array {
  return readFileSync(EXPORT_FONT_PATH)
}
