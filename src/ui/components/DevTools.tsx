import { useState } from 'react';
import { Eye, EyeOff, Wrench } from 'lucide-react';
import { keyToTile, sortTiles } from '../../core/tiles';
import type { Tile, TileFace } from '../../core/types';
import type { GameController } from '../game-controller';
import { tileText } from '../labels';
import { TileView } from './TileView';

/** Every face a hand can hold, in picker order: Tong, Sok, Ban, Angin, Naga, then Bunga 1–4 and Musim 1–4. */
export const PICKER_KEYS: readonly string[] = [
  ...['T', 'S', 'B'].flatMap((suit) => Array.from({ length: 9 }, (_, i) => `${i + 1}${suit}`)),
  'WD', 'WN', 'WX', 'WB', 'DZ', 'DF', 'DP',
  'F1', 'F2', 'F3', 'F4', 'M1', 'M2', 'M3', 'M4',
];

export const faceOf = (tile: Tile): TileFace => ({ type: tile.type, value: tile.value });
export const isBonusFace = (f: TileFace) => f.type === 'flower' || f.type === 'season';

/** Display tiles for faces; ids are only stable per position, enough for React keys and TileView. */
export function faceTiles(faces: readonly TileFace[], prefix = 'dev'): Tile[] {
  return faces.map((f, i) => ({ id: `${prefix}-${f.type}-${f.value}-${i}`, type: f.type, value: f.value, isKim: false }));
}

const PICKER_TILES: Tile[] = [...PICKER_KEYS, 'KIM'].map((k) => keyToTile(k, 0));

/** Tap-to-add grid of all 34 faces plus bunga / musim (and the KIM tile when asked); scrolls inside itself on narrow screens. */
export function FacePicker({ onPick, label = 'Pilih tile', bonus = true, kim = false, disabled }: {
  onPick: (face: TileFace) => void; label?: string; bonus?: boolean; kim?: boolean; disabled?: (face: TileFace) => boolean;
}) {
  return (
    <div className="face-picker" role="group" aria-label={label}>
      {PICKER_TILES.filter((t) => (bonus || !isBonusFace(t)) && (kim || t.type !== 'kim')).map((t) => {
        const face = faceOf(t);
        const off = disabled?.(face) ?? false;
        return <TileView key={t.id} tile={t} size="sm" disabled={off} onClick={off ? undefined : () => onPick(face)} />;
      })}
    </div>
  );
}

/** Tiles shown as a row; tapping one removes it (index-based, so duplicates go one at a time). */
export function RemovableRow({ faces, onRemove, empty, label, prefix }: {
  faces: readonly TileFace[]; onRemove: (index: number) => void; empty: string; label: string; prefix: string;
}) {
  if (!faces.length) return <p className="dev-empty muted">{empty}</p>;
  return (
    <div className="dev-row" role="group" aria-label={label}>
      {faceTiles(faces, prefix).map((t, i) => (
        <span key={t.id} className="dev-row-tile" title={`Hapus ${tileText(t)}`}>
          <TileView tile={t} size="sm" onClick={() => onRemove(i)} />
        </span>
      ))}
    </div>
  );
}

/** Runs a controller dev hook; its Indonesian error message is shown inline. */
function runDev(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/**
 * "Alat developer" in the table side panel: rig the human hand, the next draw, and peek at the
 * opponents' concealed tiles (display only).
 */
export function DevTools({ controller, revealOpponents, onRevealChange }: {
  controller: GameController; revealOpponents: boolean; onRevealChange: (on: boolean) => void;
}) {
  const own = controller.getState().players[controller.humanSeat];
  const [tool, setTool] = useState<'hand' | 'draw' | null>(null);
  const [draft, setDraft] = useState<TileFace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const openHand = () => {
    setTool(tool === 'hand' ? null : 'hand');
    setDraft(sortTiles(own.hand).map(faceOf));
    setError(null); setNote(null);
  };
  const applyHand = () => {
    const err = runDev(() => controller.devSetHand(draft));
    setError(err);
    setNote(err ? null : `Tangan diatur: ${draft.length} tile.`);
    if (!err) setTool(null);
  };
  const pickNext = (face: TileFace) => {
    const err = runDev(() => controller.devSetNextDraw(face));
    setError(err);
    setNote(err ? null : `Tile berikutnya: ${tileText(faceTiles([face])[0]!)}.`);
    if (!err) setTool(null);
  };

  return (
    <details className="table-tools dev-tools">
      <summary><Wrench size={13} aria-hidden="true" /> Alat developer</summary>
      <div className="dev-tool-buttons" role="group" aria-label="Alat developer">
        <button type="button" className="btn" aria-expanded={tool === 'hand'} onClick={openHand}>Atur tangan saya</button>
        <button type="button" className="btn" aria-expanded={tool === 'draw'} onClick={() => { setTool(tool === 'draw' ? null : 'draw'); setError(null); setNote(null); }}>Tile berikutnya</button>
        <button type="button" className="btn" aria-pressed={revealOpponents} onClick={() => onRevealChange(!revealOpponents)}>
          {revealOpponents ? <EyeOff size={13} /> : <Eye size={13} />} Lihat tangan lawan
        </button>
      </div>
      {tool === 'hand' && (
        <div className="dev-tool-body">
          <p className="field-note">Ketuk tile untuk menambah, ketuk tile di tangan untuk menghapus. Meld terbuka tetap.</p>
          <RemovableRow faces={draft} prefix="dev-own" label="Tangan baru" empty="Tangan kosong."
            onRemove={(i) => setDraft((d) => d.filter((_, j) => j !== i))} />
          <FacePicker label="Tambah tile ke tangan" bonus={false} onPick={(f) => setDraft((d) => [...d, f])} />
          <div className="dev-tool-actions">
            <span className="muted">{draft.length} tile (sekarang {own.hand.length})</span>
            <button type="button" className="btn" onClick={() => setDraft([])}>Kosongkan</button>
            <button type="button" className="btn btn-primary" onClick={applyHand}>Terapkan</button>
          </div>
        </div>
      )}
      {tool === 'draw' && (
        <div className="dev-tool-body">
          <p className="field-note">Pilih tile yang akan ditarik berikutnya dari tembok.</p>
          <FacePicker label="Tile berikutnya" onPick={pickNext} />
        </div>
      )}
      {error && <p className="dev-error" role="alert">{error}</p>}
      {note && <p className="dev-note" role="status">{note}</p>}
    </details>
  );
}
