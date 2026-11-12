import { useMemo, useState } from 'react';
import { Check, ClipboardPaste, Copy, Eraser } from 'lucide-react';
import { SEAT_ORDER } from '../../core/tiles';
import type { Seat, TileFace, Wind } from '../../core/types';
import { formatHandCode, parseHandCode, type DevHand } from '../../dev/hand-code';
import { evaluateDevHand } from '../../dev/sandbox';
import type { GameSettings } from '../../storage';
import { SEAT_SHORT, WIND_GLYPH, tileText } from '../labels';
import { classifyHand, modeLabel } from '../tay-calculator';
import { FacePicker, RemovableRow, faceTiles, isBonusFace } from './DevTools';
import { RoundScoreBlock, TayBreakdown, copyText } from './HuResultModal';
import { Modal } from './Modal';
import { TileView } from './TileView';

type MeldType = DevHand['melds'][number]['type'];
type WinMethod = DevHand['win']['method'];
/** Builder draft: a DevHand whose winning tile may still be unpicked. */
export type DraftHand = Omit<DevHand, 'winningTile'> & { winningTile: TileFace | null };
/** Where the next picker tap goes. */
type Target = 'hand' | 'win' | 'kim' | MeldType;

const MELD_BUTTON: Record<MeldType, string> = { pung: 'Pung', kong: 'Kong', ankong: 'Kong tertutup', jia: 'Jia' };
const METHOD_LABEL: Record<WinMethod, string> = { tsumo: 'Ce Mo', ron: 'Buangan', chiong_kong: 'Chiong Kong' };
const TARGET_HINT: Record<Target, string> = {
  hand: 'Ketuk tile untuk menambah ke tangan tertutup.',
  win: 'Ketuk tile yang menjadi tile menang.',
  kim: 'Ketuk tile yang menjadi Kim.',
  pung: 'Ketuk tile untuk Pung (3 sama).',
  kong: 'Ketuk tile untuk Kong terbuka (4 sama).',
  ankong: 'Ketuk tile untuk Kong tertutup (4 sama).',
  jia: 'Ketuk tile terkecil dari Jia (urutan 3).',
};

export const EMPTY_DRAFT: DraftHand = {
  concealed: [], melds: [], bonus: { bunga: [], musim: [] }, winningTile: null,
  win: { method: 'tsumo' }, kimFace: null, seatWind: 'dong', roundWind: 'dong', flags: {},
};

const isSuited = (f: TileFace) => f.type === 'tong' || f.type === 'sok' || f.type === 'ban';
const otherSeat = (seat: Wind): Seat => SEAT_ORDER.find((s) => s !== seat)!;

/** Meld faces from one tap: n copies for Pung / Kong, a run upward for Jia (null when impossible). */
export function meldFrom(type: MeldType, face: TileFace): TileFace[] | null {
  if (type !== 'jia') return Array.from({ length: type === 'pung' ? 3 : 4 }, () => face);
  if (!isSuited(face) || face.value > 7) return null;
  return [0, 1, 2].map((i) => ({ type: face.type, value: face.value + i }));
}

/** Tiles a valid hand needs: 14 plus one per Kong (winning tile included). */
export function tileTarget(d: Pick<DraftHand, 'melds'>): number {
  return 14 + d.melds.filter((m) => m.type === 'kong' || m.type === 'ankong').length;
}
export function tileCount(d: Pick<DraftHand, 'concealed' | 'melds' | 'winningTile'>): number {
  return d.concealed.length + d.melds.reduce((n, m) => n + m.faces.length, 0) + (d.winningTile ? 1 : 0);
}

/** Scoring settings for a draft: a Kim face means natural Kim, a KIM tile means dedicated, else no Kim. */
export function sandboxSettings(settings: GameSettings, d: DraftHand): GameSettings {
  const kimTile = [...d.concealed, ...(d.winningTile ? [d.winningTile] : []), ...d.melds.flatMap((m) => m.faces)].some((f) => f.type === 'kim');
  if (d.kimFace) return { ...settings, kimEnabled: true, kimMode: 'natural' };
  if (kimTile) return { ...settings, kimEnabled: true, kimMode: 'dedicated' };
  return { ...settings, kimEnabled: false, kimMode: 'off' };
}

