import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { openAuth, signOut } from '../../src/net/auth';
import { adminAudit, adminStats, adminUsers, adminUsersCsvUrl, saveAdminSettings, setUserPremium, type AdminStats, type AdminUser, type AuditEntry } from '../../src/net/admin-api';
import { AdminPage } from '../../src/ui/components/AdminPage';
import { MenuFront } from '../../src/ui/components/MainMenu';
import { StatsView } from '../../src/ui/components/admin/StatsTab';
import { copyNewsEmails, Pager, rangeText, UsersTable } from '../../src/ui/components/admin/UsersTab';
import { AnnouncementPreview, AuditLoadError, SettingsForm, settingsDirty, settingsValid } from '../../src/ui/components/admin/SettingsTab';
import { AuditView, describeEntry } from '../../src/ui/components/admin/AuditTab';
import { Async, ErrorBox } from '../../src/ui/components/admin/shared';
import { relativeTime } from '../../src/ui/components/admin/format';

const SERVER = 'https://mp.example';
const NOW = Date.UTC(2026, 10, 22, 8, 0, 0);
afterEach(() => vi.unstubAllGlobals());

const stats: AdminStats = {
  users: { total: 312, newToday: 4, new7d: 31, active7d: 120, premium: 9, newsOptIn: 57 },
  matches: { today: 12, last7d: 80 },
  daily: Array.from({ length: 30 }, (_, i) => ({ day: `2026-11-${String(i % 28 + 1).padStart(2, '0')}`, newUsers: i % 5, activeUsers: i, matches: i % 7 })),
};
const user = (over: Partial<AdminUser> = {}): AdminUser => ({ id: 'u1', name: 'Disa', email: 'disa@example.com', picture: null, premium: false, newsOptIn: true, createdAt: NOW - 5 * 86400000, lastSeenAt: NOW - 2 * 3600000, matchesHosted: 7, matchesToday: 2, currentRoom: 'AB12', ...over });
const settings = { dailyMatchLimit: 3, discardRevealMs: 1000, loginRequired: true, facebookEnabled: false, announcement: 'Libur panjang' };

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => Response.json(handler(url, init)));
  vi.stubGlobal('fetch', fn);
  return fn;
}
async function loginAs(admin: boolean) {
  mockFetch(url => url.endsWith('/config') || url.endsWith('/auth/config') ? { loginRequired: true } : { id: 'u', name: 'Jason', picture: null, premium: false, remainingMatches: 3, admin });
  await openAuth(SERVER);
}

describe('admin api wrappers', () => {
  it('sends credentials and the typed query for stats, users and audit', async () => {
    const fn = mockFetch(url => url.includes('/admin/audit') ? { entries: [] } : url.includes('/admin/users') ? { total: 0, page: 2, size: 50, users: [] } : stats);
    await adminStats(SERVER);
    await adminUsers(SERVER, { q: ' di sa ', filter: 'premium', sort: 'matches', page: 2, size: 50 });
    expect(await adminAudit(SERVER, 20)).toEqual([]);
    const calls = fn.mock.calls.map(([url, init]) => [url, init?.credentials]);
    expect(calls).toEqual([
      [`${SERVER}/admin/stats`, 'include'],
      [`${SERVER}/admin/users?q=di+sa&filter=premium&sort=matches&page=2&size=50`, 'include'],
      [`${SERVER}/admin/audit?limit=20`, 'include'],
    ]);
  });

  it('the CSV URL keeps the current filters and leaves out an empty search', () => {
    expect(adminUsersCsvUrl(SERVER, { q: 'a&b', filter: 'optin', sort: 'name' })).toBe(`${SERVER}/admin/users.csv?q=a%26b&filter=optin&sort=name`);
    expect(adminUsersCsvUrl(SERVER, { q: '  ', filter: 'all', sort: 'newest' })).toBe(`${SERVER}/admin/users.csv?filter=all&sort=newest`);
  });

  it('PUTs settings and premium, and rejects on a failed response', async () => {
    const fn = mockFetch(() => settings);
    await saveAdminSettings(SERVER, settings);
    await setUserPremium(SERVER, 'a/b', true);
    expect(fn.mock.calls.map(([url, init]) => [url, init?.method, init?.body])).toEqual([
      [`${SERVER}/admin/settings`, 'PUT', JSON.stringify(settings)],
      [`${SERVER}/admin/users/a%2Fb/premium`, 'PUT', JSON.stringify({ premium: true })],
    ]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })));
    await expect(adminStats(SERVER)).rejects.toThrow();
  });
});

