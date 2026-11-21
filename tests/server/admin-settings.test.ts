import { expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { type Database, type Statement, countMatch, tokenHash } from '../../server/auth';
import { adminRoute } from '../../server/admin';
import { readSettings, resetAt, validSettings } from '../../server/settings';
import { formatCountdown } from '../../src/ui/components/AllowanceReset';
import { acceptConfig, configNow } from '../../src/net/config';
import { remainingMatches } from '../../src/net/daily-limit';
import { MemoryStorage } from '../../src/storage';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  for (const name of ['0001_accounts', '0002_account_rooms', '0003_settings']) sql.exec(readFileSync(`server/migrations/${name}.sql`, 'utf8'));
  const db: Database = {
    prepare(query) {
      let values: unknown[] = [];
      const s: Statement = { bind(...args) { values = args; return s; }, async first<T>() { return (sql.prepare(query).get(...values as string[]) ?? null) as T | null; }, async run() { return { meta: { changes: Number(sql.prepare(query).run(...values as string[]).changes) } }; } };
      return s;
    },
    async batch(items) { sql.exec('BEGIN'); try { for (const item of items) await item.run(); sql.exec('COMMIT'); } catch (e) { sql.exec('ROLLBACK'); throw e; } },
  };
  return { db, sql };
}
it('validates every setting, rejects unknown keys, and permits boundary values', () => {
  for (const value of [{ dailyMatchLimit: -1 }, { dailyMatchLimit: 51 }, { dailyMatchLimit: 1.5 }, { discardRevealMs: 3001 }, { loginRequired: 'true' }, { facebookEnabled: 1 }, { announcement: 'a'.repeat(201) }, { admin: true }, []]) expect(validSettings(value)).toBe(false);
  expect(validSettings({ dailyMatchLimit: 0, discardRevealMs: 3000, loginRequired: false, facebookEnabled: true, announcement: 'a'.repeat(200) })).toBe(true);
});
it('defaults an empty table, caches for 30 seconds and ignores invalid stored values', async () => {
  const { db, sql } = fixture();
  expect(await readSettings({ DB: db }, 0)).toEqual({ dailyMatchLimit: 3, discardRevealMs: 1000, loginRequired: true, facebookEnabled: false, announcement: '' });
  sql.exec("INSERT INTO settings(key,value) VALUES('dailyMatchLimit','8'),('discardRevealMs','99999')");
  expect((await readSettings({ DB: db }, 29999)).dailyMatchLimit).toBe(3);
  expect(await readSettings({ DB: db }, 30000)).toMatchObject({ dailyMatchLimit: 8, discardRevealMs: 1000 });
  sql.close();
});
it('logs a failed settings read and retries on the very next request', async () => {
  const { db, sql } = fixture();
  sql.exec("INSERT INTO settings(key,value) VALUES('dailyMatchLimit','8')");
  const prepare = vi.spyOn(db, 'prepare').mockImplementationOnce(() => { throw new Error('D1 unavailable'); });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect((await readSettings({ DB: db }, 100)).dailyMatchLimit).toBe(3);
    expect(log).toHaveBeenCalledWith('Failed to read settings', expect.any(Error));
    expect((await readSettings({ DB: db }, 101)).dailyMatchLimit).toBe(8);
    expect(prepare).toHaveBeenCalledTimes(2);
  } finally { prepare.mockRestore(); log.mockRestore(); sql.close(); }
});
it.each(['%', '_', '\\'])('searches for literal %s in names and emails', async term => {
  const { db, sql } = fixture(), token = 's'.repeat(43);
  sql.exec("INSERT INTO users(id,provider,provider_sub,name,email,premium,created_at,last_seen_at) VALUES('admin','google','a','Jason','j@example.com',0,0,0),('plain','google','p','Plain','plain@example.com',0,0,0)");
  await db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').bind(await tokenHash(token), 'admin', 0, Date.now() + 100000).run();
  await db.prepare("INSERT INTO users(id,provider,provider_sub,name,email,premium,created_at,last_seen_at) VALUES('name','google','n',?,'n@example.com',0,0,0),('email','google','e','Email',?,0,0,0)").bind(`Has${term}Name`, `has${term}@example.com`).run();
  try {
    const response = await adminRoute(new Request(`https://api.test/admin/users?q=${encodeURIComponent(term)}`, { headers: { Authorization: `Bearer ${token}` } }), { DB: db, ADMIN_USER_IDS: 'admin' }, {});
    expect((await response.json() as { id: string }[]).map(u => u.id).sort()).toEqual(['email', 'name']);
  } finally { sql.close(); }
});
it('protects every admin route and applies audited settings and Premium changes immediately', async () => {
  const { db, sql } = fixture(), token = 'a'.repeat(43);
  sql.exec("INSERT INTO users(id,provider,provider_sub,name,email,premium,created_at,last_seen_at,news_opt_in) VALUES('admin','google','a','Jason','yes@example.com',0,0,0,1),('u','google','u','Player','no@example.com',0,0,0,0)");
  await db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').bind(await tokenHash(token), 'admin', 0, Date.now() + 100000).run();
  const env = { DB: db, ADMIN_USER_IDS: 'admin' };
  const request = (path: string, method = 'GET', body?: unknown, authenticated = true) => new Request(`https://api.test/admin/${path}`, { method, headers: authenticated ? { Authorization: `Bearer ${token}` } : {}, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  for (const path of ['settings', 'users', 'users/u/premium', 'news-emails', 'unknown']) {
    expect((await adminRoute(request(path, 'GET', undefined, false), env, {})).status).toBe(403);
    expect((await adminRoute(request(path), { ...env, ADMIN_USER_IDS: 'someone-else' }, {})).status).toBe(403);
  }
  expect((await adminRoute(request('settings'), env, {})).status).toBe(200);
  expect((await adminRoute(request('settings', 'PUT', { dailyMatchLimit: 51 }), env, {})).status).toBe(400);
  await readSettings(env);
  expect((await adminRoute(request('settings', 'PUT', { dailyMatchLimit: 3, announcement: 'Halo' }), env, {})).status).toBe(200);
  expect((await readSettings(env)).announcement).toBe('Halo');
  expect(sql.prepare("SELECT updated_by FROM settings WHERE key='announcement'").get()!.updated_by).toBe('admin');
  const day = Date.parse('2026-11-21T12:00:00Z');
  for (let n = 0; n < 3; n++) expect(await countMatch(env, 'u', `match${n}`, day)).toBeNull();
  expect(await countMatch(env, 'u', 'fourth', day)).toBe('daily_limit');
  expect((await adminRoute(request('users/u/premium', 'PUT', { premium: true }), env, {})).status).toBe(200);
  expect(await countMatch(env, 'u', 'fourth', day)).toBeNull();
  expect(sql.prepare('SELECT updated_by FROM admin_changes').get()!.updated_by).toBe('admin');
  expect(await (await adminRoute(request('news-emails'), env, {})).json()).toEqual(['yes@example.com']);
  expect(await (await adminRoute(request('users?q=Player'), env, {})).json()).toMatchObject([{ id: 'u', premium: 1 }]);
  sql.close();
});
it('resets exactly at WIB midnight and formats both countdown states', () => {
  expect(resetAt(Date.parse('2026-11-21T16:59:59Z'))).toBe(Date.parse('2026-11-21T17:00:00Z'));
  expect(resetAt(Date.parse('2026-11-21T17:00:00Z'))).toBe(Date.parse('2026-11-22T17:00:00Z'));
  expect(formatCountdown(18753000)).toBe('Reset 00.00 WIB · 5 jam 12 menit lagi');
  expect(formatCountdown(18753000, true)).toBe('Jatah hari ini habis. Reset dalam 05:12:33');
  expect(formatCountdown(-1, true)).toContain('00:00:00');
});
it('uses the server clock plus monotonic elapsed time and applies configurable device limits', () => {
  const elapsed = vi.spyOn(performance, 'now').mockReturnValue(100);
  try {
    acceptConfig({ serverNow: 100000, dailyMatchLimit: 0 });
    elapsed.mockReturnValue(2100);
    expect(configNow()).toBe(102000);
    expect(remainingMatches(0, new MemoryStorage())).toBe(0);
    acceptConfig({ dailyMatchLimit: 50 });
    expect(remainingMatches(0, new MemoryStorage())).toBe(50);
  } finally { elapsed.mockRestore(); acceptConfig({ dailyMatchLimit: 3 }); }
});
