import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Eraser, Search } from 'lucide-react';
import type { BonusTileRule, ScoringBasis } from '../../core/types';
import { PATTERNS, tableTay } from '../../scoring';
import { MIN_HU_TAY_LOWER_BOUND, MIN_HU_TAY_UPPER_BOUND, type OverlapPolicy } from '../../storage';
import {
  ALL_PATTERNS,
  BONUS_TILE_RULE_LABEL,
  PATTERN_GROUPS,
  SCORING_BASIS_LABEL,
  buildCalculatorReceipt,
  calculateTay,
  formatTay,
  isSelectable,
  matchColumnWithKim,
  modeLabel,
  searchPatterns,
  type CalculatorBonus,
} from '../tay-calculator';
import { copyText } from './HuResultModal';

interface TayCalculatorProps {
  defaultMinHuTay: number;
  /** Live settings policy. Defaults to the tournament rulebook exclusion table. */
  overlapPolicy?: OverlapPolicy;
  /** Live table basis; defaults to the legacy hand-usage reading. */
  scoringBasis?: ScoringBasis;
  /** Live individual flower/season rule; defaults to the PDF per-tile values. */
  bonusTileRule?: BonusTileRule;
  /**
   * Kim choice of the match in play (active rules, not next-game edits). Under the match-table
   * basis the column opens on it and follows when it changes; the checkbox can still be flipped
   * to look at the other column. Omitted: standalone calculator, opens on Tanpa Kim.
   */
  matchKimEnabled?: boolean;
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
export function TayCalculator({
  defaultMinHuTay,
  overlapPolicy = 'rulebook_exclusive',
  scoringBasis: liveBasis = 'hand_kim_usage',
  bonusTileRule: liveBonusRule = 'rulebook_per_tile',
  matchKimEnabled,
}: TayCalculatorProps) {
  const [withKim, setWithKim] = useState(() => matchColumnWithKim(matchKimEnabled, liveBasis) ?? false);
  const [scoringBasis, setScoringBasis] = useState<ScoringBasis>(liveBasis);
  const [bonusTileRule, setBonusTileRule] = useState<BonusTileRule>(liveBonusRule);
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
  useEffect(() => setScoringBasis(liveBasis), [liveBasis]);
  useEffect(() => setBonusTileRule(liveBonusRule), [liveBonusRule]);

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
    () =>
      calculateTay(selected, withKim, minHuTay, {
        overlapPolicy,
        instant,
        bonus: instant ? undefined : bonus,
        scoringBasis,
        bonusTileRule,
      }),
    [selected, withKim, minHuTay, overlapPolicy, instant, bonus, scoringBasis, bonusTileRule],
  );
  const visibleIds = useMemo(() => new Set(searchPatterns(query).map((p) => p.id)), [query]);

  const toggle = (id: number) => {
    if (!isSelectable(id, withKim, instant, scoringBasis)) return;
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
    setSelected((prev) => new Set([...prev].filter((id) => isSelectable(id, k, instant, scoringBasis))));
  };

  // A new match choice (or switching to the match basis) moves the column to the match.
  const matchColumn = matchColumnWithKim(matchKimEnabled, scoringBasis);
  useEffect(() => {
    if (matchColumn !== null) setMode(matchColumn);
  }, [matchColumn]);

  const setInstantMode = (on: boolean) => {
    setInstant(on);
    setCopied(false);
    if (on) setSelected((prev) => new Set([...prev].filter((id) => isSelectable(id, withKim, true, scoringBasis))));
  };

  const changeBasis = (basis: ScoringBasis) => {
    setScoringBasis(basis);
    setCopied(false);
    setSelected((prev) => new Set([...prev].filter((id) => isSelectable(id, withKim, instant, basis))));
  };

  return (
    <div className="calculator">
      <div className="calc-controls">
        <label className="check">
          <input type="checkbox" checked={withKim} onChange={(e) => setMode(e.target.checked)} />
          {scoringBasis === 'match_table' ? 'Pertandingan Ada Kim (kolom Ada Kim untuk semua hand)' : 'Hand memiliki / menggunakan Kim'}
        </label>
        {matchColumn !== null && (
          <span className="muted small" data-testid="calc-match-column">
            {matchColumn === withKim
              ? `Mengikuti pertandingan: ${modeLabel(matchColumn ? 'K' : 'NK')}`
              : `Dilihat manual — pertandingan memakai ${modeLabel(matchColumn ? 'K' : 'NK')}`}
          </span>
        )}
        <label className="min-input">
          Dasar kolom
          <select value={scoringBasis} onChange={(e) => changeBasis(e.target.value as ScoringBasis)}>
            <option value="match_table">Pilihan pertandingan</option>
            <option value="hand_kim_usage">Kim di tangan (lama)</option>
          </select>
        </label>
        <label className="min-input">
          Bunga/Musim
          <select value={bonusTileRule} onChange={(e) => setBonusTileRule(e.target.value as BonusTileRule)}>
            <option value="own_seat_only">Hanya posisi sendiri</option>
            <option value="rulebook_per_tile">Per tile (PDF)</option>
          </select>
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
          ? 'Kebijakan eksklusif: pola lebih tinggi menggantikan pola di bawahnya. Hanya Thi Fu → Pao Chin tertulis di rulebook; pasangan lain belum terkonfirmasi.'
          : 'Kebijakan kumulatif: pola tumpang tindih dijumlah.'}{' '}
        Jumlah bunga dan musim dipakai untuk #1 dan #2 saat hand lengkap. {SCORING_BASIS_LABEL[scoringBasis]}.{' '}
        {BONUS_TILE_RULE_LABEL[bonusTileRule]}.
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
                  const selectable = isSelectable(p.id, withKim, instant, scoringBasis);
                  const cellK = tableTay(p.id, 'K', scoringBasis);
                  const cellNK = tableTay(p.id, 'NK', scoringBasis);
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
                          {p.seatMatchBonus
                            ? bonusTileRule === 'own_seat_only'
                              ? ' · aturan rumah: hanya tile posisi sendiri +1, tile lain 0'
                              : ` · +${p.seatMatchBonus} bila sesuai posisi duduk`
                            : ''}
                          {p.instantHu ? ` · Hu instan = ${p.instantHu} Tay` : ''}
                          {shown && shown.tay !== (withKim ? cellK : cellNK) ? ` · dihitung ${shown.tay} Tay` : ''}
                        </div>
                      </td>
                      <td className={withKim ? 'col-active num' : 'num'}>{formatTay(cellK === null ? null : instant && p.instantHu != null ? p.instantHu : cellK)}</td>
                      <td className={!withKim ? 'col-active num' : 'num'}>{formatTay(cellNK === null ? null : instant && p.instantHu != null ? p.instantHu : cellNK)}</td>
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
        tetap mengikuti susunan kartu di meja. Sumber nilai: Bandung Mahjong Cup Rulebook ver06 ({ALL_PATTERNS.length} pola). Aturan
        rumah (kolom ikut pertandingan, Bunga/Musim posisi sendiri) dan pengecualian selain Thi Fu → Pao Chin bukan teks PDF.
      </p>
    </div>
  );
}
