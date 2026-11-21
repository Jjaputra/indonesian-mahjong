import { isRoomCode, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../src/net/protocol';

interface RoomNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
export interface Env {
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
    if (!originAllowed(origin)) return Response.json({ code: 'bad_message', message: 'Asal koneksi tidak diizinkan.' }, { status: 403 });
    const cors = { 'Access-Control-Allow-Origin': origin!, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/rooms') {
      const { success } = await env.ROOM_CREATION_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'local' });
      if (!success) return Response.json({ code: 'rate_limited', message: 'Terlalu banyak room dibuat. Coba lagi sebentar.' }, { status: 429, headers: { ...cors, 'Retry-After': '60' } });
      for (let attempt = 0; attempt < 10; attempt++) {
        const code = roomCode();
        const result = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(`https://room/create/${code}`, { method: 'POST' }));
        if (result.ok) return Response.json({ code }, { status: 201, headers: cors });
      }
      return Response.json({ code: 'server_busy', message: 'Server sibuk. Coba lagi.' }, { status: 503, headers: cors });
    }
    const match = /^\/rooms\/([^/]+)\/ws$/.exec(url.pathname);
    if (request.method === 'GET' && match && isRoomCode(match[1]!)) {
      const response = await env.ROOMS.get(env.ROOMS.idFromName(match[1]!)).fetch(request);
      if (response.status === 101) return response;
      return new Response(response.body, { status: response.status, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    return Response.json({ code: 'room_not_found', message: 'Room tidak ditemukan.' }, { status: 404, headers: cors });
  },
};

