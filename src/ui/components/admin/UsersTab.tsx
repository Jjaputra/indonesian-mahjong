import { authHeaders } from '../../../net/auth';
import { useEffect, useState } from 'react';
import { adminNewsEmails, adminUsers, downloadUsersCsv, setUserPremium, USER_PAGE_SIZE, type AdminUser, type UserFilter, type UsersPage, type UsersQuery, type UserSort } from '../../../net/admin-api';
import { Empty, ErrorBox, Skeleton, Toast, useLoad, useToast } from './shared';
import { formatDate, formatNumber, relativeTime } from './format';

export const FILTERS: readonly { value: UserFilter; label: string }[] = [{ value: 'all', label: 'Semua' }, { value: 'premium', label: 'Premium' }, { value: 'optin', label: 'Setuju dikabari' }];
export const SORTS: readonly { value: UserSort; label: string }[] = [
  { value: 'newest', label: 'Daftar terbaru' }, { value: 'oldest', label: 'Daftar terlama' }, { value: 'active', label: 'Terakhir aktif' }, { value: 'name', label: 'Nama A–Z' }, { value: 'matches', label: 'Host terbanyak' },
];

export function rangeText({ total, page, size }: Pick<UsersPage, 'total' | 'page' | 'size'>): string {
  if (total === 0) return '0 pemain';
  return `${formatNumber((page - 1) * size + 1)}–${formatNumber(Math.min(total, page * size))} dari ${formatNumber(total)}`;
}

/** Copies the opted-in emails and reports how many were really copied (the list can differ from the stat count). */
export async function copyNewsEmails(server: string, write: (text: string) => Promise<void> = text => navigator.clipboard.writeText(text)): Promise<string> {
  const emails = await adminNewsEmails(server);
  await write(emails.join(', '));
  return `${formatNumber(emails.length)} email udah disalin.`;
}

const shortName =(name: string) => Array.from(name).length > 20 ? `${Array.from(name).slice(0, 19).join('')}…` : name;

