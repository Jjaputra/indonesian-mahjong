import { beforeAll, afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { authRoute, countMatch, GOOGLE_CLIENT_ID, referralCode, remaining, resolveUser, tokenHash, verifyGoogle, wibDay, type Database, type Statement } from '../../server/auth';
import type { Room, Socket } from '../../server/room';
import worker, { type Env } from '../../server/router';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('server/migrations/0001_accounts.sql', 'utf8'));
  sqlite.exec(readFileSync('server/migrations/0002_account_rooms.sql', 'utf8'));
  sqlite.exec(readFileSync('server/migrations/0003_settings.sql', 'utf8'));
  sqlite.exec(readFileSync('server/migrations/0004_admin_overhaul.sql', 'utf8'));
  sqlite.exec(readFileSync('server/migrations/0005_public_rooms.sql', 'utf8'));
  sqlite.exec(readFileSync('server/migrations/0006_public_rooms_premium.sql', 'utf8'));
  sqlite.exec(readFileSync('server/migrations/0007_usernames.sql', 'utf8'));
  sqlite.exec(readFileSync('server/migrations/0008_referrals.sql', 'utf8'));
  const db: Database = {
    prepare(sql) {
      let values: unknown[] = [];
      const statement: Statement = {
        bind(...args) { values = args; return statement; },
        async first<T>() { return (sqlite.prepare(sql).get(...values as string[]) ?? null) as T | null; },
        async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values as string[]).changes) } }; },
      };
      return statement;
    },
    async batch(statements) { sqlite.exec('BEGIN'); try { for (const s of statements) await s.run(); sqlite.exec('COMMIT'); } catch (error) { sqlite.exec('ROLLBACK'); throw error; } },
  };
  return { db, sqlite };
}
let pair: CryptoKeyPair, jwk: JsonWebKey;
const now = Date.now();
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
async function credential(claims = {}, kid = 'test') {
  const unsigned = `${encode({ alg: 'RS256', kid })}.${encode({ sub: 'sub1', name: 'Jason', email: 'j@example.com', email_verified: true, aud: GOOGLE_CLIENT_ID, iss: 'https://accounts.google.com', exp: Math.floor(now / 1000) + 3600, ...claims })}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(unsigned));
  return `${unsigned}.${Buffer.from(signature).toString('base64url')}`;
}
beforeAll(async () => {
  pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
});
afterEach(() => vi.unstubAllGlobals());
it('verifies signature and required Google claims using cached JWKS', async () => {
  const fetcher = vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: 'test' }] }, { headers: { 'Cache-Control': 'max-age=3600' } })) as unknown as typeof fetch;
  expect(await verifyGoogle(await credential(), fetcher, now)).toMatchObject({ sub: 'sub1' });
  for (const claims of [{ aud: 'wrong' }, { iss: 'evil' }, { exp: 0 }, { email_verified: false }]) await expect(verifyGoogle(await credential(claims), fetcher, now)).rejects.toThrow();
  await expect(verifyGoogle(await credential({}, 'wrong'), fetcher, now)).rejects.toThrow();
  const valid = await credential();
  const parts = valid.split('.'); parts[1] = encode({ sub: 'attacker' });
  await expect(verifyGoogle(parts.join('.'), fetcher, now)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('refreshes an unknown kid once per minute, coalesces requests and replaces dropped keys', async () => {
  vi.resetModules();
  const { verifyGoogle: verify } = await import('../../server/auth');
  const fetcher = vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: 'test' }] }, { headers: { 'Cache-Control': 'max-age=3600' } }));
  await verify(await credential(), fetcher, now);
  const rotated = await credential({}, 'rotated');
  fetcher.mockImplementation(async () => Response.json({ keys: [{ ...jwk, kid: 'rotated' }] }, { headers: { 'Cache-Control': 'max-age=120' } }));
  const results = await Promise.all(Array.from({ length: 5 }, () => verify(rotated, fetcher, now + 1000)));
  expect(results).toHaveLength(5); expect(fetcher).toHaveBeenCalledTimes(2);
  await expect(verify(await credential(), fetcher, now + 2000)).rejects.toThrow('unknown key');
  expect(fetcher).toHaveBeenCalledTimes(2);
  // max-age=120 from the replacement response expires at +121s, without retaining the old set.
  await verify(rotated, fetcher, now + 120999); expect(fetcher).toHaveBeenCalledTimes(2);
  await verify(rotated, fetcher, now + 121000); expect(fetcher).toHaveBeenCalledTimes(3);
});
it('throttles failed unknown-key refresh attempts', async () => {
  vi.resetModules();
  const { verifyGoogle: verify } = await import('../../server/auth');
  const fetcher = vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: 'test' }] }, { headers: { 'Cache-Control': 'max-age=3600' } }));
  await verify(await credential(), fetcher, now);
  fetcher.mockImplementation(async () => new Response(null, { status: 503 }));
  const unknown = await credential({}, 'missing');
  await expect(verify(unknown, fetcher, now + 60000)).rejects.toThrow('keys unavailable');
  await expect(verify(unknown, fetcher, now + 61000)).rejects.toThrow('unknown key');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('permits only 60 seconds of exp/iat skew and rejects algorithm confusion', async () => {
  const at = Math.floor(now / 1000) * 1000;
  const fetcher = vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: 'test' }] }));
  await expect(verifyGoogle(await credential({ exp: at / 1000 - 59, iat: at / 1000 + 60 }), fetcher, at)).resolves.toMatchObject({ sub: 'sub1' });
  for (const claims of [{ exp: at / 1000 - 60 }, { iat: at / 1000 + 61 }, { iat: 'invalid' }]) {
    await expect(verifyGoogle(await credential(claims), fetcher, at)).rejects.toThrow('invalid claims');
  }
  for (const alg of ['none', 'HS256']) {
    const token = `${encode({ alg, kid: 'test' })}.${encode({ sub: 'attacker' })}.`;
    await expect(verifyGoogle(token, fetcher, at)).rejects.toThrow('invalid algorithm');
  }
});
const request = (path: string, method = 'GET', token?: string, body?: unknown) => new Request(`https://api.maciokyu.com${path}`, { method, headers: { Origin: 'http://localhost:5199', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
it('lazily assigns stable unique referral codes, retries collisions and handles racing reads', async () => {
  const { db, sqlite } = database();
  for (const id of ['a', 'b']) sqlite.prepare("INSERT INTO users(id,provider,provider_sub,name,created_at,last_seen_at) VALUES(?,'google',?,'Name',0,0)").run(id, id);
  expect(sqlite.prepare('SELECT referral_code FROM users WHERE id=?').get('a')!.referral_code).toBeNull();
  const original = db.prepare.bind(db);
  let collision = true;
  vi.spyOn(db, 'prepare').mockImplementation(sql => {
    if (sql.startsWith('UPDATE users SET referral_code') && collision) { collision = false; throw new Error('UNIQUE constraint failed'); }
    return original(sql);
  });
  const a = await referralCode(db, 'a');
  expect(a).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  expect(await Promise.all([referralCode(db, 'a'), referralCode(db, 'a')])).toEqual([a, a]);
  expect(await referralCode(db, 'b')).not.toBe(a);
  sqlite.close();
});
it('shares once per WIB day, spends daily then share then banked, and never spends on denied/retried starts', async () => {
  const { db, sqlite } = database(), token = 'r'.repeat(43);
  sqlite.exec("INSERT INTO users(id,provider,provider_sub,name,bonus_matches,created_at,last_seen_at) VALUES('r','google','r','Name',2,0,0)");
  const day = Date.parse('2026-11-25T16:59:59Z');
  sqlite.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(await tokenHash(token), 'r', 0, day + 86400000);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(day);
  try {
    expect((await authRoute(request('/me/share', 'POST'), { DB: db }, {})).status).toBe(401);
    expect((await worker.fetch(request('/me/share', 'POST', token), { DB: db, AUTH_LIMITER: { limit: async () => ({ success: false }) } } as unknown as Env)).status).toBe(429);
    const share = () => authRoute(request('/me/share', 'POST', token), { DB: db }, {}).then(r => r.json());
    expect(await share()).toEqual({ granted: true }); expect(await share()).toEqual({ granted: false });
    const me = await (await authRoute(request('/me', 'GET', token), { DB: db }, {})).json();
    expect(me).toMatchObject({ sharedToday: true, bonusMatches: 2, referrals: 0, remainingMatches: 6 });
    expect(me.referralCode).toHaveLength(6);
    for (let i = 0; i < 4; i++) expect(await countMatch({ DB: db }, 'r', `daily${i}`, day)).toBeNull();
    expect(sqlite.prepare('SELECT bonus_matches n FROM users').get()!.n).toBe(2);
    const concurrent = await Promise.all(Array.from({ length: 5 }, (_, i) => countMatch({ DB: db }, 'r', `bank${i}`, day)));
    expect(concurrent.filter(v => v === null)).toHaveLength(2);
    expect(await countMatch({ DB: db }, 'r', 'bank0', day)).toBeNull();
    expect(await countMatch({ DB: db }, 'r', 'denied', day)).toBe('daily_limit');
    expect(sqlite.prepare('SELECT bonus_matches n FROM users').get()!.n).toBe(0);
    clock.mockReturnValue(day + 1000);
    expect((await (await authRoute(request('/me', 'GET', token), { DB: db }, {})).json()).sharedToday).toBe(false);
    expect(await countMatch({ DB: db }, 'r', 'bank0', day + 1000)).toBeNull();
    expect(sqlite.prepare('SELECT COUNT(*) n FROM daily_matches WHERE match_key=?').get('bank0')!.n).toBe(1);
    expect(await share()).toEqual({ granted: true });
    expect((await (await authRoute(request('/me', 'GET', token), { DB: db }, {})).json()).remainingMatches).toBe(4);
    sqlite.exec('UPDATE users SET premium=1,bonus_matches=2');
    for (let i = 0; i < 8; i++) expect(await countMatch({ DB: db }, 'r', `premium${i}`, day)).toBeNull();
    expect(sqlite.prepare('SELECT bonus_matches n FROM users').get()!.n).toBe(2);
  } finally { clock.mockRestore(); sqlite.close(); }
});
it('keeps referral identities after account deletion and never rewards the same identity twice', async () => {
  const { db, sqlite } = database();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: 'test' }] })));
  const login = async (sub: string, ref?: string) => (await authRoute(request('/auth/google', 'POST', undefined, { credential: await credential({ sub }), ref }), { DB: db }, {})).json();
  const owner = await login('owner'), other = await login('other');
  const code = await referralCode(db, owner.id), otherCode = await referralCode(db, other.id);
  const friend = await login('repeat-friend', code);
  expect(sqlite.prepare('SELECT bonus_matches n FROM users WHERE id=?').get(owner.id)!.n).toBe(3);
  const hash = await tokenHash('google:repeat-friend');
  expect(sqlite.prepare('SELECT COUNT(*) n FROM referred_identities WHERE identity_hash=?').get(hash)!.n).toBe(1);
  expect((await authRoute(request('/me', 'DELETE', friend.token), { DB: db }, {})).status).toBe(200);
  const recreated = await login('repeat-friend', code);
  expect(recreated.id).not.toBe(friend.id);
  expect(sqlite.prepare('SELECT referred_by FROM users WHERE id=?').get(recreated.id)!.referred_by).toBeNull();
  expect(sqlite.prepare('SELECT bonus_matches n FROM users WHERE id=?').get(owner.id)!.n).toBe(3);
  await authRoute(request('/me', 'DELETE', recreated.token), { DB: db }, {});
  const redirected = await login('repeat-friend', otherCode);
  expect(sqlite.prepare('SELECT referred_by FROM users WHERE id=?').get(redirected.id)!.referred_by).toBeNull();
  expect(sqlite.prepare('SELECT bonus_matches n FROM users WHERE id=?').get(other.id)!.n).toBe(0);
  // Every identity is marked on sign-in, so an unreferred account deleted and re-created through a link earns nothing.
  const loner = await login('loner');
  await authRoute(request('/me', 'DELETE', loner.token), { DB: db }, {});
  const returning = await login('loner', code);
  expect(sqlite.prepare('SELECT referred_by FROM users WHERE id=?').get(returning.id)!.referred_by).toBeNull();
  expect(sqlite.prepare('SELECT bonus_matches n FROM users WHERE id=?').get(owner.id)!.n).toBe(3);
  expect(sqlite.prepare('SELECT COUNT(*) n FROM referred_identities').get()!.n).toBe(4);
  sqlite.close();
});
it('rewards only new referred signups, caps rewards at ten, ignores invalid/unknown/self referrals and supports Facebook', async () => {
  const { db, sqlite } = database();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: 'test' }] })));
  const login = async (sub: string, ref?: string) => (await authRoute(request('/auth/google', 'POST', undefined, { credential: await credential({ sub }), ref }), { DB: db }, {})).json();
  const owner = await login('owner');
  const code = await referralCode(db, owner.id);
  for (let i = 0; i < 12; i++) await login(`friend${i}`, code);
  expect(sqlite.prepare('SELECT bonus_matches n FROM users WHERE id=?').get(owner.id)!.n).toBe(30);
  expect(sqlite.prepare('SELECT COUNT(*) n FROM users WHERE referred_by=?').get(owner.id)!.n).toBe(12);
  sqlite.prepare("DELETE FROM users WHERE provider_sub='friend11'").run();
  await login('replacement', code);
  expect(sqlite.prepare('SELECT bonus_matches n FROM users WHERE id=?').get(owner.id)!.n).toBe(30);
  await login('owner', code); await login('friend0', 'ZZZZZZ');
  expect(sqlite.prepare("SELECT referred_by FROM users WHERE provider_sub='friend0'").get()!.referred_by).toBe(owner.id);
  for (const ref of ['bad', 'ZZZZZZ', 'ABCDEF?']) await login(`invalid-${ref}`, ref);
  expect(sqlite.prepare('SELECT referred_by FROM users WHERE id=?').get(owner.id)!.referred_by).toBeNull();
  expect(sqlite.prepare('SELECT COUNT(*) n FROM users WHERE referred_by=?').get(owner.id)!.n).toBe(12);
  const other = await login('other'), otherCode = await referralCode(db, other.id);
  const graph = vi.fn(async (url: string) => url.endsWith('/app') ? Response.json({ id: '1670170614568233' }) : Response.json({ id: 'fb-referral', name: 'Friend' }));
  vi.stubGlobal('fetch', graph);
  const fb = () => authRoute(request('/auth/facebook', 'POST', undefined, { accessToken: 'token', ref: otherCode }), { DB: db, FACEBOOK_ENABLED: 'true' }, {});
  expect((await fb()).status).toBe(200); expect((await fb()).status).toBe(200);
  expect(sqlite.prepare('SELECT bonus_matches n FROM users WHERE id=?').get(other.id)!.n).toBe(3);
  sqlite.prepare('DELETE FROM users WHERE referred_by=?').run(owner.id);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: 'test' }] })));
  await login('after-deletion', code);
  expect(sqlite.prepare('SELECT bonus_matches n FROM users WHERE id=?').get(owner.id)!.n).toBe(30);
  sqlite.close();
});
it('creates hashed sessions, upserts users, logs out, expires sessions and deletes the account and counts', async () => {
  const { db, sqlite } = database();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: 'test' }] })));
  const login = async () => authRoute(request('/auth/google', 'POST', undefined, { credential: await credential() }), { DB: db }, {});
  const response = await login(); expect(response.status).toBe(200);
  expect(response.headers.get('Set-Cookie')).toContain('HttpOnly; Secure; SameSite=Lax');
  const account = await response.json(); expect(account.remainingMatches).toBe(3);
  expect(sqlite.prepare('SELECT token_hash FROM sessions').get()!.token_hash).toBe(await tokenHash(account.token));
  expect(await resolveUser(request('/me', 'GET', account.token), { DB: db })).toMatchObject({ id: account.id });
  const cookieRequest = new Request('https://api.maciokyu.com/me', { headers: { Cookie: `__Host-maciokyu_session=${account.token}` } });
  expect(await resolveUser(cookieRequest, { DB: db })).toMatchObject({ id: account.id });
  await authRoute(request('/auth/logout', 'POST', account.token), { DB: db }, {});
  expect(await resolveUser(cookieRequest, { DB: db })).toBeNull();
  const second = await (await login()).json(); expect(second.id).toBe(account.id);
  sqlite.prepare('UPDATE sessions SET expires_at=0').run();
  expect(await resolveUser(request('/me', 'GET', second.token), { DB: db })).toBeNull();
  const third = await (await login()).json();
  await countMatch({ DB: db }, third.id, 'match');
  expect((await authRoute(request('/me', 'DELETE', third.token), { DB: db }, {})).status).toBe(200);
  for (const table of ['users', 'sessions', 'daily_matches']) expect(sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n).toBe(0);
  sqlite.close();
});
it('enforces atomic per-account daily counts, dedupes matches and exempts premium', async () => {
  const { db, sqlite } = database();
  sqlite.exec("INSERT INTO users (id,provider,provider_sub,name,email,picture,premium,created_at,last_seen_at) VALUES ('u','google','s','Name',NULL,NULL,0,0,0)");
  const day = Date.parse('2026-11-21T16:59:59Z');
  expect(wibDay(day)).toBe('2026-11-21');
  for (let i = 0; i < 3; i++) expect(await countMatch({ DB: db }, 'u', `m${i}`, day)).toBeNull();
  expect(await countMatch({ DB: db }, 'u', 'm0', day)).toBeNull();
  expect(await countMatch({ DB: db }, 'u', 'fourth', day)).toBe('daily_limit');
  expect(await countMatch({ DB: db }, 'u', 'fourth', day + 1000)).toBeNull();
  sqlite.exec('UPDATE users SET premium=1');
  expect(await countMatch({ DB: db }, 'u', 'fifth', day)).toBeNull();
  expect(await remaining(db, { id: 'u', name: 'Name', picture: null, premium: 1 })).toBeNull();
  expect(await countMatch({ LOGIN_REQUIRED: 'true' }, undefined, 'm')).toBe('login_required');
  expect(await countMatch({ LOGIN_REQUIRED: 'false' }, undefined, 'm')).toBeNull();
  sqlite.close();
});
it('requires login only for room creation, forwards anonymous joiners, strips spoofed identities and restricts credentialed CORS', async () => {
  const forwarded: Request[] = [];
  const env: Env = { LOGIN_REQUIRED: 'true', ROOM_CREATION_LIMITER: { limit: async () => ({ success: true }) }, ROOMS: { idFromName: n => n, get: () => ({ fetch: async r => { forwarded.push(r); return new Response(null, { status: 201 }); } }) } };
  expect((await worker.fetch(request('/rooms', 'POST'), env)).status).toBe(401);
  expect((await worker.fetch(request('/rooms', 'POST'), { ...env, LOGIN_REQUIRED: 'false' })).status).toBe(201);
  const join = request('/rooms/ABCDEF/ws'); join.headers.set('X-User-Id', 'spoof');
  expect((await worker.fetch(join, env)).status).toBe(201);
  expect(forwarded.at(-1)!.headers.get('X-User-Id')).toBeNull();
  const allowed = await worker.fetch(request('/me', 'OPTIONS'), env);
  expect(allowed.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  const denied = await worker.fetch(new Request('https://api.maciokyu.com/me', { headers: { Origin: 'https://evil.example' } }), env);
  expect(denied.status).toBe(403); expect(denied.headers.has('Access-Control-Allow-Credentials')).toBe(false);
});

it('gates Facebook, verifies the app before fetching the profile and rate limits auth requests', async () => {
  const { db, sqlite } = database();
  const req = () => request('/auth/facebook', 'POST', undefined, { accessToken: 'user-token' });
  expect((await authRoute(req(), { DB: db }, {})).status).toBe(404);
  const graph = vi.fn(async (url: string) => url.endsWith('/app') ? Response.json({ id: 'wrong-app' }) : Response.json({ id: 'fb-user', name: 'Player' }));
  vi.stubGlobal('fetch', graph);
  expect((await authRoute(req(), { DB: db, FACEBOOK_ENABLED: 'true' }, {})).status).toBe(401);
  expect(graph).toHaveBeenCalledOnce();
  graph.mockImplementation(async (url: string) => url.endsWith('/app') ? Response.json({ id: '1670170614568233' }) : Response.json({ id: 'fb-user', name: 'Player' }));
  expect((await authRoute(req(), { DB: db, FACEBOOK_ENABLED: 'true' }, {})).status).toBe(200);
  expect(graph.mock.calls.every(([url]) => !url.includes('user-token'))).toBe(true);
  const response = await worker.fetch(request('/auth/google', 'POST', undefined, { credential: 'bad' }), { DB: db, AUTH_LIMITER: { limit: async () => ({ success: false }) } } as unknown as Env);
  expect(response.status).toBe(429);
  sqlite.close();
});

it('rate limits unauthenticated room creation before checking the login requirement', async () => {
  const limit = vi.fn(async () => ({ success: false }));
  const env = { LOGIN_REQUIRED: 'true', ROOM_CREATION_LIMITER: { limit } } as unknown as Env;
  const response = await worker.fetch(request('/rooms', 'POST'), env);
  expect(response.status).toBe(429); expect(limit).toHaveBeenCalledOnce();
  expect(response.headers.get('Retry-After')).toBe('60');
  limit.mockResolvedValue({ success: true });
  expect((await worker.fetch(request('/rooms', 'POST'), env)).status).toBe(401);
  expect(limit).toHaveBeenCalledTimes(2);
});

it('defaults email consent off, records explicit changes, rejects invalid choices and deletes consent', async () => {
  const { db, sqlite } = database();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: 'test' }] })));
  const account = await (await authRoute(request('/auth/google', 'POST', undefined, { credential: await credential() }), { DB: db }, {})).json();
  expect(account.newsOptIn).toBe(false); expect(account.currentRoom).toBeNull();
  for (const newsOptIn of [true, false]) {
    expect((await authRoute(request('/me', 'POST', account.token, { newsOptIn }), { DB: db }, {})).status).toBe(200);
    const row = sqlite.prepare('SELECT news_opt_in,news_opt_in_at FROM users').get()!;
    expect(row.news_opt_in).toBe(newsOptIn ? 1 : 0); expect(row.news_opt_in_at).toBeGreaterThan(0);
    expect((await (await authRoute(request('/me', 'GET', account.token), { DB: db }, {})).json()).newsOptIn).toBe(newsOptIn);
  }
  expect((await authRoute(request('/me', 'POST', account.token, { newsOptIn: 1 }), { DB: db }, {})).status).toBe(400);
  await authRoute(request('/me', 'DELETE', account.token), { DB: db }, {});
  expect(sqlite.prepare('SELECT COUNT(*) n FROM users').get()!.n).toBe(0);
  sqlite.close();
});

