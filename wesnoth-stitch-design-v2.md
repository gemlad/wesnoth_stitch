# Wesnoth Stitch — Design Document v2

Supersedes the Python-prototype-era design doc. This is a from-scratch plan for the
Electron + TypeScript desktop rewrite.

## 1. Goals

- Browse Battle for Wesnoth unit sprites and pick one (or eventually several) to convert.
- Preview the resulting cross-stitch pattern in-app before exporting anything.
- 1 sprite pixel = 1 stitch, always. No downsampling, no "fitting to a stitch count."
- Let the user choose how many colours the pattern uses, and do the colour reduction
  properly (perceptual clustering, not naive palette flattening).
- Default colour count = however many distinct colours are actually in the sprite,
  so the "reduce colours" step only kicks in when the user asks it to.

### 1.1 Requirement reference

The Req. numbers cited throughout this doc:

| # | Requirement |
|---|---|
| 1 | Sprite browser to select which of the units from the Wesnoth repo to convert, with a graphical preview of the unit |
| 2 | *(Future extension)* Look at unit graphics from other branches of the Wesnoth repo, such as mods |
| 3 | In-app preview of what the cross-stitch pattern will look like |
| 4 | 1:1 mapping of pixels to stitches |
| 5 | Number-of-colours selector — de-duplicate similar colours after the number of colours is selected (the prototype flattened the image too much) |
| 6 | Default number of colours of DMC floss = the number of colours in the sprite, where possible |
| 7 | *(Future extension)* Multi-select sprites or folders to batch-process patterns |

## 2. Non-Goals (v1)

These are explicitly deferred — designed for, but not built yet:

- Browsing sprites from mods/add-ons or non-mainline branches (Req. 2)
- Multi-select / folder batch processing (Req. 7)
- In-app WML unit-definition parsing (name/faction metadata) — v1 browses image files
  directly rather than resolving Wesnoth's unit-type config files, see §5.1.
- Manual per-stitch colour override (click a cell, reassign its DMC colour). The
  Python-prototype-era design doc had this as a feature; v1 of this rewrite is fully
  automated (quantize → map → preview → export), with manual override as a plausible
  v1.5 addition alongside WML parsing.
- Non-unit asset categories (terrain, portraits, items, buildings, halo, etc.). The
  Python prototype browsed all of `data/core/images/`; v1 of this rewrite scopes down
  to `images/units/` only (§5.1). Revisit if useful once the pipeline is proven.

Keeping these as extensions rather than v1 scope is deliberate: they bolt onto the
"asset source" and "job" abstractions described below without a rewrite, so there's no
cost to deferring them.

## 3. Tech Stack

**This is a native desktop app**, not a web app — Electron packages a web-tech UI
(React/Konva) into a standalone installable application with Node access underneath.
That Node access is *why* Electron rather than a plain web app: a browser tab can't
browse a local Wesnoth git checkout without manual file uploads, but a Node-backed
main process can just read the filesystem directly (§4). Same model as VS Code or
Slack's desktop client — web tech for the UI, native app for everything else.


