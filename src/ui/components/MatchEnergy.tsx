import { useEffect, useState } from 'react';
import { Plus, Zap } from 'lucide-react';
import { refreshAccount, useAccount } from '../../net/auth';
import { useConfig } from '../../net/config';
import { AllowanceReset } from './AllowanceReset';
import { Modal } from './Modal';
import { ReferralShare } from './ReferralShare';
import '../online.css';
import '../qol.css';

/** More pips than this read as noise; the count still shows. */
const MAX_PIPS = 6;

/** Front-menu "energy bar": today's host matches, banked bonus, reset countdown and a + that explains how to earn more. */
export function MatchEnergy() {
  const account = useAccount();
  const { dailyMatchLimit } = useConfig();
  const [open, setOpen] = useState(false);
  // Same 60s poll as the account panel, so invites and admin limit changes show while the player sits on the menu.
  useEffect(() => {
    if (!account) return;
    const timer = setInterval(() => { void refreshAccount().catch(() => {}); }, 60000);
    return () => clearInterval(timer);
  }, [account?.id]);
  if (!account) return null;
  const bonus = account.bonusMatches ?? 0;
  // The account's own limit came with remainingMatches, so the two always agree.
  const total = (account.dailyMatchLimit ?? dailyMatchLimit) + (account.sharedToday ? 1 : 0);
  const today = Math.min(total, Math.max(0, (account.remainingMatches ?? 0) - bonus));
  return <div className="match-energy" role="group" aria-label="Jatah host">
    <div className="match-energy-row">
      <span className="match-energy-label"><Zap size={15} aria-hidden="true" /><span className="match-energy-label-text">Jatah host</span></span>
      {account.premium ? <span className="match-energy-count">Tanpa batas</span> : <>
        {total <= MAX_PIPS && <span className="match-energy-pips" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => <span key={i} className={i < today ? 'is-full' : undefined} />)}
        </span>}
        <span className="match-energy-count">{today}/{total}</span>
        {bonus > 0 && <span className="match-energy-bank">+{bonus} tabungan</span>}
      </>}
      <button type="button" className="match-energy-plus" onClick={() => setOpen(true)} title="Cara nambah jatah" aria-label="Cara nambah jatah"><Plus size={18} aria-hidden="true" /></button>
    </div>
    {!account.premium && <AllowanceReset remaining={account.remainingMatches ?? Infinity} />}
    {open && <MatchHelpModal onClose={() => setOpen(false)} />}
  </div>;
}

export function MatchHelpModal({ onClose }: { onClose: () => void }) {
  const account = useAccount();
  const { dailyMatchLimit } = useConfig();
  const [error, setError] = useState<string | null>(null);
  return <Modal title="Tambah jatah main" onClose={onClose} footer={<button type="button" className="btn btn-primary" onClick={onClose}>Oke</button>}>
    <div className="match-help">
      {account?.premium
        ? <p>Kamu Premium: host room tanpa batas. Bagikan link kamu biar temen ikut main.</p>
        : <p>Jatah kepake tiap kamu jadi host dan mulai match. Gabung room temen gratis. Jatah harian {dailyMatchLimit} match, isi ulang tiap 00.00 WIB.</p>}
      {!account?.premium && <ul className="match-help-ways">
        <li><strong>Bagikan ke WA: +1 match hari ini</strong><span>Sekali sehari, langsung dapet. Nggak perlu nunggu temen buka link.{account?.sharedToday ? ' Udah kamu ambil hari ini ✓' : ''}</span></li>
        <li><strong>Ajak temen baru: +3 match tabungan</strong><span>Tiap temen yang pertama kali login lewat link kamu. Tabungan nggak hangus. Maks. 10 temen.</span></li>
        <li><strong>Premium: tanpa batas</strong><span>Segera hadir.</span></li>
      </ul>}
      {account ? <ReferralShare onError={setError} /> : <p>Masuk dulu buat dapet link kamu.</p>}
      {error && <p className="settings-error" role="alert">{error}</p>}
    </div>
  </Modal>;
}
