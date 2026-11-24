import { useEffect, useState, type ReactNode } from 'react';
import type { PublicRoom, RoomConfig } from '../../net/protocol';
import { listPublicRooms } from '../../net/remote-table';
import { MenuChoice } from './MainMenu';

export function PublicChoice({ config, onChange }: { config: RoomConfig; onChange: (patch: Partial<RoomConfig>) => void }) {
  return <MenuChoice label="SIAPA YANG BISA GABUNG" value={config.public === true} onChange={value => onChange({ public: value })} options={[
    { value: false, label: 'Lewat kode/link', note: 'Bagikan kode atau link ke teman.' },
    { value: true, label: 'Meja publik', note: 'Meja publik muncul di daftar, siapa aja yang login bisa duduk.' },
  ]} />;
}

export function PublicTables({ server, onJoin, onCreate, onBack, account, initialRooms }: { server: string; onJoin: (code: string) => void; onCreate: () => void; onBack: () => void; account?: ReactNode; initialRooms?: PublicRoom[] }) {
  const [rooms, setRooms] = useState<PublicRoom[]>(initialRooms ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(initialRooms === undefined);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    if (initialRooms) return;
    let active = true;
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return;
      setBusy(true);
      try { const rows = await listPublicRooms(server); if (active) { setRooms(rows); setError(null); } }
      catch (err) { if (active) setError(err instanceof Error ? err.message : 'Gagal memuat daftar.'); }
      finally { if (active) setBusy(false); }
    };
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 10000);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [server, initialRooms, refreshKey]);
  return <main className="main-menu"><section className="menu-card mp-card" aria-label="Meja publik">
    <div className="mp-bar"><button className="mp-link" onClick={onBack}>Kembali</button><button className="btn" disabled={busy} onClick={() => setRefreshKey(n => n + 1)}>Muat ulang</button></div>
    <h2>Meja publik</h2>{account}
    {error && <p role="alert" className="mp-error">{error}</p>}
    {busy && <p role="status">Memuat meja…</p>}
    {!rooms.length && !busy && !error && <div><p>Belum ada meja publik.</p><button className="btn btn-primary" onClick={onCreate}>Buat meja publik</button></div>}
    <ul className="mp-public-list">{rooms.map(room => <li key={room.code}>
      <div><strong>{room.hostName}</strong><span className="mp-pill">{room.humans}/4</span>
      <p>{({ natural: 'Kim dari tile', dedicated: 'Kim tambahan', off: 'Tanpa Kim' })[room.config.kimMode]} · Min Tay {room.config.minHuTay} · {room.config.turnSeconds === null ? 'Tanpa batas' : `${room.config.turnSeconds} dtk`} · Bot {room.config.fillWithBots ? 'aktif' : 'mati'}</p></div>
      <button className="btn btn-gold" onClick={() => onJoin(room.code)}>Gabung</button>
    </li>)}</ul>
  </section></main>;
}
