import { useEffect, useState } from 'react'
import type { SpriteSummary } from '../../shared/ipc'
import { SpriteBrowser } from './components/SpriteBrowser'
import { PreviewPane } from './components/PreviewPane'

function App(): React.JSX.Element {
  const [sprites, setSprites] = useState<SpriteSummary[] | null>(null)
  const [selected, setSelected] = useState<SpriteSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .getSpriteList()
      .then(setSprites)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Wesnoth Stitch</h1>
        <p className="subtitle">Pick a unit sprite to turn into a cross-stitch pattern.</p>
      </header>

      {error && <p className="app-status app-status--error">Couldn’t load sprites: {error}</p>}
      {!error && !sprites && <p className="app-status">Loading sprites…</p>}
      {sprites && (
        <div className="app-body">
          <SpriteBrowser sprites={sprites} selectedId={selected?.id ?? null} onSelect={setSelected} />
          <PreviewPane key={selected?.id ?? 'none'} sprite={selected} />
        </div>
      )}
    </div>
  )
}

export default App
