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

import type { RGB } from './colour'
import type { QuantizedPalette, StitchPattern, StitchSymbol } from './pipeline'

/**
 * Which layers of the chart are drawn (§5.4). `colour` is the on-screen preview, `symbol`
 * is what a black-and-white printed chart looks like, `both` is the working chart you
 * stitch from.
 */
export type SymbolDisplay = 'colour' | 'symbol' | 'both'

/**
 * Presentation settings for a pattern (§6's `PatternSettings`).
 *
 * **Why this lives here now.** §6 said it would: *"it moves to `shared/ipc.ts` if and when
 * export runs in the main process and it actually has to cross a process boundary."* That
 * moment arrived with the PDF chart (#34) — the export needs the fabric colour and the
 * symbol-display mode, and it runs in main. Nothing in the *pipeline* reads it, though, so
 * it still does not belong in `pipeline/types.ts`: `mapSpriteToDmc`, `reduceTo` and
 * `symbolsFor` are pure functions of pixels and floss and do not care what colour the
 * fabric is.
 */
export interface PatternSettings {
  /** Fabric colour. "No stitch" cells render as this, rather than assumed-white Aida (§8). */
  backgroundColour: RGB
  symbolDisplay: SymbolDisplay
}

/** Channel names. Kept as string-literal consts so both processes agree. */
export const IpcChannels = {
  getSpriteStatus: 'sprites:status',
  downloadSprites: 'sprites:download',
  spriteProgress: 'sprites:progress',
  getSpriteList: 'sprites:list',
  getThumbnail: 'sprites:thumbnail',
  getFullImage: 'sprites:full-image',
  convertSprite: 'sprites:convert',
  exportPdf: 'export:pdf'
} as const

/**
 * Whether the sprite set is present and can be browsed (#70).
 *
 * A packaged build downloads the Wesnoth units set on first run (§5.1, decision in
 * docs/decisions-sprite-acquisition-2026-07-23.md), so before that first download the
 * answer is `absent` and the renderer shows the download screen rather than an error.
 * In dev the set is the repo's `wesnoth-sprites/`, so it is always `ready` and unmanaged.
 */
export interface SpriteStatus {
  state: 'ready' | 'absent'
  /** true in packaged builds (the download cache is used); false in dev. Gates the update UI. */
  managed: boolean
  /** The installed sprite-set version, or null if unknown (dev, or never downloaded). */
  version: string | null
}

/** Progress emitted (main → renderer, one-way) while downloading the sprite set (#70). */
export interface SpriteDownloadProgress {
  phase: 'manifest' | 'download' | 'extract'
  receivedBytes?: number
  totalBytes?: number
}

/**
 * What the renderer sends to export (#36).
 *
 * **It sends the sprite's identity, not its pixels.** The renderer is holding a whole
 * `ConvertedSprite` and it would be the obvious thing to ship straight back — but main can
 * re-derive it from `(id, colourCount)` for free, because `convertSprite` already caches the
 * expensive per-sprite work (§4, #17). Passing the pattern back would copy a 5,000-cell grid
 * across the process boundary to tell main something it already knows, and — worse — it
 * would make it *possible* for an exported chart to disagree with the preview it came from.
 * Deriving both from the same cached conversion means they cannot.
 */
export interface ExportRequest {
  id: string
  /** Omit for the Req. 6 default, exactly as `convertSprite` treats it. */
  colourCount?: number
  settings: PatternSettings
}

/**
 * How an export ended. Cancelling the save dialog is a **normal outcome, not an error** —
 * the renderer should say nothing and carry on, so it must be able to tell "you changed your
 * mind" apart from "the export failed", which a rejected promise alone could not express.
 */
export type ExportOutcome = { status: 'saved'; path: string } | { status: 'cancelled' }

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
 * A sprite run through the whole conversion pipeline (§5.2): mapped to DMC floss,
 * reduced to the requested colour count, and assigned chart symbols (§5.3).
 *
 * `palette.sourceColourCount` is the sprite's own distinct-DMC count (the Req. 6
 * default before capping); `palette.colourCount` is the `k` actually used.
 */
export interface ConvertedSprite {
  palette: QuantizedPalette
  pattern: StitchPattern
  /** One chart symbol per palette colour, index-aligned with `palette.colours`. */
  symbols: StitchSymbol[]
  /**
   * The slider's hard maximum (§5.3). Carried in the payload rather than imported by
   * the renderer: `MAX_COLOUR_COUNT` lives beside the pipeline, and importing it would
   * pull the 392-entry DMC dataset into the renderer bundle for a single integer.
   */
  maxColourCount: number
}

/**
 * The typed surface exposed on `window.api` in the renderer (see preload).
 * Every method is async because it round-trips to the main process over IPC.
 */
export interface SpriteApi {
  /** Whether the sprite set is installed (#70). Call before {@link getSpriteList}: a packaged
   *  first run is `absent` and needs {@link downloadSprites} before the list exists. */
  getSpriteStatus(): Promise<SpriteStatus>
  /** Download the official set (first run) or re-download it (the "update sprites" action).
   *  Emits {@link onSpriteProgress} while running; resolves with the installed version. Rejects
   *  on network/integrity failure without disturbing any set already installed. */
  downloadSprites(): Promise<{ version: string }>
  /** Subscribe to download progress. Returns an unsubscribe function. */
  onSpriteProgress(callback: (progress: SpriteDownloadProgress) => void): () => void

  /** All unit sprites under SPRITE_ROOT (real scan arrives in #3). */
  getSpriteList(): Promise<SpriteSummary[]>
  /** Decoded thumbnail for one sprite id (real decode arrives in #4). */
  getThumbnail(id: string): Promise<DecodedImage>
  /** Decoded full-resolution image for one sprite id, for the preview pane (#6). */
  getFullImage(id: string): Promise<DecodedImage>
  /**
   * Convert one sprite to a stitch pattern at `colourCount` floss colours (#17).
   *
   * Omit `colourCount` for the Req. 6 default — the sprite's own distinct-DMC count,
   * capped at `maxColourCount`. Safe to call on every slider frame: the expensive
   * per-sprite work (decode → map → merge plan) is cached in the main process, so a
   * repeat call for the same `id` only re-cuts the plan (§4).
   *
   * Rejects if `colourCount` is not an integer in `1..maxColourCount`.
   */
  convertSprite(id: string, colourCount?: number): Promise<ConvertedSprite>

  /**
   * Export the printable chart as a PDF (§5.5, #34/#35) — cover, floss key, chart pages.
   *
   * Opens a save dialog. Resolves `{ status: 'cancelled' }` if the user backs out.
   * Rejects if the palette holds more colours than the symbol set can name — but the
   * slider is capped at `maxColourCount`, so that is a bug, not a thing a user can do.
   */
  exportPdf(request: ExportRequest): Promise<ExportOutcome>
}
