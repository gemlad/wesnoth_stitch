/**
 * Maintainer script (#70): build the sprite asset the packaged app downloads.
 *
 * Produces, under dist-sprites/:
 *   - units.tar.gz        — the Wesnoth units set (top-level `units/` dir), ~4 MB gzipped
 *   - units.manifest.json — { version, ref, sha256, bytes, fileCount, generatedAt }
 *
 * Both are uploaded to the `sprites` GitHub Release (see docs/RELEASING.md); the app fetches
 * them from stable URLs in src/main/sprites-source.ts. Run at release time to refresh the set:
 *
 *   npm run fetch:sprites
 *
 * The sprites are pulled from a PINNED upstream tag (not master), so a given asset is
 * reproducible and never carries half-merged art — bump WESNOTH_REF to adopt a newer set.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { create as tarCreate } from 'tar'

/** Pinned upstream tag. Latest stable at time of writing; bump to refresh the set. */
const WESNOTH_REF = '1.18.7'
const SPRITE_SUBPATH = 'data/core/images/units'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../dist-sprites')

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: ['ignore', 'inherit', 'inherit'] })
}

function countFiles(dir) {
  let n = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) n += countFiles(join(dir, entry.name))
    else n += 1
  }
  return n
}

async function main() {
  console.log(`Fetching Wesnoth units from tag ${WESNOTH_REF} …`)
  const tmp = mkdtempSync(join(tmpdir(), 'wesnoth-sprites-'))
  try {
    // Blobless, sparse, shallow clone of just the units subtree — ~9 MB, no history/blobs.
    git(process.cwd(), 'clone', '--filter=blob:none', '--sparse', '--depth', '1', '--branch', WESNOTH_REF,
      'https://github.com/wesnoth/wesnoth', tmp)
    git(tmp, 'sparse-checkout', 'set', SPRITE_SUBPATH)

    const unitsParent = join(tmp, dirname(SPRITE_SUBPATH)) // <tmp>/data/core/images
    mkdirSync(outDir, { recursive: true })
    const tarPath = join(outDir, 'units.tar.gz')

    console.log('Creating units.tar.gz …')
    await tarCreate({ gzip: true, file: tarPath, cwd: unitsParent, portable: true }, ['units'])

    const bytes = statSync(tarPath).size
    const sha256 = createHash('sha256').update(readFileSync(tarPath)).digest('hex')
    const fileCount = countFiles(join(unitsParent, 'units'))

    const manifest = {
      version: WESNOTH_REF,
      ref: WESNOTH_REF,
      sha256,
      bytes,
      fileCount,
      generatedAt: new Date().toISOString()
    }
    writeFileSync(join(outDir, 'units.manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

    console.log(`\nDone. ${fileCount} files, ${(bytes / 1e6).toFixed(1)} MB, sha256 ${sha256.slice(0, 12)}…`)
    console.log(`Wrote ${tarPath}`)
    console.log('Upload units.tar.gz and units.manifest.json to the `sprites` GitHub Release.')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
