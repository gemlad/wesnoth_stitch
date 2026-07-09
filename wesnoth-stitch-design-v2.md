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

**IPC contract (implemented in #2).** The renderer↔main surface is three channels —
`getSpriteList`, `getThumbnail`, `getFullImage` — with channel names and payload
types defined once in `src/shared/ipc.ts` and imported by both processes so a handler
can't silently drift from its caller. Two shape decisions worth recording:

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

## 5. Core Workflows

### 5.1 Sprite Browsing & Selection (Req. 1)

Wesnoth's unit graphics live under `images/units/**/*.png` in a checkout of the repo.
Proper unit metadata (display name, faction, level) is defined separately in WML
`.cfg` files, and parsing WML fully is a project of its own.

**v1 approach:** treat the sprite browser as a filesystem browser over the images
directory, not a unit-database browser:

- User points the app at a local Wesnoth checkout (a plain folder picker — no in-app
  git cloning in v1; you almost certainly already have a checkout).
- App scans `images/units/` recursively, groups by subfolder (which loosely
  corresponds to faction, e.g. `human-loyalists/`, `undead/`), and shows thumbnails
  in a grid.
- Clicking a thumbnail loads it into the preview pane at full resolution.

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

**Approach:**

1. Convert every opaque pixel to Lab colour space (`culori`). Lab is designed so that
   Euclidean distance approximates *perceived* colour difference — this is the fix.
2. Count exact-duplicate colours first (cheap, gives you the "true" colour count of
   the sprite for Req. 6).
3. Run k-means clustering in Lab space, `k` = the user's chosen colour count,
   weighted by pixel frequency (so a colour used once doesn't get a whole cluster
   to itself at the expense of a colour used 500 times).
4. Map every pixel to its nearest cluster centroid. Transparent pixels are excluded
   from clustering entirely and stay transparent (they're not stitches).
5. Feed the resulting centroids into the preview (§5.4) immediately — this step needs
   to be fast enough to re-run live as the user drags a colour-count slider.

**Default colour count (Req. 6):** = the exact-duplicate colour count from step 2,
capped at a sensible ceiling (proposing 40). All Wesnoth sprites are hand-crafted
pixel art, not photographic/antialiased source images, so exact-duplicate colour
counts should stay naturally low and clustering shouldn't need to kick in for most
sprites at default — the cap is a safety ceiling for outliers (e.g. a sprite with
unusually rich shading), not something expected to bind routinely. **Open
question — see §8:** confirm 40 is actually generous enough once quantization is
built and can be run against real sprites.

**Stability while dragging the slider:** unseeded k-means can jitter between runs —
a colour could jump to a visually different centroid on a one-step slider move,
which would read as flicker rather than a smooth transition. Seed with a fixed
random seed (or k-means++) and, ideally, warm-start each run from the previous
`k`'s centroids so nearby `k` values produce visually stable, incrementally-changing
palettes rather than independent re-clusterings.

### 5.3 DMC Floss Mapping

Convert each cluster centroid (post-quantization) to Lab, nearest-neighbour search
against the DMC floss Lab reference table, assign floss code + a stitch symbol.

**Symbol collisions (resolves §8):** cap the colour-count slider's maximum at the
size of the legible stitch-symbol set, rather than allowing colour count to exceed
it. Guarantees every colour on a printed (including black-and-white) chart stays
visually distinguishable by symbol alone. The exact symbol-set size depends on the
font/glyph set chosen for the chart — pin that down alongside the PDF export design
(§5.5), since it determines the real ceiling.

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
  colourCount: number;    // user-chosen k
  sourceColourCount: number; // exact-duplicate count, pre-quantization
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

- **Colour-count ceiling:** is 40 the right default cap (§5.2), or should this be
  checked against a few real high-colour sprites first? Left open deliberately —
  validate during Milestone 2 (§9) once quantization exists to test against.
- **Symbol-set size:** §5.3 caps the colour-count slider at the legible stitch-symbol
  set size, but that size depends on the font/glyph set used for the PDF chart,
  which isn't chosen yet. Pin down alongside export design (§5.5).

## 9. Milestones

1. Electron + Vite + React scaffold; sprite browser over a single hardcoded checkout
   path; click-to-preview at full res. No quantization yet.
2. Quantization pipeline (Lab k-means, seeded for slider stability — §5.2) + DMC
   mapping + live 1:1 Konva grid preview with colour-count slider. Validate the
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
