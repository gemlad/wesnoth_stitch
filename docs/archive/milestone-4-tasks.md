# Milestone 4 — Task Breakdown

Source: §9 Milestone 4 of `design.md` — "Packaging: electron-builder installer target,
since the app is intended to be distributable to others, not just personal/dev use." This
is the **first-release** milestone: Milestones 1–4 together are v1.

Each task is sized to merge in one sitting on its own branch (per-task branching) — same
rhythm as Milestones 1–3.

## Status

**Live status is tracked in GitHub Issues, not here.** These tasks map to issues
**#69–#77** under the [Milestone 4 — Packaging](https://github.com/gemlad/wesnoth_stitch/milestone/4)
milestone; run `gh issue list --milestone "Milestone 4: Packaging"` for current state. This
doc is the *design rationale* — don't record done/in-progress here.

## The gate is clear

Milestone 4 was gated (`decisions-agreed-2026-07-23.md` §4) on Milestones 2 and 3 passing
UAT and closing. **They have:** M1, M2 and M3 are all closed with zero open issues, and #28
and #30 (the last human-verdict blockers) are resolved. M4 is unblocked.

## Three decisions taken up front (Gemma, 2026-07-23)

These framed the whole milestone before any ticket was written:

1. **Windows only, for first release.** Gemma is on Windows 11 — the only platform buildable
   and testable end-to-end without extra cost. NSIS installer. Mac (needs a Mac + Apple
   notarization at $99/yr to clear Gatekeeper) and Linux are deferred to a later release once
   the flow is proven.
2. **Sprites are downloaded, not bundled or hand-supplied.** See the scope shift below.
3. **Ship unsigned; document the warning.** No code-signing certificate for first release.
   Windows SmartScreen will show an "unknown publisher" prompt; the README walks the user
   through **More info → Run anyway**. Normal for a free hobby app, and it keeps the release
   free.

## Scope shift: in-app sprite fetch is pulled forward from §7.5

This is the one real departure from `design.md` as written, and it is deliberate.

- **§5.1 (v1 sprite source)** has the user point the app at a *local Wesnoth checkout* via a
  folder picker — "no in-app git cloning in v1; you almost certainly already have a checkout."
- **§7.5 (future extension)** parks in-app GitHub fetch as a *later* option "if that ever
  proves too much setup friction for a distributable build."

For **this** audience — "fairly simple to run for someone with limited-to-no experience of
git or programming" — the local-checkout assumption is exactly the friction §7.5 anticipated,
and "you already have a checkout" is false. So **M4 promotes §7.5's in-app fetch into
first-release scope**, and the folder-picker becomes at most an advanced fallback (a call the
spike makes).

