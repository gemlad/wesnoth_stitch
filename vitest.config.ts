import { defineConfig } from 'vitest/config'

/**
 * Unit tests run in plain Node — the shared colour/pipeline modules (§5.2) are
 * pure functions with no Electron or DOM dependency. Kept separate from
 * electron.vite.config.ts, which configures the app build, not the test run.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /**
     * Well past vitest's 5s default, because the export tests are not quick by accident.
     * A chart test draws a real multi-page PDF — `pdf-chart.test.ts` lays out 150×200 cells
     * twice over, a rectangle and an embedded glyph apiece — and the cost *is* the test: the
     * page count it asserts is only meaningful if the pages were really built. Those two runs
     * sat just inside 5s until #55 added a 28th test file, at which point they started losing
     * the race for a core and timing out non-deterministically. The work did not get slower;
     * there is simply more of it in parallel. Raising the ceiling keeps a genuinely slow test
     * honest, where trimming its fixture would have quietly narrowed what it covers.
     */
    testTimeout: 20_000
  }
})
