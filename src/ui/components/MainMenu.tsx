import { Calculator, LayoutGrid } from 'lucide-react';
import { keyToTile } from '../../core/tiles';
import type { BonusTileRule, ScoringBasis } from '../../core/types';
import { TileView } from './TileView';

export interface MainMenuProps {
  difficultyLabel: string;
  lastResult: string | null;
  onPractice: () => void;
  onCalculator: () => void;
  /** Pregame Kim choice; the control only renders when both props are supplied. */
  kimEnabled?: boolean;
  onKimChange?: (enabled: boolean) => void;
  /** Scoring rules for the next practice match; the summary renders with the Kim choice when supplied. */
  scoringBasis?: ScoringBasis;
  bonusTileRule?: BonusTileRule;
  onBonusTileRuleChange?: (rule: BonusTileRule) => void;
}

function tableLine(kimEnabled: boolean, basis: ScoringBasis): string {
  if (basis === 'hand_kim_usage') {
    return 'Kolom dipilih per hand menurut Kim di tangan pemenang (pembacaan lama, dari Pengaturan).';
  }
  return kimEnabled
    ? 'Setiap Hu dihitung dengan tabel Ada Kim, juga hand yang tidak memegang Kim.'
    : 'Setiap Hu dihitung dengan tabel Tanpa Kim.';
}

/** One teaching row of the tile legend: example tiles plus a plain-language reading. */
const LEGEND: readonly { title: string; keys: readonly string[]; text: string }[] = [
  { title: 'Tong (bulatan)', keys: ['1T', '5T', '9T'], text: 'Hitung bulatannya: jumlah bulatan = angka tile.' },
  { title: 'Sok (bambu)', keys: ['1S', '4S', '8S'], text: 'Hitung batang bambunya. 1 Sok bergambar burung.' },
  { title: 'Ban (karakter)', keys: ['1B', '5B', '9B'], text: 'Angka Tionghoa di atas 萬 merah; angka kecil di pojok membantu membaca.' },
  { title: 'Angin', keys: ['WD', 'WN', 'WX', 'WB'], text: '東 Timur · 南 Selatan · 西 Barat · 北 Utara. Huruf pojok T/S/B/U menunjukkan arahnya.' },
  { title: 'Naga', keys: ['DZ', 'DF', 'DP'], text: '中 Zhong merah, 發 Fat hijau, Pat = bingkai kosong (naga putih).' },
  {
    title: 'Bunga & Musim',
    keys: ['F1', 'F2', 'M3', 'M4'],
    text: 'Angka 1–4 = posisi duduk (1 Timur, 2 Selatan, 3 Barat, 4 Utara). Angka biru tua = Bunga (bunga hitam/biru); angka merah = Musim (kembang merah). Masing-masing ada satu tile per angka.',
  },
];

export function MainMenu({
  difficultyLabel,
  lastResult,
  onPractice,
  onCalculator,
  kimEnabled,
  onKimChange,
  scoringBasis,
  bonusTileRule,
  onBonusTileRuleChange,
}: MainMenuProps) {
  const showKim = kimEnabled !== undefined && onKimChange !== undefined;
  return (
    <main className="main-menu">
      <section className="menu-card" aria-label="Menu utama">
        <p className="menu-eyebrow">Meja latihan</p>
        <h2>Mahjong Tradisional Indonesia</h2>
        <p>Latihan melawan tiga bot, aturan Bandung Mahjong Cup ver06. Anda duduk sebagai Timur.</p>
        {lastResult !== null && <p className="menu-last">Terakhir: {lastResult}</p>}
        {showKim && (
          <fieldset className="menu-kim">
            <legend>Kim untuk latihan berikutnya</legend>
            <div className="segmented" role="group" aria-label="Pilihan Kim">
              <button type="button" className={kimEnabled ? 'is-on' : ''} aria-pressed={kimEnabled} onClick={() => onKimChange(true)}>
                Ada Kim
              </button>
              <button type="button" className={kimEnabled ? '' : 'is-on'} aria-pressed={!kimEnabled} onClick={() => onKimChange(false)}>
                Tanpa Kim
              </button>
            </div>
            <p className="muted small">
              Mode Kim di sini adalah model lama: empat tile Kim tetap ikut di tembok dan berlaku sebagai joker. Penentuan Kim lewat
              indikator lemparan dadu belum diterapkan karena prosedurnya masih menunggu konfirmasi.
            </p>
            {scoringBasis && bonusTileRule && (
              <div className="menu-rules" aria-label="Ringkasan aturan">
                <p className="small">
                  <strong>Tabel:</strong> {tableLine(kimEnabled, scoringBasis)}
                </p>
                {onBonusTileRuleChange && (
                  <div className="segmented" role="group" aria-label="Bunga dan Musim">
                    <button
                      type="button"
                      className={bonusTileRule === 'own_seat_only' ? 'is-on' : ''}
                      aria-pressed={bonusTileRule === 'own_seat_only'}
                      onClick={() => onBonusTileRuleChange('own_seat_only')}
                    >
                      Bunga: posisi sendiri
                    </button>
                    <button
                      type="button"
                      className={bonusTileRule === 'rulebook_per_tile' ? 'is-on' : ''}
                      aria-pressed={bonusTileRule === 'rulebook_per_tile'}
                      onClick={() => onBonusTileRuleChange('rulebook_per_tile')}
                    >
                      Bunga: per tile (PDF)
                    </button>
                  </div>
                )}
                <p className="small">
                  <strong>Bunga/Musim:</strong>{' '}
                  {bonusTileRule === 'own_seat_only'
                    ? 'hanya tile bernomor posisi Anda +1; tile posisi lain 0 (aturan rumah). Koleksi 4 Bunga, 4 Musim dan 7 tile tetap dihitung.'
                    : 'Bunga 0 dan Musim 1 per tile, posisi sendiri +1 (nilai PDF).'}
                </p>
                <p className="muted small">Timur selalu dealer di latihan; giliran berjalan berlawanan arah jarum jam.</p>
              </div>
            )}
          </fieldset>
        )}
        <div className="menu-choices">
          <button type="button" className="btn btn-primary menu-choice" onClick={onPractice}>
            <LayoutGrid size={24} aria-hidden="true" />
            <strong>Latihan</strong>
            <span>Tiga bot: {difficultyLabel}</span>
          </button>
          <button type="button" className="btn menu-choice" onClick={onCalculator}>
            <Calculator size={24} aria-hidden="true" />
            <strong>Kalkulator Tay</strong>
            <span>Periksa pola dan hitung Tay</span>
          </button>
        </div>
        <details className="tile-legend">
          <summary>Cara membaca tile</summary>
          <dl>
            {LEGEND.map((row) => (
              <div className="legend-row" key={row.title}>
                <dt>{row.title}</dt>
                <dd>
                  <span className="legend-tiles">
                    {row.keys.map((k) => (
                      <TileView key={k} tile={keyToTile(k)} size="md" />
                    ))}
                  </span>
                  <span className="legend-text">{row.text}</span>
                </dd>
              </div>
            ))}
            <div className="legend-row">
              <dt>Kim</dt>
              <dd>
                <span className="legend-tiles">
                  <TileView tile={keyToTile('KIM')} size="md" />
                </span>
                <span className="legend-text">Tile Kim berbingkai ungu putus-putus dengan bintang dan tulisan KIM.</span>
              </dd>
            </div>
          </dl>
        </details>
        <p className="muted small">Tingkat kesulitan dapat diubah melalui Pengaturan.</p>
      </section>
    </main>
  );
}
