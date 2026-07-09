import { app, ipcMain } from 'electron'
import { resolve } from 'node:path'
import { IpcChannels, type DecodedImage, type SpriteSummary } from '../shared/ipc'
import { scanSprites } from './sprites'

/**
 * Hardcoded sprite root for Milestone 1 (§5.1 scope note): the gitignored dev
 * sprite set at <repo>/wesnoth-sprites/units. `app.getAppPath()` is the project
 * root in dev; a real folder-picker + packaging-aware path is future work, since
 * this folder is deliberately not vendored/packaged.
 */
const SPRITE_ROOT = resolve(app.getAppPath(), 'wesnoth-sprites', 'units')

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
    // #4 decodes the real PNG at SPRITE_ROOT/id; for now, a 32×32 swatch.
    void id
    return solidImage(32, 32, [90, 120, 180, 255])
  })

  ipcMain.handle(IpcChannels.getFullImage, async (_event, id: string): Promise<DecodedImage> => {
    // #6 wires this into the preview pane; for now, a 72×72 swatch.
    void id
    return solidImage(72, 72, [180, 120, 90, 255])
  })
}
