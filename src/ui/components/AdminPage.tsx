import { useEffect, useState } from 'react';
import { openAuth, useAccount } from '../../net/auth';
import { adminAudit, adminStats } from '../../net/admin-api';
import { AccountPanel } from './OnlineScreen';
import { useLoad } from './admin/shared';
import { StatsTab } from './admin/StatsTab';
import { UsersTab } from './admin/UsersTab';
import { SettingsTab } from './admin/SettingsTab';
import { AuditTab } from './admin/AuditTab';
import '../online.css';
import '../admin.css';

export const ADMIN_TABS = [{ id: 'stats', label: 'Ringkasan' }, { id: 'users', label: 'Pemain' }, { id: 'settings', label: 'Pengaturan' }, { id: 'audit', label: 'Riwayat perubahan' }] as const;
export type AdminTab = typeof ADMIN_TABS[number]['id'];

export function AdminPage({ server, initialTab = 'stats' }: { server: string; initialTab?: AdminTab }) {
  const account = useAccount();
  const [tab, setTab] = useState<AdminTab>(initialTab);
  // This page skips the online screen, so it loads the login session itself.
  const [ready, setReady] = useState(false), [authError, setAuthError] = useState<string | null>(null);
  useEffect(() => { void openAuth(server).catch(() => setAuthError('Akun nggak kebuka. Coba lagi.')).finally(() => setReady(true)); }, [server]);
  const isAdmin = !!account?.admin;
  // Stats feed Ringkasan and the opt-in count; the audit feeds Pengaturan and Riwayat. Neither is fetched for a non-admin.
  const stats = useLoad(() => isAdmin ? adminStats(server) : new Promise<never>(() => {}), [server, isAdmin]);
  const audit = useLoad(() => isAdmin ? adminAudit(server) : new Promise<never>(() => {}), [server, isAdmin]);
  if (!isAdmin) return <main className="main-menu"><section className="menu-card admin-settings"><h1>Pengaturan admin</h1>
    <p>{!ready ? 'Memuat akun…' : account ? 'Akun ini bukan admin.' : 'Masuk pakai Google dulu buat buka halaman admin.'}</p>
    {ready && <AccountPanel onError={setAuthError} onClear={() => setAuthError(null)} error={authError} />}
    <a className="btn" href="./">Kembali ke menu</a>
  </section></main>;
  return <div className="admin">
    <header className="admin-header">
      <h1>maciokYU! <span>Admin</span></h1>
      <a className="btn" href="./">Kembali ke menu</a>
    </header>
    <div className="admin-tabs" role="tablist" aria-label="Bagian admin">
      {ADMIN_TABS.map(t => <button key={t.id} type="button" role="tab" id={`admin-tab-${t.id}`} aria-selected={tab === t.id} aria-controls="admin-panel" className={tab === t.id ? 'is-on' : undefined} onClick={() => setTab(t.id)}>{t.label}</button>)}
    </div>
    <main className="admin-body" id="admin-panel" role="tabpanel" aria-labelledby={`admin-tab-${tab}`}>
      {tab === 'stats' && <StatsTab load={stats} />}
      {tab === 'users' && <UsersTab server={server} optInCount={stats.data?.users.newsOptIn ?? null} />}
      {tab === 'settings' && <SettingsTab server={server} audit={audit} onSaved={audit.reload} />}
      {tab === 'audit' && <AuditTab load={audit} />}
    </main>
  </div>;
}
