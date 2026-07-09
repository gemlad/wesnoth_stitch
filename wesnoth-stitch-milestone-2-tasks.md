# Milestone 2 — Task Breakdown

Source: §9 Milestone 2 of `wesnoth-stitch-design-v2.md` — "Quantization pipeline
(Lab k-means, seeded for slider stability — §5.2) + DMC mapping + live 1:1 Konva
grid preview with colour-count slider. Validate the 40-colour default cap (§8)
against a few real sprites here … Pin down the stitch-symbol set and its size
(§5.3, §8), since it sets the slider's hard maximum."

Each task is sized to merge in one sitting on its own branch (per-task branching),
roughly in dependency order — same rhythm as Milestone 1.

## Status

**Live status is tracked in GitHub Issues, not here.** These tasks map to issues
**#13–#20** under the [Milestone 2 — Conversion pipeline](https://github.com/gemlad/wesnoth_stitch/milestone/2)
milestone; run `gh issue list` for current state. This doc is the *design rationale*
for each task — don't record done/in-progress here.

## Scope note

Milestone 2 turns a **selected** sprite into a stitchable pattern on screen:
quantize its colours → map them to DMC floss → render the stitch grid → let the user
drive the colour count with a slider. It ends at a live, correct on-screen pattern.

Explicitly **not** in M2 (per §9): **export** (PNG/PDF chart with floss key) is
Milestone 3; **packaging/installer** is Milestone 4. The sprite source stays the
hardcoded dev path from M1 (§5.1 note) — no folder picker yet.

