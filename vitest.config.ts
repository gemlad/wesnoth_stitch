import { defineConfig } from 'vitest/config'

/**
 * Unit tests run in plain Node — the shared colour/pipeline modules (§5.2) are
 * pure functions with no Electron or DOM dependency. Kept separate from
 * electron.vite.config.ts, which configures the app build, not the test run.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
