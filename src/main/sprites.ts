import { readdir, stat } from 'node:fs/promises'
import { join, extname, basename, sep } from 'node:path'
import type { SpriteSummary } from '../shared/ipc'

/**
 * Filesystem scanning for the sprite browser (§5.1). Deliberately free of any
 * Electron imports so it stays a plain, unit-testable module — the IPC handler
 * (ipc.ts) owns resolving the root path and wiring it to a channel.
 */

/** Image extensions we surface. Units are all .png today; .webp is future-proofing
 * to match the design doc's IMAGE_EXTS. Compared lower-case. */
const IMAGE_EXTS = new Set(['.png', '.webp'])

/** Thrown when the configured sprite root is missing, with a recovery hint. */
export class SpriteRootMissingError extends Error {
  constructor(root: string) {
    super(
      `Sprite folder not found at "${root}". It's gitignored, so a fresh clone ` +
        `won't have it — refetch with a blobless sparse clone of wesnoth/wesnoth ` +
        `(path data/core/images/units) into wesnoth-sprites/. See .gitignore.`
    )
    this.name = 'SpriteRootMissingError'
  }
}

/**
 * Recursively scan `root` and return every image as a {@link SpriteSummary},
 * sorted by folder then name so the grid (§5.1) renders deterministically.
 *
 * - `id`   — path relative to `root`, POSIX-separated (stable identifier).
 * - `folder` — the top-level segment under `root` (loosely the faction, e.g.
 *   "human-loyalists"); files sitting directly in `root` get "" (the UI groups
 *   these as ungrouped).
 * - `name` — basename without extension.
 *
 * Throws {@link SpriteRootMissingError} if `root` doesn't exist.
 */
export async function scanSprites(root: string): Promise<SpriteSummary[]> {
  try {
    const rootStat = await stat(root)
    if (!rootStat.isDirectory()) throw new SpriteRootMissingError(root)
  } catch (err) {
    if (err instanceof SpriteRootMissingError) throw err
    if (isErrno(err) && err.code === 'ENOENT') throw new SpriteRootMissingError(root)
    throw err
  }

  const sprites: SpriteSummary[] = []

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && IMAGE_EXTS.has(extname(entry.name).toLowerCase())) {
        // Relative path from root, normalised to POSIX separators for a stable id.
        const rel = full.slice(root.length).replace(/^[\\/]+/, '').split(sep).join('/')
        const firstSlash = rel.indexOf('/')
        sprites.push({
          id: rel,
          folder: firstSlash === -1 ? '' : rel.slice(0, firstSlash),
          name: basename(entry.name, extname(entry.name))
        })
      }
    }
  }

  await walk(root)

  sprites.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name))
  return sprites
}

/** Narrow an unknown catch value to a Node errno error. */
function isErrno(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err
}
