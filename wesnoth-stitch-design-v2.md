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

## 2. Non-Goals (v1)

These are explicitly deferred — designed for, but not built yet:

- Browsing sprites from mods/add-ons or non-mainline branches (Req. 2)
- Multi-select / folder batch processing (Req. 7)
- In-app WML unit-definition parsing (name/faction metadata) — v1 browses image files
  directly rather than resolving Wesnoth's unit-type config files, see §5.1.

Keeping these as extensions rather than v1 scope is deliberate: both bolt onto the
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
| DMC floss data | reuse the prototype's dataset (JSON) | no need to re-source this |
| Persistence | flat JSON files (recent sources, last settings) | no need for a DB at this scale |

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

### 5.2 Colour Quantization (Req. 5, 6)

This is the part the prototype got wrong, so it's worth being explicit about *why* it
flattened images too much and how v2 avoids that.

**The prototype's likely failure mode:** naive palette reduction (posterizing, or
nearest-colour-in-RGB-space clustering) treats colour distance in raw RGB, which
doesn't match human perception — two shades that are visually close can be far apart
in RGB, and two shades that are visually distinct can be RGB-close. The result is
that visually important detail gets merged away while near-duplicate shades survive
as separate colours, wasting your colour budget.

**v2 approach:**

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
capped at a sane ceiling (proposing 40 — a typical Wesnoth sprite has well under
this, but a badly-antialiased one could theoretically have hundreds of near-duplicate
shades, which is exactly the case where you *want* clustering to kick in even at the
"default"). Worth confirming that cap with a real sprite once this is built.

### 5.3 DMC Floss Mapping

Convert each cluster centroid (post-quantization) to Lab, nearest-neighbour search
against the DMC floss Lab reference table, assign floss code + a stitch symbol.
Symbol assignment needs a collision strategy if the colour count exceeds the size of
a legible symbol set — flagging this in Open Questions (§8) rather than deciding now.

### 5.4 Pattern Preview & Grid (Req. 3, 4)

- Konva `Stage`, one `Layer` of `Rect`s — one rect per source pixel, 1:1, filled with
  its quantized/DMC colour. Transparent source pixels render as empty (no stitch).
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

interface QuantizedPalette {
  colours: { lab: LabColor; rgb: RGB; dmc: DMCEntry; pixelCount: number }[];
  colourCount: number;    // user-chosen k
  sourceColourCount: number; // exact-duplicate count, pre-quantization
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

## 8. Open Questions

- **Symbol collisions:** what happens when colour count exceeds a legible set of
  distinguishable stitch symbols? Cap colour count, or allow repeats with colour as
  the primary distinguisher?
- **Checkout location:** v1 assumes the user points at an existing local git
  checkout. Worth confirming that's fine long-term vs. eventually wanting in-app
  clone/pull.
- **Transparency/background assumption:** are we assuming white Aida cloth (no
  stitch = show background), or does the export need a background-colour option?
- **Colour-count ceiling:** is 40 the right default cap, or should this be checked
  against a few real high-colour sprites first?

## 9. Milestones

1. Electron + Vite + React scaffold; sprite browser over a single hardcoded checkout
   path; click-to-preview at full res. No quantization yet.
2. Quantization pipeline (Lab k-means) + DMC mapping + live 1:1 Konva grid preview
   with colour-count slider.
3. Export parity with the prototype (PNG preview, PDF chart with floss key).
4. Future extensions: multi-source browsing (§7.1), batch processing (§7.2).
