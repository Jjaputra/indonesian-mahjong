import { useMemo, useState } from 'react';
import { Check, Copy, Eraser, Search } from 'lucide-react';
import { PATTERNS } from '../../scoring';
import {
  ALL_PATTERNS,
  PATTERN_GROUPS,
  buildCalculatorReceipt,
  calculateTay,
  formatTay,
  isSelectable,
  modeLabel,
  searchPatterns,
} from '../tay-calculator';
import { copyText } from './HuResultModal';

interface TayCalculatorProps {
  defaultMinHuTay: number;
}

/** Interactive 44-Tay calculator with rulebook reference (search, K / NK columns, 5-Tay check). */
export function TayCalculator({ defaultMinHuTay }: TayCalculatorProps) {
  const [withKim, setWithKim] = useState(false);
  const [query, setQuery] = useState('');
  const [minHuTay, setMinHuTay] = useState(defaultMinHuTay);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [copied, setCopied] = useState(false);

  const result = useMemo(() => calculateTay(selected, withKim, minHuTay), [selected, withKim, minHuTay]);
  const visibleIds = useMemo(() => new Set(searchPatterns(query).map((p) => p.id)), [query]);

  const toggle = (id: number) => {
    if (!isSelectable(id, withKim)) return;
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
    // Drop selections that do not exist in the new mode ("—").
    setSelected((prev) => new Set([...prev].filter((id) => isSelectable(id, k))));
  };

  return (
    <div className="calculator">
      <div className="calc-controls">
        <label className="check">
          <input type="checkbox" checked={withKim} onChange={(e) => setMode(e.target.checked)} />
          Hand memiliki / menggunakan Kim
        </label>
        <label className="search">
          <Search size={14} />
          <input type="search" placeholder="Cari pola (nama, nomor, keterangan)…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="min-input">
          Minimum Hu
          <input
            type="number"
            min={0}
            max={100}
            value={minHuTay}
            onChange={(e) => setMinHuTay(Math.max(0, Number(e.target.value) || 0))}
          />
          Tay
        </label>
      </div>

      <div className={`calc-summary ${result.meetsMinimum ? 'ok' : 'bad'}`} aria-live="polite">
        <span className="badge badge-kim">{modeLabel(result.mode)}</span>
        <span className="calc-total">{result.total} Tay</span>
        <span className="status-line">{result.statusText}</span>
        <span className="calc-actions">
          <button
            type="button"
            className="btn"
            onClick={async () => setCopied(await copyText(buildCalculatorReceipt(result)))}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Disalin' : 'Salin hasil'}
          </button>
          <button type="button" className="btn" onClick={() => setSelected(new Set())}>
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
                  const selectable = isSelectable(p.id, withKim);
                  const checked = selected.has(p.id);
                  return (
                    <tr key={p.id} className={`${checked ? 'is-checked' : ''}${selectable ? '' : ' is-unavailable'}`} onClick={() => toggle(p.id)}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Pilih ${p.name}`}
                          checked={checked}
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
                        </div>
                      </td>
                      <td className={withKim ? 'col-active num' : 'num'}>{formatTay(p.K)}</td>
                      <td className={!withKim ? 'col-active num' : 'num'}>{formatTay(p.NK)}</td>
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
        Nilai “—” berarti pola tidak berlaku pada mode tersebut dan tidak dapat dipilih. Sumber: Bandung Mahjong Cup Rulebook ver06
        ({ALL_PATTERNS.length} pola).
      </p>
    </div>
  );
}
