# Milestone 3 — Task Breakdown

Source: §9 Milestone 3 of `design.md` — "Export parity with the prototype (PNG preview,
PDF chart with floss key), including the configurable background colour (§5.4, §6)."

Each task is sized to merge in one sitting on its own branch (per-task branching),
roughly in dependency order — same rhythm as Milestones 1 and 2.

## Status

**Live status is tracked in GitHub Issues, not here.** These tasks map to issues
**#32–#36** under the [Milestone 3 — Export](https://github.com/gemlad/wesnoth_stitch/milestone/3)
milestone; run `gh issue list` for current state. This doc is the *design rationale*
for each task — don't record done/in-progress here.

## Scope note

Milestone 3 turns the live on-screen pattern from M2 into **files you can actually use**:
a PNG preview and a multi-page printable PDF chart with a DMC floss key. It is
deliberately **parity with the prototype**, not a redesign — §5.5 already says the
prototype's export logic "is portable rather than something to redesign". What changes is
what it runs *against*: the new `StitchPattern` / `QuantizedPalette` structures (§6)
instead of the old flattened-image path.

Explicitly **not** in M3: packaging/installer (M4), and the extras in §7.

### The symbol spikes do not block this — the dependency runs the other way

#28 (print legibility) and #30 (symbol-set spike) are open, and it is worth being explicit
that **neither gates this milestone**. §8 settled that on purpose: the 37 glyphs are "all
inside font-safe Unicode ranges, **so the choice no longer waits on the PDF font (§5.5)**".

The reverse is true, though. **M3 is what makes those two answerable:**

- **#28 cannot be finished until M3 exists.** Its test sheet currently renders through
  Chromium with the app's font stack, "not the export font (§5.5 does not exist yet)". You
  cannot judge print legibility without a print path. Task 3 builds one; #28 is then taken
  against it, which is why #28 moves onto this milestone.
- **#30's D4 — "do we bundle an export font?" — is a Milestone 3 decision.** It has been
  stuck in the spike because there was no export to decide it against. Task 1 decides it.

Two guard rails so M3 does not accidentally foreclose #30's remaining options:

1. **The export consumes `symbolsFor()` / `STITCH_SYMBOLS` / `MAX_COLOUR_COUNT`. It never
   redeclares them.** The prototype does exactly the wrong thing — `chart.py:57` does
   `SYMBOLS[i % len(SYMBOLS)]`, silently reusing a glyph once it runs out, which is the bug
   `symbolAt()` was written to *throw* on. **Port the layout, not that line.** Held to, a
   later #30 change to the set or the assignment rule is a data change here, not a rewrite.
2. **Bundle a generously-covering face, not a minimal one.** DejaVu Sans covers Geometric
   Shapes *and* the dingbat ranges. Committing to it costs nothing today and keeps D4's
   "reopen the glyph pool" option alive, rather than killing it by picking a narrow font.

## Tasks

### 1. Export font: bundle it, prove it covers the set (#32)
- Branch: `feature/export-font`
- Bundle **DejaVu Sans** (OFL, redistributable in a desktop app) under `resources/fonts/`,
  and embed it in the PDF via `pdf-lib` + `@pdf-lib/fontkit`. Record the licence and
  attribution alongside the asset.
- **Add the font-coverage test:** load the bundled face and assert every codepoint in
  `STITCH_SYMBOLS` resolves to a real glyph rather than `.notdef` (tofu). §5.3 has always
  warned that a missing codepoint renders as a box; until now nothing checked. Cheap,
  and it is the thing that makes a bundled face *safe*.
- This is the conservative half of #30's **D4**: it gives the export a real embedded face
  without yet reopening the glyph pool. Reopening it stays #30's call.
- Depends on: nothing (M2 shipped)

### 2. PNG export (#33)
- Branch: `feature/png-export`
- `StitchPattern` → PNG in the main process, using `pngjs` (already a dependency — no new
  lib, and no canvas). Each cell is a block of N×N pixels; N configurable.
- **Transparent cells take `PatternSettings.backgroundColour`** (§5.4/§6), not the
  prototype's hardcoded `#F4EFE3`. Honouring that setting is the "including the
  configurable background colour" half of the milestone.
- Pure function of pattern + palette + settings → `Buffer`. Testable with no DOM.
- Depends on: nothing

