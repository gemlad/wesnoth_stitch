import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { create as tarCreate } from 'tar'
import {
  isUpdateAvailable,
  parseManifest,
  sha256File,
  verifyAndInstall,
  type SpriteManifest
} from './sprites-download'

const HEX64 = 'a'.repeat(64)

describe('parseManifest', () => {
  it('accepts a well-formed manifest and normalises the digest to lower case', () => {
    const m = parseManifest({ version: ' 1.18.7 ', sha256: HEX64.toUpperCase(), bytes: 123 })
    expect(m).toEqual({ version: '1.18.7', sha256: HEX64, bytes: 123 })
  })

  it.each([
    ['not an object', 42],
    ['missing version', { sha256: HEX64, bytes: 1 }],
    ['bad sha length', { version: '1', sha256: 'abc', bytes: 1 }],
    ['non-positive bytes', { version: '1', sha256: HEX64, bytes: 0 }]
  ])('rejects %s', (_label, bad) => {
    expect(() => parseManifest(bad)).toThrow()
  })
})

describe('isUpdateAvailable', () => {
  const manifest: SpriteManifest = { version: '1.18.7', sha256: HEX64, bytes: 1 }
  it('is true when nothing is installed or the version differs', () => {
    expect(isUpdateAvailable(null, manifest)).toBe(true)
    expect(isUpdateAvailable('1.18.6', manifest)).toBe(true)
  })
  it('is false when the installed version matches', () => {
    expect(isUpdateAvailable('1.18.7', manifest)).toBe(false)
  })
})

describe('sha256File / verifyAndInstall', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sprite-dl-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  /** Build a units.tar.gz whose top-level `units/` holds the given files, and its manifest. */
  async function makeArchive(files: Record<string, string>): Promise<{ tarPath: string; manifest: SpriteManifest }> {
    const src = await mkdtemp(join(dir, 'src-'))
    for (const [rel, content] of Object.entries(files)) {
      const full = join(src, 'units', rel)
      await mkdir(join(full, '..'), { recursive: true })
      await writeFile(full, content)
    }
    const tarPath = join(dir, 'units.tar.gz')
    await tarCreate({ gzip: true, file: tarPath, cwd: src, portable: true }, ['units'])
    const bytes = (await readFile(tarPath)).length
    const sha256 = await sha256File(tarPath)
    return { tarPath, manifest: { version: 'test-1', sha256, bytes } }
  }

  it('sha256File matches an independently computed digest', async () => {
    const p = join(dir, 'blob')
    await writeFile(p, 'hello sprites')
    const expected = createHash('sha256').update('hello sprites').digest('hex')
    expect(await sha256File(p)).toBe(expected)
  })

  it('installs the archive into <cacheDir>/units and records the version', async () => {
    const cacheDir = join(dir, 'cache')
    const { tarPath, manifest } = await makeArchive({ 'drakes/burner.png': 'DRAKE' })
    await verifyAndInstall({ tarPath, manifest, cacheDir, versionFile: join(cacheDir, 'units.version') })

    expect(await readFile(join(cacheDir, 'units', 'drakes', 'burner.png'), 'utf8')).toBe('DRAKE')
    expect(await readFile(join(cacheDir, 'units.version'), 'utf8')).toBe('test-1')
  })

  it('overlays without deleting user-added files (#82), but overwrites official ones', async () => {
    const cacheDir = join(dir, 'cache')
    const units = join(cacheDir, 'units')
    // A pre-existing set: one official file (older content) and one file the user added.
    await mkdir(join(units, 'drakes'), { recursive: true })
    await writeFile(join(units, 'drakes', 'burner.png'), 'OLD-OFFICIAL')
    await writeFile(join(units, 'my-custom-sprite.png'), 'USER-MADE')

    const { tarPath, manifest } = await makeArchive({ 'drakes/burner.png': 'NEW-OFFICIAL' })
    await verifyAndInstall({ tarPath, manifest, cacheDir, versionFile: join(cacheDir, 'units.version') })

    // Official file overwritten…
    expect(await readFile(join(units, 'drakes', 'burner.png'), 'utf8')).toBe('NEW-OFFICIAL')
    // …the user's own file left untouched.
    expect(await readFile(join(units, 'my-custom-sprite.png'), 'utf8')).toBe('USER-MADE')
  })

  it('rejects a tarball whose digest does not match the manifest, changing nothing', async () => {
    const cacheDir = join(dir, 'cache')
    await mkdir(join(cacheDir, 'units'), { recursive: true })
    await writeFile(join(cacheDir, 'units', 'keep.png'), 'KEEP')

    const { tarPath, manifest } = await makeArchive({ 'drakes/burner.png': 'DRAKE' })
    const tampered: SpriteManifest = { ...manifest, sha256: 'b'.repeat(64) }

    await expect(
      verifyAndInstall({ tarPath, manifest: tampered, cacheDir, versionFile: join(cacheDir, 'units.version') })
    ).rejects.toThrow(/integrity check/)

    // The existing set is intact and no version was written.
    expect(await readFile(join(cacheDir, 'units', 'keep.png'), 'utf8')).toBe('KEEP')
    expect(existsSync(join(cacheDir, 'units.version'))).toBe(false)
  })
})