| Layer | Choice | Why |
|---|---|---|
| Shell | Electron | filesystem access for reading a local Wesnoth checkout |
| Language | TypeScript throughout (main + renderer) | matches your stated direction |
| Bundler | electron-vite | least-friction Electron+TS+React setup |
| UI framework | React | just for panels/forms — the stitch grid itself is canvas, not DOM |
| Canvas/grid | Konva.js | pick over Fabric because Konva's layer model suits a fixed grid of
coloured cells + a symbol-overlay layer better than Fabric's object-manipulation focus, which you don't need |
| Colour maths | `culori` | Lab colour space conversion + distance, needed for both
quantization and DMC matching |
| Image decoding | `pngjs` | pure-JS, deterministic RGBA decode in the main process (added #4); chosen over Electron's `nativeImage` to avoid platform BGRA/byte-order quirks and a native rebuild, and to keep exact source pixels for the quantizer (§5.2) |
| DMC floss data | reuse the prototype's dataset | prototype stores this as `dmc_colors.csv` (code, name, hex columns) — convert to JSON at build time or load the CSV directly, no need to re-source the data itself |
| Persistence | flat JSON files (recent sources, last settings) | no need for a DB at this scale |
| Packaging | electron-builder | app is intended to be distributable to others eventually (not just personal/dev use), so an installer target is in scope even if early builds stay personal-use |

## 4. Architecture

```
┌─────────────────────────┐
│ Main process (Node)     │
│  - filesystem access    │
│  - asset scanning       │
│  - export (PDF/PNG)     │
└───────────▲──────────────┘
            │ IPC
┌───────────▼──────────────┐
│ Renderer (React + Konva) │
│  - Sprite Browser         │
│  - Colour/quantize panel  │
│  - Pattern preview grid   │
└───────────────────────────┘
```

Filesystem and image-decoding work stays in the main process; the renderer only ever
receives already-decoded pixel data / thumbnails over IPC. This keeps the renderer
free to just be a UI layer, and means the export pipeline can be reused headlessly
later for batch processing (§7.2) without touching UI code.

**IPC contract (implemented in #2, extended in #17).** The renderer↔main surface is four
channels — `getSpriteList`, `getThumbnail`, `getFullImage`, `convertSprite` — with channel
names and payload types defined once in `src/shared/ipc.ts` and imported by both processes
so a handler can't silently drift from its caller. Two shape decisions worth recording:

- **Images cross as raw RGBA**, not encoded PNG bytes. Both `getThumbnail` and
  `getFullImage` return `DecodedImage = { width, height, data: Uint8Array }` (row-major
  RGBA). Raw RGBA is the canonical form the renderer consumes — a canvas paints it
  directly and the quantizer (§5.2) needs it anyway — so decoding stays in the main
  process and the renderer never re-decodes.
- **The sprite list is metadata-only.** `getSpriteList` returns
  `SpriteSummary = { id, folder, name }`; thumbnails are fetched per-sprite via
  `getThumbnail`, *not* bundled into the list. This avoids shipping thousands of image
  buffers up front just to populate the grid. It's a deliberate split of the §6
  `SpriteAsset` sketch (which bundled `thumbnail`) — see the note there.

**Where the pipeline runs — decided in #17, on measurement.** `convertSprite(id,
colourCount?)` runs the whole of §5.2/§5.3 (decode → map to DMC → reduce over floss →
assign symbols) and returns `ConvertedSprite = { palette, pattern, symbols,
maxColourCount }`. Because the preview re-runs live as the slider drags, the open question
was main process (per this section) vs a renderer web worker. Measured through real IPC in
the running app — 72×72 scout, `k=20`, steady state:

| | ms |
|---|---|
| IPC round-trip, trivial payload | 0.157 |
| main-process compute (`reduceTo` + `symbolsFor`, warm) | **0.077** |
| renderer-observed warm tick | 1.877 |
| ⇒ payload serialization | **1.643** |
| cold sprite (`merfolk/citizen`, 94 floss: decode + map + plan) | 48.6 |

**Compute is 4% of a slider frame; serialising the palette and the 5,184-cell grid is
88%.** A web worker would pay that same serialization on `postMessage`, so moving compute
off the main process buys back at most 0.077 ms — nothing. The decision is therefore free
to be made on architecture, and this section already wants the pipeline in main so export
(§5.5) and batch processing (§7.2) can reuse it headlessly. **So: main process.**

Two consequences worth carrying forward:

- **A per-sprite `ReductionPlan` cache (LRU, 12) is what makes the slider affordable.**
  The cold path is dominated by `mapToDmc`, which searches per *distinct source colour* —
  48.6 ms on the worst sprite, 25× the frame budget, and entirely independent of `k`.
  Caching decode + map + merge plan per sprite id means a slider frame only re-cuts the
  plan. This is exactly the `planReduction`/`reduceTo` split from §5.2 step 3, turned into
  a warm start across IPC calls. That cold cost is still a visible hitch when selecting a
  rich sprite; #19 may want to prewarm on selection rather than on first slider touch.
- **The payload is dominated by the grid, not the palette.** A 13-floss sprite costs the
  same 1.6 ms as a 31-floss one. If a future grid outgrows the budget, the lever is
  `StitchPattern.cells`: a flat `Int16Array` (with `-1` for no-stitch) clones far more
  cheaply than `(number | null)[][]`. Not worth the churn through §6, #14 and #18 at
  1.9 ms per tick.

Caveat on those numbers: they are steady-state. The same call measured ~14 ms when issued
immediately after page load, competing with app startup, JIT and the initial sprite scan.
A first slider drag right after launch will be slower than a later one.

## 5. Core Workflows

### 5.1 Sprite Browsing & Selection (Req. 1)

Wesnoth's unit graphics live under `images/units/**/*.png` in a checkout of the repo.
Proper unit metadata (display name, faction, level) is defined separately in WML
`.cfg` files, and parsing WML fully is a project of its own.

**v1 approach:** treat the sprite browser as a filesystem browser over the images
directory, not a unit-database browser:

- User points the app at a local Wesnoth checkout (a plain folder picker — no in-app
  git cloning in v1; you almost certainly already have a checkout).
- App scans `images/units/` recursively, groups by the **top-level** subfolder
  (which loosely corresponds to faction, e.g. `human-loyalists/`, `undead/`) so
  nested animation frames still bucket under their faction, and shows thumbnails
  in a grid. Thumbnails are decoded in the main process and downscaled
  nearest-neighbour to a 64px longest side (#4) — nearest-neighbour keeps the pixel
  art crisp; sprites already ≤64px are sent through unscaled.
- The grid (#5) paints each thumbnail's raw RGBA onto a `<canvas>` (kept crisp with
  `image-rendering: pixelated`) and **lazy-loads** thumbnails as cells scroll into
  view (IntersectionObserver), so it doesn't fire ~7k IPC requests up front. Full
  row virtualization is deferred — lazy image loading keeps it responsive at M1 scale.
- Clicking a thumbnail loads it into the preview pane at full resolution (#6/#7):
  the selected sprite is fetched via `getFullImage` (undownscaled) and painted 1:1
  onto a `<canvas>`, with its name/folder/dimensions shown. Zoom is deferred (§5.4).

This is a deliberate simplification: it gets you a working, pixel-accurate browser
immediately, and folder names are already reasonably human-readable. Nicer names via
WML parsing is a plausible v1.5 addition, not a blocker.

> **Note (dev sprite set):** a standalone copy of the mainline unit sprites has been
> fetched into `wesnoth-sprites/units/` at the repo root (gitignored — see
> `.gitignore`; refetch via a blobless sparse clone of `wesnoth/wesnoth`, path
> `data/core/images/units`). This is *not* a full repo checkout — only the `units/`
> subtree, ~7,100 files / ~9 MB. So the sprite root should be a **configurable
> constant** (e.g. `SPRITE_ROOT = 'wesnoth-sprites/units'`), not code that assumes the
> full `data/core/images/units` layout. `wesnoth-sprites/` plays the role the doc's
> "checkout" plays; `units/` is the scan target and its subfolders are the categories.
> The folder-picker flow above still stands for real user checkouts.

### 5.2 Colour Quantization (Req. 5, 6)

This is the part the prototype got wrong, so it's worth being explicit about *why* it
flattened images too much and how this design avoids that.

**The prototype's likely failure mode:** naive palette reduction (posterizing, or
nearest-colour-in-RGB-space clustering) treats colour distance in raw RGB, which
doesn't match human perception — two shades that are visually close can be far apart
in RGB, and two shades that are visually distinct can be RGB-close. The result is
that visually important detail gets merged away while near-duplicate shades survive
as separate colours, wasting your colour budget.

**Map to DMC *before* reducing (don't ditch fidelity too soon).** The output is
always DMC floss — that's the only alphabet you can actually stitch. So the most
faithful representation available is "every pixel → its best DMC match"; that's
lossless *with respect to the medium*. We therefore map to floss first (the fidelity
ceiling) and treat colour *reduction* as a second, honest step over real floss —
rather than clustering into arbitrary centroids and only snapping to DMC at the end.

Mapping-first avoids two failure modes of quantize-then-snap: (a) **snap-drift /
collisions** — k-means centroids optimise for raw pixels, then a *second* lossy snap
to DMC can collapse two centroids onto the same floss, so you ask for `k` colours and
silently get fewer distinct floss; (b) a **misleading default count** — "the sprite's
own colour count" (Req. 6) as distinct *RGB* over-counts shades that are the same
thread. Distinct *DMC* is what Req. 6 actually wants.

**Approach:**

1. Convert every opaque pixel to Lab colour space (`culori`). Lab is designed so that
   Euclidean distance approximates *perceived* colour difference — this is the fix.
   Transparent pixels are excluded entirely and stay transparent (they're not stitches).
   "Opaque" is thresholded, not strict: a pixel counts as a stitch when its alpha is
   ≥ **128** (a tunable `alphaThreshold`), so anti-aliased edge fringe — mostly
   transparent pixels with blended colours — is left unstitched rather than becoming a
   full stitch of a colour that isn't really in the sprite. Cross-stitch can't do
   partial coverage, so the choice is binary. **#20 validates the default** against real
   sprites (implemented in #15).
2. **Map each opaque pixel to its nearest DMC floss** by Lab (ΔE) distance against the
   reference table (§5.3, #13). Dedupe by exact colour first so this is
   (distinct sprite colours × DMC) distance calcs, not per-pixel — cheap at 64–144px.
   The number of **distinct DMC colours** the sprite resolves to is the "true" colour
   count for Req. 6.
3. **Reduce over DMC.** If the requested colour count is below the distinct-DMC count,
   merge the perceptually closest floss colours — **k-medoids / agglomerative merge in
   Lab, weighted by pixel frequency** (so a floss used once doesn't survive at the
   expense of one used 500 times), down to `k`. The representative of each merged group
   is itself a real DMC colour (k-medoids, not k-means averages), so the final palette
   is guaranteed-real floss with no second snap. Merged pixels reassign to their group's
   representative. **Implemented in #14** with **Ward-style linkage**: merging clusters
   A and B costs `wA·wB / (wA + wB) · ΔE(repA, repB)²`, pixel counts as weights. That
   weight factor is precisely what enforces "used once doesn't survive at the expense of
   used 500 times" — absorbing a 1-pixel cluster costs ≈1× its ΔE², fusing two 500-pixel
   clusters ≈250×. Each group's representative is its **pixel-weighted medoid** (the
   member floss minimising `Σ wⱼ·ΔE`), so merged pixels reassign to the thread that
   already covered most of them, not to the group's geometric middle.
4. Feed the resulting palette into the preview (§5.4) immediately — this step needs to
   be fast enough to re-run live as the user drags a colour-count slider.

**Default colour count (Req. 6):** = the distinct-DMC count from step 2, capped at
`MAX_COLOUR_COUNT` (§5.3). The cap is **37**, the size of the legible stitch-symbol set —
not a number chosen here. A chart cannot show more colours than it has symbols to name,
so the symbol set is what binds.

**Census (#16), over all 7,116 sprites in the checkout** — the original guess of 40 was
made blind, so it is worth recording what the data actually says:

| | distinct-DMC count |
|---|---|
| median | 24 |
| p90 | 35 |
| p99 | 47 |
| max | 94 (`merfolk/citizen.png`) |

Full palette fits under the cap — i.e. no reduction at default — for **93.2%** of sprites
at 37, against 95.8% at the originally-proposed 40. So lowering the ceiling to buy
legibility costs 2.6 points of coverage, or 188 extra sprites that reduce.

This corrects an assumption above: reduction is **not** a rare safety net for outliers.
Roughly one sprite in fifteen exceeds the cap, and the long tail (merfolk, yeti death
frames, the jinn) runs to 94 distinct floss — those are heavily shaded and anti-aliased
despite being pixel art. Reduction is a routine, load-bearing part of the pipeline, which
is a good argument for the care taken over its stability in step 3.

**Stability while dragging the slider:** reduction over the fixed DMC-mapped base is a
**merge** — lowering `k` just merges the next-closest pair of floss colours, so the
palette changes incrementally and monotonically rather than re-clustering from scratch.
This is naturally warm-startable (agglomerative merges nest) and inherently more stable
than re-seeding k-means each step: no colour jumps to a visually different value on a
one-step slider move.

**Implemented in #14** as a two-phase split that makes the nesting *structural* rather
than emergent: `planReduction(sprite)` runs the agglomerative merge once and records the
whole sequence as a dendrogram; `reduceTo(plan, k)` replays its first `n − k` steps. Every
`k` is therefore a cut of one shared sequence, so `k − 1` is provably `k` with exactly two
entries merged. Measured on real 72×72 sprites (n = 11–31 distinct floss): **~0.3–0.9 ms**
to build the plan, **~0.1 ms** per cut — a full sweep of every `k` costs 1–3 ms. Live
re-run on slider drag is comfortably affordable; this measurement informs #17's
compute-location call (main process vs renderer worker).

**One honest tradeoff:** mapping-first can band slightly harder on smooth gradients
(many near shades all snap to one floss, where free k-means might place an in-between
centroid). But you can't *stitch* an in-between colour anyway, so that loss is inherent
to the medium — and on limited-palette pixel art it barely applies.

### 5.3 DMC Floss Reference & Stitch Symbols

The **DMC floss Lab reference table** (precomputed sRGB→Lab for every floss, #13) is
what §5.2 maps against — mapping to floss is now the *first* pipeline step, not a
post-quantization snap. Each colour in the reduced palette (already a real DMC floss by
construction, §5.2) is assigned a stitch symbol for the chart.

**Symbol collisions (resolves §8):** cap the colour-count slider's maximum at the
size of the legible stitch-symbol set, rather than allowing colour count to exceed
it. Guarantees every colour on a printed (including black-and-white) chart stays
visually distinguishable by symbol alone.

**The set, pinned down (#16).** `STITCH_SYMBOLS` holds **37 glyphs**, ordered by
*distinctness* rather than codepoint. Symbols are handed out in array order and the
palette is sorted dominant-floss-first (§5.2), so a low-`k` chart spends only the top of
the list — bold, unmistakable silhouettes — and detail degrades gracefully as `k` climbs.
Five tiers:

1. **Solid geometrics** (4) — separable by silhouette alone: `● ■ ▲ ◆`
2. **Outline counterparts** (5) — same silhouettes, inverted fill: `○ □ △ ◇ ☆`
3. **Half fill** (1) — a third fill state: `◐`
4. **Strokes** (4) — a different visual class, thin and open: `+ × # =`
5. **Letters** (23) — the fallback commercial charts have always used: A–Z less `O` and
   `Q` (confusable with `○`) and `X` (with `×`, which reads better small).

**Two rules decide membership**, both learned from rendering the set at chart scale
rather than reasoning about it on paper:

- **One orientation per shape family.** A rotated glyph is not a new glyph: the eye reads
  `▲ ▼ ◀ ▶` as one symbol pointing four ways and has to *decode* the direction, which is
  exactly the work a chart symbol exists to avoid. Only the upward triangle survives, and
  only one half-filled circle, so it has no mirror twin to be confused against.
- **No two glyphs may share an ink blob.** At 9px a solid glyph reads as its filled area
  and little else, so `★` and `◆` become the same dark lozenge. The star is kept in
  outline only, where its points register.

The same reasoning excludes the size variants (`▲`/`▴`) and weight variants (`+`/`✚`) the
prototype shipped. Digits are dropped wholesale: `0`/`O`, `1`/`I`, `2`/`Z`, `5`/`S`,
`6`/`G`, `8`/`B` and `9`/`P` all collide with letters already in the set, and salvaging
`3 4 7` is not worth a mixed-class rule. Every surviving glyph is a single BMP code point
from Basic Latin, Latin-1, Geometric Shapes, or the outline star — ranges with
near-universal font coverage, so neither Chromium's canvas (§5.4) nor a bundled PDF font
(§5.5) falls back to tofu. Asking for a symbol past the end throws rather than wrapping;
the prototype's `i % len` silently aliased two colours onto one glyph.

`MAX_COLOUR_COUNT = 37` is therefore the slider's **hard maximum** (read by #19), and
since it sits below the 40 §5.2 proposed, *it* is the effective colour cap — see the
census in §5.2. If #20 wants a higher cap, **the symbol set must grow first**: a chart
cannot show more colours than it has symbols to name.

#### Limitations of the hard limit

The ceiling is a real constraint with real costs, and they should be understood before
anyone tries to raise it:

- **It is a limit on charting, not on stitching.** Nothing stops you stitching 94 floss
  colours. The 37 exists because a *printed black-and-white chart* must name each colour
  with a glyph you can tell apart from the other 36. That is the most demanding consumer
  of the palette, and it sets the budget for everything upstream.
- **485 sprites (6.8%) cannot be charted at full fidelity.** They exceed 37 distinct DMC
  and must reduce (§5.2). The extreme case, `merfolk/citizen.png`, has 94 distinct floss
  and loses 57 of them. Reduction is designed to make that loss principled rather than
  arbitrary, but it is still a loss.
- **The cap is imposed on the preview by the export.** The on-screen colour preview
  (§5.4) and the PNG export need no symbols and could carry far more colours. The slider
  is capped globally anyway, so that what you preview is always what you can export. A
  preview you cannot turn into a chart would be worse than a lower ceiling.
- **Raising it is not cheap.** The glyph pool that survives both rules inside font-safe
  ranges is close to exhausted. Every obvious remaining candidate breaks something:
  digits collide with letters, lowercase collides with uppercase, and arrows, dingbats
  and box-drawing characters either reintroduce rotation families or risk font fallback
  in a bundled PDF font (§5.5). Growing the set means either accepting a font dependency
  or accepting worse glyphs.
- **The rules are heuristics, and they have not met paper.** Both were validated by
  rendering a real chart at 9px on screen — which is how the rotation variants and the
  `★`/`◆` blob collision were caught — but not yet at 5pt in the actual export font.
  `C`/`G`, `E`/`F` and `P`/`R` are the marginal survivors. If any fails in print, the cap
  drops by one for each glyph removed; the two numbers are the same number (#20).
- **Symbols are assigned by palette index, so they are stable only for a fixed `k`.**
  This is the sharpest limitation, and it partly undercuts §5.2's stability story.
  Reduction keeps *colours* stable as the slider moves, but the palette reorders by pixel
  count, so a colour that survives a merge can still be handed a different glyph.
  Measured on the dwarvish scout (31 distinct floss): **22 of the 30 slider steps
  reassign at least one surviving colour's symbol**, 124 reassignments in total — and not
  subtly, e.g. DMC 918 goes `◆` → `○` on a one-step move. So dragging the slider with the
  symbol overlay on (#18) will visibly churn even though the colours beneath do not.

  This is tolerable because an exported chart is produced at one chosen `k`, and within
  that chart every glyph is unique and stable. But it means a chart's symbol assignment
  is meaningful only alongside the colour count it was exported with, and two charts of
  the same sprite at different `k` are not glyph-comparable. If the churn proves
  distracting in the live preview, the fix is to assign symbols against the *base*
  palette's ordering rather than the reduced one — every reduced colour is a base colour
  (its medoid), so the mapping exists — at the cost that a low-`k` chart would no longer
  be guaranteed the most distinctive glyphs. That trade is deliberately not taken here;
  revisit under #18/#19 once the overlay is real enough to judge.

### 5.4 Pattern Preview & Grid (Req. 3, 4)

- Konva `Stage`, one `Layer` of `Rect`s — one rect per source pixel, 1:1, filled with
  its quantized/DMC colour. Transparent source pixels render as the user's chosen
  background colour (resolves §8 — background is configurable, not assumed-white
  Aida, so the preview matches what a non-white fabric would actually look like).
- A second optional layer overlays the DMC symbol per cell (toggleable — colour-only
  vs. symbol-only vs. both, matching what you'd actually print).
- Zoom/pan on the stage. At typical Wesnoth sprite sizes (64–144px) this is nowhere
  near a performance concern — no virtualization needed for v1.
- This preview is the thing that re-renders live as the user moves the colour-count
  slider, so quantization (§5.2) needs to be fast on every drag, not just on commit.

### 5.5 Export

Not a v1 focus for this doc — the prototype already produces PNG previews and
DMC-keyed PDF charts, and that logic is portable rather than something to redesign.
Main change: it now runs against the new pixel-grid + palette data structures instead
of the old flattened-image path.

## 6. Data Model (sketch)

```ts
interface SpriteAsset {
  path: string;          // absolute path in the checkout
  folder: string;         // e.g. "human-loyalists"
  thumbnail: Buffer;
}
// Note (#2): the IPC contract splits this sketch in two. The sprite list carries
// metadata only — SpriteSummary = { id, folder, name } — and the thumbnail is
// fetched separately via getThumbnail (returning a raw-RGBA DecodedImage, not a
// Buffer), so the grid doesn't ship thousands of buffers up front. See §4.

interface QuantizedPalette {
  colours: { lab: LabColor; rgb: RGB; dmc: DMCEntry; pixelCount: number }[];
  colourCount: number;    // user-chosen k (post-reduction)
  sourceColourCount: number; // distinct-DMC count, pre-reduction (§5.2 step 2, Req. 6 default)
}

interface PatternSettings {
  backgroundColour: RGB;  // fabric colour assumption; "no stitch" cells render as this
}

interface StitchPattern {
  width: number;
  height: number;
  cells: (number | null)[][]; // index into QuantizedPalette.colours, or null = no stitch
}
```

## 7. Future Extensions

### 7.1 Multi-branch / mod support (Req. 2)

Because sprite discovery is just "scan an images folder" (§5.1), this generalizes
cheaply: introduce an **asset source** concept — a named local path (mainline
checkout, an add-on folder, a different branch checked out elsewhere). The browser
groups thumbnails by source instead of assuming a single fixed path. No architectural
change needed beyond letting the user register more than one source in settings.

### 7.2 Batch Processing (Req. 7)

Since export logic already lives in the main process and is decoupled from the
renderer (§4), batch processing is a queue of `{ SpriteAsset, colourCount, exportOptions }`
jobs run through the existing single-sprite pipeline headlessly. The UI work is a
multi-select on the sprite browser plus a job-progress view — the underlying
quantize → map → export pipeline doesn't change.

### 7.3 Manual per-stitch colour override

Deferred from v1 (§2) since the automated pipeline is the whole point of getting
quantization right (§5.2). If added later: click a cell in the Konva grid, pick a
replacement DMC colour from a swatch list; the override needs to survive
re-quantization (e.g. store overrides as `{ cellIndex, dmcCode }` separate from
`StitchPattern.cells` and re-apply them after any pipeline re-run), otherwise
dragging the colour-count slider after making manual edits would silently discard
them.

### 7.4 Non-unit asset categories

Extend the sprite browser beyond `images/units/` (§5.1) to the rest of
`data/core/images/` — terrain, portraits, items, buildings, halo, etc. Same
filesystem-scan approach, just a configurable root instead of a hardcoded
`images/units/` path; likely folds into the **asset source** concept from §7.1.

### 7.5 In-app GitHub fetch

v1 requires a pre-existing local Wesnoth checkout (§5.1, §8). If that ever proves
too much setup friction for a distributable build (§3, packaging), the prototype's
GitHub-fetch-and-cache logic could be ported in as an alternative **asset source**
(§7.1) alongside local paths, rather than replacing local-checkout support.

## 8. Open Questions

- ~~**Symbol-set size:**~~ **Resolved (#16).** 37 glyphs — solid geometrics, their
  outline counterparts, one half fill, four strokes, then letters — all inside font-safe
  Unicode ranges, so the choice no longer waits on the PDF font (§5.5). The count is set
  by what stays legible at ~9px, under two rules: one orientation per shape family, and
  no two glyphs sharing an ink blob. See §5.3.
- ~~**Colour-count ceiling:**~~ **Resolved (#16), and not the way §5.2 guessed.** The cap
  is not a free choice: it *is* the symbol-set size, because a chart cannot show more
  colours than it has symbols to name. So `MAX_COLOUR_COUNT = 37`. A census over all
  7,116 sprites (§5.2) shows the full palette fits under it 93.2% of the time (95.8% at
  the old 40), with a median of 24 and a long tail to 94. The original framing — a safety
  ceiling for rare outliers — was wrong: about one sprite in fifteen exceeds the cap, so
  reduction runs routinely.
- **Still open for #20:** whether 37 glyphs *actually* read at print scale. The set was
  checked by rendering a real chart (dwarvish scout at `k=20`) in black and white at
  9px, which is what caught the rotation variants and the `★`/`◆` blob collision. The
  remaining marginal pairs are letters: `C`/`G`, `E`/`F`, `P`/`R`. If any fails on paper,
  dropping it lowers the cap by one — the two are the same number.

## 9. Milestones

1. Electron + Vite + React scaffold; sprite browser over a single hardcoded checkout
   path; click-to-preview at full res. No quantization yet.
2. Conversion pipeline (map to DMC first, then reduce over floss — Lab k-medoids/merge,
   monotone for slider stability — §5.2) + live 1:1 Konva grid preview with colour-count
   slider. Validate the
   40-colour default cap (§8) against a few real sprites here, including one with
   unusually rich shading, while the pipeline is still fresh to iterate on. Pin
   down the stitch-symbol set and its size (§5.3, §8), since it sets the slider's
   hard maximum.
3. Export parity with the prototype (PNG preview, PDF chart with floss key),
   including the configurable background colour (§5.4, §6).
4. Packaging: electron-builder installer target (§3), since the app is intended to
   be distributable to others, not just personal/dev use.
5. Future extensions: multi-source browsing (§7.1), batch processing (§7.2), manual
   per-stitch override (§7.3), non-unit asset categories (§7.4).