### 3. PDF chart pages — geometry, gridlines, glyphs (#34)
- Branch: `feature/pdf-chart-pages`
- Add `pdf-lib` (§3). Build the tiled chart pages: coloured cell fills, gridlines **bold
  every 10th** (the prototype's convention, and every commercial chart's), row/column
  rulers, and the per-cell glyph drawn as **embedded-font vector text** — not raster.
- **Size cells in millimetres, not points-per-figure.** The prototype tiles at
  `PAGE_MAX_STITCHES = 55` on US Letter. Use **A4**, and drive the layout from a physical
  cell size — §5.3's whole legibility argument rests on **2.36 mm/cell** (a 72-cell sprite
  across A4's printable width, ~4.8pt glyphs). Getting this wrong invalidates #28.
- Honour `PatternSettings.symbolDisplay` (`colour` / `symbol` / `both`). This is *not*
  scope creep: the setting already exists, it falls out of consuming `PatternSettings`,
  and **#28 needs a symbol-only black-and-white chart to judge** — §5.3's marginal pairs
  can't be assessed on a chart with colour underneath the glyph.
- Consumes `symbolsFor(palette)`. Never `% len`. See guard rail 1.
- Depends on: 1

### 4. PDF cover + floss key pages (#35)
- Branch: `feature/pdf-key-pages`
- **Cover/stats page:** title, `W × H` stitches, colour count, approximate finished size at
  Aida 11/14/16/18, and the **Wesnoth artwork attribution** (GPL v2+ / CC-BY-SA 4.0 — the
  prototype carries this and the licence often requires it; see the README's licence note).
- **Floss key page(s):** one row per colour — swatch, glyph, `DMC <code> — <name>`, and the
  stitch count. Paginated (the prototype fits 35 rows/page). At `k = 37` this is one page;
  it must still paginate correctly.
- Depends on: 1, 3

### 5. Export over IPC + save dialog (#36)
- Branch: `feature/export-ipc`
- Typed IPC channels (`exportPng`, `exportPdf`) following the M1/M2 shared-contract pattern
  in `src/shared/ipc.ts`; native save dialog; export buttons wired into the pattern view.
- **`PatternSettings` moves from `src/renderer/src/pattern/settings.ts` to
  `src/shared/ipc.ts`.** §6 predicted exactly this — "it moves to `shared/ipc.ts` if and
  when export runs in the main process and it actually has to cross a process boundary".
  This is that moment. The note in `settings.ts` should be updated, not just deleted.
- Depends on: 2, 3, 4

### 6. Take the print-legibility test for real (#28)
- Branch: `spike/print-legibility`
- **Moved onto this milestone from M2**, because it was never doable there. Re-render the
  legibility sheet through the *actual export path* from tasks 1–4 — embedded DejaVu, real
  A4, 2.36 mm/cell — and take the test on paper: the `C`/`G`, `E`/`F`, `P`/`R` drill, the
  blind identification task, and the two real charts.
- Outcome feeds §5.3 and #30. **If a pair fails, `MAX_COLOUR_COUNT` drops by one per glyph
  removed** — the two numbers are the same number (§8).
- Depends on: 3, 4

## Open Questions

### Q1 — Does the printed chart need a page-overlap margin?
The prototype tiles with hard cuts: a stitch on the seam between two pages appears on
exactly one of them. Commercial charts usually repeat a row or two across the seam so you
can align pages by eye. Deferred rather than decided — take the view once a real tiled
chart has been printed (task 6 prints one anyway).

### Q2 — Does #30 land before or after export ships?
M3 is deliberately built to survive either. If the symbol set or the assignment rule
changes under #30, guard rail 1 means the export picks it up as a data change. But if #30
lands *first*, tasks 3–4 render the new set directly and #28's verdict is taken against
what we'll actually ship. Sequencing is the stakeholder's call; nothing here depends on it.

## Definition of done for Milestone 3

- Selecting a sprite, choosing a colour count, and hitting export produces **a PNG preview
  and a multi-page printable PDF chart** — cover/stats, floss key, and tiled chart pages
  with bold-every-10 gridlines and one distinct glyph per floss colour.
- The chart's glyphs are **embedded vector text in a bundled font**, proven by test to cover
  every codepoint in the set — no tofu, no rasterised symbols.
- The configurable **background colour** and the **symbol/colour/both** setting are honoured
  by the export, not just the preview.
- Cells are laid out at a **real physical size in millimetres**, so a printed chart is
  measurable — and so #28's verdict means something.
- No packaging, no installer — that's Milestone 4.
