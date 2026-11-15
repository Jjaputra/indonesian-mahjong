import { Room, type RoomData, type Socket } from './room';
export { default } from './router';


export class RoomDO implements DurableObject {
  private room!: Room;
  private peers = new Map<string, WebSocket>();
  constructor(private ctx: DurableObjectState) {
    ctx.blockConcurrencyWhile(async () => {
      const sockets: Socket[] = [];
      for (const ws of ctx.getWebSockets()) {
        const socket = ws.deserializeAttachment() as Socket;
        if (socket) { sockets.push(socket); this.peers.set(socket.id, ws); }
      }
      this.room = new Room({ now: () => Date.now(), token: () => crypto.randomUUID(),
        seed: () => Array.from(crypto.getRandomValues(new Uint32Array(148))), log: message => console.warn(message),
        put: async data => { await ctx.storage.put('room', data); }, deleteAll: () => ctx.storage.deleteAll(),
        setAlarm: async at => { if (at === null) await ctx.storage.deleteAlarm(); else await ctx.storage.setAlarm(at); },
        send: (s, m) => this.peers.get(s.id)?.send(JSON.stringify(m)),
        close: s => { this.peers.get(s.id)?.close(4001, 'Koneksi diganti.'); this.peers.delete(s.id); },
        attach: s => this.peers.get(s.id)?.serializeAttachment(s),
      }, await ctx.storage.get<RoomData>('room') ?? null, sockets);
    });
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/create/') && request.method === 'POST') {
      return new Response(null, { status: await this.room.create(url.pathname.split('/')[2]!) ? 201 : 409 });
    }
    if (!this.room.data) return Response.json({ code: 'room_not_found', message: 'Room tidak ditemukan.' }, { status: 404 });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket diperlukan.', { status: 426 });
    if (this.peers.size >= 32) return new Response('Room penuh.', { status: 429 });
    const pair = new WebSocketPair();
    const socket: Socket = { id: crypto.randomUUID(), lastActivity: Date.now() };
    this.ctx.acceptWebSocket(pair[1]); pair[1].serializeAttachment(socket);
    this.peers.set(socket.id, pair[1]); this.room.connect(socket);
    return new Response(null, { status: 101, webSocket: pair[0] });
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
