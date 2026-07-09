/**
 * Runs a one-off TypeScript script that imports from `src/shared`.
 *
 * The repo has no ts-node/tsx, and adding one for two spike scripts isn't worth a
 * dependency — esbuild is already here (Vite pulls it in), so bundle to a temp ESM module
 * and hand it to node. `--packages=external` leaves pngjs/culori to resolve from
 * node_modules at runtime rather than inlining them.
 *
 *   node scripts/run-ts.mjs scripts/validate-cap.ts
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'

const entry = process.argv[2]
if (!entry) {
  console.error('usage: node scripts/run-ts.mjs <script.ts> [args…]')
  process.exit(2)
}

const repo = resolve(import.meta.dirname, '..')
// Inside the repo, not tmp: `--packages=external` leaves bare imports for node to resolve,
// and node only walks *up* from the module for node_modules.
const outDir = resolve(repo, 'out', '.ts-bundle')
mkdirSync(outDir, { recursive: true })
const outfile = resolve(outDir, basename(entry).replace(/\.ts$/, '.mjs'))
const esbuild = resolve(repo, 'node_modules', '.bin', 'esbuild')

const build = spawnSync(
  esbuild,
  [
    entry,
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--packages=external',
    `--outfile=${outfile}`
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' }
)
if (build.status !== 0) process.exit(build.status ?? 1)

// The bundle lives under out/, so it cannot locate the repo from its own path.
const run = spawnSync(process.execPath, [outfile, ...process.argv.slice(3)], {
  stdio: 'inherit',
  env: { ...process.env, REPO_ROOT: repo }
})
process.exit(run.status ?? 1)
