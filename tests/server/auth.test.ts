import { beforeAll, afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { authRoute, countMatch, GOOGLE_CLIENT_ID, remaining, resolveUser, tokenHash, verifyGoogle, wibDay, type Database, type Statement } from '../../server/auth';
import worker, { type Env } from '../../server/router';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('server/migrations/0001_accounts.sql', 'utf8'));
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
it('creates hashed sessions, upserts users, logs out, expires sessions and deletes the account and counts', async () => {
  const { db, sqlite } = database();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: 'test' }] })));
  const login = async () => authRoute(request('/auth/google', 'POST', undefined, { credential: await credential() }), { DB: db }, {});
  const response = await login(); expect(response.status).toBe(200);
  expect(response.headers.get('Set-Cookie')).toContain('HttpOnly; Secure; SameSite=Lax');
  const account = await response.json(); expect(account.remainingMatches).toBe(5);
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
  sqlite.exec("INSERT INTO users VALUES ('u','google','s','Name',NULL,NULL,0,0,0)");
  const day = Date.parse('2026-11-21T16:59:59Z');
  expect(wibDay(day)).toBe('2026-11-21');
  for (let i = 0; i < 5; i++) expect(await countMatch({ DB: db }, 'u', `m${i}`, day)).toBeNull();
  expect(await countMatch({ DB: db }, 'u', 'm0', day)).toBeNull();
  expect(await countMatch({ DB: db }, 'u', 'sixth', day)).toBe('daily_limit');
  expect(await countMatch({ DB: db }, 'u', 'sixth', day + 1000)).toBeNull();
  sqlite.exec('UPDATE users SET premium=1');
  expect(await countMatch({ DB: db }, 'u', 'seventh', day)).toBeNull();
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
