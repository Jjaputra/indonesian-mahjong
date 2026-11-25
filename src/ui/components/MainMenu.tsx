import { useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import logo from '../../assets/brand/maciokyu-logo.png';
import { useConfig } from '../../net/config';
import { useAccount } from '../../net/auth';
import { PremiumModal } from './PremiumModal';
import { MatchEnergy } from './MatchEnergy';
import type { OnlineStep } from './OnlineMenu';

export interface MainMenuProps {
  onOnline?: (step: OnlineStep) => void;
  resumeRoomCode?: string | null;
  onResumeRoom?: () => void;
  initialPremiumOpen?: boolean;
}

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

/** Only admins see it. A component of its own, so the account hook runs inside React and not when tests call the menu directly. */
function AdminLink() {
  return useAccount()?.admin ? <a className="menu-admin" href="?admin=1">Admin</a> : null;
}

export function MenuFront({ onOnline, resumeRoomCode, onResumeRoom, onPremium }: MainMenuProps & { onPremium: () => void }) {
  return (
    <section className="menu-card" aria-label="Menu utama">
      <div className="menu-logo"><img src={logo} alt="maciokYU!" width={1277} height={407} /></div>
      <p className="menu-eyebrow">Mahjong Indonesia di browser</p>
      {onOnline && <MatchEnergy />}
      <div className="menu-choices menu-front">
        {onOnline && <button type="button" className="btn btn-primary menu-choice" onClick={() => onOnline('public')}><strong>Meja publik</strong><span>Cari meja yang masih ada kursi</span></button>}
        {resumeRoomCode && onResumeRoom && <button type="button" className="btn btn-gold menu-choice menu-online" onClick={onResumeRoom}>
          <strong>Lanjut room {resumeRoomCode}</strong>
          <span>Kursi masih disimpan</span>
        </button>}
        {onOnline ? <>
          <button type="button" className="btn btn-primary menu-choice" onClick={() => onOnline('create')}>
            <strong>Buat room <ArrowRight size={20} aria-hidden="true" /></strong><span>Atur aturan, undang lewat link</span>
          </button>
          <button type="button" className="btn btn-gold menu-choice menu-online" onClick={() => onOnline('join')}>
            <strong>Gabung room</strong><span>Isi kode dari teman</span>
          </button>
        </> : <p className="muted">Room belum tersedia. Coba lagi nanti.</p>}
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
  const [premiumOpen, setPremiumOpen] = useState(props.initialPremiumOpen ?? false);
  return <main className="main-menu">
    {announcement && <p className="mp-pill" role="status">{announcement}</p>}
    <MenuFront {...props} onPremium={() => setPremiumOpen(true)} />
    {premiumOpen && <PremiumModal onClose={() => setPremiumOpen(false)} />}
  </main>;
}