it.each(['playing', 'finished'])('verifies /me room and clears explicit leave in phase %s; refuses duplicate creation', async phase => {
  const { db, sqlite } = database();
  const token = 'a'.repeat(43);
  sqlite.prepare("INSERT INTO users (id,provider,provider_sub,name,premium,created_at,last_seen_at) VALUES ('u','google','s','Name',0,0,0)").run();
  sqlite.exec("UPDATE users SET username=name,username_key=lower(name) WHERE username IS NULL");
  sqlite.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(await tokenHash(token), 'u', 0, Date.now() + 100000);
  sqlite.prepare('INSERT INTO account_rooms VALUES (?,?,?,?)').run('u', 'ABCDEF', 'dong', Date.now());
  let live = true;
  const env: Env = { DB: db, ROOM_CREATION_LIMITER: { limit: async () => ({ success: true }) }, ROOMS: { idFromName: n => n, get: () => ({ fetch: async r => {
    expect(r.headers.get('X-User-Id')).toBe('u');
    if (r.method === 'DELETE') live = false;
    return Response.json(live ? { code: 'ABCDEF', phase } : null);
  } }) } };
  expect((await (await worker.fetch(request('/me', 'GET', token), env)).json()).currentRoom).toEqual({ code: 'ABCDEF', phase });
  expect((await worker.fetch(request('/rooms', 'POST', token), env)).status).toBe(409);
  for (const body of [undefined, { code: 'GHJKLM' }]) {
    await worker.fetch(request('/me/room', 'DELETE', token, body), env);
    expect(live).toBe(true);
    expect((await (await worker.fetch(request('/me', 'GET', token), env)).json()).currentRoom.code).toBe('ABCDEF');
  }
  await worker.fetch(request('/me/room', 'DELETE', token, { code: 'ABCDEF' }), env);
  expect((await (await worker.fetch(request('/me', 'GET', token), env)).json()).currentRoom).toBeNull();
  expect(sqlite.prepare('SELECT COUNT(*) n FROM account_rooms').get()!.n).toBe(0);
  sqlite.prepare('INSERT INTO account_rooms VALUES (?,?,?,?)').run('u', 'ABCDEF', 'dong', 0);
  expect((await (await worker.fetch(request('/me', 'GET', token), env)).json()).currentRoom).toBeNull();
  sqlite.close();
});

