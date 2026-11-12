import { ArrowRight } from 'lucide-react';
import { keyToTile } from '../../core/tiles';
import { type DeadWallOption, type DealerWinRule, type MatchTimeLimit } from '../match';
import { TileView } from './TileView';

export interface MainMenuProps {
  difficultyLabel: string;
  lastResult: string | null;
  onPractice: () => void;
  kimEnabled?: boolean;
  kimMode?: 'natural' | 'dedicated' | 'off';
  onKimModeChange?: (mode: 'natural' | 'dedicated' | 'off') => void;
  deadWall?: DeadWallOption;
  onDeadWallChange?: (option: DeadWallOption) => void;
  onKimChange?: (enabled: boolean) => void;
  timeLimitMinutes?: MatchTimeLimit;
  onTimeLimitChange?: (limit: MatchTimeLimit) => void;
  dealerWinRule?: DealerWinRule;
  onDealerWinRuleChange?: (rule: DealerWinRule) => void;
}

interface ChoiceOption<T> { value: T; label: string; note: string }

/** A pregame choice as large tap buttons: one radio group, each option with a one-line explanation. */
function MenuChoice<T>({ label, value, options, onChange }: { label: string; value: T; options: readonly ChoiceOption<T>[]; onChange: (value: T) => void }) {
  const current = options.find((o) => o.value === value) ?? options[0]!;
  return (
    <div className="menu-option">
      <span className="menu-option-label">{label}</span>
      <div className="menu-segments" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === current.value}
            className={o.value === current.value ? 'is-on' : undefined} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      <small className="menu-option-note">{current.note}</small>
    </div>
  );
}

const KIM_OPTIONS: readonly ChoiceOption<'natural' | 'dedicated' | 'off'>[] = [
  { value: 'natural', label: 'Kim dari tile', note: 'Satu wajah tile diundi tiap game; keempat kopinya jadi Kim.' },
  { value: 'dedicated', label: 'Kim tambahan (pemula)', note: 'Empat tile KIM khusus ditambahkan ke tembok (148 tile).' },
  { value: 'off', label: 'Tanpa Kim', note: 'Tidak ada Kim; semua tile dimainkan dengan wajah aslinya.' },
];
const DEAD_WALL_OPTIONS: readonly ChoiceOption<DeadWallOption>[] = [
  { value: 'none', label: 'Sampai habis (turnamen)', note: 'Semua tile dimainkan sampai habis, sesuai aturan turnamen.' },
  { value: '14', label: 'Sisa 14 tile (dead wall)', note: 'Game berakhir Seri saat tembok tinggal 14 tile.' },
];
const TIME_OPTIONS: readonly ChoiceOption<MatchTimeLimit>[] = [
  { value: null, label: 'Tanpa batas (default)', note: 'Pertandingan berjalan sampai 16 game selesai.' },
  { value: 90, label: '90 menit', note: 'Waktu tetap berjalan saat jeda atau dialog terbuka. Setelah waktu habis, selesaikan game yang sedang berjalan.' },
];

/** A few real tiles fanned across the card: winds, dragons and a Kim. */
const SHOWCASE = ['WD', 'WN', 'WX', 'WB', 'DZ', 'KIM', '8B'].map((key, i) => keyToTile(key, 90 + i));

export function MainMenu({ difficultyLabel, lastResult, onPractice, kimEnabled, onKimChange, kimMode, onKimModeChange, deadWall, onDeadWallChange, timeLimitMinutes, onTimeLimitChange }: MainMenuProps) {
  return (
    <main className="main-menu">
      <section className="menu-card" aria-label="Menu utama">
        <div className="menu-showcase" aria-hidden="true">
          {SHOWCASE.map((t) => <TileView key={t.id} tile={t} size="md" />)}
        </div>
        <p className="menu-eyebrow">Mahjong Tradisional Indonesia</p>
        <h2>Waktunya bermain.</h2>
        <p className="muted">Anda dan tiga lawan. Satu meja.</p>
        {lastResult !== null && <p className="menu-last">Terakhir: {lastResult}</p>}
        {(onKimModeChange || onKimChange) && <MenuChoice label="Pilihan Kim" value={kimMode ?? (kimEnabled ? 'natural' : 'off')} options={KIM_OPTIONS}
          onChange={(mode) => { if (onKimModeChange) onKimModeChange(mode); else onKimChange?.(mode !== 'off'); }} />}
        {onDeadWallChange && <MenuChoice label="Akhir tembok" value={deadWall ?? 'none'} options={DEAD_WALL_OPTIONS} onChange={onDeadWallChange} />}
        {timeLimitMinutes !== undefined && onTimeLimitChange && <MenuChoice label="Waktu" value={timeLimitMinutes} options={TIME_OPTIONS} onChange={onTimeLimitChange} />}
        <div className="menu-choices">
          <button type="button" className="btn btn-primary menu-choice" onClick={onPractice}>
            <strong>Mulai bermain <ArrowRight size={20} aria-hidden="true" /></strong>
            <span>Tiga bot · {difficultyLabel} · 16 game</span>
          </button>
        </div>
      </section>
    </main>
  );
}
