import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  hasSprites,
  readInstalledVersion,
  resolveSpriteLocation,
  writeInstalledVersion
} from './sprites-cache'

describe('resolveSpriteLocation', () => {
  it('uses the repo wesnoth-sprites/ in dev and marks it unmanaged', () => {
    const loc = resolveSpriteLocation({
      isPackaged: false,
      appPath: '/repo',
      userDataPath: '/user'
    })
    expect(loc.root).toBe(join('/repo', 'wesnoth-sprites', 'units'))
    expect(loc.cacheDir).toBe(join('/repo', 'wesnoth-sprites'))
    expect(loc.managed).toBe(false)
  })

  it('uses userData/sprites/ in a packaged build and marks it managed', () => {
    const loc = resolveSpriteLocation({
      isPackaged: true,
      appPath: '/app.asar',
      userDataPath: '/user'
    })
    expect(loc.root).toBe(join('/user', 'sprites', 'units'))
    expect(loc.cacheDir).toBe(join('/user', 'sprites'))
    expect(loc.versionFile).toBe(join('/user', 'sprites', 'units.version'))
    expect(loc.managed).toBe(true)
  })
})

describe('cache state on disk', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sprite-cache-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('hasSprites is false when the folder is missing or empty, true when populated', async () => {
    const root = join(dir, 'units')
    expect(await hasSprites(root)).toBe(false)
    await mkdir(root, { recursive: true })
    expect(await hasSprites(root)).toBe(false)
    await writeFile(join(root, 'a.png'), 'x')
    expect(await hasSprites(root)).toBe(true)
  })

  it('reads back the version it wrote, and null when absent', async () => {
    const versionFile = join(dir, 'units.version')
    expect(await readInstalledVersion(versionFile)).toBeNull()
    await writeInstalledVersion(versionFile, '1.18.7')
    expect(await readInstalledVersion(versionFile)).toBe('1.18.7')
  })
})
