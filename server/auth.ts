import { reservedUsername, validUsername, usernameKey } from '../src/net/protocol';
import { readSettings, resetAt } from './settings';
export const GOOGLE_CLIENT_ID = '493683615084-apa5g3v01866pb8b9qfrgc75ii4pqtqk.apps.googleusercontent.com';
export const FACEBOOK_APP_ID = '1670170614568233';
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Database { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown> }
export interface AuthEnv { currentRoom?(userId: string): Promise<{ code: string; phase: string } | null>; DB?: Database; ADMIN_USER_IDS?: string; LOGIN_REQUIRED?: string; FACEBOOK_ENABLED?: string }
export interface User { id: string; username?: string | null; name: string; picture: string | null; premium: number; news_opt_in?: number; news_opt_in_at?: number | null }
interface Identity { sub: string; name: string; email?: string; picture?: string }
const COOKIE = '__Host-maciokyu_session';
const LIFETIME = 60 * 86400000;
const cookie = (token: string, age = LIFETIME / 1000) => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
export const wibDay = (now: number) => new Date(now + 7 * 3600000).toISOString().slice(0, 10);
const bytes = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
export async function tokenHash(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
type Jwk = JsonWebKey & { kid?: string };
let jwks: { keys: Jwk[]; until: number } | undefined;
let refreshAfter = 0;
let fetchingKeys: Promise<void> | undefined;
async function refreshKeys(fetcher: typeof fetch, now: number): Promise<void> {
  if (fetchingKeys) return fetchingKeys;
  fetchingKeys = (async () => {
    const response = await fetcher('https://www.googleapis.com/oauth2/v3/certs');
    if (!response.ok) throw new Error('keys unavailable');
    const body = await response.json() as { keys: Jwk[] };
    if (!Array.isArray(body.keys)) throw new Error('invalid keys');
    const seconds = Number(/max-age=(\d+)/.exec(response.headers.get('Cache-Control') ?? '')?.[1] ?? 3600);
    jwks = { keys: body.keys, until: now + seconds * 1000 };
  })();
  try { await fetchingKeys; } finally { fetchingKeys = undefined; }
}
export async function verifyGoogle(token: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<Identity> {
  const parts = token.split('.');
  if (parts.length !== 3 || token.length > 16384) throw new Error('invalid credential');
  const header = JSON.parse(new TextDecoder().decode(bytes(parts[0]!)));
  const claims = JSON.parse(new TextDecoder().decode(bytes(parts[1]!)));
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('invalid algorithm');
  const expired = !jwks || jwks.until <= now;
  if (expired) await refreshKeys(fetcher, now);
  let jwk = jwks!.keys.find(k => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk && (fetchingKeys || (!expired && now >= refreshAfter))) {
    if (!fetchingKeys) refreshAfter = now + 60000;
    await refreshKeys(fetcher, now);
    jwk = jwks!.keys.find(k => k.kid === header.kid && k.kty === 'RSA');
  }
  if (!jwk) throw new Error('unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(parts[2]!), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) throw new Error('invalid signature');
  if (claims.aud !== GOOGLE_CLIENT_ID || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)
    || typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now - 60000
    || (claims.iat !== undefined && (typeof claims.iat !== 'number' || !Number.isFinite(claims.iat) || claims.iat * 1000 > now + 60000)) || claims.email_verified !== true
    || typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string') throw new Error('invalid claims');
  return { sub: claims.sub, name: typeof claims.name === 'string' ? claims.name : claims.email, email: claims.email, picture: typeof claims.picture === 'string' ? claims.picture : undefined };
}
export function sessionToken(request: Request): string | null {
  const localBearer = request.headers.get('Origin')?.startsWith('http://localhost:') ? /^maciokyu-auth,\s*([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Sec-WebSocket-Protocol') ?? '')?.[1] : undefined;
  return localBearer ?? /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization') ?? '')?.[1]
    ?? new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{43})(?:;|$)`).exec(request.headers.get('Cookie') ?? '')?.[1] ?? null;
}
export async function resolveUser(request: Request, env: AuthEnv): Promise<User | null> {
  const token = sessionToken(request);
  if (!token || !env.DB) return null;
  return env.DB.prepare('SELECT u.id, u.username, u.name, u.picture, u.premium, u.news_opt_in, u.news_opt_in_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await tokenHash(token), Date.now()).first<User>();
}
export async function remaining(db: Database, user: User, now = Date.now(), limit = 3): Promise<number | null> {
  if (user.premium) return null;
  const row = await db.prepare('SELECT COUNT(*) AS n FROM daily_matches WHERE user_id=? AND wib_day=?').bind(user.id, wibDay(now)).first<{ n: number }>();
  return Math.max(0, limit - (row?.n ?? 0));
}
/** One atomic conditional insert prevents concurrent rooms exceeding the account limit. */
export async function countMatch(env: AuthEnv, userId: string | undefined, key: string, now = Date.now()): Promise<'login_required' | 'daily_limit' | null> {
  const settings = await readSettings(env, now);
  if (!userId) return settings.loginRequired ? 'login_required' : null;
  const db = env.DB!;
  const user = await db.prepare('SELECT id, name, picture, premium FROM users WHERE id=?').bind(userId).first<User>();
  if (!user) return 'login_required';
  const day = wibDay(now);
  const result = await db.prepare('INSERT OR IGNORE INTO daily_matches (user_id,wib_day,match_key) SELECT ?,?,? WHERE ?=1 OR (SELECT COUNT(*) FROM daily_matches WHERE user_id=? AND wib_day=?)<?').bind(userId, day, key, user.premium ? 1 : 0, userId, day, settings.dailyMatchLimit).run();
  if (result.meta.changes) return null;
  return await db.prepare('SELECT match_key FROM daily_matches WHERE user_id=? AND wib_day=? AND match_key=?').bind(userId, day, key).first() ? null : 'daily_limit';
}
export async function authRoute(request: Request, env: AuthEnv, cors: Record<string, string>): Promise<Response> {
  const path = new URL(request.url).pathname;
  const respond = (body: unknown, status = 200, headers = {}) => Response.json(body, { status, headers: { ...cors, 'Cache-Control': 'no-store', ...headers } });
  if (!env.DB) return respond({ message: 'Masuk belum tersedia. Coba lagi nanti.' }, 503);
  const settings = await readSettings(env);
  const allowance = async (user: User) => ({ admin: (env.ADMIN_USER_IDS ?? '').split(',').map(s => s.trim()).includes(user.id), dailyMatchLimit: settings.dailyMatchLimit, resetAt: resetAt(Date.now()), serverNow: Date.now(), remainingMatches: await remaining(env.DB!, user, Date.now(), settings.dailyMatchLimit) });
  if (request.method === 'POST' && ['/auth/google', '/auth/facebook'].includes(path)) {
    if (path.endsWith('facebook') && !settings.facebookEnabled) return respond({ message: 'Masuk pakai Facebook belum tersedia.' }, 404);
    let identity: Identity;
    try {
      if (Number(request.headers.get('Content-Length') ?? 0) > 20000) return respond({ message: 'Data terlalu besar. Refresh, lalu coba lagi.' }, 413);
      const raw = await request.text();
      if (raw.length > 20000) return respond({ message: 'Data terlalu besar. Refresh, lalu coba lagi.' }, 413);
      const body = JSON.parse(raw);
      if (path.endsWith('google')) {
        if (typeof body.credential !== 'string') throw new Error();
        identity = await verifyGoogle(body.credential);
      } else {
        if (typeof body.accessToken !== 'string' || body.accessToken.length > 4096) throw new Error();
        const headers = { Authorization: `Bearer ${body.accessToken}` };
        const app = await fetch('https://graph.facebook.com/v27.0/app', { headers });
        if (!app.ok || (await app.json() as { id: string }).id !== FACEBOOK_APP_ID) throw new Error();
        const profile = await fetch('https://graph.facebook.com/v27.0/me?fields=id,name,email,picture', { headers });
        const person = await profile.json() as { id: string; name: string; email?: string; picture?: { data?: { url?: string } } };
        if (!profile.ok || typeof person.id !== 'string' || typeof person.name !== 'string') throw new Error();
        identity = { sub: person.id, name: person.name, email: person.email, picture: person.picture?.data?.url };
      }
    } catch { return respond({ code: 'invalid_credential', message: 'Gagal masuk. Coba lagi.' }, 401); }
    const now = Date.now(), provider = path.endsWith('google') ? 'google' : 'facebook';
    await env.DB.prepare('INSERT INTO users (id,provider,provider_sub,name,email,picture,premium,created_at,last_seen_at) VALUES (?,?,?,?,?,?,0,?,?) ON CONFLICT(provider,provider_sub) DO UPDATE SET name=excluded.name,email=excluded.email,picture=excluded.picture,last_seen_at=excluded.last_seen_at').bind(crypto.randomUUID(), provider, identity.sub, identity.name, identity.email ?? null, identity.picture ?? null, now, now).run();
    const user = (await env.DB.prepare('SELECT id,username,name,picture,premium,news_opt_in,news_opt_in_at FROM users WHERE provider=? AND provider_sub=?').bind(provider, identity.sub).first<User>())!;
    const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await env.DB.prepare('INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)').bind(await tokenHash(token), user.id, now, now + LIFETIME).run();
    const local = new URL(request.headers.get('Origin') ?? request.url).hostname === 'localhost';
    return respond({ ...user, name: user.username ?? '', username: user.username ?? null, newsOptIn: !!user.news_opt_in, currentRoom: await env.currentRoom?.(user.id) ?? null, premium: !!user.premium, ...await allowance(user), ...(local ? { token } : {}) }, 200, { 'Set-Cookie': cookie(token) });
  }
  const user = await resolveUser(request, env);
  if (request.method === 'POST' && path === '/auth/logout') {
    const token = sessionToken(request);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await tokenHash(token)).run();
    return respond({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
  }
  if (!user) return respond({ code: 'login_required', message: 'Masuk dulu.' }, 401);
  if (request.method === 'POST' && path === '/me/username') {
    if (user.username) return respond({ code: 'username_locked', message: 'Nama ini permanen dan nggak bisa diganti sendiri.' }, 409);
    const body = await request.json().catch(() => null) as { username?: unknown } | null;
    if (!validUsername(body?.username)) return respond({ code: 'invalid_username', message: typeof body?.username === 'string' && reservedUsername(body.username) ? 'Nama itu nggak boleh dipakai, coba yang lain.' : 'Nama 3–12 karakter: huruf, angka, spasi tunggal, titik, _ atau - di antara huruf/angka.' }, 400);
    const username = body.username.trim().normalize('NFC');
    try {
      const result = await env.DB.prepare('UPDATE users SET username=?,username_key=? WHERE id=? AND username IS NULL').bind(username, usernameKey(username), user.id).run();
      if (!result.meta.changes) return respond({ code: 'username_locked', message: 'Nama ini permanen dan nggak bisa diganti sendiri.' }, 409);
    } catch (error) {
      if (!String(error).includes('UNIQUE')) throw error;
      return respond({ code: 'username_taken', message: 'Nama itu udah dipakai, coba yang lain.' }, 409);
    }
    return respond({ username });
  }
  if (request.method === 'GET' && path === '/me') return respond({ ...user, name: user.username ?? '', username: user.username ?? null, newsOptIn: !!user.news_opt_in, currentRoom: await env.currentRoom?.(user.id) ?? null, premium: !!user.premium, ...await allowance(user) });
  if (request.method === 'POST' && path === '/me') {
    let body: { newsOptIn?: unknown };
    try { body = await request.json(); } catch { return respond({ message: 'Data nggak valid. Refresh, lalu coba lagi.' }, 400); }
    if (typeof body.newsOptIn !== 'boolean') return respond({ message: 'Pilihan email nggak valid. Coba lagi.' }, 400);
    await env.DB.prepare('UPDATE users SET news_opt_in=?,news_opt_in_at=? WHERE id=?').bind(body.newsOptIn ? 1 : 0, Date.now(), user.id).run();
    return respond({ ok: true });
  }
  if (request.method === 'DELETE' && path === '/me') {
    await env.DB.batch(['DELETE FROM sessions WHERE user_id=?', 'DELETE FROM daily_matches WHERE user_id=?', 'DELETE FROM account_rooms WHERE user_id=?', 'DELETE FROM users WHERE id=?'].map(sql => env.DB!.prepare(sql).bind(user.id)));
    return respond({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
  }
  return respond({ message: 'Nggak ketemu.' }, 404);
}