> ⚠️ **Scope may shift after stakeholder review.** The [Open Questions](#open-questions)
> below (raised in the Sprint 1 review) could pull export into M2 or change the
> default colour-count behaviour. Treat this breakdown as the pre-review baseline;
> update the issues once those are answered.

## Tasks

### 1. DMC floss dataset + colour utilities (#13)
- Branch: `feature/dmc-colour-data`
- Port the prototype's `dmc_colors.csv` (code, name, hex) into the app as a typed
  dataset (§3: reuse the data, convert to JSON at build time or load the CSV).
- Add `culori`-based colour utilities in a shared/testable module: sRGB→Lab
  conversion and Lab (ΔE) distance (§5.2), plus a precomputed **DMC Lab reference
  table** for nearest-floss search (used by #15).
- No UI. Pure functions with unit tests against a few known conversions.
- Depends on: nothing (M1 shipped)

### 2. Colour quantization — Lab k-means (#14)
- Branch: `feature/quantization`
- Implement the §5.2 pipeline over a decoded sprite (raw RGBA): exclude transparent
  pixels; count exact-duplicate colours first (the "true" colour count, Req. 6);
  run **k-means in Lab space**, `k` = requested colour count, weighted by pixel
  frequency; map every opaque pixel to its nearest centroid.
- **Slider stability (§5.2):** seed deterministically (k-means++ / fixed seed) and
  warm-start each run from the previous `k`'s centroids so adjacent `k` values give
  visually stable, incrementally-changing palettes rather than independent re-clusters.
- Produces `QuantizedPalette` + `StitchPattern` (§6). Pure, testable module.
- Depends on: 1

### 3. DMC floss mapping (#15)
- Branch: `feature/dmc-mapping`
- Map each post-quantization centroid to its nearest DMC floss by Lab distance
  against the reference table from #13; populate `QuantizedPalette.colours[].dmc`
  (code + name) (§5.3).
- Pure, testable: assert a handful of centroids resolve to sensible floss codes.
- Depends on: 1, 2

### 4. Stitch-symbol set + slider ceiling (#16)
- Branch: `feature/stitch-symbols`
- Pin down a **legible stitch-symbol glyph set** and its size (§5.3, §8): assign a
  distinct symbol per palette colour, and expose the set size as the colour-count
  slider's **hard maximum**, so every colour stays distinguishable by symbol alone
  (incl. black-and-white charts).
- Records the chosen glyph set + count as a constant the slider (#19) reads.
- Depends on: 3

### 5. Convert-a-sprite-to-a-pattern over IPC (#17)
- Branch: `feature/convert-ipc`
- Expose the pipeline (quantize → DMC map → symbols) behind a typed IPC channel,
  e.g. `convertSprite(id, colourCount) → { QuantizedPalette, StitchPattern }`,
  following the M1 shared-contract pattern (`src/shared/ipc.ts`).
- **Design call to make here:** the preview must re-run live as the slider drags
  (§5.2/§5.4). Decide compute location — main process (per §4) vs a renderer web
  worker — based on measured latency for typical 64–144px sprites. Note the choice
  in the design doc.
- Depends on: 2, 3, 4

### 6. Konva pattern grid preview (#18)
- Branch: `feature/konva-grid`
- Add `konva` (§3). Render `StitchPattern` as a `Stage` + one `Layer` of `Rect`s —
  one per source pixel, 1:1, filled with the mapped DMC/quantized colour (§5.4).
  Transparent cells render as a **configurable background colour** (§5.4/§6:
  `PatternSettings.backgroundColour`), not assumed-white.
- Optional second layer overlaying the per-cell **symbol** (toggle: colour-only /
  symbol-only / both). Zoom/pan on the stage.
- Depends on: 5

### 7. Colour-count slider + live re-quantization (#19)
- Branch: `feature/colour-slider`
- Slider from 1 to the symbol-set max (#16); default = the sprite's exact-duplicate
  colour count capped at 40 (§5.2). Dragging re-runs the pipeline (#17) and updates
  the Konva preview (#18) live, relying on the seeded/warm-started quantization for
  visual stability.
- This is where "default colours = the sprite's own colour count" (Req. 6) becomes
  visible and testable.
- Depends on: 5, 6

### 8. Validate colour cap + symbol legibility (#20)
- Branch: `spike/validate-colour-cap`
- Run the finished pipeline against real sprites, **including one with unusually
  rich shading**, to resolve the two §8 open questions: (a) is the 40-colour default
  cap generous enough; (b) does the chosen symbol-set size hold as a legible ceiling.
- Record findings in the design doc (§5.2/§5.3/§8) and adjust the constants if needed.
- Depends on: 7

## Open Questions

Raised in the **Sprint 1 review** — to be answered after review with the stakeholder's
partner, then folded into the issues above. _Decisions pending._

### Q1 — Milestone 2 scope: does export come now?
The documented plan puts export (PNG preview + PDF chart with floss key) in Milestone
3. The stakeholder asked whether a printable chart, even rough, matters more than
colour-matching polish.
- **If "export sooner":** add an export story to M2 (port the prototype's PDF/PNG
  logic against the new `StitchPattern`/`QuantizedPalette` — §5.5), likely after #19.
- **If "keep M3":** no change; this breakdown stands.
- **Decision:** _pending review with partner._

### Q2 — Default colour-count behaviour
Current plan: default to **as many colours as the sprite actually uses**, capped at a
ceiling (40). The stakeholder asked whether a **fixed small palette** by default would
suit how they'd actually stitch.
- **If "sprite's own count":** #19 as written; #20 validates the cap.
- **If "fixed small default":** change #19's default and reframe the slider's role;
  revisit whether the 40-cap validation (#20) still matters.
- **Decision:** _pending review with partner._

### Q3 — Distribution timing (affects sequencing, not M2 content)
When is a shareable installer wanted vs. dev-only builds? This decides how soon the
folder-picker + packaging work (M4, and the M1 hardcoded-source note) gets pulled
forward — it doesn't change M2's tasks, but it changes what comes after.
- **Decision:** _pending review with partner._

### Design-doc open questions resolved *within* M2 (§8)
- **40-colour cap** — validated in #20 against real sprites.
- **Stitch-symbol set size** — pinned down in #16; it sets the slider's hard max.

## Definition of done for Milestone 2

- Selecting a sprite and choosing a colour count produces a **live, correct on-screen
  stitch pattern**: colours quantized perceptually (Lab), each mapped to a real DMC
  floss, rendered 1:1 on the Konva grid with a per-cell symbol option and a
  configurable background colour.
- The colour-count slider re-quantizes live and stays visually stable across steps;
  its maximum is the legible symbol-set size; its default is the sprite's own colour
  count (capped).
- The 40-colour cap and symbol-set ceiling are validated against real sprites (§8).
- No export, no packaging — those are Milestones 3 and 4.
