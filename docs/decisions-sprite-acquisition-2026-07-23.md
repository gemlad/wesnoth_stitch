# Decision — sprite acquisition for the packaged app (#69)

Spike outcome for Milestone 4. Decides how a **packaged, installed** Wesnoth Stitch obtains
the official **units** sprite set, given the fixed constraints from
[`milestone-4-tasks.md`](milestone-4-tasks.md): no bundled copy, easy for a non-technical
user (no git), Windows-first, offline-tolerant where reasonable.

Made autonomously (Gemma: "no decisions for me") on measured evidence, recorded here so #70
builds against a settled mechanism.

## The gap

`SPRITE_ROOT` is hardcoded to `app.getAppPath()/wesnoth-sprites/units` (`src/main/ipc.ts`) —
the gitignored **dev** set. A packaged build has no sprites at all. Something must fetch them
at runtime, and it must not be a bundled snapshot (Gemma's requirement: a shipped copy goes
stale against upstream).

## What the numbers rule out

Measured against `wesnoth/wesnoth@master`, 2026-07-23 (`gh api .../git/trees?recursive=1`):

| thing | measure |
|---|---|
| `data/core/images/units/**` — what we need | **7,266 files, 9.07 MB** uncompressed |
| whole repo working tree | **29,149 files, 1.15 GB** uncompressed |

- **Full-repo archive, extract the subtree** — GitHub's `codeload` tarball is the *entire*
  working tree. That is **~1.15 GB uncompressed** (hundreds of MB gzipped, and `codeload`
  sends no `Content-Length` so we couldn't even show a progress bar) to extract 9 MB. A
  ~100× waste on a first-run download for a non-technical user on an unknown connection.
  **Rejected.**
- **Per-file download** (raw.githubusercontent or the git blobs API, enumerated via one
  `git/trees` call) — **7,266 requests**. Unauthenticated GitHub is capped at **60/hr**;
  even with a token (which we would then have to ship — a non-starter) it is 7,266 fragile
  round-trips with no resumability. **Rejected.**
- **Blobless sparse clone** — what the *dev* fetch does, and it is correct there. But it
  needs **git on the user's machine**, which disqualifies the entire target audience.
  **Rejected for the shipped app** (kept for dev/maintainer use — see below).

GitHub has **no native "download this subdirectory as an archive"** endpoint, so there is no
one-request way to pull *just* the subtree directly from upstream. That absence is what forces
the decision below.

## Decision: a self-hosted slim units archive, refreshed at release time

**The app downloads a single `units.tar.gz` (~9 MB uncompressed, ~3–4 MB gzipped) that we
publish as a versioned asset on our own `gemlad/wesnoth_stitch` GitHub Releases**, caches it
to `app.getPath('userData')`, and offers an in-app "update sprites" action that re-pulls the
latest asset.

The asset is produced from upstream by a **maintainer script** — the existing blobless
sparse-clone fetch (already how `wesnoth-sprites/` is populated) piped to `tar`, exposed as
`npm run fetch:sprites`. **Refreshing it is a step in the release runbook (#73)**, so every
Wesnoth Stitch release carries a current sprite set, and users can pull a newer set
between-releases via the update action.

### Why this, over "always live from upstream"

The user's requirement is "don't **ship a copy in the app** that won't keep up to date." This
satisfies it: the sprites are **not bundled in the installer**, they are fetched separately and
are **independently refreshable** from the app itself. What we trade is "current to the second"
for "current as of our last refresh" — acceptable because (a) unit pixel art changes rarely,
(b) the refresh is automated into releasing, and (c) the in-app update closes the gap on
demand. In exchange we get the only option that is simultaneously **small** (one ~4 MB
download), **git-free**, **rate-limit-free**, **resumable**, and **progress-reportable** (our
asset serves a real `Content-Length`, unlike codeload).

### Consequences for downstream tickets

- **#70 (implementation)** builds: main-process download of the release asset → verify →
  extract to `userData/sprites/units` → point `SPRITE_ROOT` there when `app.isPackaged`
  (dev keeps `wesnoth-sprites/units`) → re-scan; plus the "update sprites" action and
  offline/partial-download handling. It also adds the `fetch:sprites` maintainer script and
  publishes the **first** sprite asset.
- **#73 (runbook)** gains a "refresh the sprite asset" step before cutting a release.
- **Pin vs track (task-doc Q1): pin.** The maintainer script fetches a **tagged upstream
  point**, not a moving `master`, so a given sprite asset is reproducible and never contains
  half-merged art. "Stays current" is served by re-running the fetch at each release, not by
  tracking `master` live.
- **Folder-picker fallback (task-doc Q2): deferred, not built for v1.** The download path is
  the single happy path. §5.1's local-checkout picker can return post-launch as an
  offline/advanced escape hatch if anyone asks; nothing here forecloses it.

### Attribution

The archive is Wesnoth art (GPLv2+ / CC-BY-SA 4.0). The download flow must carry the same
credit the export already stamps on every chart page (`shared/licence.ts`), and the release
asset's notes must state its upstream origin and licence. This dovetails with the licence
conformance work (#77).
