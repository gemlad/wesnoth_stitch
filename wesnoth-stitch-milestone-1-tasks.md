# Milestone 1 — Task Breakdown

Source: §9 Milestone 1 of `wesnoth-stitch-design-v2.md` — "Electron + Vite + React
scaffold; sprite browser over a single hardcoded checkout path; click-to-preview at
full res. No quantization yet."

Each task below is sized to merge in one sitting on its own branch (per-task
branching, not per-milestone — milestones stay open too long and produce
unreviewable merges), roughly in dependency order.

## Scope note

Per the milestone text, the checkout path is **hardcoded** for M1 — no folder
picker yet. §5.1's folder-picker UX is out of scope until it's revisited, either
as an M1 stretch task or a follow-up. Flagging this now so it isn't assumed done
when M1 gets checked off.

The hardcoded path should point at the gitignored dev sprite set now in the repo:
`wesnoth-sprites/units/` (see §5.1 note in `wesnoth-stitch-design-v2.md` — ~7,100
files, refetch via a blobless sparse clone of `wesnoth/wesnoth`). Use a single
configurable `SPRITE_ROOT` constant rather than assuming the full
`data/core/images/units` repo layout.

## Tasks

### 1. Electron + Vite + React scaffold ✅ Done
- Branch: `scaffold/electron-vite-react` (merged in `1b952aa`, commit `c4fe3ac`)
- Set up electron-vite with TypeScript, React, main/renderer/preload split per §4.
- App launches to a blank window in dev mode.
- No IPC, no business logic yet — just confirming the toolchain boots.
- Depends on: nothing

### 2. IPC skeleton between main and renderer
- Branch: `scaffold/ipc-skeleton`
- Define a minimal typed IPC contract (e.g. `getSpriteList`, `getThumbnail`,
  `getFullImage`) per §4 — main owns filesystem/decoding, renderer only ever
  receives already-decoded data.
- Handlers can return hardcoded/fake data for now; this task is about locking the
  IPC shape early so later tasks build against a stable contract.
- Depends on: 1

### 3. Asset scanning (main process)
- Branch: `feature/asset-scan`
- Recursively scan the hardcoded `SPRITE_ROOT` (`wesnoth-sprites/units/`), group
  results by subfolder (§5.1), return `SpriteAsset[]` (path + folder) over the real
  `getSpriteList` handler from task 2.
- Surface a clear error to the renderer if `SPRITE_ROOT` doesn't exist — worth
  handling explicitly since the folder is gitignored, so a fresh clone won't have
  it until someone refetches the sprite set.
- Depends on: 2

### 4. Thumbnail generation (main process)
- Branch: `feature/thumbnails`
- Decode each PNG and produce a thumbnail buffer (main-process only, per §4).
- Wire into the `getThumbnail` IPC handler from task 2.
- Depends on: 3

### 5. Sprite browser grid (renderer)
- Branch: `feature/sprite-browser-ui`
- React component: grid of thumbnails grouped by folder (e.g. `human-loyalists`,
  `undead`), per §5.1.
- Consumes `getSpriteList` + `getThumbnail` over IPC.
- Depends on: 4

### 6. Full-resolution preview pane (renderer)
- Branch: `feature/preview-pane`
- Clicking a thumbnail requests the full-res decoded image via `getFullImage` and
  renders it at 1:1.
- Can be built in parallel with tasks 3–5 once the IPC shape from task 2 is
  locked, then wired together in task 7.
- Depends on: 2

### 7. Wire up click-to-preview end-to-end
- Branch: `feature/browser-preview-integration`
- Connect sprite browser (5) selection state to the preview pane (6); confirm the
  full click-through flow works against the real `wesnoth-sprites/units/` sprite set,
  not just each piece in isolation.
- This is the task where M1's "click-to-preview at full res" criterion actually
  gets verified live.
- Depends on: 5, 6

## Definition of done for Milestone 1

- App launches, shows a thumbnail grid scanned from the hardcoded `SPRITE_ROOT`
  (`wesnoth-sprites/units/`), grouped by subfolder.
- Clicking any thumbnail shows that sprite at full resolution in a preview pane.
- No quantization, no DMC mapping, no export — those are Milestone 2+.
