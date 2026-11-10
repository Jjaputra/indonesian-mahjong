import type { Meld, Tile } from '../../core/types';
import { MELD_LABEL, getTileFace, type TileFace, type TileTone } from '../labels';

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

const SUIT_MARK: Partial<Record<TileTone, string>> = { tong: '筒', sok: '索', ban: '萬' };

/** Suit tiles keep the Indonesian name under the number, and a glyph that stays visible when the caption is hidden. */
function suitCaption(face: TileFace): { mark?: string; caption: string } {
  const mark = SUIT_MARK[face.tone];
  if (!mark) return { caption: face.sub };
  const name = face.sub.split(' ').pop();
  return { mark, caption: name && name.length > 0 ? name : face.sub };
}

export function TileView({ tile, size = 'md', selected, highlight, disabled, drawn, onClick, onDoubleClick }: TileViewProps) {
  const face = getTileFace(tile);
  const { mark, caption } = suitCaption(face);
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
      {mark && (
        <span className="tile-mark" aria-hidden="true">
          {mark}
        </span>
      )}
      <span className="tile-main">{face.main}</span>
      <span className="tile-sub">{caption}</span>
      {face.tone === 'kim' && <span className="kim-badge">KIM</span>}
    </>
  );
  if (!onClick) {
    return (
      <span className={cls} title={face.title} aria-label={face.title}>
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      title={disabled ? `${face.title} (tidak bisa dibuang)` : face.title}
      aria-label={face.title}
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
