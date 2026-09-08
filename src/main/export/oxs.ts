/**
 * OXS export (#94) — the chart as data, for other cross-stitch software.
 *
 * The PDF (§5.5) is a *rendering*: it says how the chart should look on paper and nothing
 * about what a program should do with it. OXS is the other half — the open interchange format
 * (https://ursasoftware.com/OXSFormat/) that Pattern Keeper, KXStitch, WinStitch and friends
 * read — so a chart can be opened in the tool the stitcher already uses: ticked off stitch by
 * stitch on a tablet, re-keyed to another floss brand, or dropped into a bigger design.
 *
 * **What this writes, and what it deliberately does not.** A Wesnoth sprite is one stitch per
 * pixel (Req. 4), whole cross stitches only: no fractional stitches, no backstitch outline, no
 * beads or knots. So `partstitches` and `ornaments_inc_knots_and_beads` are written empty, and
 * so is `backstitches` — which the spec calls mandatory *even when empty*, alongside
 * `properties` and `fullstitches`. Emitting the empty containers costs four lines and keeps
 * readers that trust that sentence happy.
 *
 * **Index 0 is the cloth, so every floss index shifts by one.** OXS reserves palette item 0
 * for the fabric, which is how the file carries `backgroundColour` (§8: the fabric is not
 * assumed white). A `StitchPattern` cell holding palette index `i` therefore becomes
 * `palindex="${i + 1}"`. `palettecount` counts the floss only — the spec says so explicitly:
 * *"palettecount excludes cloth color, which is item 0"*.
 *
 * **Stitch coordinates are 0-based, so the top-left cell is (0, 0).** The spec's examples are
 * ambiguous on the origin and were first read as 1-based, which shifted every exported chart
 * one cell right and one cell down against its own `chartwidth`/`chartheight` — the last column
 * and row fell outside the stated grid (#114). Readers count from zero, so the pattern's
 * `cells[row][col]` becomes `x="${col}" y="${row}"` with no offset.
 *
 * **Symbols are a plain sequence number, not this app's glyph.** The spec's wording is
 * *"Ursa uses a symbol number, which is a sequence number. Others may specify a font and/or an
 * actual character"* — and the character reading, tried first, was **wrong in practice**: a
 * file carrying `symbol="●"` imported into WinStitch and FlossCross with **no symbols at all**
 * (Gemma, 2026-08-20). Neither program looks up a character; both index a symbol library of
 * their own. So each floss gets `1, 2, 3…` in palette order and the reading program draws
 * whatever its library holds at that slot.
 *
 * **The consequence, accepted deliberately: an imported chart's glyphs do not match the PDF's.**
 * There is no way to make them: our set (§5.3) was chosen against a bundled font we control,
 * and no OXS reader can be told about it. What *is* guaranteed is that the numbers are
 * distinct, so two floss colours can never share a symbol wherever the file lands — which is
 * the property that makes a chart stitchable. Each palette item also carries the name of the
 * Wesnoth Stitch glyph in `comments`, so the PDF key and the imported palette can still be
 * lined up by hand.
 *
 * Pure and Electron-free, like the PDF builder beside it: pattern in, string out, so the format
 * can be tested without a window — and so `npm run uat:chart` can drop a real `.oxs` next to
 * the real PDFs, to be opened in the actual third-party software.
 */
import type { RGB } from '../../shared/colour'
import { LICENCE_LINES } from '../../shared/licence'
import {
  flipHorizontal,
  symbolsFor,
  type QuantizedPalette,
  type StitchPattern
} from '../../shared/pipeline'

/**
 * Fabric count recorded in `properties`, in stitches per inch.
 *
 * 14-count Aida — the count most cross-stitchers default to, and one of the four the PDF cover
 * quotes. Nothing in the pattern depends on it (a chart is counts, not inches); it only sets
 * the finished size the importing software displays, and every one of them lets you change it.
 */
export const DEFAULT_STITCHES_PER_INCH = 14

/** What the file says it is a chart *of*, and what made it. */
export interface OxsMeta {
  /** Usually the sprite's name. Becomes `charttitle`. */
  title: string
  /** App version for `software_version`, e.g. "1.1.0". Left out of the file if absent. */
  softwareVersion?: string
}

export interface OxsExportOptions {
  /** The fabric (§6). Becomes palette item 0, the cloth colour. */
  backgroundColour: RGB
  /** Mirror the pattern left-to-right (#56), exactly as the PDF and the preview do. */
  flip: boolean
  /** Fabric count for `properties`. Defaults to {@link DEFAULT_STITCHES_PER_INCH}. */
  stitchesPerInch?: number
}

/**
 * The characters an XML attribute value must not carry raw.
 *
 * The apostrophe is not among them: every value here is written in double quotes, so `'` is
 * ordinary text — and leaving it alone keeps the quoted spec text below readable to whoever
 * opens the file to work out why their software choked on it.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** `name="value"` pairs, skipping any whose value is undefined. */
