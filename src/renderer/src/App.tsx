import { useEffect, useState } from 'react'
import type { SpriteSummary } from '../../shared/ipc'

function App(): React.JSX.Element {
  const [sprites, setSprites] = useState<SpriteSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Temporary IPC smoke test for #2 — proves the renderer→main→renderer round
  // trip works against the locked contract. Replaced by the real sprite grid in #5.
  useEffect(() => {
    window.api
      .getSpriteList()
      .then(setSprites)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <div className="app-shell">
      <h1>Wesnoth Stitch</h1>
      <p className="subtitle">
        Scaffold — Milestone 1. Sprite browser and pattern preview coming next.
      </p>
      {error && <p className="ipc-status ipc-status--error">IPC error: {error}</p>}
      {sprites && (
        <p className="ipc-status">
          IPC OK — scanned {sprites.length} sprite{sprites.length === 1 ? '' : 's'} across{' '}
          {new Set(sprites.map((s) => s.folder)).size} folder
          {new Set(sprites.map((s) => s.folder)).size === 1 ? '' : 's'}
        </p>
      )}
    </div>
  )
}

export default App
