/**
 * Keeps only the newest of a series of overlapping async requests (§5.4's live slider).
 *
 * Dragging the colour slider fires a `convertSprite` call per step, and `ipcMain.handle`
 * services them concurrently rather than in a queue — so nothing guarantees that the
 * reply for `k = 18` lands before the reply for `k = 17`. Without a guard, a single
 * late-arriving response repaints the grid at a colour count the slider is no longer on,
 * and the preview quietly disagrees with the control that drives it.
 *
 * Rather than serialising the requests (which would make the slider lag by a whole
 * round-trip), every result carries a sequence number and only the newest is allowed to
 * land. Stale results — and stale *rejections* — are dropped.
 */
export interface LatestOnly<T> {
  /** Start a request. Its callbacks fire only if no newer request has started since. */
  run(start: () => Promise<T>, onResult: (value: T) => void, onError?: (e: unknown) => void): void
  /** Drop every in-flight request. For unmount, where a `setState` would be a leak. */
  cancel(): void
}

export function latestOnly<T>(): LatestOnly<T> {
  let newest = 0

  return {
    run(start, onResult, onError) {
      const mine = ++newest
      start().then(
        (value) => {
          if (mine === newest) onResult(value)
        },
        (e: unknown) => {
          if (mine === newest) onError?.(e)
        }
      )
    },
    // Bumping the counter invalidates everything outstanding without needing to hold
    // references to their promises.
    cancel() {
      newest++
    }
  }
}
