import { afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { type Database, type Statement, tokenHash } from '../../server/auth';
import { adminRoute } from '../../server/admin';

const now = Date.parse('2026-11-21T17:00:00Z'); // First instant of November 22 in WIB.
const opened: DatabaseSync[] = [];
afterEach(() => { vi.restoreAllMocks(); opened.splice(0).forEach(sql => sql.close()); });
async function fixture() {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  const sql = new DatabaseSync(':memory:'); opened.push(sql);
  for (const name of ['0001_accounts', '0002_account_rooms', '0003_settings', '0004_admin_overhaul', '0007_usernames']) sql.exec(readFileSync(`server/migrations/${name}.sql`, 'utf8'));
  const db: Database = {
    prepare(query) {
      let values: unknown[] = [];
      const s: Statement & { all<T>(): Promise<{ results: T[] }> } = {
        bind(...args) { values = args; return s; },
        async first<T>() {
          if (/\bLIKE\b/i.test(query) && values.some(v => typeof v === 'string' && Buffer.byteLength(v) > 50)) throw new Error('LIKE pattern too long');
          const row = sql.prepare(query).get(...values as string[]) ?? null;
          if (row && Object.values(row).some(v => typeof v === 'string' && Buffer.byteLength(v) > 2000000)) throw new Error('D1 cell exceeds 2 MB');
          return row as T | null;
        },
        async all<T>() { return { results: sql.prepare(query).all(...values as string[]) as T[] }; },
        async run() { return { meta: { changes: Number(sql.prepare(query).run(...values as string[]).changes) } }; },
      };
      return s;
    },
    async batch(items) { sql.exec('BEGIN'); try { for (const item of items) await item.run(); sql.exec('COMMIT'); } catch (e) { sql.exec('ROLLBACK'); throw e; } },
  };
  const add = (id: string, name = id, created = now, seen = created, premium = 0, optin = 0, email: string | null = `${id}@test.com`) =>
    sql.prepare("INSERT INTO users(id,provider,provider_sub,name,email,picture,premium,news_opt_in,created_at,last_seen_at) VALUES(?,'google',?,?,?,'https://photo.test/a',?,?,?,?)").run(id, id, name, email, premium, optin, created, seen);
  add('admin', 'Jason', 0, 0);
  const token = 'a'.repeat(43);
  await db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').bind(await tokenHash(token), 'admin', now, now + 100000).run();
  const env = { DB: db, ADMIN_USER_IDS: 'admin' };
  const request = (path: string, method = 'GET', body?: unknown, admins = 'admin', auth = true) => adminRoute(new Request(`https://api.test/admin/${path}`, {
    method, headers: auth ? { Authorization: `Bearer ${token}` } : {}, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), { ...env, ADMIN_USER_IDS: admins }, { 'Access-Control-Allow-Origin': 'http://localhost:5199' });
  const matches = (id: string, day: string, n = 1) => { for (let i = 0; i < n; i++) sql.prepare('INSERT INTO daily_matches VALUES(?,?,?)').run(id, day, `${i}`); };
  return { sql, db, add, request, matches };
}
it.each(['stats', 'users', 'users.csv', 'audit'])('protects %s for signed-out and non-admin users and disables caching', async path => {
  const { request } = await fixture();
  for (const response of [await request(path, 'GET', undefined, 'someone-else'), await request(path, 'GET', undefined, 'admin', false)]) {
    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  }
  const allowed = await request(path);
  expect(allowed.status).toBe(200);
  expect(allowed.headers.get('Cache-Control')).toBe('no-store');
  expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5199');
});
it('pages, filters and sorts users with room and indexed match counts', async () => {
  const { add, request, sql, matches } = await fixture();
  add('c', 'Charlie', now - 300, now - 10, 1);
  add('b', 'Bob', now - 200, now - 20, 0, 1);
  add('a', 'alice', now - 100, now - 30, 1, 1);
  matches('a', '2026-11-21', 3); matches('b', '2026-11-22', 2);
  sql.prepare("INSERT INTO account_rooms VALUES('a','ABCD','east',?)").run(now);
  const get = async (query: string) => (await (await request(`users?${query}`)).json()) as { total: number; page: number; size: number; users: { id: string; matchesHosted: number; matchesToday: number; currentRoom: string | null }[] };
  expect(await get('page=2&size=2&sort=newest')).toMatchObject({ total: 4, page: 2, size: 2, users: [{ id: 'c' }, { id: 'admin' }] });
  expect((await get('filter=premium&sort=oldest')).users.map(u => u.id)).toEqual(['c', 'a']);
  expect((await get('filter=optin&sort=active')).users.map(u => u.id)).toEqual(['b', 'a']);
  expect((await get('sort=name')).users.map(u => u.id)).toEqual(['a', 'b', 'c', 'admin']);
  expect((await get('sort=matches')).users.slice(0, 2)).toMatchObject([{ id: 'a', matchesHosted: 3, matchesToday: 0, currentRoom: 'ABCD' }, { id: 'b', matchesHosted: 2, matchesToday: 2, currentRoom: null }]);
  expect(await get('page=-1&size=10000&sort=injected')).toMatchObject({ page: 1, size: 100 });
  expect(await get('page=999')).toMatchObject({ total: 4, users: [] });
  expect(await get('q=missing')).toMatchObject({ total: 0, users: [] });
});
it.each(['%', '_', '\\', "' OR 1=1 --"])('treats %s as literal search text in paginated and CSV queries', async term => {
  const { add, request } = await fixture();
  add('name', `Has${term}Name`); add('email', 'Email', now, now, 0, 0, `has${term}@test.com`); add('plain');
  const query = `q=${encodeURIComponent(term)}`;
  expect(await (await request(`users?${query}`)).json()).toMatchObject({ total: 2, users: [{ id: 'email' }, { id: 'name' }] });
  const csv = await (await request(`users.csv?${query}`)).text();
  expect(csv).toContain('Has'); expect(csv).not.toContain('plain@test.com');
});
it('exports all matches with shared filters/sort, CSV quoting, injection guards and WIB dates', async () => {
  const { add, request, matches } = await fixture();
  for (let i = 0; i < 105; i++) add(`u${i}`, `User ${i}`, now, now, 1, 1);
  for (const [i, name] of ['=SUM(A1)', '+cmd', '-cmd', '@cmd', '\tcmd', 'Comma, "Quote"\r\nNext'].entries()) add(`x${i}`, name, now, now, 1, 1);
  add('null-email', 'Null Email', now, now, 1, 1, null);
  matches('x0', '2026-11-22', 2);
  const response = await request('users.csv?filter=premium&sort=matches&page=999&size=1');
  expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
  expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="maciokyu-users-20261122.csv"');
  const csv = await response.text();
  expect(csv.startsWith('id,name,email,premium,news_opt_in,created_at,last_seen_at,matches_hosted\r\nx0,')).toBe(true);
  for (const name of ['=SUM(A1)', '+cmd', '-cmd', '@cmd', '\tcmd']) expect(csv).toContain(`'${name}`);
  expect(csv).toContain('"Comma, ""Quote""\r\nNext"');
  expect(csv).toContain('null-email,Null Email,,1,1,');
  expect(csv).toContain('2026-11-22T00:00:00.000+07:00');
  expect(csv).toContain('u104,'); expect(csv).not.toContain('admin,');
  expect(await (await request('users.csv?filter=optin&q=User%20104')).text()).toContain('u104,');
  expect((await (await request('users.csv?q=missing')).text()).trim().split('\n')).toHaveLength(1);
});
it('streams more than 6000 users as normal rows in bounded CSV pages', async () => {
  const { add, request, db, sql } = await fixture();
  sql.exec('BEGIN');
  for (let i = 0; i < 6501; i++) add(`u${String(i).padStart(4, '0')}`, 'N'.repeat(350), now, now, 1);
  sql.exec('COMMIT');
  const prepare = vi.spyOn(db, 'prepare');
  const csv = await (await request('users.csv?filter=premium&sort=oldest')).text();
  const lines = csv.trim().split('\r\n');
  expect(Buffer.byteLength(csv)).toBeGreaterThan(2000000);
  expect(lines).toHaveLength(6502);
  expect(lines[1]).toMatch(/^u0000,/);
  expect(lines[6501]).toMatch(/^u6500,/);
  expect(new Set(lines.slice(1).map(line => line.split(',')[0])).size).toBe(6501);
  const pages = prepare.mock.calls.map(([query]) => query).filter(query => query.includes('FROM users u WHERE'));
  expect(pages).toHaveLength(7);
  for (const query of pages) {
    expect(query).toContain('LIMIT ? OFFSET ?');
    expect(query).not.toMatch(/json_group_array|picture|matchesToday|currentRoom/);
  }
});
it('searches a 60-character email case-insensitively and caps search text at 200 characters', async () => {
  const { add, request } = await fixture();
  const email = `${'a'.repeat(51)}@test.com`;
  expect(email).toHaveLength(60);
  add('long-email', 'Email', now, now, 0, 0, email);
  const query = `q=${encodeURIComponent(email.toUpperCase())}`;
  expect(await (await request(`users?${query}`)).json()).toMatchObject({ total: 1, users: [{ id: 'long-email' }] });
  expect(await (await request(`users.csv?${query}`)).text()).toContain(email);
  add('long-name', 'b'.repeat(200));
  expect(await (await request(`users?q=${'b'.repeat(200)}ignored`)).json()).toMatchObject({ total: 1, users: [{ id: 'long-name' }] });
});
it('counts the same distinct non-null opted-in emails as the mailing list', async () => {
  const { add, request } = await fixture();
  add('a', 'A', now, now, 0, 1, 'same@test.com');
  add('b', 'B', now, now, 0, 1, 'same@test.com');
  add('c', 'C', now, now, 0, 1, null);
  add('d', 'D', now, now, 0, 0, 'no@test.com');
  add('e', 'E', now, now, 0, 1, 'other@test.com');
  const emails = await (await request('news-emails')).json() as string[];
  expect(emails).toEqual(['other@test.com', 'same@test.com']);
  expect(await (await request('stats')).json()).toMatchObject({ users: { newsOptIn: emails.length } });
});
it('writes only the changed announcement from a full settings form and skips unchanged saves', async () => {
  const { request, sql, db } = await fixture();
  const settings = { dailyMatchLimit: 3, discardRevealMs: 1000, loginRequired: true, facebookEnabled: false, announcement: 'Before' };
  for (const [key, value] of Object.entries(settings)) sql.prepare('INSERT INTO settings VALUES(?,?,?,?)').run(key, ` ${JSON.stringify(value)} `, now - 1, 'admin');
  const batch = vi.spyOn(db, 'batch');
  const updated = { ...settings, announcement: 'After' };
  expect(await (await request('settings', 'PUT', updated)).json()).toEqual(updated);
  expect(batch).toHaveBeenCalledTimes(1);
  expect(batch.mock.calls[0]![0]).toHaveLength(2);
  expect(sql.prepare('SELECT key,value FROM setting_changes').all()).toEqual([
    expect.objectContaining({ key: 'announcement', value: '"After"' }),
  ]);
  expect(sql.prepare("SELECT updated_at FROM settings WHERE key='dailyMatchLimit'").get()!.updated_at).toBe(now - 1);
  batch.mockClear();
  expect(await (await request('settings', 'PUT', updated)).json()).toEqual(updated);
  expect(batch).not.toHaveBeenCalled();
  expect(sql.prepare('SELECT COUNT(*) AS n FROM setting_changes').get()!.n).toBe(1);
});
it('uses WIB calendar boundaries, deduplicates active hosts and zero-fills thirty days', async () => {
  const { add, matches, request } = await fixture();
  add('before', 'Before', now - 1, now - 1);
  add('today', 'Today', now, now, 1, 1);
  add('week', 'Week', now - 6 * 86400000, now - 6 * 86400000);
  add('outside', 'Outside', now - 6 * 86400000 - 1, now - 6 * 86400000 - 1);
  add('host', 'Host', 0, 0);
  add('future', 'Future', now + 86400000, now + 86400000);
  matches('today', '2026-11-22', 2); matches('host', '2026-11-22'); matches('before', '2026-11-21');
  matches('week', '2026-11-16'); matches('outside', '2026-11-15'); matches('future', '2026-11-23');
  const body = await (await request('stats')).json() as { users: unknown; matches: unknown; daily: { day: string; newUsers: number; activeUsers: number; matches: number }[] };
  expect(body.users).toEqual({ total: 7, newToday: 1, new7d: 3, active7d: 4, premium: 1, newsOptIn: 1 });
  expect(body.matches).toEqual({ today: 3, last7d: 5 });
  expect(body.daily).toHaveLength(30);
  expect(body.daily[0]).toEqual({ day: '2026-10-24', newUsers: 0, activeUsers: 0, matches: 0 });
  expect(body.daily[28]).toEqual({ day: '2026-11-21', newUsers: 1, activeUsers: 1, matches: 1 });
  expect(body.daily[29]).toEqual({ day: '2026-11-22', newUsers: 1, activeUsers: 2, matches: 3 });
  expect(new Set(body.daily.map(d => d.day)).size).toBe(30);
});
it('combines settings snapshots and full history with Premium events in newest-first order', async () => {
  const { request, sql } = await fixture();
  sql.prepare("INSERT INTO settings VALUES('facebookEnabled','false',?,'admin')").run(now - 100);
  sql.prepare("INSERT INTO admin_changes(user_id,premium,updated_at,updated_by) VALUES('admin',1,?,'admin')").run(now - 50);
  await request('settings', 'PUT', { announcement: 'First', dailyMatchLimit: 5 });
  vi.mocked(Date.now).mockReturnValue(now + 10);
  await request('settings', 'PUT', { announcement: 'Second' });
  vi.mocked(Date.now).mockReturnValue(now + 20);
  await request('users/admin/premium', 'PUT', { premium: true });
  const body = await (await request('audit')).json() as { entries: { at: number; kind: string; value?: unknown; by: { id: string; name: string } }[] };
  expect(body.entries).toHaveLength(6);
  expect(body.entries.map(e => e.at)).toEqual([now + 20, now + 10, now, now, now - 50, now - 100]);
  expect(body.entries[0]).toMatchObject({ kind: 'premium', by: { id: 'admin', name: 'Jason' }, userId: 'admin', userName: 'Jason', premium: true });
  expect(body.entries[1]).toMatchObject({ kind: 'setting', key: 'announcement', value: 'Second' });
  expect(body.entries.some(e => e.value === 5)).toBe(true);
  expect(await (await request('audit?limit=1')).json()).toMatchObject({ entries: [body.entries[0]] });
});
it('retains history atomically when a history write fails', async () => {
  const { request, sql } = await fixture();
  sql.exec("CREATE TRIGGER reject_history BEFORE INSERT ON setting_changes BEGIN SELECT RAISE(ABORT,'history unavailable'); END");
  await expect(request('settings', 'PUT', { announcement: 'Failed' })).rejects.toThrow('history unavailable');
  expect(sql.prepare('SELECT COUNT(*) AS n FROM settings').get()!.n).toBe(0);
});
it('migrates existing settings history without changing the snapshot or user data', () => {
  const sql = new DatabaseSync(':memory:'); opened.push(sql);
  for (const name of ['0001_accounts', '0002_account_rooms', '0003_settings']) sql.exec(readFileSync(`server/migrations/${name}.sql`, 'utf8'));
  sql.exec("INSERT INTO settings VALUES('announcement','\"Legacy\"',123,'admin'),('loginRequired','true',NULL,NULL)");
  sql.exec(readFileSync('server/migrations/0004_admin_overhaul.sql', 'utf8'));
  expect(sql.prepare('SELECT key,value,updated_at,updated_by FROM setting_changes').all()).toEqual([
    expect.objectContaining({ key: 'announcement', value: '"Legacy"', updated_at: 123, updated_by: 'admin' }),
  ]);
  expect(sql.prepare('SELECT COUNT(*) AS n FROM settings').get()!.n).toBe(2);
  for (const [table, column, condition] of [['users', 'created_at', 'created_at>=0'], ['users', 'last_seen_at', 'last_seen_at>=0'], ['daily_matches', 'wib_day', "wib_day>='2026-11-22'"]]) {
    const plan = sql.prepare(`EXPLAIN QUERY PLAN SELECT ${column} FROM ${table} WHERE ${condition}`).all();
    expect(plan.some(row => String(row.detail).includes(`INDEX ${table}_${column}`))).toBe(true);
  }
});

it('renames usernames as admin atomically with audit and rejects collisions without a new audit entry', async () => {
  const { request, add, sql } = await fixture();
  add('u'); add('v');
  expect((await request('users/u/username', 'PUT', { username: 'Tomok' }, 'nobody')).status).toBe(403);
  expect((await request('users/u/username', 'PUT', { username: 'Tomok' })).status).toBe(200);
  expect((await request('users/v/username', 'PUT', { username: 'TOMOK' })).status).toBe(409);
  expect((await request('users/u/username', 'PUT', { username: 'Renamed' })).status).toBe(200);
  expect(sql.prepare('SELECT username,username_key FROM users WHERE id=?').get('u')).toMatchObject({ username: 'Renamed', username_key: 'renamed' });
  const audit = await (await request('audit')).json();
  expect(audit.entries).toHaveLength(2);
  expect(audit.entries.some((e: { key: string; value: string }) => e.key === 'username:u' && e.value === 'Tomok → Renamed')).toBe(true);
  expect((await request('users?q=Renamed')).status).toBe(200);
});
