// WebSocket client for one room: hello on every (re)connect, backoff reconnect, ping, server clock offset.
// The socket and timers are injectable so tests drive it without a network.
import type { ClientMessage, ServerMessage } from './protocol';

export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event?: { code: number }) => void) | null;
  onerror: (() => void) | null;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'stopped';

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(id: unknown): void;
}

export interface ConnectionOptions {
  url: string;
  /** Read at every connect, so a token learned from `welcome` is used on the next hello. */
  hello: () => Omit<Extract<ClientMessage, { type: 'hello' }>, 'type'>;
  onMessage: (message: ServerMessage) => void;
  onStatus: (status: ConnectionStatus) => void;
  socketFactory?: (url: string) => SocketLike;
  now?: () => number;
  timers?: Timers;
  pingMs?: number;
  onQuality?: (latencyMs: number | null, pongLate: boolean) => void;
}

export function connectionIndicator(status: ConnectionStatus, latencyMs: number | null, pongLate: boolean): { tone: 'online' | 'slow' | 'offline'; text: string } {
  if (status !== 'open') return { tone: 'offline', text: 'Terputus · menyambung ulang...' };
  const slow = pongLate || (latencyMs !== null && latencyMs > 400);
  return { tone: slow ? 'slow' : 'online', text: `${slow ? 'Sinyal lemah' : 'Online'}${pongLate || latencyMs === null ? '' : ` · ${Math.round(latencyMs)} ms`}` };
}

export const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 15000] as const;
export const backoffDelay = (attempt: number): number => BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]!;

/** Milliseconds to add to the local clock to get server time. `rttMs` halves the round trip when known. */
export const clockOffset = (serverNow: number, localNow: number, rttMs = 0): number => serverNow + rttMs / 2 - localNow;

const defaultTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id as ReturnType<typeof setTimeout>) };

export class Connection {
  status: ConnectionStatus = 'idle';
  /** Server clock minus local clock, in ms. */
  offset = 0;
  private socket: SocketLike | null = null;
  private attempt = 0;
  private retryTimer: unknown = null;
  private pingTimer: unknown = null;
  private lateTimer: unknown = null;
  private latencyMs: number | null = null;
  private pingSentAt: number | null = null;
  private readonly now: () => number;
  private readonly timers: Timers;

  constructor(private readonly options: ConnectionOptions) {
    this.now = options.now ?? Date.now;
    this.timers = options.timers ?? defaultTimers;
  }

  /** Server time as seen from this device. */
  serverNow(): number { return this.now() + this.offset; }

  connect(): void {
    if (this.status === 'stopped') return;
    this.cancelRetry();
    this.stopPing();
    this.latencyMs = null;
    this.options.onQuality?.(null, false);
    this.dropSocket();
    this.setStatus(this.attempt === 0 && this.status === 'idle' ? 'connecting' : 'reconnecting');
    const factory = this.options.socketFactory ?? (url => new WebSocket(url) as unknown as SocketLike);
    let socket: SocketLike;
    try { socket = factory(this.options.url); } catch { this.scheduleRetry(); return; }
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.send({ type: 'hello', ...this.options.hello() });
      this.startPing();
    };
    socket.onmessage = event => {
      if (this.socket !== socket) return;
      let message: ServerMessage;
      try { message = JSON.parse(String(event.data)) as ServerMessage; } catch { return; }
      this.receive(message);
    };
    socket.onclose = event => {
      if (this.socket !== socket) return;
      if (event?.code === 4001) { this.receive({ type: 'kicked', reason: 'replaced' }); return; }
      if (event?.code === 4002) { this.receive({ type: 'kicked', reason: 'room_closed' }); return; }
      if (event?.code === 4003) { this.stop(); return; }
      this.socket = null;
      this.stopPing();
      if (this.status !== 'stopped') this.scheduleRetry();
    };
    socket.onerror = () => { /* onclose follows and drives the retry */ };
  }

  send(message: ClientMessage): boolean {
    if (!this.socket) return false;
    try { this.socket.send(JSON.stringify(message)); return true; } catch { return false; }
  }

  /** Ask the server to resend room + view on the live socket, or reconnect now when there is none. */
  resync(): void {
    if (this.status === 'stopped') return;
    if (this.status === 'open' && this.socket) this.send({ type: 'resync' });
    else { this.attempt = 0; this.connect(); }
  }

  /** Explicit user action may reopen a connection stopped after replacement. */
  restart(): void { this.attempt = 0; this.setStatus('idle'); this.connect(); }

  /** Stop for good (left the room, or kicked). No further reconnects. */
  stop(): void {
    this.cancelRetry();
    this.stopPing();
    this.dropSocket();
    this.setStatus('stopped');
  }

  private receive(message: ServerMessage): void {
    if (message.type === 'welcome') {
      this.offset = clockOffset(message.serverNow, this.now());
      this.attempt = 0;
      this.setStatus('open');
      // One ping right away: its round trip refines the welcome's rough offset.
      this.ping();
    } else if (message.type === 'pong') {
      if (this.pingSentAt !== null) {
        this.latencyMs = Math.max(0, this.now() - this.pingSentAt);
        this.offset = clockOffset(message.serverNow, this.now(), this.latencyMs);
        this.options.onQuality?.(this.latencyMs, false);
      }
      this.clearLateTimer();
      this.pingSentAt = null;
    } else if (message.type === 'kicked') {
      this.options.onMessage(message);
      this.stop();
      return;
    }
    this.options.onMessage(message);
  }

  private scheduleRetry(): void {
    this.setStatus('reconnecting');
    const delay = backoffDelay(this.attempt++);
    this.retryTimer = this.timers.set(() => { this.retryTimer = null; this.connect(); }, delay);
  }

  private cancelRetry(): void {
    if (this.retryTimer !== null) { this.timers.clear(this.retryTimer); this.retryTimer = null; }
  }

  private startPing(): void {
    this.stopPing();
    const every = this.options.pingMs ?? 25000;
    const tick = () => {
      this.ping();
      this.pingTimer = this.timers.set(tick, every);
    };
    this.pingTimer = this.timers.set(tick, every);
  }

  private ping(): void {
    // Keep the oldest outstanding ping so a missing pong never looks healthy.
    if (this.pingSentAt === null) {
      this.pingSentAt = this.now();
      this.lateTimer = this.timers.set(() => {
        this.lateTimer = null;
        this.options.onQuality?.(this.latencyMs, true);
      }, 1000);
    }
    this.send({ type: 'ping' });
  }

  private clearLateTimer(): void {
    if (this.lateTimer !== null) { this.timers.clear(this.lateTimer); this.lateTimer = null; }
  }

  private stopPing(): void {
    this.clearLateTimer();
    if (this.pingTimer !== null) { this.timers.clear(this.pingTimer); this.pingTimer = null; }
    this.pingSentAt = null;
  }

  private dropSocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    try { socket.close(); } catch { /* already closed */ }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.options.onStatus(status);
  }
}
