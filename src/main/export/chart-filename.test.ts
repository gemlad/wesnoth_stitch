import { describe, it, expect } from 'vitest'
import type { SymbolDisplay } from '../../shared/ipc'
import { chartExportName } from './chart-filename'

describe('chartExportName', () => {
  it('tags the chart mode so the modes do not overwrite each other (#48)', () => {
    expect(chartExportName('fighter', 'colour')).toBe('fighter-chart-colour')
    expect(chartExportName('fighter', 'symbol')).toBe('fighter-chart-symbols')
    expect(chartExportName('fighter', 'both')).toBe('fighter-chart-colour-symbols')
  })

  it('gives every mode a distinct name for the same sprite', () => {
    const modes: SymbolDisplay[] = ['colour', 'symbol', 'both']
    const names = modes.map((m) => chartExportName('citizen', m))
    expect(new Set(names).size).toBe(modes.length)
  })

  it('keeps the sprite name as the stem', () => {
    expect(chartExportName('drakes/burner', 'symbol')).toBe('drakes/burner-chart-symbols')
  })
})