function attributes(pairs: Record<string, string | number | undefined>): string {
  return Object.entries(pairs)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}="${escapeXml(String(value))}"`)
    .join(' ')
}

/** `{ r, g, b }` → `RRGGBB`: the hex RGB the format asks for, no `#`, upper case. */
function hex({ r, g, b }: RGB): string {
  return [r, g, b]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

/**
 * The `<format>` element's text, verbatim from the specification's own example.
 *
 * It is documentation addressed to whoever opens the file in a text editor, not data — readers
 * ignore it. Kept because the spec's example carries it, and because a file that explains its
 * own shape is worth thirteen lines to someone debugging an import. (`knos` is the spec's
 * typo, reproduced rather than corrected: this is a quotation.)
 */
const FORMAT_COMMENTS: readonly string[] = [
  'Designed to allow interchange of basic pattern data between any cross stitch style software',
  "the 'properties' section establishes size, copyright, authorship and software used",
  'The features of each software package varies, but using XML each can pick out the things it can deal with, while ignoring others',
  'The basic items are :',
  "'palette'..a set of colors used in the design: palettecount excludes cloth color, which is item 0",
  "'fullstitches'.. simple crosses",
  "'backstitches'.. lines/objects with a start and end point",
  '(There is a wide variety of ways of treating part stitches, knos, beads and so on.)',
  'Colors are expressed in hex RGB format.',
  "Decimal numbers use US/UK format where '.' is the indicator - eg 0.5 is 'half'",
  'For readability, please use words not enumerations',
  'The properties, fullstitches, and backstitches elements should be considered mandatory, even if empty',
  'element and attribute names are always lowercase'
]

/** Strands per stitch, recorded per palette item. Two is the standard on 14-count Aida. */
const STRANDS = 2

/**
 * Build the chart as an OXS document.
 *
 * @throws RangeError if a cell indexes a colour the palette does not have — the same pipeline
 * bug `renderPatternPng` refuses to paint over, and one that would otherwise import as a chart
 * pointing at floss nobody listed.
 * @throws RangeError (via `symbolsFor`) if the palette holds more colours than the symbol set
 * can name.
 */
export function buildChartOxs(
  pattern: StitchPattern,
  palette: QuantizedPalette,
  meta: OxsMeta,
  options: OxsExportOptions
): string {
  // Flipped once, here, for the reason the PDF flips once at the top (#56): everything below
  // reads this one grid, so the exported file cannot face the other way from its own preview.
  const charted = options.flip ? flipHorizontal(pattern) : pattern
  const symbols = symbolsFor(palette)

  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<chart>']

  lines.push('  <format')
  FORMAT_COMMENTS.forEach((comment, index) => {
    lines.push(`    comments${String(index + 1).padStart(2, '0')}="${escapeXml(comment)}"`)
  })
  lines.push('  />')

  const stitchesPerInch = options.stitchesPerInch ?? DEFAULT_STITCHES_PER_INCH
  lines.push(
    `  <properties ${attributes({
      oxsversion: '1.0',
      software: 'Wesnoth Stitch',
      software_version: meta.softwareVersion,
      chartheight: charted.height,
      chartwidth: charted.width,
      charttitle: meta.title,
      author: '',
      // The artwork attribution travels with the file, as it does on every printed page (#47):
      // a chart handed to another program is still derived from Wesnoth's art.
      copyright: LICENCE_LINES.join(' '),
      instructions: `Whole cross stitches only, ${palette.colourCount} DMC floss colours. No backstitch.`,
      stitchesperinch: stitchesPerInch,
      stitchesperinch_y: stitchesPerInch,
      palettecount: palette.colourCount
    })} />`
  )

  lines.push('  <palette>')
  const clothHex = hex(options.backgroundColour)
  lines.push(
    `    <palette_item ${attributes({
      index: 0,
      number: 'cloth',
      name: 'cloth',
      color: clothHex,
      printcolor: clothHex,
      blendcolor: 'nil',
      comments: '',
      strands: STRANDS,
      dashpattern: '',
      misc1: ''
    })} />`
  )
  palette.colours.forEach((colour, index) => {
    const code = colour.dmc.code
    const colourHex = hex(colour.rgb)
    lines.push(
      `    <palette_item ${attributes({
        index: index + 1,
        // Brand-qualified in `number`, following the spec's own example (`number="DMC 781"`,
        // `name="Topaz V DK"`) — "310" alone is ambiguous in software that knows several floss
        // ranges, and this is the field those programs match on.
        number: `DMC ${code}`,
        name: colour.dmc.name,
        color: colourHex,
        printcolor: colourHex,
        bscolor: colourHex,
        blendcolor: 'nil',
        // The glyph this colour carries on our own printed chart — as its *name*, since the
        // symbol number below deliberately says nothing about it. Kept ASCII: the whole reason
        // this file no longer ships a `●` is that readers did not cope with it.
        comments: `Wesnoth Stitch symbol: ${symbols[index].name}`,
        strands: STRANDS,
        bsstrands: 1,
        // 1, 2, 3… in palette order. See the note on symbols above: a sequence number is what
        // WinStitch and FlossCross actually read, and being distinct is all it has to be.
        symbol: index + 1,
        dashpattern: '',
        misc1: ''
      })} />`
    )
  })
  lines.push('  </palette>')

  lines.push('  <fullstitches>')
  for (let row = 0; row < charted.height; row++) {
    for (let col = 0; col < charted.width; col++) {
      const index = charted.cells[row][col]
      // No stitch: the fabric shows, and OXS says that by leaving the cell out entirely.
      if (index === null) continue
      if (index < 0 || index >= palette.colours.length) {
        throw new RangeError(
          `Cell (${col}, ${row}) indexes palette colour ${index}, but the palette has ${palette.colours.length}`
        )
      }
      // 0-based, top-left origin: the first cell of the chart is (0, 0). See the note on
      // coordinates above — the spec's examples read as 1-based, but the software does not.
      lines.push(`    <stitch ${attributes({ x: col, y: row, palindex: index + 1 })} />`)
    }
  }
  lines.push('  </fullstitches>')

  // Empty, and present anyway — see the note on mandatory containers above.
  lines.push('  <partstitches />')
  lines.push('  <backstitches />')
  lines.push('  <ornaments_inc_knots_and_beads />')
  lines.push('  <commentboxes />')

  lines.push('</chart>')
  return lines.join('\n') + '\n'
}
