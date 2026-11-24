import { adminRoute } from './admin';
import { readSettings, resetAt } from './settings';
import { authRoute, resolveUser, sessionToken, tokenHash, type AuthEnv } from './auth';
import { isRoomCode, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../src/net/protocol';

interface RoomNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
export interface Env extends AuthEnv {
  AUTH_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
  ROOMS: RoomNamespace;
  ROOM_CREATION_LIMITER: { limit(input: { key: string }): Promise<{ success: boolean }> };
}
export const ALLOWED_ORIGINS = [/^https:\/\/maciokyu\.com$/, /^https:\/\/www\.maciokyu\.com$/, /^https:\/\/indomahjong\.pages\.dev$/, /^https:\/\/[a-z0-9-]+\.indomahjong\.pages\.dev$/, /^http:\/\/localhost:\d+$/];
export function originAllowed(origin: string | null): boolean { return origin !== null && ALLOWED_ORIGINS.some(rule => rule.test(origin)); }
export function roomCode(): string {
  // Rejection sampling avoids modulo bias.
  let code = '';
  while (code.length < ROOM_CODE_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (const byte of bytes) if (byte < 256 - 256 % ROOM_CODE_ALPHABET.length && code.length < ROOM_CODE_LENGTH) code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
  }
  return code;
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (!originAllowed(origin)) return Response.json({ code: 'bad_message', message: 'Koneksi dari situs ini nggak diizinkan. Buka maciokyu.com.' }, { status: 403 });
    const cors = { 'Access-Control-Allow-Origin': origin!, 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/rooms/public') {
      const statement = env.DB?.prepare('SELECT code,host_name,host_premium,humans,config,updated_at FROM public_rooms WHERE updated_at>? ORDER BY updated_at DESC LIMIT 30').bind(Date.now() - 2 * 3600000);
      const rows = statement && await (statement as typeof statement & { all<T>(): Promise<{ results: T[] }> }).all<{ code: string; host_name: string; host_premium: number; humans: number; config: string; updated_at: number }>();
      return Response.json({ rooms: (rows?.results ?? []).map(r => ({ code: r.code, hostName: r.host_name, hostPremium: !!r.host_premium, humans: r.humans, config: JSON.parse(r.config), updatedAt: r.updated_at })) }, { headers: { ...cors, 'Cache-Control': 'no-store' } });
    }
    const currentRoom = async (userId: string) => {
      const row = await env.DB?.prepare('SELECT code FROM account_rooms WHERE user_id=?').bind(userId).first<{ code: string }>();
      if (!row) return null;
      const response = await env.ROOMS.get(env.ROOMS.idFromName(row.code)).fetch(new Request('https://room/account', { headers: { 'X-User-Id': userId } }));
      if (!response.ok) throw new Error('Room verification failed');
      const room = await response.json() as { code: string; phase: string } | null;
      if (!room) await env.DB!.prepare('DELETE FROM account_rooms WHERE user_id=? AND code=?').bind(userId, row.code).run();
      return room;
    };
    if (request.method === 'DELETE' && url.pathname === '/me/room') {
      const user = await resolveUser(request, env);
      if (!user) return Response.json({ code: 'login_required' }, { status: 401, headers: cors });
      const body = await request.json().catch(() => null) as { code?: unknown } | null;
      const room = await currentRoom(user.id);
      if (room && body?.code === room.code) await env.ROOMS.get(env.ROOMS.idFromName(room.code)).fetch(new Request('https://room/account', { method: 'DELETE', headers: { 'X-User-Id': user.id } }));
      return Response.json({ ok: true }, { headers: cors });
    }
    if (url.pathname.startsWith('/admin/')) return adminRoute(request, env, cors);
    const settings = await readSettings(env);
    if (request.method === 'GET' && ['/config', '/auth/config'].includes(url.pathname)) return Response.json({ ...settings, resetAt: resetAt(Date.now()), serverNow: Date.now() }, { headers: { ...cors, 'Cache-Control': 'no-store' } });
    if (url.pathname.startsWith('/auth/') || url.pathname === '/me') {
      const limiter = env.AUTH_LIMITER ?? env.ROOM_CREATION_LIMITER;
      if (!(await limiter.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'local' })).success) return Response.json({ code: 'rate_limited', message: 'Tunggu bentar, lalu coba lagi.' }, { status: 429, headers: cors });
      if (request.method === 'DELETE' && url.pathname === '/me') {
        const user = await resolveUser(request, env);
        const room = user && await currentRoom(user.id);
        if (room) await env.ROOMS.get(env.ROOMS.idFromName(room.code)).fetch(new Request('https://room/account', { method: 'DELETE', headers: { 'X-User-Id': user!.id } }));
      }
      return authRoute(request, { ...env, currentRoom }, cors);
    }
    if (request.method === 'POST' && url.pathname === '/rooms') {
      const { success } = await env.ROOM_CREATION_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'local' });
      if (!success) return Response.json({ code: 'rate_limited', message: 'Terlalu banyak room dibuat. Coba lagi bentar lagi.' }, { status: 429, headers: { ...cors, 'Retry-After': '60' } });
      const user = await resolveUser(request, env);
      if (!user && settings.loginRequired) return Response.json({ code: 'login_required', message: 'Masuk pakai Google dulu buat bikin room.' }, { status: 401, headers: cors });
      const live = user && await currentRoom(user.id);
      const body = await request.json().catch(() => null) as { replace?: unknown } | null;
      if (live && body?.replace !== true) return Response.json({ code: 'current_room', currentRoom: live, message: `Kamu masih punya room ${live.code}.` }, { status: 409, headers: cors });
      for (let attempt = 0; attempt < 10; attempt++) {
        const code = roomCode();
        const result = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(`https://room/create/${code}`, { method: 'POST', headers: user ? { 'X-User-Id': user.id } : {} }));
        if (result.ok) {
          if (live) {
            const leave = await env.ROOMS.get(env.ROOMS.idFromName(live.code)).fetch(new Request('https://room/account', { method: 'DELETE', headers: { 'X-User-Id': user!.id } }));
            if (!leave.ok) throw new Error('Room leave failed');
          }
          return Response.json({ code }, { status: 201, headers: cors });
        }
      }
      return Response.json({ code: 'server_busy', message: 'Server lagi sibuk. Coba lagi bentar lagi.' }, { status: 503, headers: cors });
    }
    const match = /^\/rooms\/([^/]+)\/ws$/.exec(url.pathname);
    if (request.method === 'GET' && match && isRoomCode(match[1]!)) {
      const user = await resolveUser(request, env);
      const headers = new Headers(request.headers);
      headers.delete('X-User-Id'); headers.delete('X-Session-Hash');
      if (user) { headers.set('X-User-Id', user.id); headers.set('X-Session-Hash', await tokenHash(sessionToken(request)!)); }
      const response = await env.ROOMS.get(env.ROOMS.idFromName(match[1]!)).fetch(new Request(request, { headers }));
      if (response.status === 101) return response;
      return new Response(response.body, { status: response.status, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    return Response.json({ code: 'room_not_found', message: 'Room nggak ketemu. Cek lagi kodenya atau minta link baru.' }, { status: 404, headers: cors });
  },
};