it('keeps the account room index consistent through DO persistence, leave and idle room deletion', async () => {
  const { db, sqlite } = database();
  sqlite.prepare("INSERT INTO users (id,provider,provider_sub,name,premium,created_at,last_seen_at) VALUES ('u','google','s','Name',0,0,0)").run();
  sqlite.exec("UPDATE users SET username=name,username_key=lower(name) WHERE username IS NULL");
  sqlite.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('verified-session', 'u', 0, Date.now() + 60000);
  const memory = new Map<string, unknown>();
  let ready: Promise<unknown> = Promise.resolve();
  const ctx = {
    blockConcurrencyWhile: (fn: () => Promise<unknown>) => { ready = fn(); },
    getWebSockets: () => [],
    storage: {
      get: async (key: string) => memory.get(key),
      put: async (key: string, value: unknown) => { memory.set(key, value); },
      deleteAll: async () => { memory.clear(); },
      setAlarm: async () => {}, deleteAlarm: async () => {},
    },
  };
  // Keep Worker globals out of the browser TypeScript compilation.
  const adapterPath = '../../server/index.ts';
  const { RoomDO } = await import(adapterPath);
  let otherLive = true;
  const otherRequests: string[] = [];
  const object = new RoomDO(ctx, { DB: db, ROOMS: { idFromName: (code: string) => code, get: (code: string) => ({ fetch: async (r: Request) => {
    expect(code).toBe('GHJKLM'); otherRequests.push(r.method);
    if (r.method === 'DELETE') { otherLive = false; sqlite.prepare('DELETE FROM account_rooms WHERE code=?').run(code); }
    return Response.json(otherLive ? { code, phase: 'playing' } : null);
  } }) } });
  await ready;
  expect((await object.fetch(new Request('https://room/create/ABCDEF', { method: 'POST', headers: { 'X-User-Id': 'u' } }))).status).toBe(201);
  expect(sqlite.prepare('SELECT code,seat FROM account_rooms').get()).toMatchObject({ code: 'ABCDEF', seat: 'dong' });
  expect(await (await object.fetch(new Request('https://room/account', { headers: { 'X-User-Id': 'u' } }))).json()).toEqual({ code: 'ABCDEF', phase: 'lobby' });
  const room = (object as unknown as { room: Room }).room;
  const sit = async (switchRoom = false) => {
    const socket: Socket = { id: crypto.randomUUID(), userId: 'u', sessionHash: 'verified-session' };
    room.connect(socket); await room.message(socket, JSON.stringify({ type: 'hello', name: 'Name', switchRoom }));
    return socket;
  };
  const hostSocket = await sit();
  await room.message(hostSocket, JSON.stringify({ type: 'config', config: { ...room.data!.config, public: true } }));
  expect(sqlite.prepare('SELECT host_name,humans FROM public_rooms').get()).toMatchObject({ host_name: 'Name', humans: 1 });
  expect(sqlite.prepare('SELECT code,seat FROM account_rooms').get()).toMatchObject({ code: 'ABCDEF', seat: 'dong' });
  const accountRequest = () => new Request('https://room/account', { headers: { 'X-User-Id': 'u' } });
  expect(await (await object.fetch(accountRequest())).json()).toEqual({ code: 'ABCDEF', phase: 'lobby' });
  await room.leaveAccount('u');
  expect(sqlite.prepare('SELECT COUNT(*) n FROM public_rooms').get()!.n).toBe(0);
  expect(await (await object.fetch(accountRequest())).json()).toBeNull();
  expect(sqlite.prepare('SELECT COUNT(*) n FROM account_rooms').get()!.n).toBe(0);
  sqlite.prepare('INSERT INTO account_rooms VALUES (?,?,?,?)').run('u', 'GHJKLM', 'nan', Date.now());
  expect((await sit()).token).toBeUndefined();
  expect(otherLive).toBe(true);
  expect(sqlite.prepare('SELECT code FROM account_rooms').get()!.code).toBe('GHJKLM');
  // Refusal by B must never leave A or overwrite its account index.
  room.data!.config.allowSpectators = false;
  for (const seat of ['dong', 'nan', 'xi', 'bei'] as const) room.data!.people[seat] = { name: seat, seat };
  expect((await sit(true)).token).toBeUndefined();
  expect(otherLive).toBe(true); expect(otherRequests).toEqual(['GET']);
  expect(sqlite.prepare('SELECT code FROM account_rooms').get()!.code).toBe('GHJKLM');
  room.data!.people = {};
  expect((await sit(true)).seat).toBe('dong');
  expect(otherRequests).toEqual(['GET', 'GET', 'DELETE']);
  expect(sqlite.prepare('SELECT code FROM account_rooms').get()!.code).toBe('ABCDEF');
  expect(sqlite.prepare('SELECT COUNT(*) n FROM public_rooms').get()!.n).toBe(1);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 86400000);
  try { await object.alarm(); } finally { clock.mockRestore(); }
  expect(sqlite.prepare('SELECT COUNT(*) n FROM account_rooms').get()!.n).toBe(0);
  expect(memory.size).toBe(0);
  expect(sqlite.prepare('SELECT COUNT(*) n FROM public_rooms').get()!.n).toBe(0);
  sqlite.close();
});


