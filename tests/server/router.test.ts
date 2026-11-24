import { it, expect } from 'vitest';
import worker, { originAllowed, roomCode, type Env } from '../../server/router';
import { isRoomCode } from '../../src/net/protocol';

it('lists public rooms with one bounded recent query, parsed config and no login', async () => {
  let reads = 0, query = '', cutoff = 0;
  const env = { DB: { prepare: (sql: string) => {
    query = sql;
    return { bind: (at: number) => {
      cutoff = at;
      return { all: async () => {
        reads++;
        return { results: [{ code: 'ABC234', host_name: 'Host', humans: 2, config: '{"public":true}', updated_at: 123 }] };
      } };
    } };
  } } } as unknown as Env;
  const response = await worker.fetch(new Request('https://worker.test/rooms/public', { headers: { Origin: 'https://maciokyu.com' } }), env);
  expect(reads).toBe(1);
  expect(query).toContain('WHERE updated_at>? ORDER BY updated_at DESC LIMIT 30');
  expect(Math.abs(cutoff - (Date.now() - 7200000))).toBeLessThan(1000);
  expect(await response.json()).toEqual({ rooms: [{ code: 'ABC234', hostName: 'Host', humans: 2, config: { public: true }, updatedAt: 123 }] });
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://maciokyu.com');
  expect((await worker.fetch(new Request('https://worker.test/rooms/public', { headers: { Origin: 'https://evil.example' } }), env)).status).toBe(403);
});

it('allows only the configured production, preview and local origins', () => {
  for (const origin of ['https://maciokyu.com', 'https://www.maciokyu.com']) expect(originAllowed(origin)).toBe(true);
  for (const origin of ['http://maciokyu.com', 'https://maciokyu.com.evil.example', 'https://www.maciokyu.com.evil.example']) expect(originAllowed(origin)).toBe(false);
  for (const origin of ['https://indomahjong.pages.dev', 'https://branch-name.indomahjong.pages.dev', 'http://localhost:5199']) expect(originAllowed(origin)).toBe(true);
  for (const origin of [null, 'https://evil.example', 'https://indomahjong.pages.dev.evil.example', 'http://indomahjong.pages.dev', 'http://localhost:5199.evil.example']) expect(originAllowed(origin)).toBe(false);
  for (let i = 0; i < 100; i++) expect(isRoomCode(roomCode())).toBe(true);
});
it('returns CORS headers for both new domain origins', async () => {
  for (const origin of ['https://maciokyu.com', 'https://www.maciokyu.com']) {
    const response = await worker.fetch(new Request('https://worker.test/rooms', { method: 'OPTIONS', headers: { Origin: origin } }), {} as Env);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
  }
});
it('creates with collision retry, forwards known WS routes and returns unknown rooms', async () => {
  let creates = 0;
  const env: Env = { LOGIN_REQUIRED: 'false', ROOM_CREATION_LIMITER: { limit: async () => ({ success: true }) }, ROOMS: { idFromName: n => n, get: () => ({ fetch: async req => {
    if (new URL(req.url).pathname.startsWith('/create/')) return new Response(null, { status: ++creates === 1 ? 409 : 201 });
    return Response.json({ code: 'room_not_found', message: 'Room tidak ditemukan.' }, { status: 404 });
  } }) } };
  const request = (path: string, method = 'GET', origin = 'http://localhost:5199') => new Request(`https://worker.test${path}`, { method, headers: { Origin: origin } });
  const result = await worker.fetch(request('/rooms', 'POST'), env);
  expect(result.status).toBe(201); expect(creates).toBe(2); expect(isRoomCode((await result.json()).code)).toBe(true);
  expect(result.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5199');
  const missing = await worker.fetch(request('/rooms/ABCDEF/ws'), env); expect(missing.status).toBe(404);
  expect(await missing.json()).toMatchObject({ code: 'room_not_found' });
  expect((await worker.fetch(request('/rooms', 'OPTIONS'), env)).status).toBe(204);
  expect((await worker.fetch(request('/rooms', 'POST', 'https://evil.example'), env)).status).toBe(403);
});
