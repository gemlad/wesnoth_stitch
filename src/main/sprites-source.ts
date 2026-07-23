/**
 * Where a packaged build fetches its sprite set from (#70).
 *
 * Stable URLs on a dedicated `sprites` GitHub Release, so the app needs **no** GitHub API
 * call (and hits no rate limit): the maintainer replaces the two assets in place when
 * refreshing the set (see scripts/fetch-sprites.mjs and docs/RELEASING.md). The manifest is
 * tiny and carries the version + sha256, so the app can check for an update and verify the
 * download's integrity without downloading the ~4 MB archive first.
 *
 * Decision: docs/decisions-sprite-acquisition-2026-07-23.md.
 */
const RELEASE_BASE = 'https://github.com/gemlad/wesnoth_stitch/releases/download/sprites'

export const SPRITE_ASSET_URL = `${RELEASE_BASE}/units.tar.gz`
export const SPRITE_MANIFEST_URL = `${RELEASE_BASE}/units.manifest.json`
