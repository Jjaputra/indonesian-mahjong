import { SEAT_ORDER } from '../../core/tiles';
import type { Meld, Seat, Tile } from '../../core/types';
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
  /** Turned sideways in an exposed meld: the tile taken from another player's discard */
  claimed?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export function TileView({ tile, size = 'md', selected, highlight, disabled, drawn, claimed, onClick, onDoubleClick }: TileViewProps) {
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
    claimed ? 'is-claimed' : '',
    tile.isKim && tile.type !== 'kim' ? 'is-kim' : '',
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

/**
 * Real-table layout of a claimed meld, seen by its owner: the taken tile lies sideways on the side
 * of the player it came from (left = first, opposite = middle, right = last). The engine appends
 * the claimed discard after the owner's own tiles (a Kakan's added tile comes last, same face).
 */
export function claimedMeldOrder(meld: Meld, owner: Seat): { tiles: Tile[]; claimedId: string | null } {
  const claimedIndex = meld.type === 'kong' ? 3 : 2;
  const claimed = meld.claimedFrom && meld.type !== 'ankong' ? meld.tiles[claimedIndex] : undefined;
  if (!claimed) return { tiles: [...meld.tiles], claimedId: null };
  const rest = meld.tiles.filter((t) => t.id !== claimed.id);
  const from = (SEAT_ORDER.indexOf(owner) - SEAT_ORDER.indexOf(meld.claimedFrom!) + 4) % 4;
  const at = from === 1 ? 0 : from === 2 ? 1 : rest.length;
  rest.splice(at, 0, claimed);
  return { tiles: rest, claimedId: claimed.id };
}

export function MeldView({ meld, size = 'sm', owner }: { meld: Meld; size?: TileSize; owner?: Seat }) {
  const hidden = meld.type === 'ankong';
  const { tiles, claimedId } = owner ? claimedMeldOrder(meld, owner) : { tiles: meld.tiles, claimedId: null };
  return (
    <span className={`meld meld-${meld.type}`} title={MELD_LABEL[meld.type]}>
      {tiles.map((t, i) =>
        hidden && (i === 0 || i === 3) ? <TileBack key={t.id} size={size} /> : <TileView key={t.id} tile={t} size={size} claimed={t.id === claimedId} />
      )}
      <span className="meld-label">{MELD_LABEL[meld.type]}</span>
    </span>
  );
}
