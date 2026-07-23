import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import type { StitchPattern } from '../../shared/pipeline'
import type { Tile } from './pdf-layout'
import { centreMarksForTile, drawCentreMarks } from './pdf-markers'

/** A pattern of the given size — cells are irrelevant to marker placement. */
const patternOf = (width: number, height: number): StitchPattern => ({
  width,
  height,
  cells: []
})

describe('centreMarksForTile', () => {
  it('puts all three marks on a single-page chart', () => {
    const m = centreMarksForTile(patternOf(11, 9), { x0: 0, y0: 0, x1: 11, y1: 9 })
    expect(m).toMatchObject({ centreCol: 5, centreRow: 4, top: true, side: true, centre: true })
  })

  it('uses floor(size / 2) as the centre, matching the chart convention', () => {
    expect(centreMarksForTile(patternOf(10, 10), { x0: 0, y0: 0, x1: 10, y1: 10 })).toMatchObject({
      centreCol: 5,
      centreRow: 5
    })
  })

  it('scatters the marks across the pages that actually hold them (large chart)', () => {
    // 40×40, centre at (20, 20), split into four 20×20 quadrant tiles.
    const p = patternOf(40, 40)
    const topLeft: Tile = { x0: 0, y0: 0, x1: 20, y1: 20 }
    const topRight: Tile = { x0: 20, y0: 0, x1: 40, y1: 20 }
    const bottomLeft: Tile = { x0: 0, y0: 20, x1: 20, y1: 40 }
    const bottomRight: Tile = { x0: 20, y0: 20, x1: 40, y1: 40 }

    // The centre column/row start the second tiles, so nothing lands on the top-left page.
    expect(centreMarksForTile(p, topLeft)).toMatchObject({ top: false, side: false, centre: false })
    // Top edge + centre column → the top-right page carries the top arrow only.
    expect(centreMarksForTile(p, topRight)).toMatchObject({ top: true, side: false, centre: false })
    // Left edge + centre row → the bottom-left page carries the side arrow only.
    expect(centreMarksForTile(p, bottomLeft)).toMatchObject({
      top: false,
      side: true,
      centre: false
    })
    // The centre cell → the bottom-right page carries the diamond only.
    expect(centreMarksForTile(p, bottomRight)).toMatchObject({
      top: false,
      side: false,
      centre: true
    })
  })

  it('never puts a top arrow on a lower band of tiles', () => {
    const p = patternOf(20, 40)
    // A tile on the second row of tiles holds the centre column but not the top edge.
    const lower: Tile = { x0: 0, y0: 20, x1: 20, y1: 40 }
    expect(centreMarksForTile(p, lower).top).toBe(false)
  })
})

describe('drawCentreMarks', () => {
  it('draws every requested mark without throwing, and adds ink to the page', async () => {
    const size = async (draw: boolean): Promise<number> => {
      const doc = await PDFDocument.create()
      const page = doc.addPage([595, 842])
      if (draw) {
        drawCentreMarks(
          page,
          { centreCol: 5, centreRow: 5, top: true, side: true, centre: true },
          { x0: 0, y0: 0, x1: 11, y1: 11 },
          { left: 60, gridTop: 780, cell: 20 }
        )
      }
      return (await doc.save()).length
    }
    expect(await size(true)).toBeGreaterThan(await size(false))
  })

  it('is a no-op when the tile carries no marks', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([595, 842])
    expect(() =>
      drawCentreMarks(
        page,
        { centreCol: 5, centreRow: 5, top: false, side: false, centre: false },
        { x0: 20, y0: 20, x1: 40, y1: 40 },
        { left: 60, gridTop: 780, cell: 20 }
      )
    ).not.toThrow()
  })
})
