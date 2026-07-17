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
| Canvas/grid | Konva.js, via `react-konva` (#18) | pick over Fabric because Konva's layer model suits a fixed grid of
coloured cells + a symbol-overlay layer better than Fabric's object-manipulation focus, which you don't need. `react-konva` 19.2 peers React 19.2, so it fits the app as it stands; with the grid collapsed to two `Shape`s (§5.4) its reconciler has almost nothing to do, and it buys the stage's mount/unmount and prop-driven redraw for free |
| Colour maths | `culori` | Lab colour space conversion + distance, needed for both
quantization and DMC matching |
| Image decoding | `pngjs` | pure-JS, deterministic RGBA decode in the main process (added #4); chosen over Electron's `nativeImage` to avoid platform BGRA/byte-order quirks and a native rebuild, and to keep exact source pixels for the quantizer (§5.2) |
| DMC floss data | reuse the prototype's dataset | prototype stores this as `dmc_colors.csv` (code, name, hex columns) — convert to JSON at build time or load the CSV directly, no need to re-source the data itself |
| PDF export | `pdf-lib` + `@pdf-lib/fontkit` (#34) | chosen over Chromium's `printToPDF` and over `jsPDF`. The chart's whole legibility argument (§5.3) rests on an exact **physical** cell size and on glyphs being **embedded vector text** — `printToPDF` renders through Chromium's font stack rather than an embedded face, which is precisely the gap #28 complains about, and `jsPDF`-from-canvas rasterises the glyphs. `pdf-lib` runs headless in the main process, so the export module is unit-testable like the rest of the pipeline |
| Chart/PDF font | **DejaVu Sans**, bundled (#32) | the set was constrained to font-safe ranges so *any* of DejaVu/Segoe/Arial would do (§8) — but the export embeds one anyway, so a chart renders identically on a machine that has never heard of Wesnoth. DejaVu is picked for **coverage headroom**: it carries the dingbat and box-drawing ranges the current set deliberately avoids, so §5.3's glyph pool can be reopened later (#30, D4) without also changing fonts. Licensed under the **Bitstream Vera Fonts License** (not the OFL, as an earlier note in this repo had it) — redistribution and bundling are permitted; the one condition that could bite, a ban on reusing the DejaVu/Vera names for *modified* faces, does not, since we ship it unmodified |
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
   partial coverage, so the choice is binary.
   **Every surviving translucent pixel is then composited over white** before it is
   mapped, so alpha decides *whether* there is a stitch and the composite decides *what
   colour* it is. See "Translucency is semantic" below — this is #20's finding, and it
   changed the pipeline (implemented in #15, corrected in #20).
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
`MAX_COLOUR_COUNT` (§5.3). The cap is the size of the legible stitch-symbol set — not a
number chosen here. A chart cannot show more colours than it has symbols to name, so the
symbol set is what binds. It opened at **37** and is **provisionally 49** after #30/D3
widened the glyph pool over the bundled font (§5.3); the print test (#28) may lower it again.

**Confirmed on purpose, not just in practice (decisions-pending.md §4).** This shipped in
#19 before ever being asked as a question — the slider simply defaulted to "sprite's own
count, capped." Gemma has since confirmed that is the wanted behaviour: no separate
fixed-small-palette mode. The sprite's own distinct-DMC count (capped at 37) stays the
slider's ceiling and default.

**Census (#16, re-run in #20 against the composited pipeline), over all 7,118 sprites in
the checkout** — the original guess of 40 was made blind, so it is worth recording what the
data actually says. Reproduce with `npm run validate:cap`:

| | distinct-DMC count |
|---|---|
| median | 24 |
| p90 | 35 |
| p99 | 47 |
| max | 95 (`merfolk/citizen.png`) |

Full palette fits under the cap — i.e. no reduction at default — for **93.0%** of sprites
at 37, against 95.7% at the originally-proposed 40. So lowering the ceiling to buy
legibility costs 2.7 points of coverage, or 189 extra sprites that reduce.

**Update (#30/D3): the cap is now provisionally 49**, and coverage jumps with it — the full
palette fits under 49 for **99.4%** of sprites, leaving only **41 (0.6%)** that reduce at
default, against 497 (7.0%) at 37. This did not come from deciding fidelity needed more
colours (#20 settled that it does not — see below); it came from widening the *legible
symbol set* now that a font is bundled (§5.3). Re-measure with `npm run validate:cap`, which
now reports `coverageAtCap`. The paragraphs below are the original 37-cap analysis, kept
because the fidelity argument they make is exactly why widening the *symbol* set — not the
colour budget — was the right lever.

This corrects an assumption above: reduction is **not** a rare safety net for outliers — at
least it was not at 37. Roughly one sprite in fourteen exceeded the cap at 37 (one in ~170
at 49), and the long tail (merfolk, yeti death frames, the jinn) runs to 95 distinct floss —
those are heavily shaded and anti-aliased despite being pixel art. Reduction is still a
load-bearing part of the pipeline for that tail, which is a good argument for the care taken
over its stability in step 3.

**What the cap actually costs, measured (#20).** Coverage says how *often* the cap binds,
not how much it hurts when it does. So: for every opaque pixel of the twelve richest
sprites (77–95 distinct floss), how far in Lab ΔE is the floss it ends up stitched in from
the floss it would have had at full fidelity?

| | pixel-weighted mean ΔE | for reference |
|---|---|---|
| capped at 37 | **1.14** | |
| capped at 40 | 0.97 | the original proposal |
| | | ΔE ≈ 2.3 ≈ one just-noticeable difference |

Even on the worst sprite in the checkout, the average pixel lands **half a JND** from
where full fidelity would have put it, and raising the cap to 40 improves that by 0.17 ΔE
— imperceptible — while rescuing only 189 sprites (2.7%) from reducing at all, and
demanding three more legible glyphs that do not exist (§5.3). The p95 is ~10 ΔE and the
max ~30, so a thin tail of pixels does shift visibly; the mean is what a stitched piece
reads as. **37 is generous. The colour cap was never the binding constraint — glyph
legibility is.** That inverts the framing §8 opened with.

#### Translucency is semantic, not coverage (#20)

§5.2 assumed the partial-alpha band was anti-aliased edge fringe. It is not, and the
`alphaThreshold` default sat exactly on top of the thing it isn't. Alpha across a
297-sprite sample:

| alpha | pixels |
|---|---|
| 0 (clear) | 80.09% |
| 255 (opaque) | 17.32% |
| everything else | 2.59% |

and that 2.59% is almost entirely **one value**: `alpha = 153`, 42,765 of the ~44,500
partial pixels. It is a single flat colour per sprite — pure black, or `rgb(23,0,53)` —
occupying the rows at and below the sprite's lowest opaque pixel, in **269 of 297**
sprites. It is Wesnoth's **drop shadow**, drawn at 60% opacity. Twenty-four sprites in the
checkout are nothing else, and are named accordingly (`*-shadow.png`, `sand-halo-*.png`).
It accounts for **12.57% of every stitched cell in the checkout**.

Taken at face value that pixel is `rgb(0,0,0)`, so it was mapped to **DMC 310 Black** and
stitched at full strength: a hard black blob under the unit, spending a colour of the
37-colour budget on it. A stitch has no opacity, so there is no faithful way to render a
60% shadow *as drawn*.

**So translucent pixels are composited before mapping**: `src·α + matte·(1−α)`. The
shadow becomes the mid grey it looks like — `merfolk/citizen.png` now charts it as DMC 317
Pewter Gray DK rather than DMC 310 Black — in a floss you can actually buy. Alpha still
decides *whether* a pixel is a stitch; the composite decides *what colour* it is. That
split is why `alphaThreshold` stays at 128, and the histogram shows it is safe: there is
essentially nothing between alpha 96 and 224 except the shadow spike, so the threshold sits
in an empty region and its exact value does not matter.

**The matte is always white, never the user's fabric colour** — though the fabric colour is
the physically faithful choice, and the preview knows it (`PatternSettings.backgroundColour`,
§6). Two reasons. It would make the palette a function of a *view* setting, so nudging the
fabric picker would re-run quantization, invalidate the plan cache (§4) and churn every
colour and glyph on the chart. And it would put UI state inside `pipeline/`, which is
deliberately a pure function of pixels and floss. White is the conventional chart reference,
and it keeps a sprite's pattern the same object whatever cloth it ends up on.

This is what moved the census: citizen goes 94 → 95 distinct floss, because the shadow's
black no longer collapses onto DMC 310 alongside the sprite's own black pixels.

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

**Confirmed against the live slider (#19):** stepping `merfolk/citizen.png` from `k = 12`
to `k = 11` in the running app leaves all 11 of the surviving floss codes exactly as they
were, and introduces **no** code that was not already in the `k = 12` palette. The palette
really does only merge. Glyphs are the exception, and churn — see §5.3.

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

**The set, pinned down (#16), then widened (#30/D3).** `STITCH_SYMBOLS` holds
**49 glyphs** — the original 37, plus a provisional block of 12 appended by #30/D3 (below).
It is ordered by *distinctness* rather than codepoint. Symbols are handed out in array order
and the palette is sorted dominant-floss-first (§5.2), so a low-`k` chart spends only the top
of the list — bold, unmistakable silhouettes — and detail degrades gracefully as `k` climbs.
The original nine tiers:

1. **Solid geometrics** (4) — separable by silhouette alone: `● ■ ▲ ◆`
2. **Outline counterparts** (5) — same silhouettes, inverted fill: `○ □ △ ◇ ☆`
3. **Half fill** (1) — a third fill state: `◐`
4. **Strokes** (4) — a different visual class, thin and open: `+ × # =`
5. **Letters** (23) — the fallback commercial charts have always used: A–Z less `O` and
   `Q` (confusable with `○`) and `X` (with `×`, which reads better small).

**Provisional additions (#30/D3, 2026-07-17).** Appended after the validated 37 — so they
are spent only above `k = 37` — and used unchanged in both the on-screen overlay and the
printed chart (D5). They are *deliberately generous*: the print test (#28) is expected to
remove the ones that blob-collide on paper (`♦` against `◆`, `♠` against `▲`), so the block
adds candidates rather than a settled set. Appended rather than interleaved because the
assignment/ordering rule is itself under review (#30/D1); imposing a distinctness rank on
them now would pre-empt that.

6. **Card suits** (4) — strong filled silhouettes: `♥ ♣ ♦ ♠` (♦/♠ the expected #28 casualties)
7. **Textured square** (1) — a fill state distinct from solid `■` and open `□`: `▦`
8. **Print marks** (4) — typographic, drawn to stay distinct small: `† ‡ § ¶`
9. **Restored numerals** (3) — the three digits with no letter twin: `3 4 7`

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
prototype shipped. Most digits stay out — `0`/`O`, `1`/`I`, `2`/`Z`, `5`/`S`, `6`/`G`,
`8`/`B` and `9`/`P` all collide with letters — but `3 4 7` have no letter twin and are
restored in tier 9 (#30/D3). On code points: the original 37 were each a single BMP code
point from Basic Latin, Latin-1, Geometric Shapes, or the outline star — ranges with
near-universal coverage, so the set survived *any* font. The provisional additions reach
into Miscellaneous Symbols (`♥ ♣ ♦ ♠`) and General Punctuation (`† ‡ § ¶`), which are **not**
universal; that is safe only because the export now bundles and embeds DejaVu Sans (#32,
§5.5) and `font-coverage.test.ts` asserts every codepoint in the set resolves in it rather
than falling back to tofu. The bundled font, not the range, is the guarantee (#30/D4).
Asking for a symbol past the end throws rather than wrapping; the prototype's `i % len`
silently aliased two colours onto one glyph.

`MAX_COLOUR_COUNT = STITCH_SYMBOLS.length` is the slider's **hard maximum** (read by #19)
and the effective colour cap — see the census in §5.2. It opened at 37 and is
**provisionally 49** after #30/D3. Raising it required exactly what §8 said it would: **the
symbol set had to grow first**, and it could only grow past the font-safe ranges once a font
was bundled. The number is not settled — every provisional glyph that fails the print test
(#28) removes itself and drops the cap by one.

#### Limitations of the hard limit

The ceiling is a real constraint with real costs, and they should be understood before
anyone tries to raise it:

- **It is a limit on charting, not on stitching.** Nothing stops you stitching 95 floss
  colours. The cap exists because a *printed black-and-white chart* must name each colour
  with a glyph you can tell apart from every other. That is the most demanding consumer
  of the palette, and it sets the budget for everything upstream.
- **At the provisional cap of 49, only 41 sprites (0.6%) cannot be charted at full
  fidelity** — down from 497 (7.0%) at 37. They exceed 49 distinct DMC and must reduce
  (§5.2). The extreme case, `merfolk/citizen.png`, has 95 distinct floss and still loses 46
  of them. #20 measured what that loss is worth at 37: a pixel-weighted mean of 1.14 ΔE,
  half a just-noticeable difference; widening the cap only shrinks it. Reduction is designed
  to make that loss principled rather than arbitrary — but it is still a loss.
- **The cap is imposed on the preview by the export.** The on-screen colour preview
  (§5.4) and the PNG export need no symbols and could carry far more colours. The slider
  is capped globally anyway, so that what you preview is always what you can export. A
  preview you cannot turn into a chart would be worse than a lower ceiling.
- **Raising it further is not cheap, and part of the pool is provisional.** The bundled
  font (#32) reopened the ranges the original 37 avoided, which is where the 12 additions
  came from — but each new glyph still has to earn its place against the two rules *and* the
  print test. The current additions are candidates, not survivors: `♦` and `♠` in
  particular are expected to fail against `◆` and `▲` on paper. Beyond them the remaining
  distinct silhouettes thin out fast, and the ordered-ink-ramp glyphs (shades, circle
  fills) only pay off if the assignment rule changes to map ink to area — which is #30/D1,
  not a free addition.
- **The rules are heuristics, and the widened set has not met paper.** The original 37 were
  validated by rendering a real chart at 9px on screen — which caught the rotation variants
  and the `★`/`◆` blob collision — but not yet at ~5pt in the actual export font. The
  marginal letter pairs `C`/`G`, `E`/`F`, `P`/`R` remain, and the 12 new glyphs join them as
  unproven-in-print. If any fails, the cap drops by one for each glyph removed; the count and
  the cap are the same number. This is #28, deliberately deferred until the set settles.

  **#20 built the test but could not take it.** `npm run uat:legibility` renders
  `uat/glyph-legibility-test.pdf`: seven A4 pages at exact physical size —
  a 100mm calibration ruler, the whole set at four cell sizes, a side-by-side and
  *separated* drill on the marginal pairs, a blind identification task, and two real
  charts (dwarvish scout at `k=20`, merfolk citizen at `k=37`). The scale that matters is
  **2.36 mm per cell**: a 72-cell sprite across A4's printable width, which puts the glyph
  at ~4.8pt — that is where "legible at ~5pt" comes from. Two caveats the sheet cannot
  remove: it renders through Chromium with the app's font stack, not the export font
  (§5.5 does not exist yet), and the verdict is a human judgement. Tracked as #28.
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

#### Gemma's answers on #30's D1–D5 (decisions-pending.md §1, §3)

**What failed UAT (the question #30 was left waiting on):** not individual glyph
confusion, but that the assignment rule concentrates the boldest glyphs on the
sprite's largest, dominant-coloured regions — the near-solid black field on
`merfolk/citizen` at `k=37` this section already describes. That confirms the
"heaviest glyphs land on the largest areas" finding is the real defect, not a
side-observation.

- **D2 — churn is not a priority.** Keep assigning against the *reduced* palette
  (index order), as today. The base-palette escape hatch above is not worth taking
  just to kill churn; if D1's inverse-density work changes the assignment rule anyway,
  churn may fall out of that for free.
- **D3 — bring back distinct numerals, and widen the pool.** Once the glyph set is
  being redesigned around a bundled font (D4, §3 below), revisit whether `3 4 7` (and
  other glyphs excluded only for font-safety, not for confusability) are worth
  re-admitting. This folds into the same design-exploration work as §3's "do we bundle
  an export font" question — see there for what's still open.
- **D5 — yes, one set for both.** The on-screen overlay and the printed chart use the
  same `STITCH_SYMBOLS`/`symbolsFor` — already true in code (both consumers call the
  same function), and now confirmed as the intended design, not an accident of not
  having built two.
- **D1 — still open, and now scoped as a concrete deliverable.** Gemma asked for real
  comparative renders rather than a decision made on paper: inverse-density (large
  areas get the lightest glyphs — the opposite of today), stability (minimise churn
  across `k`), and an interleaved rule (most-distinct, then least-dense, then
  next-most-distinct, …). This is the next piece of work — see the note added to #30.

### 5.4 Pattern Preview & Grid (Req. 3, 4)

- Konva `Stage` with two `Layer`s, each holding a **single `Shape`** whose `sceneFunc`
  draws every visible cell: one for the colour grid, one for the symbol/grid overlay.
  Cells are 1:1 with source pixels, filled with their quantized/DMC colour. Transparent
  source pixels render as the user's chosen background colour (resolves §8 — background
  is configurable, not assumed-white Aida, so the preview matches what a non-white fabric
  would actually look like).
- The overlay layer draws the per-cell DMC symbol (toggleable — colour-only vs.
  symbol-only vs. both, matching what you'd actually print) *and* rules the cell grid,
  with a heavier line every 10 cells. In symbol-only mode that grid is the only thing
  separating one stitch from the next, which is why every printed chart has one. Glyph
  ink is picked per cell by WCAG contrast against whatever sits behind it, so a symbol
  never disappears into a dark navy floss or a pale fabric.
- Zoom/pan on the stage. Zoom *is* the stage's scale, so one stage unit is one source
  pixel and the drawing code works in whole cell coordinates, never pixels. Symbols are
  sized in cell units and scaled by the stage transform, which Chromium does exactly
  (measured: a `0.72px` font under `scale(16)` matches an `11.52px` font, glyph for
  glyph, to <0.001px of advance width). Both scene functions cull to the visible cell
  range — zoom is unbounded above, so at 48× only a few hundred of 5,184 cells are on
  screen.
- This preview is the thing that re-renders live as the user moves the colour-count
  slider, so quantization (§5.2) needs to be fast on every drag, not just on commit.

#### Why not one `Rect` per source pixel (#18)

**Until #18 this section specified one `Konva.Rect` per source pixel, and asserted that at
Wesnoth sprite sizes this is "nowhere near a performance concern — no virtualization
needed for v1". Nobody had measured it. It is wrong.** On a 72×72 sprite (5,184 cells),
in Electron, median of 10 draws:

| | node-per-cell | one `Shape` + `sceneFunc` |
|---|---:|---:|
| build | 87.3 ms | 3.7 ms |
| recolour every cell + redraw | 12.9 ms | 1.9 ms |
| redraw, nothing changed | 10.9 ms | — |
| zoom step | 14.5 ms | 2.1 ms |
| symbol overlay redraw | 55.5 ms (3,631 `Text` nodes) | 2.6 ms |

A 10.9 ms floor to redraw an *unchanged* layer already eats two thirds of a 16.7 ms frame
before React or the ~1.9 ms conversion (§4) get a turn, so the live slider could not have
hit 60 fps on top of it; and 3,631 `Konva.Text` nodes cost 55.5 ms per redraw — 18 fps to
pan a *static* chart. Collapsing each layer to one `Shape` whose `sceneFunc` loops
`fillRect`/`fillText` removes the per-node overhead. Measured in the real app afterwards,
both layers redraw in **1.0 ms** at fit zoom and **0.3 ms** zoomed in (culling), against a
~1.9 ms warm conversion — leaving ~14 ms of the frame spare for §5.2's slider.

Those loops live in `src/renderer/src/pattern/draw.ts` as pure functions over a structural
`DrawContext` rather than behind Konva's types, so they unit-test against a recording fake
with no jsdom and no canvas.

#### The colour-count slider (#19)

The slider runs from 1 to **the sprite's own distinct-DMC count, capped at
`MAX_COLOUR_COUNT`** — not to the symbol-set ceiling unconditionally. `convertSprite`
treats "more colours than the sprite has" as a no-op rather than an error, so a slider
that always ran to 37 would have a dead zone at the top of every simple sprite, where
dragging changed nothing and the readout disagreed with the handle. Its default position
is its maximum, which is exactly what makes Req. 6 visible: a 13-floss bat opens at 13/13,
and `merfolk/citizen.png` opens at 37/37 with "reduced from 94".

**Requests overlap, and IPC replies are not ordered.** `ipcMain.handle` services calls
concurrently, so nothing stops the reply for `k = 18` landing after the reply for `k = 17`
and repainting the grid at a colour count the slider has left. Serialising the calls would
cost a whole round-trip of lag per step, so instead every request carries a sequence number
and only the newest may land (`pattern/latest-only.ts`). Verified in the running app: 40
overlapping conversions fired back-to-back with out-of-order `k`s leave the grid on exactly
the final `k`, with all 814 stitched cells matching that palette.

**No prewarm is needed.** Selecting a sprite already converts it at the default `k`, and
that call populates the main process's per-sprite plan cache (§4). The slider only appears
once it returns, so the first drag step is always warm — which answers the prewarm question
`convert.ts` left open.

**A slider step costs ~4 ms end to end.** Measured in the running app on the worst sprite
in the checkout (94 distinct floss):

| | ms |
|---|---|
| `convertSprite` round-trip, warm | 1.6 (p95 2.9) |
| `structuredClone` of the whole payload | 0.7 |
| both Konva layers redrawn | 0.6 (p95 0.9) |
| **input event → grid repainted** | **4.2** (p95 31) |

The p95 is one display refresh, not work: an IPC reply that misses the current frame waits
for the next paint. Payload size is not the constraint — a 13-floss sprite costs the same
as the 94-floss one, and a trivial IPC call on the same wire costs 1.8 ms, so the round
trip is at the floor of IPC latency rather than dominated by serialization.

**Rejected for now: flattening `StitchPattern.cells` to an `Int16Array`.** `convert.ts`
names this as the lever if the grid outgrows the budget, and it does work — cloning the
5,184-cell nested `(number | null)[][]` costs 0.6 ms, the equivalent flat `Int16Array`
costs 0.0 ms (41 KB → 10 KB). But that is 0.6 ms off a 4.2 ms step, bought with a change to
a shared type that the pipeline, the IPC contract, the grid and their tests all speak. Not
worth it at this size. Revisit if a larger grid (§7.4) or export (§5.5) makes the payload
the constraint it currently is not.

### 5.5 Export

Still not a redesign — the prototype already produces PNG previews and DMC-keyed PDF
charts, and that logic is portable. The main change is what it runs against: the
`StitchPattern` / `QuantizedPalette` structures (§6) instead of the old flattened-image
path. Milestone 3; broken down in `milestone-3-tasks.md`.

**PNG.** One block of N×N pixels per stitch, written with `pngjs` in the main process (no
canvas needed — it is already the decoder). "No stitch" cells take
`PatternSettings.backgroundColour`, not the prototype's hardcoded cream.

**PDF.** Multi-page, via `pdf-lib` (§3): a cover/stats page (dimensions, colour count,
finished size at Aida 11/14/16/18, and the Wesnoth artwork attribution the licence asks
for), floss key page(s) — swatch, glyph, DMC code and name, stitch count — then tiled
chart pages with gridlines bold every 10th.

**Two things the port must get right, both of which the prototype gets wrong:**

- **Cells are sized in millimetres, not in figure-relative units.** The prototype tiles at
  55 stitches per US-Letter page and lets the glyph size fall out of that. But §5.3's
  entire legibility case is stated in physical units — **2.36 mm per cell**, a 72-cell
  sprite across A4's printable width, putting a glyph at ~4.8pt. If the export does not
  lay out to a real physical size, "legible at 5pt" is unfalsifiable and #28's verdict
  means nothing.
- **Glyphs come from `symbolsFor()`, and running out is an error.** `chart.py:57` does
  `SYMBOLS[i % len(SYMBOLS)]` — it silently hands two floss colours the same glyph once it
  passes the end of its list, which is exactly the ambiguity a chart exists to prevent, and
  exactly why `symbolAt()` throws instead. Port the page layout; do not port that line.

The glyph font is **embedded, not assumed** (§3). §5.3 kept the set inside font-safe ranges
so the export would not be *blocked* on a font decision — but the export still bundles
DejaVu Sans, so that a chart prints the same everywhere, and so #28 can be judged against
the face the user actually gets. A test asserts every codepoint in the set resolves to a
real glyph rather than tofu (#32).

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
  symbolDisplay: 'colour' | 'symbol' | 'both';  // which chart layers are drawn (§5.4)
}
// Note (#18): this one does NOT live with the pipeline types. Nothing in the pipeline
// reads or produces it — mapSpriteToDmc, reduceTo and symbolsFor are pure functions of
// pixels and floss, and none of them care what colour the fabric is. Putting a view
// setting in shared/pipeline/types.ts would sit UI state inside the one module whose
// selling point is being headless and reusable. Both fields are consumed only by the
// preview (§5.4) and, later, export (§5.5), so it lives in the renderer, at
// src/renderer/src/pattern/settings.ts. It moves to shared/ipc.ts if and when export
// runs in the main process and it actually has to cross a process boundary.

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
  colours than it has symbols to name. So `MAX_COLOUR_COUNT = STITCH_SYMBOLS.length`. A
  census over all 7,118 sprites (§5.2) shows the full palette fits under 37 for 93.0% of
  them (95.7% at the old 40), with a median of 24 and a long tail to 95. The original
  framing — a safety ceiling for rare outliers — was wrong at 37: about one sprite in
  fourteen exceeded it. **Update (#30/D3):** the symbol set has since been widened to a
  provisional **49**, at which coverage is 99.4% and reduction is back to being rare (0.6%,
  one sprite in ~170). See §5.3.
- ~~**Is the cap generous enough?**~~ **Resolved (#20), and the question was the wrong way
  round.** Capping the twelve richest sprites at 37 moves the average pixel **1.14 ΔE**
  from where full fidelity would put it — half a just-noticeable difference. Raising the
  cap to 40 improves that to 0.97 ΔE, which nobody can see, while rescuing 2.7% of sprites
  from reducing. Colour fidelity was never the binding constraint. **Glyph legibility is,
  and it is the only thing holding the number down.** That is precisely why the lever that
  finally moved it (#30/D3) was widening the *legible symbol set* over a bundled font, not
  raising the colour budget — see §5.3.
- ~~**Anti-aliasing / `alphaThreshold`:**~~ **Resolved (#20), and the premise was wrong.**
  The partial-alpha band is not anti-aliasing fringe. It is one value — `alpha = 153` — and
  it is Wesnoth's drop shadow, present under 90% of sprites and worth 12.57% of every
  stitched cell in the checkout. Mapped at face value it charted as DMC 310 Black. Pixels
  above the threshold are now **composited over white** before mapping, so the shadow
  becomes the grey it looks like (DMC 317 on `merfolk/citizen.png`), and `alphaThreshold`
  stays at 128 — the histogram is empty either side of it, so its exact value is
  immaterial. See §5.2, "Translucency is semantic".
- **Still open — needs a printer, not a program — but deliberately deferred.** Whether the
  symbol set *actually* reads at print scale. The original 37 were checked by rendering a
  real chart (dwarvish scout at `k=20`) in black and white at 9px, which caught the rotation
  variants and the `★`/`◆` blob collision. Two groups remain unproven on paper: the marginal
  letter pairs `C`/`G`, `E`/`F`, `P`/`R`, and now the **12 provisional additions** widened in
  by #30/D3 — `♦` and `♠` especially, expected to collide with `◆` and `▲`. If any fails,
  dropping it lowers the cap by one — the count and the cap are the same number. #20 built
  the test sheet (`npm run uat:legibility`, §5.3) but the verdict is a human judgement, so it
  is tracked as its own issue (#28). **Gemma's call (decisions-pending.md §2): take the print
  test once the set has settled** — i.e. after #30/D1's assignment work — since the widened
  set is where the culling now happens.

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
   be distributable to others, not just personal/dev use. **Gated on UAT
   (decisions-pending.md §4):** does not start until Milestones 2 and 3 have passed UAT
   and are closed — i.e. #30 and #28 (§8) are resolved and the M2/M3 GitHub milestones
   have no open issues. First release is Milestones 1–4.
5. Future extensions: multi-source browsing (§7.1), batch processing (§7.2), manual
   per-stitch override (§7.3), non-unit asset categories (§7.4). Post-first-release work
   (page-overlap margins, colour-key display, distribution/Pattern Keeper compatibility,
   etc.) is tracked directly as GitHub milestones rather than enumerated here — see the
   repo's milestone list.
