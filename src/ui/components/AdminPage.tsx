import { useEffect, useState } from 'react';
import { authHeaders, useAccount } from '../../net/auth';
import { fetchConfig, type PublicConfig } from '../../net/config';

interface AdminUser { id: string; name: string; email: string | null; premium: number }
export function AdminPage({ server }: { server: string }) {
  const account = useAccount();
  const [settings, setSettings] = useState<PublicConfig | null>(null);
  const [q, setQ] = useState(''), [users, setUsers] = useState<AdminUser[]>([]), [message, setMessage] = useState('');
  async function api(path: string, body?: unknown) {
    const response = await fetch(`${server}/admin/${path}`, { method: body === undefined ? 'GET' : 'PUT', credentials: 'include', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) throw new Error('Gagal memuat atau menyimpan data.');
    return response.json();
  }
  const fail = (e: Error) => setMessage(e.message);
  useEffect(() => { if (account?.admin) void api('settings').then(setSettings).catch(fail); }, [account?.admin, server]);
  if (!account?.admin) return null;
  return <main className="main-menu"><section className="menu-card admin-settings"><h1>Pengaturan admin</h1>
    {settings && <form onSubmit={e => { e.preventDefault(); void api('settings', settings).then(async value => { setSettings(value); await fetchConfig(server); setMessage('Pengaturan disimpan.'); }).catch(fail); }}>
      <label>Jatah match harian (0–50)<input type="number" min={0} max={50} value={settings.dailyMatchLimit} onChange={e => setSettings({ ...settings, dailyMatchLimit: e.target.valueAsNumber })} /></label><p>Jumlah match yang dapat dimulai host tanpa Premium setiap hari.</p>
      <label>Waktu tampil discard (0–3000 ms)<input type="number" min={0} max={3000} value={settings.discardRevealMs} onChange={e => setSettings({ ...settings, discardRevealMs: e.target.valueAsNumber })} /></label><p>Jeda untuk melihat tile sebelum pilihan klaim muncul.</p>
      <label><input type="checkbox" checked={settings.loginRequired} onChange={e => setSettings({ ...settings, loginRequired: e.target.checked })} /> Wajib masuk</label><p>Pemain online perlu masuk dengan akun.</p>
      <label><input type="checkbox" checked={settings.facebookEnabled} onChange={e => setSettings({ ...settings, facebookEnabled: e.target.checked })} /> Login Facebook</label><p>Tampilkan pilihan masuk dengan Facebook.</p>
      <label>Pengumuman<input maxLength={200} value={settings.announcement} onChange={e => setSettings({ ...settings, announcement: e.target.value })} /></label><p>Banner singkat pada menu depan, maksimal 200 karakter.</p>
      <button className="btn btn-primary">Simpan</button>
    </form>}
    <form onSubmit={e => { e.preventDefault(); void api(`users?q=${encodeURIComponent(q)}`).then(setUsers).catch(fail); }}><label>Cari nama atau email<input value={q} onChange={e => setQ(e.target.value)} /></label><button className="btn">Cari</button></form>
    {users.map(user => <label key={user.id}>{user.name} · {user.email}<input type="checkbox" checked={!!user.premium} onChange={e => { const premium = e.target.checked; void api(`users/${encodeURIComponent(user.id)}/premium`, { premium }).then(() => setUsers(list => list.map(u => u.id === user.id ? { ...u, premium: premium ? 1 : 0 } : u))).catch(fail); }} /> Premium</label>)}
    <button className="btn" onClick={() => { void api('news-emails').then(async (emails: string[]) => { await navigator.clipboard.writeText(emails.join(', ')); setMessage(`${emails.length} email disalin.`); }).catch(fail); }}>Salin email yang setuju dikabari</button>
    <p role="status">{message}</p>
  </section></main>;
}
