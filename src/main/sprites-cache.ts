import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Where the sprite set lives, and whether it is ours to manage (#70).
 *
 * Deliberately free of any Electron import so it unit-tests in plain Node — the IPC layer
 * (ipc.ts) passes in `app.isPackaged` / `getAppPath()` / `getPath('userData')`.
 */
export interface SpriteLocation {
  /** Directory scanSprites walks — always `<cacheDir>/units`. */
  root: string
  /** Writable directory the downloaded archive installs into. */
  cacheDir: string
  /** File recording the installed sprite-set version, a sibling of `units/` so it is never
   *  mistaken for a sprite or touched by the overlay install. */
  versionFile: string
  /** false in dev (the set is the repo's `wesnoth-sprites/`, hands-off); true in a packaged
   *  build (the set is downloaded to userData and we may re-download it). */
  managed: boolean
}

/**
 * Resolve where sprites are, given the runtime.
 *
 * - **dev** (`!isPackaged`): the repo's `wesnoth-sprites/units`, exactly as before — the
 *   existing dev workflow and tests are untouched, and we never download over it.
 * - **packaged**: `<userData>/sprites/units`, writable and outside the read-only asar, which
 *   is why `SPRITE_ROOT` can no longer be a constant pointing inside the app bundle.
 */
export function resolveSpriteLocation(opts: {
  isPackaged: boolean
  appPath: string
  userDataPath: string
}): SpriteLocation {
  const cacheDir = opts.isPackaged
    ? join(opts.userDataPath, 'sprites')
    : join(opts.appPath, 'wesnoth-sprites')
  return {
    root: join(cacheDir, 'units'),
    cacheDir,
    versionFile: join(cacheDir, 'units.version'),
    managed: opts.isPackaged
  }
}

/** True if `root` is a directory holding at least one entry — the "sprites are installed"
 *  test that decides `ready` vs `absent`. An empty or missing folder counts as absent. */
export async function hasSprites(root: string): Promise<boolean> {
  try {
    const s = await stat(root)
    if (!s.isDirectory()) return false
    const entries = await readdir(root)
    return entries.length > 0
  } catch {
    return false
  }
}

/** The installed sprite-set version, or null if none is recorded (dev, or never downloaded). */
export async function readInstalledVersion(versionFile: string): Promise<string | null> {
  try {
    const raw = (await readFile(versionFile, 'utf8')).trim()
    return raw || null
  } catch {
    return null
  }
}

/** Record the installed version. Written *last* in an install, so an interrupted install does
 *  not claim to be a version it did not finish writing. */
export async function writeInstalledVersion(versionFile: string, version: string): Promise<void> {
  await mkdir(dirname(versionFile), { recursive: true })
  await writeFile(versionFile, version, 'utf8')
}
