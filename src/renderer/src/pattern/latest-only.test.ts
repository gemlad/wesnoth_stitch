import { describe, it, expect, vi } from 'vitest'
import { latestOnly } from './latest-only'

/** A promise whose settlement this test controls, so responses can be reordered at will. */
function deferred<T>(): {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
} {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Let every already-settled promise callback run. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('latestOnly', () => {
  it('applies a lone request', async () => {
    const onResult = vi.fn()
    latestOnly<number>().run(() => Promise.resolve(7), onResult)
    await flush()
    expect(onResult).toHaveBeenCalledWith(7)
  })

  it('drops a slow earlier response that lands after a newer one', async () => {
    // The whole point: k=17 is requested second but replies first, so the stale k=18
    // reply must not repaint the grid behind the slider.
    const first = deferred<string>()
    const second = deferred<string>()
    const onResult = vi.fn()
    const l = latestOnly<string>()

    l.run(() => first.promise, onResult)
    l.run(() => second.promise, onResult)

    second.resolve('k=17')
    first.resolve('k=18')
    await flush()

    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledWith('k=17')
  })

  it('applies each response when they arrive in order', async () => {
    const onResult = vi.fn()
    const l = latestOnly<number>()
    l.run(() => Promise.resolve(1), onResult)
    await flush()
    l.run(() => Promise.resolve(2), onResult)
    await flush()
    expect(onResult.mock.calls.map((c) => c[0])).toEqual([1, 2])
  })

  it('drops a stale rejection, so an old failure cannot blank a good preview', async () => {
    const first = deferred<string>()
    const onResult = vi.fn()
    const onError = vi.fn()
    const l = latestOnly<string>()

    l.run(() => first.promise, onResult, onError)
    l.run(() => Promise.resolve('fresh'), onResult, onError)
    first.reject(new Error('stale failure'))
    await flush()

    expect(onError).not.toHaveBeenCalled()
    expect(onResult).toHaveBeenCalledWith('fresh')
  })

  it('reports the newest request’s rejection', async () => {
    const onError = vi.fn()
    const boom = new Error('convert failed')
    latestOnly<string>().run(() => Promise.reject(boom), vi.fn(), onError)
    await flush()
    expect(onError).toHaveBeenCalledWith(boom)
  })

  it('cancel() drops everything in flight — nothing lands after unmount', async () => {
    const pending = deferred<string>()
    const onResult = vi.fn()
    const onError = vi.fn()
    const l = latestOnly<string>()

    l.run(() => pending.promise, onResult, onError)
    l.cancel()
    pending.resolve('too late')
    await flush()

    expect(onResult).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('still works after a cancel, for a remounted view', async () => {
    const onResult = vi.fn()
    const l = latestOnly<number>()
    l.cancel()
    l.run(() => Promise.resolve(42), onResult)
    await flush()
    expect(onResult).toHaveBeenCalledWith(42)
  })
})