export function UserAvatar({ user }: { user: Pick<AdminUser, 'name' | 'picture'> }) {
  return <span className="admin-avatar" aria-hidden="true">
    {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" loading="lazy" /> : (Array.from(user.name)[0] ?? '?').toUpperCase()}
  </span>;
}

export function UsersTable({ users, now = Date.now(), onPremium, onRename }: { onRename?: (user: AdminUser) => void; users: AdminUser[]; now?: number; onPremium: (user: AdminUser, premium: boolean) => void }) {
  return <table className="admin-table">
    <thead><tr><th>Pemain</th><th>Email</th><th>Daftar</th><th>Terakhir aktif</th><th className="num">Host total / hari ini</th><th>Room</th><th>Premium</th></tr></thead>
    <tbody>{users.map(user => <tr key={user.id}>
      <td data-label="Pemain" className="admin-user"><div className="admin-user-box"><UserAvatar user={user} /><span className="admin-user-name">{user.username ?? 'Belum pilih nama'} <small>({user.name})</small></span>{onRename && <button type="button" className="mp-link" onClick={() => onRename(user)}>Ganti username</button>}{!!user.newsOptIn && <span className="admin-badge" title="Setuju dikabari lewat email">Dikabari</span>}</div></td>
      <td data-label="Email" className="admin-email">{user.email ?? '—'}</td>
      <td data-label="Daftar">{formatDate(user.createdAt)}</td>
      <td data-label="Terakhir aktif">{relativeTime(user.lastSeenAt, now)}</td>
      <td data-label="Host total / hari ini" className="num">{user.matchesHosted} / {user.matchesToday}</td>
      <td data-label="Room">{user.currentRoom ? <code className="admin-room">{user.currentRoom}</code> : '—'}</td>
      <td data-label="Premium"><label className="admin-toggle"><input type="checkbox" checked={!!user.premium} onChange={e => onPremium(user, e.target.checked)} aria-label={`Premium untuk ${user.name}`} /><span>{user.premium ? 'Premium' : 'Gratis'}</span></label></td>
    </tr>)}</tbody>
  </table>;
}

export function Pager({ total, page, size, onPage }: Pick<UsersPage, 'total' | 'page' | 'size'> & { onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return <nav className="admin-pager" aria-label="Halaman pemain">
    <button type="button" className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>Sebelumnya</button>
    <span role="status">{rangeText({ total, page, size })}</span>
    <button type="button" className="btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>Berikutnya</button>
  </nav>;
}

export function UsersTab({ server, optInCount }: { server: string; optInCount: number | null }) {
  const [search, setSearch] = useState(''), [q, setQ] = useState('');
  const [filter, setFilter] = useState<UserFilter>('all'), [sort, setSort] = useState<UserSort>('newest'), [page, setPage] = useState(1);
  const [toast, say] = useToast();
  const [busy, setBusy] = useState(false);
  // Search waits for a pause in typing, then goes back to page 1.
  useEffect(() => { const id = setTimeout(() => { setQ(search); setPage(1); }, 350); return () => clearTimeout(id); }, [search]);
  const query: UsersQuery = { q, filter, sort, page, size: USER_PAGE_SIZE };
  const load = useLoad(() => adminUsers(server, query), [server, q, filter, sort, page]);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  useEffect(() => setOverrides({}), [load.data]);
  const shown = load.data?.users.map(u => u.id in overrides ? { ...u, premium: overrides[u.id]! } : u) ?? [];
  const run = async (task: () => Promise<string>) => { setBusy(true); try { say(await task()); } catch (e) { say((e as Error).message); } finally { setBusy(false); } };
  const togglePremium = (user: AdminUser, premium: boolean) => {
    setOverrides(o => ({ ...o, [user.id]: premium }));
    setUserPremium(server, user.id, premium).then(() => say(premium ? `${shortName(user.name)} sekarang Premium.` : `Premium ${shortName(user.name)} dicabut.`), () => {
      setOverrides(o => ({ ...o, [user.id]: !premium })); say('Premium nggak ke-update. Coba lagi.');
    });
  };
  const chip = (value: UserFilter, label: string) => <button key={value} type="button" className={`admin-chip${filter === value ? ' is-on' : ''}`} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1); }}>{label}</button>;
  return <section className="admin-panel"><h2>Pemain</h2>
    <div className="admin-toolbar">
      <label className="admin-search"><span>Cari nama atau email</span><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari…" /></label>
      <label className="admin-sort"><span>Urutkan</span><select value={sort} onChange={e => { setSort(e.target.value as UserSort); setPage(1); }}>{SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
    </div>
    <div className="admin-chips" role="group" aria-label="Saring pemain">{FILTERS.map(f => chip(f.value, f.label))}</div>
    {load.status === 'error' && <ErrorBox onRetry={load.reload} />}
    {!load.data && load.status === 'loading' && <Skeleton rows={6} />}
    {load.data && <div className={load.status === 'loading' ? 'is-stale' : undefined}>
      {load.data.users.length ? <UsersTable users={shown} onPremium={togglePremium} onRename={user => {
        const username = window.prompt('Ganti username (3–12 karakter)', user.username ?? '');
        if (username === null) return;
        void run(async () => {
          const response = await fetch(`${server}/admin/users/${encodeURIComponent(user.id)}/username`, { method: 'PUT', credentials: 'include', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
          const body = await response.json();
          if (!response.ok) throw new Error(body.message ?? 'Nama belum tersimpan.');
          load.reload(); return 'Username udah diganti. Pemain perlu menyambung ulang.';
        });
      }} /> : <Empty>{q || filter !== 'all' ? 'Nggak ada pemain yang cocok.' : 'Belum ada pemain.'}</Empty>}
      <Pager total={load.data.total} page={load.data.page} size={load.data.size} onPage={setPage} />
    </div>}
    <div className="admin-export">
      <div className="admin-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => { await downloadUsersCsv(server, query); return 'CSV udah diunduh.'; })}>Unduh CSV</button>
        <button type="button" className="btn" disabled={busy} onClick={() => void run(() => copyNewsEmails(server))}>
          Salin email yang setuju dikabari{optInCount !== null && ` (${formatNumber(optInCount)})`}
        </button>
      </div>
      <p className="muted small">Isinya email semua pemain. Jangan disebar. Buat promo, pakai daftar yang setuju dikabari.</p>
    </div>
    <Toast message={toast} />
  </section>;
}