it('keeps A when confirmed creation fails and leaves it only after successful creation', async () => {
  const { db, sqlite } = database(); const token = 'a'.repeat(43);
  sqlite.prepare("INSERT INTO users (id,provider,provider_sub,name,premium,created_at,last_seen_at) VALUES ('u','google','s','Name',0,0,0)").run();
  sqlite.exec("UPDATE users SET username=name,username_key=lower(name) WHERE username IS NULL");
  sqlite.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(await tokenHash(token), 'u', 0, Date.now() + 100000);
  sqlite.prepare('INSERT INTO account_rooms VALUES (?,?,?,?)').run('u', 'ABCDEF', 'dong', Date.now());
  let fail = true, created = false, live = true;
  const env: Env = { DB: db, ROOM_CREATION_LIMITER: { limit: async () => ({ success: true }) }, ROOMS: { idFromName: n => n, get: () => ({ fetch: async r => {
    if (new URL(r.url).pathname.startsWith('/create/')) {
      if (fail) return new Response(null, { status: 409 });
      created = true; return new Response(null, { status: 201 });
    }
    if (r.method === 'DELETE') { expect(created).toBe(true); live = false; }
    return Response.json(live ? { code: 'ABCDEF', phase: 'playing' } : null);
  } }) } };
  expect((await worker.fetch(request('/rooms', 'POST', token, { replace: true }), env)).status).toBe(503);
  expect(live).toBe(true);
  expect((await (await worker.fetch(request('/me', 'GET', token), env)).json()).currentRoom.code).toBe('ABCDEF');
  fail = false;
  expect((await worker.fetch(request('/rooms', 'POST', token, { replace: true }), env)).status).toBe(201);
  expect(live).toBe(false); sqlite.close();
});

