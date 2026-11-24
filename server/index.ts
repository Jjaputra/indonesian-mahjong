import { readSettings } from './settings';
import { countMatch, remaining, type User } from './auth';
import type { Env } from './router';
import { Room, type RoomData, type Socket } from './room';
export { default } from './router';


export class RoomDO implements DurableObject {
  private room!: Room;
  private accountRoomsSignature?: string;
  private publicRoomsSignature?: string;
  private peers = new Map<string, WebSocket>();
  constructor(private ctx: DurableObjectState, env: Env) {
    ctx.blockConcurrencyWhile(async () => {
      const sockets: Socket[] = [];
      for (const ws of ctx.getWebSockets()) {
        const socket = ws.deserializeAttachment() as Socket;
        if (socket) { sockets.push(socket); this.peers.set(socket.id, ws); }
      }
      const settings = await readSettings(env);
      this.room = new Room({
        settings: () => readSettings(env),
        joinAccount: async (userId, code, confirmed) => {
          const row = await env.DB?.prepare('SELECT code FROM account_rooms WHERE user_id=?').bind(userId).first<{ code: string }>();
          if (!row || row.code === code) return null;
          const other = env.ROOMS.get(env.ROOMS.idFromName(row.code));
          const headers = { 'X-User-Id': userId };
          const response = await other.fetch(new Request('https://room/account', { headers }));
          if (!response.ok) throw new Error('Room verification failed');
          if (!await response.json()) return null;
          if (!confirmed) return row.code;
          const leave = await other.fetch(new Request('https://room/account', { method: 'DELETE', headers }));
          if (!leave.ok) throw new Error('Room leave failed');
          return null;
        },
        loginRequired: settings.loginRequired,
        authorize: async (socket, key) => {
          const settings = await readSettings(env);
          let user: User | null = null;
          if (socket?.sessionHash && env.DB) user = await env.DB.prepare('SELECT u.id,u.name,u.picture,u.premium FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(socket.sessionHash, Date.now()).first<User>();
          if (!user) return settings.loginRequired || socket?.userId ? 'login_required' : null;
          if (key) return countMatch(env, user.id, key);
          return await remaining(env.DB!, user, Date.now(), settings.dailyMatchLimit) === 0 ? 'daily_limit' : null;
        }, now: () => Date.now(), token: () => crypto.randomUUID(),
        seed: () => Array.from(crypto.getRandomValues(new Uint32Array(148))), log: message => console.warn(message),
        put: async (data, opts) => {
          await ctx.storage.put('room', data);
          if (env.DB && !opts?.chatOnly) {
            const host = data.host ? data.people[data.host] : null;
            const humans = Object.values(data.people).filter(p => p.seat).length;
            const listed = data.config.public && !data.session && !data.seatDice && humans < 4 && host && !data.hostTransferPending && [...this.room.sockets.values()].some(s => s.token === data.host);
            const publicSignature = listed ? JSON.stringify([host.name, humans, data.config]) : '';
            if (publicSignature !== this.publicRoomsSignature) {
              if (listed) await env.DB.prepare('INSERT INTO public_rooms (code,host_name,humans,config,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET host_name=excluded.host_name,humans=excluded.humans,config=excluded.config,updated_at=excluded.updated_at').bind(data.code, host.name, humans, JSON.stringify(data.config), data.lastActivity).run();
              else if (this.publicRoomsSignature !== '') await env.DB.prepare('DELETE FROM public_rooms WHERE code=?').bind(data.code).run();
              this.publicRoomsSignature = publicSignature;
            }
            // Unchanged seats skip the D1 rewrite; the 10-minute bucket still rewrites now and then, so a row another room overwrote heals.
            const signature = JSON.stringify([Math.floor(Date.now() / 600_000), data.code, data.creatorPending ? data.creatorUserId ?? null : null,
              Object.values(data.people).filter(p => p.userId && p.seat).map(p => [p.userId, p.seat]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]);
            if (signature === this.accountRoomsSignature) return;
            const statements = [env.DB.prepare('DELETE FROM account_rooms WHERE code=?').bind(data.code)];
            if (data.creatorPending && data.creatorUserId)
              statements.push(env.DB.prepare('INSERT INTO account_rooms (user_id,code,seat,last_activity) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET code=excluded.code,seat=excluded.seat,last_activity=excluded.last_activity').bind(data.creatorUserId, data.code, 'dong', data.lastActivity));
            for (const p of Object.values(data.people)) if (p.userId && p.seat)
              statements.push(env.DB.prepare('INSERT INTO account_rooms (user_id,code,seat,last_activity) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET code=excluded.code,seat=excluded.seat,last_activity=excluded.last_activity').bind(p.userId, data.code, p.seat, data.lastActivity));
            await env.DB.batch(statements);
            this.accountRoomsSignature = signature;
          }
        },
        deleteAll: async () => {
          this.accountRoomsSignature = undefined;
          this.publicRoomsSignature = undefined;
          if (env.DB && this.room.data) await env.DB.prepare('DELETE FROM public_rooms WHERE code=?').bind(this.room.data.code).run();
          if (env.DB && this.room.data) await env.DB.prepare('DELETE FROM account_rooms WHERE code=?').bind(this.room.data.code).run();
          await ctx.storage.deleteAll();
        },
        setAlarm: async at => { if (at === null) await ctx.storage.deleteAlarm(); else await ctx.storage.setAlarm(at); },
        send: (s, m) => this.peers.get(s.id)?.send(JSON.stringify(m)),
        close: (s, reason) => { this.peers.get(s.id)?.close(reason === 'replaced' ? 4001 : reason === 'reconnected' ? 4003 : 4002, reason === 'replaced' ? 'Room ini dibuka di tab atau HP lain.' : reason === 'reconnected' ? 'Koneksi diperbarui.' : reason === 'kicked' ? 'Kamu dikeluarkan dari room ini.' : 'Room ditutup.'); this.peers.delete(s.id); },
        attach: s => this.peers.get(s.id)?.serializeAttachment(s),
      }, await ctx.storage.get<RoomData>('room') ?? null, sockets);
    });
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/create/') && request.method === 'POST') {
      return new Response(null, { status: await this.room.create(url.pathname.split('/')[2]!, request.headers.get('X-User-Id') ?? undefined) ? 201 : 409 });
    }
    if (url.pathname === '/account') {
      const userId = request.headers.get('X-User-Id');
      if (!userId) return new Response(null, { status: 401 });
      if (request.method === 'DELETE') await this.room.leaveAccount(userId);
      const seated = this.room.data && (Object.values(this.room.data.people).some(p => p.userId === userId && p.seat) || (this.room.data.creatorPending && this.room.data.creatorUserId === userId));
      return Response.json(seated ? { code: this.room.data!.code, phase: this.room.info().phase } : null);
    }
    if (!this.room.data) return Response.json({ code: 'room_not_found', message: 'Room nggak ketemu. Cek lagi kodenya atau minta link baru.' }, { status: 404 });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket diperlukan.', { status: 426 });
    if (this.peers.size >= 32) return new Response('Room penuh. Coba lagi nanti.', { status: 429 });
    const pair = new WebSocketPair();
    const socket: Socket = { id: crypto.randomUUID(), lastActivity: Date.now(), userId: request.headers.get('X-User-Id') ?? undefined, sessionHash: request.headers.get('X-Session-Hash') ?? undefined };
    this.ctx.acceptWebSocket(pair[1]); pair[1].serializeAttachment(socket);
    this.peers.set(socket.id, pair[1]); this.room.connect(socket);
    return new Response(null, { status: 101, webSocket: pair[0], headers: request.headers.get('Sec-WebSocket-Protocol')?.startsWith('maciokyu-auth,') ? { 'Sec-WebSocket-Protocol': 'maciokyu-auth' } : {} });
  }
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const saved = ws.deserializeAttachment() as Socket;
    const socket = this.room.sockets.get(saved.id);
    if (socket) await this.room.message(socket, typeof message === 'string' ? message : '');
  }
  async webSocketClose(ws: WebSocket): Promise<void> {
    const socket = ws.deserializeAttachment() as Socket;
    await this.room.disconnect(socket); this.peers.delete(socket.id);
  }
  async webSocketError(ws: WebSocket): Promise<void> { await this.webSocketClose(ws); }
  async alarm(): Promise<void> { await this.room.alarm(); }
}
