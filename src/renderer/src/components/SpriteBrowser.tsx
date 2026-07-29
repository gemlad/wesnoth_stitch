import { useMemo, useState } from 'react'
import type { SpriteSummary } from '../../../shared/ipc'
import { SpriteThumb } from './SpriteThumb'
import { countIn, groupSprites } from './sprite-search'

interface Props {
  sprites: SpriteSummary[]
  selectedId: string | null
  onSelect: (sprite: SpriteSummary) => void
}

/**
 * Scrollable grid of sprite thumbnails, grouped by folder (§5.1), with a search box (#66).
 *
 * The query lives here rather than in `App`: nothing outside this panel acts on it, and a
 * filtered-out sprite stays selected and stays charted — searching changes what you can *see*,
 * never what you are working on. Losing your pattern because you typed in a search box would
 * be a far worse bug than the scrolling it replaces.
 *
 * The search box sits outside the scroll container, so it stays put with several thousand
 * sprites below it.
 */
export function SpriteBrowser({ sprites, selectedId, onSelect }: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => groupSprites(sprites, query), [sprites, query])
  const matches = countIn(groups)
  const searching = query.trim() !== ''

  return (
    <div className="sprite-browser">
      <div className="sprite-browser__search">
        <input
          type="search"
          className="sprite-search__input"
          placeholder="Search sprites…"
          aria-label="Search sprites by name or faction"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          // Escape clears — the shortcut anyone who has used a search box expects, and the
          // fastest way back to the whole set.
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('')
          }}
        />
        {searching && (
          <span className="sprite-search__count">
            {matches} of {sprites.length}
          </span>
        )}
      </div>

      <div className="sprite-browser__list">
        {searching && matches === 0 && (
          <p className="sprite-search__empty">No sprites match “{query.trim()}”.</p>
        )}

        {groups.map(({ folder, sprites: items }) => (
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
    </div>
  )
}
