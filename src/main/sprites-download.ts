import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { once } from 'node:events'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { extract as tarExtract } from 'tar'
import type { SpriteDownloadProgress } from '../shared/ipc'
import { writeInstalledVersion } from './sprites-cache'

/**
 * Downloading and installing the sprite set (#70). Electron-free so the verify/install seams
 * unit-test in plain Node; ipc.ts owns the Electron wiring (paths, progress channel).
 */

/** The manifest published alongside `units.tar.gz` — enough to check for an update and to
 *  verify the download before trusting it. */
export interface SpriteManifest {
  version: string
  sha256: string
  bytes: number
}

/** Validate an untrusted manifest payload into a {@link SpriteManifest}, or throw. */
export function parseManifest(json: unknown): SpriteManifest {
  if (!json || typeof json !== 'object') throw new Error('Sprite manifest is not an object.')
  const m = json as Record<string, unknown>
  if (typeof m.version !== 'string' || m.version.trim() === '') {
    throw new Error('Sprite manifest: missing "version".')
  }
  if (typeof m.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(m.sha256)) {
    throw new Error('Sprite manifest: "sha256" must be a 64-char hex digest.')
  }
  const bytes = typeof m.bytes === 'number' ? m.bytes : Number(m.bytes)
  if (!Number.isFinite(bytes) || bytes <= 0) throw new Error('Sprite manifest: "bytes" must be positive.')
  return { version: m.version.trim(), sha256: m.sha256.toLowerCase(), bytes }
}

/** Whether the manifest names a different version than the one installed (null = none yet). */
export function isUpdateAvailable(installed: string | null, manifest: SpriteManifest): boolean {
  return installed !== manifest.version
}

/** sha256 of a file, streamed so a ~4 MB archive is not buffered whole. */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
  })
}

/**
 * Verify a downloaded tarball against its manifest and install it into `cacheDir`.
 *
 * **Never deletes the existing sprite folder (#82).** A user may have dropped their own
 * sprites into it, so the archive is *overlaid*: extracted to a staging dir, then copied over
 * `<cacheDir>/units` with `fs.cp({ force: true })`, which overwrites the official files it
 * carries but leaves any file the user added (or any sprite dropped upstream) untouched. The
 * cost is that a removed-upstream sprite lingers — an acceptable trade for not eating user
 * files. The version marker is written last, so an interrupted install is retried next launch.
 */
export async function verifyAndInstall(opts: {
  tarPath: string
  manifest: SpriteManifest
  cacheDir: string
  versionFile: string
}): Promise<void> {
  const actual = await sha256File(opts.tarPath)
  if (actual !== opts.manifest.sha256) {
    throw new Error(
      `Sprite download failed its integrity check (expected ${opts.manifest.sha256}, got ${actual}). ` +
        `Nothing was changed; try again.`
    )
  }

  await mkdir(opts.cacheDir, { recursive: true })
  const staging = await mkdtemp(join(opts.cacheDir, '.staging-'))
  try {
    // The archive holds a top-level `units/` dir, so this yields `<staging>/units`.
    await tarExtract({ file: opts.tarPath, cwd: staging })
    // Overlay onto the live folder: overwrite official files, keep everything else (#82).
    await cp(join(staging, 'units'), join(opts.cacheDir, 'units'), { recursive: true, force: true })
    await writeInstalledVersion(opts.versionFile, opts.manifest.version)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

/**
 * Fetch the manifest, download `units.tar.gz` (reporting progress), verify and install it.
 * Returns the version installed. Thin orchestration over the tested seams above; `fetchImpl`
 * is injectable so it does not have to hit the network in a test.
 */
export async function downloadSpriteSet(opts: {
  manifestUrl: string
  assetUrl: string
  cacheDir: string
  versionFile: string
  onProgress?: (p: SpriteDownloadProgress) => void
  fetchImpl?: typeof fetch
}): Promise<{ version: string }> {
  const doFetch = opts.fetchImpl ?? fetch
  opts.onProgress?.({ phase: 'manifest' })

  const manifestRes = await doFetch(opts.manifestUrl)
  if (!manifestRes.ok) throw new Error(`Couldn't fetch the sprite manifest (HTTP ${manifestRes.status}).`)
  const manifest = parseManifest(await manifestRes.json())

  await mkdir(opts.cacheDir, { recursive: true })
  const tmpTar = join(opts.cacheDir, `.download-${Date.now()}.tar.gz`)
  try {
    opts.onProgress?.({ phase: 'download', receivedBytes: 0, totalBytes: manifest.bytes })
    const res = await doFetch(opts.assetUrl)
    if (!res.ok || !res.body) throw new Error(`Couldn't download the sprites (HTTP ${res.status}).`)
    const total = Number(res.headers.get('content-length')) || manifest.bytes

    const out = createWriteStream(tmpTar)
    let received = 0
    let lastReported = 0
    for await (const chunk of Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])) {
      received += chunk.length
      if (!out.write(chunk)) await once(out, 'drain')
      // Throttle progress to ~1% steps so a 4 MB download is not thousands of IPC messages.
      if (received - lastReported >= total / 100) {
        lastReported = received
        opts.onProgress?.({ phase: 'download', receivedBytes: received, totalBytes: total })
      }
    }
    out.end()
    await once(out, 'finish')

    opts.onProgress?.({ phase: 'extract' })
    await verifyAndInstall({ tarPath: tmpTar, manifest, cacheDir: opts.cacheDir, versionFile: opts.versionFile })
    return { version: manifest.version }
  } finally {
    await rm(tmpTar, { force: true })
  }
}