type Evaluation = { kind: 'waiting'; text: string } | { kind: 'error'; text: string } | { kind: 'ok'; result: ReturnType<typeof evaluateDevHand> };

export function evaluateDraft(d: DraftHand, settings: GameSettings): Evaluation {
  if (!d.winningTile) return { kind: 'waiting', text: 'Pilih tile menang untuk menghitung skor.' };
  try {
    return { kind: 'ok', result: evaluateDevHand({ ...d, winningTile: d.winningTile }, sandboxSettings(settings, d)) };
  } catch (e) {
    return { kind: 'error', text: e instanceof Error ? e.message : String(e) };
  }
}

/** Hand code of a draft, or null until a winning tile is picked. */
export function draftCode(d: DraftHand): string | null {
  return d.winningTile ? formatHandCode({ ...d, winningTile: d.winningTile }) : null;
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" className={value === v ? 'is-on' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

const WIND_OPTIONS = SEAT_ORDER.map((w) => [w, `${WIND_GLYPH[w]} ${SEAT_SHORT[w]}`] as [Wind, string]);

/** "Uji Tangan": build any hand, get the live Hu receipt (Tay table, minimum check, Round Score). */
export function HandSandbox({ settings, initial, onClose }: { settings: GameSettings; initial?: DevHand | null; onClose: () => void }) {
  const [draft, setDraft] = useState<DraftHand>(() => initial ?? EMPTY_DRAFT);
  const [target, setTarget] = useState<Target>('hand');
  const [code, setCode] = useState(() => (initial ? formatHandCode(initial) : ''));
  const [codeError, setCodeError] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const update = (patch: Partial<DraftHand>) => { setDraft((d) => ({ ...d, ...patch })); setCopied(false); };
  const evaluation = useMemo(() => evaluateDraft(draft, settings), [draft, settings]);
  const count = tileCount(draft);
  const need = tileTarget(draft);

  const pick = (face: TileFace) => {
    setPickError(null);
    setCopied(false);
    if (isBonusFace(face)) {
      const key = face.type === 'flower' ? 'bunga' : 'musim';
      const list = draft.bonus[key];
      update({ bonus: { ...draft.bonus, [key]: list.includes(face.value) ? list.filter((n) => n !== face.value) : [...list, face.value].sort() } });
      return;
    }
    if (target === 'hand') update({ concealed: [...draft.concealed, face] });
    else if (target === 'win') { update({ winningTile: face }); setTarget('hand'); }
    else if (target === 'kim') { update({ kimFace: face }); setTarget('hand'); }
    else {
      const faces = meldFrom(target, face);
      if (!faces) { setPickError('Jia harus tile angka 1–7 sebagai tile terkecil.'); return; }
      if (draft.melds.length >= 4) { setPickError('Maksimal 4 meld.'); return; }
      update({ melds: [...draft.melds, { type: target, faces }] });
      setTarget('hand');
    }
  };

  const setMethod = (method: WinMethod) =>
    update({ win: method === 'tsumo' ? { method } : { method, discarder: draft.win.discarder && draft.win.discarder !== draft.seatWind ? draft.win.discarder : otherSeat(draft.seatWind) } });
  const setSeat = (seatWind: Wind) =>
    update({ seatWind, win: draft.win.method !== 'tsumo' && draft.win.discarder === seatWind ? { ...draft.win, discarder: otherSeat(seatWind) } : draft.win });
  const setFlag = (patch: DevHand['flags']) => update({ flags: { ...draft.flags, ...patch } });

  const loadCode = () => {
    const parsed = parseHandCode(code);
    if (!parsed.ok) { setCodeError(parsed.error); return; }
    setCodeError(null);
    setDraft(parsed.hand);
  };
  const currentCode = draftCode(draft);
  const bonusFaces: TileFace[] = [
    ...draft.bonus.bunga.map((value) => ({ type: 'flower' as const, value })),
    ...draft.bonus.musim.map((value) => ({ type: 'season' as const, value })),
  ];

  return (
    <Modal title="Uji Tangan" onClose={onClose} wide footer={
      <>
        <button type="button" className="btn" onClick={() => { setDraft(EMPTY_DRAFT); setTarget('hand'); setCode(''); setCodeError(null); }}>
          <Eraser size={14} /> Kosongkan
        </button>
        <button type="button" className="btn btn-primary" onClick={onClose}>Tutup</button>
      </>
    }>
      <div className="sandbox">
        <div className="sandbox-main">
        <p className="field-note dev-warning">Mode developer · untuk cek skor, tidak dicatat ke riwayat.</p>

        <section className="sandbox-code" aria-label="Kode tangan">
          <label htmlFor="sandbox-code-input"><h3>Kode tangan</h3></label>
          <textarea id="sandbox-code-input" rows={2} spellCheck={false} value={code} placeholder="123m456p789s E E Zh Zh | pung 5s 5s 5s | win 5s ce_mo | kim 3m | seat S | round E"
            aria-invalid={!!codeError} aria-describedby={codeError ? 'sandbox-code-error' : undefined}
            onChange={(e) => { setCode(e.target.value); setCodeError(null); }} />
          {codeError && <p id="sandbox-code-error" className="dev-error" role="alert">{codeError}</p>}
          <div className="sandbox-code-actions">
            <button type="button" className="btn" onClick={loadCode} disabled={!code.trim()}><ClipboardPaste size={14} /> Muat kode</button>
            <button type="button" className="btn" disabled={!currentCode} onClick={async () => {
              if (!currentCode) return;
              setCode(currentCode);
              setCodeError(null);
              setCopied(await copyText(currentCode));
            }}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Kode disalin' : 'Salin kode'}
            </button>
          </div>
        </section>

        <section className="sandbox-build" aria-label="Susun tangan">
          <div className="sandbox-hand">
            <h3>Tangan tertutup <small className={count === need ? 'count-ok' : 'muted'}>{count}/{need} tile</small></h3>
            <RemovableRow faces={draft.concealed} prefix="sb-hand" label="Tangan tertutup — ketuk untuk menghapus" empty="Belum ada tile."
              onRemove={(i) => update({ concealed: draft.concealed.filter((_, j) => j !== i) })} />
            <div className="sandbox-slots">
              <span className="sandbox-slot">
                <span className="slot-label">Tile menang</span>
                {draft.winningTile
                  ? <TileView tile={faceTiles([draft.winningTile], 'sb-win')[0]!} size="sm" highlight onClick={() => update({ winningTile: null })} />
                  : <span className="slot-empty">—</span>}
              </span>
              <span className="sandbox-slot">
                <span className="slot-label">Kim</span>
                {draft.kimFace
                  ? <TileView tile={faceTiles([draft.kimFace], 'sb-kim')[0]!} size="sm" onClick={() => update({ kimFace: null })} />
                  : <span className="slot-empty">Tanpa Kim</span>}
              </span>
              {bonusFaces.length > 0 && (
                <span className="sandbox-slot">
                  <span className="slot-label">Bunga / Musim</span>
                  <RemovableRow faces={bonusFaces} prefix="sb-bonus" label="Bunga dan Musim — ketuk untuk menghapus" empty=""
                    onRemove={(i) => pick(bonusFaces[i]!)} />
                </span>
              )}
            </div>
            {draft.melds.length > 0 && (
              <div className="sandbox-melds" role="group" aria-label="Meld — ketuk untuk menghapus">
                {draft.melds.map((m, i) => (
                  <button key={i} type="button" className="sandbox-meld" title={`Hapus ${MELD_BUTTON[m.type]}`} aria-label={`Hapus ${MELD_BUTTON[m.type]} ${m.faces.map((f) => tileText(faceTiles([f])[0]!)).join(', ')}`}
                    onClick={() => update({ melds: draft.melds.filter((_, j) => j !== i) })}>
                    <small>{MELD_BUTTON[m.type]}</small>
                    {faceTiles(m.faces, `sb-meld-${i}`).map((t) => <TileView key={t.id} tile={t} size="sm" />)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="sandbox-target">
            <Segmented<Target> label="Tujuan ketukan tile" value={target} onChange={(t) => { setTarget(t); setPickError(null); }} options={[
              ['hand', 'Tangan'], ['win', 'Tile menang'], ['kim', 'Kim'],
              ['pung', '+ Pung'], ['kong', '+ Kong'], ['ankong', '+ Kong tertutup'], ['jia', '+ Jia'],
            ]} />
            <p className="field-note" role="status">{TARGET_HINT[target]} Bunga / Musim selalu masuk ke rak.</p>
            {pickError && <p className="dev-error" role="alert">{pickError}</p>}
          </div>
          <FacePicker label="Pilih tile" kim onPick={pick}
            disabled={target === 'jia' ? (f) => !isBonusFace(f) && (!isSuited(f) || f.value > 7) : target === 'kim' ? (f) => f.type === 'kim' : undefined} />
        </section>

        <section className="sandbox-context" aria-label="Konteks kemenangan">
          <div className="field"><span>Angin duduk</span><Segmented label="Angin duduk" value={draft.seatWind} options={WIND_OPTIONS} onChange={setSeat} /></div>
          <div className="field"><span>Angin putaran</span><Segmented label="Angin putaran" value={draft.roundWind} options={WIND_OPTIONS} onChange={(roundWind) => update({ roundWind })} /></div>
          <div className="field">
            <span>Cara menang</span>
            <Segmented label="Cara menang" value={draft.win.method} options={(['tsumo', 'ron', 'chiong_kong'] as WinMethod[]).map((m) => [m, METHOD_LABEL[m]] as [WinMethod, string])} onChange={setMethod} />
            {draft.win.method !== 'tsumo' && (
              <label className="sandbox-from">dari{' '}
                <select aria-label={`${METHOD_LABEL[draft.win.method]} dari`} value={draft.win.discarder} onChange={(e) => update({ win: { ...draft.win, discarder: e.target.value as Seat } })}>
                  {SEAT_ORDER.filter((s) => s !== draft.seatWind).map((s) => <option key={s} value={s}>{SEAT_SHORT[s]}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="sandbox-flags" role="group" aria-label="Kondisi khusus">
            <label className="toggle"><input type="checkbox" checked={!!draft.flags.firstGoAround} onChange={(e) => setFlag({ firstGoAround: e.target.checked })} /><span>Giliran pertama</span></label>
            <label className="toggle"><input type="checkbox" checked={!!draft.flags.initialDealtHand} onChange={(e) => setFlag({ initialDealtHand: e.target.checked })} /><span>Tangan awal (belum ada buangan)</span></label>
            <label className="toggle"><input type="checkbox" checked={!!draft.flags.paoChin} onChange={(e) => setFlag({ paoChin: e.target.checked })} /><span>Pao Chin</span></label>
            <div className="field"><span>Setelah kong</span>
              <Segmented label="Setelah kong" value={String(draft.flags.consecutiveKongs ?? 0) as '0' | '1' | '2'}
                options={[['0', 'Tidak'], ['1', '1 kong'], ['2', '2 kong']]} onChange={(v) => setFlag({ consecutiveKongs: Number(v) || undefined })} />
            </div>
          </div>
        </section>
        </div>

        <section className="sandbox-result receipt" aria-label="Hasil skor" aria-live="polite">
          {evaluation.kind !== 'ok' ? (
            <p className={evaluation.kind === 'error' ? 'dev-error' : 'muted'} role={evaluation.kind === 'error' ? 'alert' : undefined}>{evaluation.text}</p>
          ) : (
            <>
              <p className={`hu-banner${evaluation.result.scoring.isValidHu ? '' : ' is-lew-fit'}`} aria-hidden="true">
                {evaluation.result.scoring.isValidHu ? 'HU' : 'LEW FIT'}
                <small>{SEAT_SHORT[draft.seatWind]} · {evaluation.result.scoring.totalTay} Tay</small>
              </p>
              <dl className="receipt-meta">
                <dt>Klasifikasi</dt>
                <dd>{classifyHand(evaluation.result.scoring)}</dd>
                <dt>Tabel</dt>
                <dd><span className={`badge ${evaluation.result.scoring.mode === 'K' ? 'badge-kim' : 'badge-seat'}`}>{modeLabel(evaluation.result.scoring.mode)}</span></dd>
              </dl>
              <TayBreakdown scoring={evaluation.result.scoring} />
              <RoundScoreBlock nameOf={(s) => `Kursi ${SEAT_SHORT[s]}`}
                outcome={evaluation.result.roundScore ? { winner: draft.seatWind, seatWind: draft.seatWind, roundScore: evaluation.result.roundScore } : null} />
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
