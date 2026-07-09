import { ipcMain } from 'electron'
import { IpcChannels, type DecodedImage, type SpriteSummary } from '../shared/ipc'

/**
 * Placeholder sprite list — real scanning of SPRITE_ROOT arrives in #3. The
 * shapes here are exactly what the renderer keeps consuming once the data is real.
 */
const PLACEHOLDER_SPRITES: SpriteSummary[] = [
  { id: 'human-loyalists/spearman.png', folder: 'human-loyalists', name: 'spearman' },
  { id: 'human-loyalists/bowman.png', folder: 'human-loyalists', name: 'bowman' },
  { id: 'undead/skeleton.png', folder: 'undead', name: 'skeleton' }
]

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
    return PLACEHOLDER_SPRITES
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
