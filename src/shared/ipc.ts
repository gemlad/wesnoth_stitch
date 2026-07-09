/**
 * IPC contract shared by the main and renderer processes.
 *
 * The renderer never touches the filesystem or decodes images itself (§4 of the
 * design doc): every call here is serviced by a main-process handler that owns
 * that work and hands back already-decoded data. Keeping the channel names and
 * payload types in one place means both sides build against the same shape, so a
 * handler can't silently drift from its caller.
 *
 * Handlers currently return placeholder data — this task (#2) locks the shape;
 * real filesystem scanning and image decoding land in #3 and #4.
 */

/** Channel names. Kept as string-literal consts so both processes agree. */
export const IpcChannels = {
  getSpriteList: 'sprites:list',
  getThumbnail: 'sprites:thumbnail',
  getFullImage: 'sprites:full-image'
} as const

/** A single unit sprite as surfaced to the browser grid (§5.1). */
export interface SpriteSummary {
  /** Stable identifier — the sprite's path relative to SPRITE_ROOT. */
  id: string
  /** Grouping folder, e.g. "human-loyalists"; the grid groups by this (§5.1). */
  folder: string
  /** Display name — the file's basename without extension. */
  name: string
}

/**
 * An image already decoded by the main process into raw RGBA pixels.
 *
 * This is the canonical form the renderer consumes: the browser paints
 * thumbnails to a canvas and the quantizer (§5.2, later milestone) needs raw
 * RGBA anyway, so both getThumbnail and getFullImage return this rather than
 * encoded bytes. `data` is row-major RGBA, length === width * height * 4.
 */
export interface DecodedImage {
  width: number
  height: number
  data: Uint8Array
}

/**
 * The typed surface exposed on `window.api` in the renderer (see preload).
 * Every method is async because it round-trips to the main process over IPC.
 */
export interface SpriteApi {
  /** All unit sprites under SPRITE_ROOT (real scan arrives in #3). */
  getSpriteList(): Promise<SpriteSummary[]>
  /** Decoded thumbnail for one sprite id (real decode arrives in #4). */
  getThumbnail(id: string): Promise<DecodedImage>
  /** Decoded full-resolution image for one sprite id, for the preview pane (#6). */
  getFullImage(id: string): Promise<DecodedImage>
}
