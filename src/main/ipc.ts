import { app, ipcMain } from 'electron'
import { resolve, sep } from 'node:path'
import { IpcChannels, type DecodedImage, type SpriteSummary } from '../shared/ipc'
import { scanSprites } from './sprites'
import { decodeImage, makeThumbnail } from './images'

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

/** A solid-colour RGBA image so the renderer has something real-shaped to render. */
function solidImage(
  width: number,
  height: number,
  [r, g, b, a]: [number, number, number, number]
): DecodedImage {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = a
  }
  return { width, height, data }
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
    // #6 wires this into the preview pane; for now, a 72×72 swatch.
    void id
    return solidImage(72, 72, [180, 120, 90, 255])
  })
}
