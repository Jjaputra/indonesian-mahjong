import type { Meld, Tile } from '../../core/types';
import { MELD_LABEL, getTileFace, tileAccessibleLabel } from '../labels';
import { TileArt } from './TileArt';

export type TileSize = 'sm' | 'md' | 'lg';

interface TileViewProps {
  tile: Tile;
  size?: TileSize;
  selected?: boolean;
  highlight?: boolean;
  disabled?: boolean;
  /** Visually separated freshly drawn tile */
  drawn?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export function TileView({ tile, size = 'md', selected, highlight, disabled, drawn, onClick, onDoubleClick }: TileViewProps) {
  const face = getTileFace(tile.isKim && tile.type !== 'kim' ? { ...tile, isKim: false } : tile);
  const label = tileAccessibleLabel(face) + (tile.isKim && tile.type !== 'kim' ? ' — Kim' : '');
  const cls = [
    'tile',
    `tile-${size}`,
    `tone-${face.tone}`,
    selected ? 'is-selected' : '',
    highlight ? 'is-highlight' : '',
    disabled ? 'is-disabled' : '',
    drawn ? 'is-drawn' : '',
    onClick ? 'is-clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      <TileArt tile={tile} face={face} />
      {(face.tone === 'kim' || tile.isKim) && <span className="kim-badge" aria-hidden="true">KIM</span>}
    </>
  );
  if (!onClick) {
    return (
      <span className={cls} role="img" title={label} aria-label={label} data-tile-id={tile.id}>
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      data-tile-id={tile.id}
      title={disabled ? `${label} (tidak bisa dibuang)` : label}
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {content}
    </button>
  );
}

export function TileBack({ size = 'sm' }: { size?: TileSize }) {
  return <span className={`tile tile-${size} tile-back`} aria-hidden="true" />;
}

export function TileRow({ tiles, size = 'sm', highlightId }: { tiles: readonly Tile[]; size?: TileSize; highlightId?: string }) {
  return (
    <span className="tile-row">
      {tiles.map((t) => (
        <TileView key={t.id} tile={t} size={size} highlight={t.id === highlightId} />
      ))}
    </span>
  );
}

export function MeldView({ meld, size = 'sm' }: { meld: Meld; size?: TileSize }) {
  const hidden = meld.type === 'ankong';
  return (
    <span className={`meld meld-${meld.type}`} title={MELD_LABEL[meld.type]}>
      {meld.tiles.map((t, i) =>
        hidden && (i === 0 || i === 3) ? <TileBack key={t.id} size={size} /> : <TileView key={t.id} tile={t} size={size} />
      )}
      <span className="meld-label">{MELD_LABEL[meld.type]}</span>
    </span>
  );
}
