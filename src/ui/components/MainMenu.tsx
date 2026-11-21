import { useState } from 'react';
import { ArrowLeft, ArrowRight, Sparkles, Users } from 'lucide-react';
import type { AIDifficulty } from '../../storage';
import logo from '../../assets/brand/maciokyu-logo.png';
import { DIFFICULTY_LABEL } from '../labels';
import { useConfig } from '../../net/config';
import { useAccount } from '../../net/auth';
import { PremiumModal } from './PremiumModal';
import { type DeadWallOption, type DealerWinRule, type MatchTimeLimit } from '../match';

export interface MainMenuProps {
  difficulty?: AIDifficulty;
  onDifficultyChange?: (difficulty: AIDifficulty) => void;
  difficultyLabel?: string;
  lastResult: string | null;
  onPractice: () => void;
  kimEnabled?: boolean;
  kimMode?: 'natural' | 'dedicated' | 'off';
  onKimModeChange?: (mode: 'natural' | 'dedicated' | 'off', minHuTay: 3 | 5) => void;
  deadWall?: DeadWallOption;
  onDeadWallChange?: (option: DeadWallOption) => void;
  onKimChange?: (enabled: boolean) => void;
  timeLimitMinutes?: MatchTimeLimit;
  onTimeLimitChange?: (limit: MatchTimeLimit) => void;
  dealerWinRule?: DealerWinRule;
  onDealerWinRuleChange?: (rule: DealerWinRule) => void;
  /** Online play: set only when a room server is configured. */
  onOnline?: () => void;
  /** A room this browser can rejoin ("Lanjutkan room CODE"). */
  resumeRoomCode?: string | null;
  onResumeRoom?: () => void;
  /** Which screen opens first; the front screen unless a test or demo asks for the options. */
  initialStep?: MenuStep;
  /** Open with the Premium modal showing (tests). */
  initialPremiumOpen?: boolean;
}

export type MenuStep = 'front' | 'solo';

interface ChoiceOption<T> { value: T; label: string; note: string }