There is also a concrete gap forcing the issue: `SPRITE_ROOT` is currently hardcoded to
`app.getAppPath()/wesnoth-sprites/units` (`src/main/ipc.ts:25`) — the **gitignored dev set**.
A packaged build has no sprites at all. Something has to replace it, and bundling a snapshot
is ruled out (it would go stale against the official set — Gemma's requirement). That makes
the acquisition mechanism the milestone's critical path.

## Tasks

### 1. Spike: how the installed app gets the sprite set (#69) — **DECIDED**
- Branch: `spike/sprite-acquisition`
- **Outcome recorded in
  [`decisions-sprite-acquisition-2026-07-23.md`](decisions-sprite-acquisition-2026-07-23.md).**
  The measured evidence killed the obvious options — a full-repo tarball is **1.15 GB** to
  extract 9 MB, per-file download is **7,266 requests** against a 60/hr cap, and a sparse
  clone needs git the audience doesn't have. **Decision:** the app downloads a **self-hosted
  slim `units.tar.gz` (~4 MB)** published as a versioned asset on our own GitHub Releases,
  produced from a **pinned** upstream tag by a maintainer `fetch:sprites` script and refreshed
  as a release-runbook step, cached to `userData`, with an in-app "update sprites" action.
- Depends on: nothing. **On the critical path** — everything user-facing waited on its answer.

### 2. Sprite acquisition: download + cache + update (#70, #82)
- Branch: `feature/sprite-download`
- Implement the spike's choice. First-run download with progress → cache to `userData` →
  `SPRITE_ROOT` resolves there when `app.isPackaged` (dev keeps `wesnoth-sprites/units`) →
  re-scan → an "update sprites" action. Graceful offline/failure; a first run shows the
  download screen (`SpriteSetup`) rather than throwing `SpriteRootMissingError`. Integrity is
  checked against a `sha256` in the published manifest before install.
- **Install is non-destructive (#82).** The archive is *overlaid* onto the sprite folder
  (`fs.cp`, `force: true`) rather than swapping the folder out, so any sprite a user has
  added by hand survives an update; official files are overwritten, nothing is deleted.
- Depends on: 1.

### 3. App icon & branding (#71)
- Branch: `feature/app-icon`
- Replace the electron-vite **template** icon (`build/icon.ico`, `build/icon.png`,
  `resources/icon.png`) with a real Wesnoth-Stitch mark that reads at 16px and 256px. A
  *derived cross-stitch* mark, not Wesnoth's own logo.
- Depends on: nothing (parallel).

### 4. Finalise the Windows installer config (#72)
- Branch: `feature/win-installer-config`
- Turn the template `electron-builder.yml` into a real Windows config: **per-user NSIS**
  (`perMachine: false`, no admin prompt), desktop + Start-menu shortcuts, friendly uninstall.
  **Remove the placeholder `publish` block** (`example.com/auto-updates`) — first release has
  no auto-updater. Ensure `resources/**` (the bundled font) ships and `wesnoth-sprites/` does
  not. Trim the out-of-scope mac/linux target config.
- Depends on: nothing (parallel), but pairs with 5.

### 5. Release runbook & versioning (#73)
- Branch: `docs/releasing`
- **No GitHub Actions** (project runs local checks only). Write `docs/RELEASING.md`: bump
  `version`, run typecheck/test/lint, `npm run build:win`, publish a **GitHub Release** with
  the installer attached. Settle the first-release version (proposal: **1.0.0**).
- Depends on: 4.

### 6. Rewrite the README as a download-and-run guide (#74)
- Branch: `docs/readme-user-guide`
- Re-aim the README from the Python prototype to the shipped app, for a non-technical user:
  download from Releases → **run past the SmartScreen warning** (screenshot) → first-run
  sprite download → pick sprite, set colours/background, export PDF, print at 100%. Carry the
  Wesnoth / DejaVu / DMC-data credits. Move prototype run notes down into `prototype/`.
- Depends on (for accuracy): 1, 4.

### 7. Spike: choose the project's own licence (#76)
- Branch: `spike/licence`
- The repo is currently **unlicensed** (no `LICENSE`, no `package.json` `license` field) —
  "all rights reserved" by default, which contradicts the intent to distribute. Decide the
  **code** licence and confirm compatibility with the bundled DejaVu Sans (Bitstream Vera),
  the DMC dataset, and the npm dependency tree (mostly MIT/BSD/Apache). Draw the boundary
  explicitly: because sprites are now *downloaded, not bundled* (task 2), the app does not
  redistribute Wesnoth art — GPLv2+/CC-BY-SA governs the **exported charts** (already
  attributed), not the app's code.
- **Deliverable:** a dated `docs/decisions-*.md` + a conformance checklist handed to task 8.
- Depends on: nothing (parallel), but its boundary argument leans on 2's download-not-bundle
  decision.

### 8. Conform to the chosen licence (#77)
- Branch: `feature/licence-conformance`
- Add the top-level `LICENSE` + `package.json` `license` field; ship third-party notices
  (surface `resources/fonts/LICENSE.txt`, the DMC provenance, key deps) and confirm they land
  **in the packaged build**; expose the app's own licence + notices somewhere reachable
  in-app (About). Keep the code licence and the *art* attribution clearly separate.
- Depends on: 7. Relates to 6 (README) and 9 (smoke test verifies the notices ship).

### 9. Packaged-build smoke test / first-release UAT (#75)
- Branch: `uat/packaged-build`
- The **go/no-go gate**. Build the installer and drive the *installed* app (not `npm run
  dev`) through the whole flow on Windows: per-user install, SmartScreen path, first-run
  sprite download (+ offline case + update), browse → convert → export, PDF glyphs render in
  the bundled font with the licence footer on every page, the **LICENSE and third-party
  notices are present in the install**, no dev-path leaks, clean uninstall.
- Depends on: 2, 3, 4, 5, 8. **Gates the release.**

## Dependency shape

```
#69 spike ──▶ #70 download impl ──┐
                                  │
#71 icon ─────────────────────────┤
#72 installer config ──▶ #73 runbook ──┤──▶ #75 smoke test / UAT ──▶ cut release
#76 licence spike ──▶ #77 conformance ─┤
#74 README (needs #69, #72, #77 for accuracy)┘
```

Two independent long poles: the sprite-acquisition chain (#69 → #70) and the licence chain
(#76 → #77). #71/#72 run fully in parallel. Nothing ships until #75 passes.

## Open questions

### Q1 — Pin to a Wesnoth release tag, or track `master`? — **RESOLVED: pin.**
The maintainer `fetch:sprites` script targets a **tagged** upstream point, so each sprite
asset is reproducible and never contains half-merged art. "Stays current" is served by
re-fetching at each release plus the in-app update action — not by tracking `master` live.
See the [spike decision](decisions-sprite-acquisition-2026-07-23.md).

### Q2 — Is a folder-picker fallback worth building? — **RESOLVED: deferred, not v1.**
The download path is the single happy path for first release. §5.1's local-checkout picker
can return post-launch as an offline/advanced escape hatch; nothing in the chosen design
forecloses it.

### Q3 — Auto-update: now or later?
First release ships **without** an auto-updater (task 4 removes the stub), so updating means
re-downloading from Releases. Wiring electron-updater to GitHub Releases is a plausible
post-launch improvement, not v1 scope.

## Definition of done for Milestone 4

- A **Windows installer** (`wesnoth-stitch-<version>-setup.exe`) is published on the GitHub
  **Releases** page, installable per-user with no admin prompt.
- On first run the installed app **downloads the official Wesnoth sprite set** (no bundled
  copy, no git knowledge required) and the full pipeline — browse → colour slider → export
  PDF chart — works from the *installed* app, verified by #75.
- The **README** tells a non-technical user how to download, get past the unsigned-app
  warning, and use the app, with the required art/font/data attributions.
- The project has a **decided licence**, a top-level `LICENSE`, and third-party notices that
  ship in the installed build — the distributable is self-describing.
- A **release runbook** exists so the next release is repeatable.
- Post-first-release work (Mac/Linux targets, code signing, auto-update, and everything in
  Milestones 5–6) is tracked as its own GitHub milestones — not here.
