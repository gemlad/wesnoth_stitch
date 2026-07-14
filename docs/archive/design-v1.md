# Wesnoth Stitch — design doc (v1, superseded)

> **Archived.** This is the Python-prototype-era design doc, kept for history.
> It was written before the Electron + TypeScript rewrite and is superseded by
> [design.md](../design.md), which restates the plan from scratch. Where the two
> disagree, `design.md` wins. Do not plan work from this file.

## Purpose of this doc
This is a planning reference for rebuilding the Wesnoth Stitch prototype as a desktop application, to be used as project context when working with Claude Code. It captures the current state, the target architecture, the feature set for v1, and open questions to resolve during build.

## Background
The existing prototype (`wesnoth_stitch/`, Python) fetches Battle for Wesnoth sprite assets from the official GitHub repository and converts them into cross-stitch patterns. It currently produces PNG previews and printable PDF charts with DMC floss keys, run locally from the command line.

## Goals for the rewrite
- Move from a script-driven prototype to a desktop app with a real GUI.
- Keep the core pipeline (fetch sprite → convert to stitch grid → map colors to DMC floss → export chart) but make it interactive and visual.
- Support iterating on a pattern before export: zoom, inspect, tweak colors, preview the printed chart.
- Stay a solo/hobby-scale project — favor simplicity and shippability over enterprise architecture.

## Target stack
- **Shell:** Electron (desktop wrapper)
- **Language:** TypeScript throughout (main + renderer)
- **Rendering:** Canvas-based grid editor — Konva.js or Fabric.js (both fit a stitch-grid/pattern-chart use case; pick one early and prototype with it before committing)
- **PDF export:** a JS PDF library (e.g. pdf-lib or jsPDF) for the printable chart output
- **Packaging:** electron-builder for distributable builds

*Open question: confirm Konva vs Fabric with a quick spike — rendering a grid of colored squares with zoom/pan in each, see which feels better to work with.*

## Architecture sketch
- **Main process:** file system access, GitHub asset fetching, PDF export, app lifecycle
- **Renderer process:** UI — sprite browser, pattern grid editor, DMC color key panel, export/print preview
- **Shared logic module:** sprite-to-stitch conversion and DMC color matching, written as plain TypeScript so it's testable independent of Electron and could be reused if a web version is ever built later

## Feature set for v1
1. **Sprite source browser** — browse/search Wesnoth sprite assets fetched from GitHub, select one to convert
2. **Pattern generation** — convert selected sprite into a stitch grid at a chosen size/density
3. **Pattern editor (core UI)**
   - Zoomable, scrollable grid view of the stitch chart
   - Click a cell to see/change its DMC color
   - Toggle a "simplify colors" pass to reduce the floss palette
4. **DMC color key panel** — live list of colors used in the current pattern with DMC codes and swatches
5. **Export**
   - PNG preview (as today)
   - Printable PDF chart with DMC key (as today), generated from the in-app pattern state rather than a one-shot script

## Out of scope for v1
- Custom/non-Wesnoth image import (revisit later if useful)
- Multi-pattern project management / saving multiple in-progress patterns
- Any cloud sync or sharing features

## UI design notes
- Three-pane layout: sprite browser (left), pattern grid editor (center, largest area), DMC key + export controls (right)
- Grid editor is the heart of the app — prioritize smooth zoom/pan and clear cell boundaries over decorative chrome
- Print preview should closely match the actual PDF output so there are no export surprises

## Migration notes from the Python prototype
- Sprite-fetching logic (GitHub API calls, asset paths) needs porting to TypeScript — check whether the same Wesnoth repo structure/endpoints are still used
- DMC floss matching (nearest-color logic) is the most valuable piece of existing logic to port carefully and test against known-good output from the Python version
- PDF chart layout (grid + key formatting) can likely be redesigned rather than ported line-for-line, since the prototype's version was script-generated rather than interactively previewed

## Roadmap (rough)
1. Spike: Konva vs Fabric grid rendering with zoom/pan
2. Port sprite-fetch and DMC-matching logic to TypeScript, with tests against prototype output
3. Build static pattern grid view (no editing yet) wired to ported logic
4. Add cell editing + DMC key panel
5. Add PDF export from in-app state
6. Polish: sprite browser, print preview, packaging

## Open questions to resolve before/during build
- Konva vs Fabric — decide via spike
- Exact DMC matching algorithm to port (confirm it's still desired as-is, or worth revisiting)
- Whether stitch density/size should be adjustable per-pattern or fixed for v1
- Packaging target — just for personal use, or eventually distributable to others?
