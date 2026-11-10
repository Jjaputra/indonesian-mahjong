import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Eraser, Search } from 'lucide-react';
import { PATTERNS } from '../../scoring';
import { MIN_HU_TAY_LOWER_BOUND, MIN_HU_TAY_UPPER_BOUND, type OverlapPolicy } from '../../storage';
import {
  ALL_PATTERNS,
  PATTERN_GROUPS,
  buildCalculatorReceipt,
  calculateTay,
  formatTay,
  isSelectable,
  modeLabel,
  searchPatterns,
  type CalculatorBonus,
} from '../tay-calculator';
import { copyText } from './HuResultModal';

interface TayCalculatorProps {
  defaultMinHuTay: number;
  /** Live settings policy. Defaults to the tournament rulebook exclusion table. */
  overlapPolicy?: OverlapPolicy;
}

const MAX_BONUS = 4;

function clampMin(value: number): number {
  if (!Number.isFinite(value)) return MIN_HU_TAY_LOWER_BOUND;
  return Math.min(MIN_HU_TAY_UPPER_BOUND, Math.max(MIN_HU_TAY_LOWER_BOUND, Math.round(value)));
}

function clampBonus(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.floor(value)));
}

/** Interactive 44-Tay calculator with rulebook reference (search, K / NK columns, Tay threshold). */
export function TayCalculator({ defaultMinHuTay, overlapPolicy = 'rulebook_exclusive' }: TayCalculatorProps) {
  const [withKim, setWithKim] = useState(false);
  const [instant, setInstant] = useState(false);
  const [query, setQuery] = useState('');
  const [minHuTay, setMinHuTay] = useState(() => clampMin(defaultMinHuTay));
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [flowers, setFlowers] = useState(0);
  const [seasons, setSeasons] = useState(0);
  const [flowerSeatMatches, setFlowerSeatMatches] = useState(0);
  const [seasonSeatMatches, setSeasonSeatMatches] = useState(0);
  const [copied, setCopied] = useState(false);

  // Saved minimum replaces the threshold only. Pattern picks and bonus counts stay.
  useEffect(() => {
    setMinHuTay(clampMin(defaultMinHuTay));
  }, [defaultMinHuTay]);

  const bonus = useMemo<CalculatorBonus>(
    () => ({
      flowers,
      seasons,
      flowerSeatMatches: Math.min(flowerSeatMatches, flowers),
      seasonSeatMatches: Math.min(seasonSeatMatches, seasons),
    }),
    [flowers, seasons, flowerSeatMatches, seasonSeatMatches],
  );

  const result = useMemo(
    () => calculateTay(selected, withKim, minHuTay, { overlapPolicy, instant, bonus: instant ? undefined : bonus }),
    [selected, withKim, minHuTay, overlapPolicy, instant, bonus],
  );
  const visibleIds = useMemo(() => new Set(searchPatterns(query).map((p) => p.id)), [query]);

  const toggle = (id: number) => {
    if (!isSelectable(id, withKim, instant)) return;
    setCopied(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setMode = (k: boolean) => {
    setWithKim(k);
    setSelected((prev) => new Set([...prev].filter((id) => isSelectable(id, k, instant))));
  };

  const setInstantMode = (on: boolean) => {
    setInstant(on);
    setCopied(false);
    if (on) setSelected((prev) => new Set([...prev].filter((id) => isSelectable(id, withKim, true))));
  };

  return (
    <div className="calculator">
      <div className="calc-controls">
        <label className="check">
          <input type="checkbox" checked={withKim} onChange={(e) => setMode(e.target.checked)} />
          Hand memiliki / menggunakan Kim
        </label>
        <label className="check">
          <input type="checkbox" checked={instant} onChange={(e) => setInstantMode(e.target.checked)} />
          Hu instan (nilai 10, bukan nilai hand lengkap)
        </label>
        <label className="search">
          <Search size={14} />
          <input type="search" placeholder="Cari pola (nama, nomor, keterangan)…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="min-input">
          Minimum Hu
          <input
            type="number"
            min={MIN_HU_TAY_LOWER_BOUND}
            max={MIN_HU_TAY_UPPER_BOUND}
            value={minHuTay}
            onChange={(e) => setMinHuTay(clampMin(Number(e.target.value)))}
          />
          Tay
        </label>
        <label className="min-input">
          Bunga
          <input
            type="number"
            min={0}
            max={MAX_BONUS}
            value={flowers}
            disabled={instant}
            onChange={(e) => {
              const next = clampBonus(Number(e.target.value), MAX_BONUS);
              setFlowers(next);
              setFlowerSeatMatches((prev) => Math.min(prev, next));
            }}
          />
        </label>
        <label className="min-input">
          Bunga sesuai duduk
          <input
            type="number"
            min={0}
            max={flowers}
            value={Math.min(flowerSeatMatches, flowers)}
            disabled={instant}
            onChange={(e) => setFlowerSeatMatches(clampBonus(Number(e.target.value), flowers))}
          />
        </label>
        <label className="min-input">
          Musim
          <input
            type="number"
            min={0}
            max={MAX_BONUS}
            value={seasons}
            disabled={instant}
            onChange={(e) => {
              const next = clampBonus(Number(e.target.value), MAX_BONUS);
              setSeasons(next);
              setSeasonSeatMatches((prev) => Math.min(prev, next));
            }}
          />
        </label>
        <label className="min-input">
          Musim sesuai duduk
          <input
            type="number"
            min={0}
            max={seasons}
            value={Math.min(seasonSeatMatches, seasons)}
            disabled={instant}
            onChange={(e) => setSeasonSeatMatches(clampBonus(Number(e.target.value), seasons))}
          />
        </label>
      </div>
      <p className="muted small">
        {overlapPolicy === 'rulebook_exclusive'
          ? 'Kebijakan eksklusif rulebook: pola lebih tinggi menggantikan pola di bawahnya.'
          : 'Kebijakan kumulatif: pola tumpang tindih dijumlah.'}{' '}
        Jumlah bunga dan musim dipakai untuk #1 dan #2 saat hand lengkap.
      </p>

      <div className={`calc-summary ${result.meetsMinimum ? 'ok' : 'bad'}`} aria-live="polite">
        <span className="badge badge-kim">{modeLabel(result.mode)}</span>
        <span className="calc-total">{result.total} Tay</span>
        <span className="status-line">{result.statusText}</span>
        <span className="calc-actions">
          <button type="button" className="btn" onClick={async () => setCopied(await copyText(buildCalculatorReceipt(result)))}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Disalin' : 'Salin hasil'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setSelected(new Set());
              setCopied(false);
            }}
          >
            <Eraser size={14} /> Reset
          </button>
        </span>
      </div>

      {PATTERN_GROUPS.map((g) => {
        const rows = g.ids.filter((id) => visibleIds.has(id)).map((id) => PATTERNS.get(id)!);
        if (!rows.length) return null;
        return (
          <section key={g.title} className="calc-group">
            <h3>{g.title}</h3>
            <table className="tay-table calc-table">
              <thead>
                <tr>
                  <th />
                  <th>#</th>
                  <th>Pola &amp; Keterangan</th>
                  <th className={withKim ? 'col-active' : ''}>K</th>
                  <th className={!withKim ? 'col-active' : ''}>NK</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const selectable = isSelectable(p.id, withKim, instant);
                  const checked = selected.has(p.id);
                  const shown = result.lines.find((line) => line.id === p.id);
                  return (
                    <tr key={p.id} className={`${checked ? 'is-checked' : ''}${selectable ? '' : ' is-unavailable'}`} onClick={() => toggle(p.id)}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Pilih ${p.name}`}
                          checked={checked && selectable}
                          disabled={!selectable}
                          onChange={() => toggle(p.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td>{p.id}</td>
                      <td>
                        <strong>{p.name}</strong>
                        <div className="muted small">
                          {p.keterangan}
                          {p.seatMatchBonus ? ` · +${p.seatMatchBonus} bila sesuai posisi duduk` : ''}
                          {p.instantHu ? ` · Hu instan = ${p.instantHu} Tay` : ''}
                          {shown && shown.tay !== (withKim ? p.K : p.NK) ? ` · dihitung ${shown.tay} Tay` : ''}
                        </div>
                      </td>
                      <td className={withKim ? 'col-active num' : 'num'}>{formatTay(p.K === null ? null : instant && p.instantHu != null ? p.instantHu : p.K)}</td>
                      <td className={!withKim ? 'col-active num' : 'num'}>{formatTay(p.NK === null ? null : instant && p.instantHu != null ? p.instantHu : p.NK)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
      {visibleIds.size === 0 && <p className="muted">Tidak ada pola yang cocok dengan “{query}”.</p>}
      <p className="muted small">
        Nilai “—” berarti pola tidak berlaku pada mode tersebut dan tidak dapat dipilih. Centang pola hanya menjumlah Tay; Hu sah
        tetap mengikuti susunan kartu di meja. Sumber: Bandung Mahjong Cup Rulebook ver06 ({ALL_PATTERNS.length} pola).
      </p>
    </div>
  );
}
