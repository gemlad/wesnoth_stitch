import { useMemo } from 'react'
import type { SpriteSummary } from '../../../shared/ipc'
import { SpriteThumb } from './SpriteThumb'

interface Props {
  sprites: SpriteSummary[]
  selectedId: string | null
  onSelect: (sprite: SpriteSummary) => void
}

/** Label for sprites that sit directly under the root with no faction folder. */
const UNGROUPED = '(ungrouped)'

/**
 * Scrollable grid of sprite thumbnails, grouped by folder (§5.1). The incoming
 * list is already sorted by folder then name (see scanSprites), so grouping just
 * needs a stable bucket-by-folder pass.
 */
export function SpriteBrowser({ sprites, selectedId, onSelect }: Props): React.JSX.Element {
  const groups = useMemo(() => {
    const byFolder = new Map<string, SpriteSummary[]>()
    for (const sprite of sprites) {
      const key = sprite.folder || UNGROUPED
      const bucket = byFolder.get(key)
      if (bucket) bucket.push(sprite)
      else byFolder.set(key, [sprite])
    }
    return [...byFolder.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [sprites])

  return (
    <div className="sprite-browser">
      {groups.map(([folder, items]) => (
        <section className="sprite-group" key={folder}>
          <h2 className="sprite-group__title">
            {folder}
            <span className="sprite-group__count">{items.length}</span>
          </h2>
          <div className="sprite-grid">
            {items.map((sprite) => (
              <SpriteThumb
                key={sprite.id}
                sprite={sprite}
                selected={sprite.id === selectedId}
                onSelect={onSelect}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