it('sets a unique username once, rejects invalid/taken values and resolves concurrent claims through the index', async () => {
  const { db, sqlite } = database();
  const tokens = ['a'.repeat(43), 'b'.repeat(43), 'c'.repeat(43), 'd'.repeat(43)];
  for (let i = 0; i < tokens.length; i++) {
    sqlite.prepare("INSERT INTO users(id,provider,provider_sub,name,premium,created_at,last_seen_at) VALUES(?,'google',?,'Private Google',0,0,0)").run(String(i), String(i));
    sqlite.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,0,?)').run(await tokenHash(tokens[i]!), String(i), Date.now() + 60000);
  }
  const choose = (i: number, username: unknown) => authRoute(request('/me/username', 'POST', tokens[i], { username }), { DB: db }, {});
  expect((await choose(0, '😀')).status).toBe(400);
  expect((await (await choose(0, 'x')).json()).message).toContain('3–12 karakter');
  expect((await (await choose(0, 'ADMIN')).json()).message).toBe('Nama itu nggak boleh dipakai, coba yang lain.');
  expect((await choose(0, ' Tomok ')).status).toBe(200);
  expect(await (await choose(1, 'TOMOK')).json()).toMatchObject({ code: 'username_taken' });
  expect(await (await choose(0, 'Changed')).json()).toMatchObject({ code: 'username_locked' });
  expect(await (await authRoute(request('/me', 'GET', tokens[0]), { DB: db }, {})).json()).toMatchObject({ username: 'Tomok', name: 'Tomok' });
  const race = await Promise.all([choose(2, 'Race'), choose(3, 'race')]);
  expect(race.map(r => r.status).sort()).toEqual([200, 409]);
  const same = await Promise.all([choose(1, 'Once'), choose(1, 'Twice')]);
  expect(same.map(r => r.status).sort()).toEqual([200, 409]);
  const env = { DB: db, ROOMS: { idFromName: () => '', get: () => ({ fetch: async () => new Response() }) }, ROOM_CREATION_LIMITER: { limit: async () => ({ success: true }) }, AUTH_LIMITER: { limit: async () => ({ success: false }) } };
  expect((await worker.fetch(request('/me/username', 'POST', tokens[0], { username: 'Other' }), env)).status).toBe(429);
  sqlite.prepare('UPDATE users SET username=NULL,username_key=NULL WHERE id=?').run('1');
  expect(await (await worker.fetch(request('/rooms', 'POST', tokens[1], {}), env)).json()).toMatchObject({ code: 'username_required' });
  sqlite.close();
});
