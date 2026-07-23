import { describe, it, expect } from 'vitest'
import { contentBounds, trimToContent } from './trim'
import type { DecodedImage } from '../ipc'

/** Build a row-major RGBA image from a flat list of alpha values (colour is irrelevant here). */
function imageOfAlpha(width: number, height: number, alphas: number[]): DecodedImage {
  expect(alphas.length).toBe(width * height)
  const data = new Uint8Array(width * height * 4)
  alphas.forEach((a, i) => {
    data[i * 4] = 10 // arbitrary non-zero colour so we can prove the crop copies pixels
    data[i * 4 + 1] = 20
    data[i * 4 + 2] = 30
    data[i * 4 + 3] = a
  })
  return { width, height, data }
}

const T = 128 // the pipeline's default alpha threshold

describe('contentBounds', () => {
  it('finds the tight box of pixels at or above the threshold', () => {
    // 4×3, content is a 2×2 block offset by (1,1).
    const img = imageOfAlpha(4, 3, [
      0, 0, 0, 0,
      0, 255, 255, 0,
      0, 255, 255, 0
    ])
    expect(contentBounds(img, T)).toEqual({ x: 1, y: 1, width: 2, height: 2 })
  })

  it('treats alpha exactly at the threshold as content, below it as border', () => {
    const img = imageOfAlpha(3, 1, [127, 128, 127])
    expect(contentBounds(img, T)).toEqual({ x: 1, y: 0, width: 1, height: 1 })
  })

  it('returns null when nothing meets the threshold', () => {
    expect(contentBounds(imageOfAlpha(2, 2, [0, 0, 10, 100]), T)).toBeNull()
  })
})

describe('trimToContent', () => {
  it('crops the transparent border and copies the content pixels', () => {
    const img = imageOfAlpha(3, 3, [
      0, 0, 0,
      0, 255, 0,
      0, 0, 0
    ])
    const out = trimToContent(img, T)
    expect(out.width).toBe(1)
    expect(out.height).toBe(1)
    // The surviving pixel keeps its RGBA, proving the copy is by pixel, not just by size.
    expect([...out.data]).toEqual([10, 20, 30, 255])
  })

  it('returns the same object (no copy) when the image is already tight', () => {
    const img = imageOfAlpha(2, 1, [255, 255])
    expect(trimToContent(img, T)).toBe(img)
  })

  it('collapses a fully transparent image to 0×0', () => {
    const out = trimToContent(imageOfAlpha(3, 2, [0, 0, 0, 0, 0, 0]), T)
    expect(out.width).toBe(0)
    expect(out.height).toBe(0)
    expect(out.data.length).toBe(0)
  })

  it('preserves a non-transparent interior hole (only the border is trimmed)', () => {
    // A ring of content around a transparent centre — the box stays 3×3, the hole stays.
    const img = imageOfAlpha(3, 3, [
      255, 255, 255,
      255, 0, 255,
      255, 255, 255
    ])
    const out = trimToContent(img, T)
    expect(out.width).toBe(3)
    expect(out.height).toBe(3)
    expect(out.data[(1 * 3 + 1) * 4 + 3]).toBe(0) // centre still transparent
  })
})
