# Releasing Wesnoth Stitch

How to cut a first-class release. This project has **no CI** (deliberate — checks run
locally), so a release is **built on a Windows machine and uploaded by hand**. First release
is **Windows-only** (§9 Milestone 4).

## Versioning

Semver. **The first public release is `1.0.0`** — the `0.x` line was the pre-release dev
history. Bump `version` in `package.json` as step 2 below; the installer filename and the
in-app version follow from it.

## Prerequisites (one-off)

- Windows 10/11.
- Node via fnm (`.node-version` pins the version) — `npm install` done.
- [`gh`](https://cli.github.com/) authenticated to `gemlad/wesnoth_stitch`.

## Steps

### 1. Refresh the sprite asset *(once #70 lands)*

The app downloads its sprites from a `units.tar.gz` asset attached to the GitHub Release
(decision: [`decisions-sprite-acquisition-2026-07-23.md`](decisions-sprite-acquisition-2026-07-23.md)).
Regenerate it from a **pinned** upstream Wesnoth tag so the release carries a current set:

```bash
npm run fetch:sprites      # blobless sparse-clone of the pinned tag -> units.tar.gz
```

Attach the produced `units.tar.gz` in step 5. *(This script and the app-side download are
built in #70; until then the app still uses the dev set and this step is a placeholder.)*

### 2. Bump the version

Edit `version` in `package.json` (e.g. `1.0.0`), commit on a release branch.

### 3. Run the checks — all must pass

```bash
npm run typecheck && npm run test && npm run lint   # lint: 0 errors (CRLF warnings are pre-existing)
```

### 4. Build the Windows installer

```bash
npm run build:win
```

Produces `dist/wesnoth-stitch-<version>-setup.exe` — a per-user NSIS installer (no admin
prompt; see `electron-builder.yml`).

### 5. Smoke-test, then publish

Run the packaged-build smoke test (**#75**) against that installer *before* publishing — it is
the go/no-go gate. Then create the GitHub Release and attach the installer (plus the sprite
asset from step 1):

```bash
gh release create v<version> \
  "dist/wesnoth-stitch-<version>-setup.exe" \
  units.tar.gz \
  --title "Wesnoth Stitch <version>" \
  --notes-file release-notes.md
```

### 6. Release notes — include the SmartScreen note

The build is **unsigned**, so Windows SmartScreen shows an "unknown publisher" prompt. Every
release's notes must tell users how to get past it (mirror the README):

> Windows may warn that the publisher is unknown. Click **More info → Run anyway**. This is
> expected for a free, unsigned app.

## Not in scope for a release

- **Code signing** — deferred; hence the SmartScreen note above.
- **Mac/Linux builds** — Windows-only for now (`electron-builder.yml` carries no mac/linux
  targets).
- **Auto-update** — no update feed; users download the next installer from Releases.
