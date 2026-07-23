import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { basename, resolve, sep } from 'node:path'
import {
  IpcChannels,
  type ConvertedSprite,
  type DecodedImage,
  type ExportOutcome,
  type ExportRequest,
  type SpriteStatus,
  type SpriteSummary
} from '../shared/ipc'
import { scanSprites } from './sprites'
import { decodeImage, makeThumbnail } from './images'
import { convertSprite } from './convert'
import { loadExportFont } from './export/font'
import { buildChartPdf } from './export/pdf'
import { chartExportName } from './export/chart-filename'
import {
  hasSprites,
  readInstalledVersion,
  resolveSpriteLocation,
  type SpriteLocation
} from './sprites-cache'
import { downloadSpriteSet } from './sprites-download'
import { SPRITE_ASSET_URL, SPRITE_MANIFEST_URL } from './sprites-source'

/**
 * Where the sprite set lives (#70). In dev this is the repo's gitignored
 * `wesnoth-sprites/units`; in a packaged build it is `<userData>/sprites/units`, downloaded on
 * first run. Resolved in {@link registerIpcHandlers} (it needs app paths that are only valid
 * once the app is ready) and read by every sprite handler — which is why it is no longer the
 * import-time constant Milestone 1 used.
 */
let location: SpriteLocation

/** Longest-side cap for browser-grid thumbnails (§5.1). Sprites are ~64–144px,
 * so this trims IPC payload while staying crisp under nearest-neighbour. */
const THUMBNAIL_MAX_PX = 64

/**
 * Resolve a renderer-supplied sprite id to an absolute path, refusing anything
 * that escapes SPRITE_ROOT. The id always originates from getSpriteList, but it
 * crosses a trust boundary (the renderer), so a `..` traversal must not be able
 * to read arbitrary files off disk.
 */
function resolveSpritePath(id: string): string {
  const root = location.root
  const abs = resolve(root, id)
  if (abs !== root && !abs.startsWith(root + sep)) {
    throw new Error(`Refusing to read outside the sprite root: "${id}"`)
  }
  return abs
}

/** The sprite's own name — "fighter" from "dwarves/fighter.png" — for filenames and titles. */
function spriteName(id: string): string {
  return basename(id, '.png')
}

/**
 * Ask where to save, then run `write` if the user says yes.
 *
 * **Cancelling is a normal outcome, not an error.** It resolves rather than rejects, so the
 * renderer can stay quiet instead of showing "export failed" to someone who simply changed
 * their mind. The file is only written *after* the dialog returns a path, so backing out
 * leaves nothing behind.
 */
async function saveThrough(
  event: Electron.IpcMainInvokeEvent,
  { defaultName, extension, description }: { defaultName: string; extension: string; description: string },
  write: (path: string) => Promise<void>
): Promise<ExportOutcome> {
  const window = BrowserWindow.fromWebContents(event.sender)
  const options: Electron.SaveDialogOptions = {
    defaultPath: `${defaultName}.${extension}`,
    filters: [{ name: description, extensions: [extension] }]
  }

  // Parent the dialog to the window that asked, so it is modal to it rather than floating.
  const { canceled, filePath } = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options)

  if (canceled || !filePath) return { status: 'cancelled' }

  await write(filePath)
  return { status: 'saved', path: filePath }
}

/**
 * Register every IPC handler. Called once from the main entrypoint after the app
 * is ready. Handlers return placeholder data for now (#2); #3/#4/#6 swap in real
 * filesystem + decode logic without changing these channel signatures.
 */
export function registerIpcHandlers(): void {
  location = resolveSpriteLocation({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    userDataPath: app.getPath('userData')
  })

  // Is the sprite set present? A packaged first run answers `absent`, and the renderer shows
  // the download screen (#70) instead of the missing-folder error the M1 flow would have hit.
  ipcMain.handle(IpcChannels.getSpriteStatus, async (): Promise<SpriteStatus> => {
    const ready = await hasSprites(location.root)
    const version = await readInstalledVersion(location.versionFile)
    return { state: ready ? 'ready' : 'absent', managed: location.managed, version }
  })

  // Download (or re-download, for the "update sprites" action) the official set, streaming
  // progress back over the one-way spriteProgress channel. Resolves with the installed version.
  ipcMain.handle(IpcChannels.downloadSprites, async (event): Promise<{ version: string }> => {
    // Guard the dev set: in dev the "cache" IS the repo's wesnoth-sprites/, which we must not
    // overwrite. Only a packaged build manages (and downloads) its sprite set.
    if (!location.managed) {
      throw new Error('Sprite download is only used in packaged builds; dev uses wesnoth-sprites/.')
    }
    const { sender } = event
    return downloadSpriteSet({
      manifestUrl: SPRITE_MANIFEST_URL,
      assetUrl: SPRITE_ASSET_URL,
      cacheDir: location.cacheDir,
      versionFile: location.versionFile,
      onProgress: (p) => sender.send(IpcChannels.spriteProgress, p)
    })
  })

  ipcMain.handle(IpcChannels.getSpriteList, async (): Promise<SpriteSummary[]> => {
    // Errors (e.g. the sprite folder missing) reject the invoke and surface to
    // the renderer, which shows the message — see App.tsx / SpriteRootMissingError.
    return scanSprites(location.root)
  })

  ipcMain.handle(IpcChannels.getThumbnail, async (_event, id: string): Promise<DecodedImage> => {
    // Decode the PNG at SPRITE_ROOT/id and downscale for the grid. A missing or
    // malformed file rejects the invoke and surfaces to the renderer.
    const full = await decodeImage(resolveSpritePath(id))
    return makeThumbnail(full, THUMBNAIL_MAX_PX)
  })

  ipcMain.handle(IpcChannels.getFullImage, async (_event, id: string): Promise<DecodedImage> => {
    // Full-resolution decode for the preview pane (§5.4) — no downscale.
    return decodeImage(resolveSpritePath(id))
  })

  ipcMain.handle(
    IpcChannels.convertSprite,
    async (_event, id: string, colourCount?: number): Promise<ConvertedSprite> => {
      // The whole pipeline (§5.2/§5.3). Called on every slider frame (#19), so the
      // per-sprite decode + merge plan is cached inside convertSprite; a repeat call for
      // the same id only re-cuts the plan. A bad colourCount rejects the invoke.
      return convertSprite(id, resolveSpritePath(id), colourCount)
    }
  )

  // The export handler re-derives the pattern from (id, colourCount) rather than take it
  // from the renderer. convertSprite's cache makes that free, and it means the exported
  // file and the preview it came from are the *same* conversion — they cannot disagree.

  ipcMain.handle(
    IpcChannels.exportPdf,
    async (event, { id, colourCount, settings }: ExportRequest): Promise<ExportOutcome> => {
      const { palette, pattern } = await convertSprite(id, resolveSpritePath(id), colourCount)
      const name = spriteName(id)

      return saveThrough(
        event,
        {
          defaultName: chartExportName(name, settings.symbolDisplay),
          extension: 'pdf',
          description: 'Printable chart'
        },
        async (path) => {
          const pdf = await buildChartPdf(
            pattern,
            palette,
            { title: name, width: pattern.width, height: pattern.height },
            { ...settings, fontBytes: loadExportFont() }
          )
          await writeFile(path, pdf)
        }
      )
    }
  )
}
