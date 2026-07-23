import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { basename, resolve, sep } from 'node:path'
import {
  IpcChannels,
  type ConvertedSprite,
  type DecodedImage,
  type ExportOutcome,
  type ExportRequest,
  type SpriteSummary
} from '../shared/ipc'
import { scanSprites } from './sprites'
import { decodeImage, makeThumbnail } from './images'
import { convertSprite } from './convert'
import { loadExportFont } from './export/font'
import { buildChartPdf } from './export/pdf'
import { chartExportName } from './export/chart-filename'

/**
 * Hardcoded sprite root for Milestone 1 (§5.1 scope note): the gitignored dev
 * sprite set at <repo>/wesnoth-sprites/units. `app.getAppPath()` is the project
 * root in dev; a real folder-picker + packaging-aware path is future work, since
 * this folder is deliberately not vendored/packaged.
 */
const SPRITE_ROOT = resolve(app.getAppPath(), 'wesnoth-sprites', 'units')

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
  const abs = resolve(SPRITE_ROOT, id)
  if (abs !== SPRITE_ROOT && !abs.startsWith(SPRITE_ROOT + sep)) {
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
  ipcMain.handle(IpcChannels.getSpriteList, async (): Promise<SpriteSummary[]> => {
    // Errors (e.g. the sprite folder missing) reject the invoke and surface to
    // the renderer, which shows the message — see App.tsx / SpriteRootMissingError.
    return scanSprites(SPRITE_ROOT)
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