describe('admin entry', () => {
  it('shows the Admin button on the front menu only for admins and links to ?admin=1', async () => {
    await loginAs(false);
    expect(renderToStaticMarkup(createElement(MenuFront, { lastResult: null, onSolo: () => {}, onPremium: () => {} }))).not.toContain('Admin');
    await loginAs(true);
    const html = renderToStaticMarkup(createElement(MenuFront, { lastResult: null, onSolo: () => {}, onPremium: () => {} }));
    expect(html).toContain('href="?admin=1"');
    expect(html).toContain('>Admin<');
    await signOut();
  });

  it('renders the four tabs with a skeleton while the first answers load', async () => {
    await loginAs(true);
    const html = renderToStaticMarkup(createElement(AdminPage, { server: SERVER }));
    for (const label of ['Ringkasan', 'Pemain', 'Pengaturan', 'Riwayat perubahan', 'Ke menu']) expect(html).toContain(label);
    expect(html).toContain('aria-busy="true"');
    await signOut();
  });
});

describe('tabs render their data', () => {
  it('Ringkasan: stat cards and the 30-day chart', () => {
    const html = renderToStaticMarkup(createElement(StatsView, { stats }));
    for (const label of ['Total pemain', 'Baru hari ini', 'Baru 7 hari', 'Aktif 7 hari', 'Premium', 'Setuju dikabari', 'Match hari ini', 'Match 7 hari']) expect(html).toContain(label);
    expect(html).toContain('>312<');
    expect(html.match(/<rect /g)).toHaveLength(60);
  });

  it('Ringkasan: a quiet month says so instead of drawing an empty chart', () => {
    const quiet = { ...stats, daily: stats.daily.map(d => ({ ...d, newUsers: 0, matches: 0 })) };
    const html = renderToStaticMarkup(createElement(StatsView, { stats: quiet }));
    expect(html).toContain('Belum ada aktivitas');
    expect(html).not.toContain('<svg');
  });

  it('Pemain: table cells, opt-in badge, room, and a Premium toggle', () => {
    const html = renderToStaticMarkup(createElement(UsersTable, { users: [user(), user({ id: 'u2', name: 'Ce Mo', email: null, premium: true, newsOptIn: false, currentRoom: null, lastSeenAt: null })], now: NOW, onPremium: () => {} }));
    expect(html).toContain('Disa');
    expect(html).toContain('2 jam lalu');
    expect(html).toContain('7 / 2');
    expect(html).toContain('AB12');
    expect(html).toContain('Dikabari');
    expect(html.match(/type="checkbox"/g)).toHaveLength(2);
    expect(html.match(/checked=""/g)).toHaveLength(1);
  });

  it('Pemain: paging shows the range and disables the ends', () => {
    expect(rangeText({ total: 312, page: 1, size: 50 })).toBe('1–50 dari 312');
    expect(rangeText({ total: 312, page: 7, size: 50 })).toBe('301–312 dari 312');
    expect(rangeText({ total: 0, page: 1, size: 50 })).toBe('0 pemain');
    const first = renderToStaticMarkup(createElement(Pager, { total: 312, page: 1, size: 50, onPage: () => {} }));
    expect(first).toMatch(/disabled=""[^>]*>Sebelumnya/);
    expect(first).not.toMatch(/disabled=""[^>]*>Berikutnya/);
    const last = renderToStaticMarkup(createElement(Pager, { total: 312, page: 7, size: 50, onPage: () => {} }));
    expect(last).toMatch(/disabled=""[^>]*>Berikutnya/);
  });

  it('Pengaturan: groups, explanations and a disabled Simpan until something changes', () => {
    const audit: AuditEntry[] = [{ at: NOW - 3600000, by: { id: 'a', name: 'Jason' }, kind: 'setting', key: 'dailyMatchLimit', value: 3 }];
    const html = renderToStaticMarkup(createElement(SettingsForm, { saved: settings, audit, now: NOW, onSave: async () => {} }));
    for (const legend of ['Match online', 'Masuk', 'Pengumuman']) expect(html).toContain(`<legend>${legend}</legend>`);
    expect(html).toContain('Terakhir diubah 1 jam lalu oleh Jason');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Simpan<\/button>|<button disabled=""[^>]*>Simpan<\/button>/);
    expect(settingsDirty(settings, { ...settings, dailyMatchLimit: 4 })).toBe(true);
    expect(settingsDirty(settings, { ...settings })).toBe(false);
    expect(settingsValid({ ...settings, dailyMatchLimit: 51 })).toBe(false);
    expect(settingsValid({ ...settings, discardRevealMs: Number.NaN })).toBe(false);
  });

  it('Pengaturan: injected announcement text renders as text, not HTML', () => {
    const evil = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    const html = renderToStaticMarkup(createElement(AnnouncementPreview, { text: evil }));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    const form = renderToStaticMarkup(createElement(SettingsForm, { saved: { ...settings, announcement: evil }, audit: null, onSave: async () => {} }));
    expect(form).not.toContain('<img');
    expect(form).not.toContain('<script');
  });

  it('Pengaturan: a failed audit load shows an error line with Coba lagi', () => {
    const html = renderToStaticMarkup(createElement(AuditLoadError, { onRetry: () => {} }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Riwayat perubahan nggak kebuka');
    expect(html).toMatch(/<button[^>]*>Coba lagi<\/button>/);
  });

  it('Salin email: the toast counts the emails actually copied, not the stat', async () => {
    const fn = mockFetch(() => ['a@x.com', 'b@x.com', 'c@x.com']);
    let copied = '';
    const message = await copyNewsEmails(SERVER, async text => { copied = text; });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(copied).toBe('a@x.com, b@x.com, c@x.com');
    expect(message).toBe('3 email udah disalin.');
  });

  it('Riwayat perubahan: newest first as given, written as plain text', () => {
    const entries: AuditEntry[] = [
      { at: NOW - 60000, by: { id: 'a', name: '<b>Jason</b>' }, kind: 'premium', userId: 'u1', userName: 'Disa', premium: true },
      { at: NOW - 86400000, by: { id: 'a', name: 'Jason' }, kind: 'setting', key: 'announcement', value: '<i>hai</i>' },
      { at: NOW - 2 * 86400000, by: { id: 'a', name: 'Jason' }, kind: 'setting', key: 'loginRequired', value: false },
    ];
    const html = renderToStaticMarkup(createElement(AuditView, { entries, now: NOW }));
    expect(html.indexOf('Memberi Premium untuk Disa')).toBeLessThan(html.indexOf('Pengumuman'));
    expect(html).toContain('Wajib masuk');
    expect(html).toContain('nonaktif');
    expect(html).not.toContain('<b>Jason');
    expect(html).not.toContain('<i>hai');
    expect(describeEntry(entries[0]!)).toBe('Memberi Premium untuk Disa');
  });
});

describe('states', () => {
  it('empty audit says so', () => {
    expect(renderToStaticMarkup(createElement(AuditView, { entries: [] }))).toContain('Belum ada yang diubah.');
  });

  it('error shows Coba lagi, loading shows a skeleton, cached data wins over a failed reload', () => {
    const reload = () => {};
    expect(renderToStaticMarkup(createElement(ErrorBox, { onRetry: reload }))).toContain('Coba lagi');
    const render = (load: { status: 'loading' | 'error' | 'ok'; data: string | null; reload: () => void }) => renderToStaticMarkup(createElement(Async<string>, { load, children: data => data }));
    expect(render({ status: 'error', data: null, reload })).toContain('Coba lagi');
    expect(render({ status: 'loading', data: null, reload })).toContain('aria-busy="true"');
    expect(render({ status: 'error', data: 'masih ada', reload })).toBe('masih ada');
  });

  it('relative time reads like the group talks', () => {
    expect(relativeTime(NOW - 10000, NOW)).toBe('baru saja');
    expect(relativeTime(NOW - 5 * 60000, NOW)).toBe('5 menit lalu');
    expect(relativeTime(NOW - 2 * 3600000, NOW)).toBe('2 jam lalu');
    expect(relativeTime(NOW - 3 * 86400000, NOW)).toBe('3 hari lalu');
    expect(relativeTime(null, NOW)).toBe('—');
  });
});