/** A pregame choice as large tap buttons: one radio group, each option with a one-line explanation. */
export function MenuChoice<T>({ label, value, options, onChange }: { label: string; value: T; options: readonly ChoiceOption<T>[]; onChange: (value: T) => void }) {
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

export const DIFFICULTY_NOTE: Record<AIDifficulty, string> = {
  easy: 'Bot bermain santai tanpa membaca buangan berbahaya; cocok untuk pemula.',
  normal: 'Bot bermain seimbang, menyusun kombinasi standar dengan variasi wajar.',
  hard: 'Bot bermain efisien, membaca buangan berbahaya, dan mengejar nilai tinggi.',
};

export const DIFFICULTY_OPTIONS: readonly ChoiceOption<AIDifficulty>[] = (['easy', 'normal', 'hard'] as const).map((value) => ({
  value,
  label: DIFFICULTY_LABEL[value],
  note: DIFFICULTY_NOTE[value],
}));

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

function SoloChoices(props: MainMenuProps & { onBack: () => void }) {
  const { difficulty, onDifficultyChange, difficultyLabel, onPractice, kimEnabled, onKimChange, kimMode, onKimModeChange, deadWall, onDeadWallChange, timeLimitMinutes, onTimeLimitChange, onBack } = props;
  const activeDifficulty: AIDifficulty =
    difficulty ??
    (difficultyLabel ? ((Object.keys(DIFFICULTY_LABEL) as AIDifficulty[]).find((k) => DIFFICULTY_LABEL[k] === difficultyLabel)) : undefined) ??
    'normal';
  const activeDifficultyLabel = difficulty ? DIFFICULTY_LABEL[difficulty] : (difficultyLabel ?? DIFFICULTY_LABEL[activeDifficulty]);

  return (
    <section className="menu-card" aria-label="Main sendiri">
      <button type="button" className="menu-back" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" /> Kembali</button>
      <div className="menu-logo"><img src={logo} alt="maciokYU!" width={1277} height={407} /></div>
      <h2>Main sendiri</h2>
      <p className="muted">Anda dan tiga lawan. Satu meja.</p>
      {(onKimModeChange || onKimChange) && <MenuChoice label="Pilihan Kim" value={kimMode ?? (kimEnabled ? 'natural' : 'off')} options={KIM_OPTIONS}
        onChange={(mode) => { if (onKimModeChange) onKimModeChange(mode, mode === 'off' ? 3 : 5); else onKimChange?.(mode !== 'off'); }} />}
      {onDifficultyChange && <MenuChoice label="Tingkat kesulitan bot" value={activeDifficulty} options={DIFFICULTY_OPTIONS} onChange={onDifficultyChange} />}
      {onDeadWallChange && <MenuChoice label="Akhir tembok" value={deadWall ?? 'none'} options={DEAD_WALL_OPTIONS} onChange={onDeadWallChange} />}
      {timeLimitMinutes !== undefined && onTimeLimitChange && <MenuChoice label="Waktu" value={timeLimitMinutes} options={TIME_OPTIONS} onChange={onTimeLimitChange} />}
      <div className="menu-choices">
        <button type="button" className="btn btn-primary menu-choice" onClick={onPractice}>
          <strong>Mulai bermain <ArrowRight size={20} aria-hidden="true" /></strong>
          <span>Tiga bot · {activeDifficultyLabel} · 16 game</span>
        </button>
      </div>
    </section>
  );
}

/** Only admins see it. A component of its own, so the account hook runs inside React and not when tests call the menu directly. */
function AdminLink() {
  return useAccount()?.admin ? <a className="menu-admin" href="?admin=1">Admin</a> : null;
}

function FrontChoices({ lastResult, onSolo, onOnline, resumeRoomCode, onResumeRoom, onPremium }: Pick<MainMenuProps, 'lastResult' | 'onOnline' | 'resumeRoomCode' | 'onResumeRoom'> & { onSolo: () => void; onPremium: () => void }) {
  return (
    <section className="menu-card" aria-label="Menu utama">
      <div className="menu-logo"><img src={logo} alt="maciokYU!" width={1277} height={407} /></div>
      <p className="menu-eyebrow">Mahjong Indonesia · main bareng teman</p>
      {lastResult !== null && <p className="menu-last">Terakhir: {lastResult}</p>}
      <div className="menu-choices menu-front">
        <button type="button" className="btn btn-primary menu-choice" onClick={onSolo}>
          <strong>Main sendiri <ArrowRight size={20} aria-hidden="true" /></strong>
          <span>Lawan tiga bot</span>
        </button>
        {resumeRoomCode && onResumeRoom && <button type="button" className="btn btn-gold menu-choice menu-online" onClick={onResumeRoom}>
          <strong>Lanjutkan room {resumeRoomCode}</strong>
          <span>Kursi Anda masih disimpan</span>
        </button>}
        {onOnline && <button type="button" className="btn btn-gold menu-choice menu-online" onClick={onOnline}>
          <strong><Users size={20} aria-hidden="true" /> Main bareng teman</strong>
          <span>Room pribadi · undang lewat tautan</span>
        </button>}
        <button type="button" className="menu-premium" onClick={onPremium}>
          <Sparkles size={16} aria-hidden="true" /> Premium · segera hadir
        </button>
        <AdminLink />
      </div>
    </section>
  );
}

export function MainMenu(props: MainMenuProps) {
  const { announcement } = useConfig();
  const [step, setStep] = useState<MenuStep>(props.initialStep ?? 'front');
  const [premiumOpen, setPremiumOpen] = useState(props.initialPremiumOpen ?? false);
  return (
    <main className="main-menu">
      {announcement && <p className="mp-pill" role="status">{announcement}</p>}
      {step === 'solo'
        ? <SoloChoices {...props} onBack={() => setStep('front')} />
        : <FrontChoices lastResult={props.lastResult} onOnline={props.onOnline} resumeRoomCode={props.resumeRoomCode} onResumeRoom={props.onResumeRoom}
          onSolo={() => setStep('solo')} onPremium={() => setPremiumOpen(true)} />}
      {premiumOpen && <PremiumModal onClose={() => setPremiumOpen(false)} />}
    </main>
  );
}

export { FrontChoices as MenuFront, SoloChoices as MenuSolo };
