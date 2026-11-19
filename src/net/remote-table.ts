// Client-side room state: lobby info, the latest personal SeatView, and the actions that go back to the server.
import type { Seat } from '../core/types';
import type { SeatView, SessionAction } from '../session';
import type { StorageLike } from '../storage';
import { Connection, type ConnectionStatus, type SocketLike, type Timers } from './connection';
import type { ErrorCode, RoomConfig, RoomInfo, ServerMessage } from './protocol';
import { forgetRoom, roomSocketUrl, saveRoom } from './room-store';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** An action as the UI builds it; the table stamps the view's version on send. */
export type ActionInput = DistributiveOmit<SessionAction, 'version'>;

export interface LogLine { id: number; text: string; seat?: Seat }

export interface RemoteState {
  status: ConnectionStatus;
  room: RoomInfo | null;
  /** This device's seat, or null when standing / spectating. Always as the server last said. */
  seat: Seat | null;
  /** This device holds the host token, seated or not. */
  host: boolean;
  view: SeatView | null;
  log: LogLine[];
  /** Last non-fatal server error, shown as a toast. `id` changes per error so repeats re-trigger. */
  error: { id: number; code: ErrorCode; message: string } | null;
  /** When (local clock) the current hand finished, for local hand-result presentation. Null while a hand is on. */
  handEndedAt: number | null;
  /** The server ended this session; no reconnect follows. */
  ended: 'replaced' | 'room_closed' | 'room_not_found' | null;
  /** A welcome has arrived on the current or an earlier socket. */
  joined: boolean;
}

export interface RemoteTableOptions {
  server: string;
  code: string;
  name: string;
  token?: string;
  /** The host's "Buat Room" form: sent once, right after the first welcome of a room just created. */
  initialConfig?: RoomConfig;
  storage?: StorageLike;
  socketFactory?: (url: string) => SocketLike;
  now?: () => number;
  timers?: Timers;
  pingMs?: number;
}

const MAX_LOG = 60;

export class RemoteTable {
  readonly code: string;
  private state: RemoteState = { status: 'idle', room: null, seat: null, host: false, handEndedAt: null, view: null, log: [], error: null, ended: null, joined: false };
  private readonly listeners = new Set<() => void>();
  private readonly actionListeners = new Set<(action: ActionInput) => void>();
  private readonly conn: Connection;
  private token: string | undefined;
  private endedKey: number | null = null;
  private pendingConfig: RoomConfig | undefined;
  private logSeq = 0;
  private errorSeq = 0;

  constructor(private readonly options: RemoteTableOptions) {
    this.code = options.code;
    this.token = options.token;
    this.pendingConfig = options.initialConfig;
    this.conn = new Connection({
      url: roomSocketUrl(options.server, options.code),
      hello: () => ({ token: this.token, name: this.options.name }),
      onMessage: m => this.receive(m),
      onStatus: status => this.patch({ status }),
      socketFactory: options.socketFactory,
      now: options.now,
      timers: options.timers,
      pingMs: options.pingMs,
    });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getState = (): RemoteState => this.state;
  subscribeActions(listener: (action: ActionInput) => void): () => void {
    this.actionListeners.add(listener);
    return () => { this.actionListeners.delete(listener); };
  }

  connect(): void { this.conn.connect(); }
  /** Leave the screen but keep the seat: the stored token survives. */
  disconnect(): void { this.conn.stop(); }
  /** The tab came back: resync the live socket or reconnect now. */
  onVisible(): void { this.conn.resync(); }
  resync(): void { this.conn.resync(); }

  get playerName(): string { return this.options.name; }
  now(): number { return (this.options.now ?? Date.now)(); }

  /** Server clock minus local clock, in ms. */
  get offset(): number { return this.conn.offset; }
  serverNow(): number { return this.conn.serverNow(); }
  /** The decision deadline on this device's clock, or null when the table has no time limit. */
  deadlineLocal(): number | null {
    const d = this.state.view?.deadline;
    return typeof d === 'number' ? d - this.conn.offset : null;
  }

  get isHost(): boolean { return this.state.host; }

  sit(seat: Seat): void { this.conn.send({ type: 'sit', seat }); }
  stand(): void { this.conn.send({ type: 'stand' }); }
  setConfig(config: RoomConfig): void { this.conn.send({ type: 'config', config }); }
  ready(): void { this.conn.send({ type: 'ready' }); }
  rollSeats(): void { this.conn.send({ type: 'rollSeats' }); }
  replaceBot(seat: Seat): void { this.conn.send({ type: 'replaceBot', seat }); }
  start(): void { this.conn.send({ type: 'start' }); }
  rematch(): void { this.conn.send({ type: 'rematch' }); }

  /** Send a game action stamped with the version of the view the player is looking at. */
  act(action: ActionInput): boolean {
    const view = this.state.view;
    if (!view) return false;
    const sent = this.conn.send({ type: 'act', action: { ...action, version: view.version } as SessionAction });
    if (sent) for (const listener of this.actionListeners) listener(action);
    return sent;
  }

  private receive(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.token = message.token;
        saveRoom({ code: this.code, token: message.token, name: this.options.name }, this.options.storage);
        this.patch({ seat: message.seat, host: message.host, room: message.room, joined: true, ended: null });
        if (this.pendingConfig && message.room.phase === 'lobby') {
          const config = this.pendingConfig;
          this.pendingConfig = undefined;
          this.setConfig(config);
        }
        break;
      case 'room':
        if (message.room.phase === 'seating' || message.room.phase === 'lobby') {
          this.endedKey = null;
          this.patch({ room: message.room, seat: message.seat, host: message.host, view: null, handEndedAt: null, log: [] });
        } else this.patch({ room: message.room, seat: message.seat, host: message.host });
        break;
      case 'view': {
        const matchChanged = this.state.view !== null && this.state.view.match.startedAt !== message.view.match.startedAt;
        const finished = message.view.phase === 'DRAW_SERI' || message.view.phase === 'RESOLVED_HU';
        // Stamp the end of a hand once; later views of the same finished hand keep the first time.
        const key = finished ? message.view.match.hands.length : null;
        const next: Partial<RemoteState> = { view: message.view };
        // A reconnect may miss the rematch's seating/lobby messages entirely.
        if (matchChanged) next.log = [];
        if (key !== this.endedKey || matchChanged) { this.endedKey = key; next.handEndedAt = key === null ? null : this.now(); }
        this.patch(next);
        break;
      }
      case 'event':
        this.patch({ log: [...this.state.log, { id: ++this.logSeq, text: message.text, seat: message.seat }].slice(-MAX_LOG) });
        break;
      case 'error':
        if (message.code === 'stale_version') { this.conn.resync(); break; }
        if (message.code === 'room_not_found') {
          forgetRoom(this.code, this.options.storage);
          this.conn.stop();
          this.patch({ ended: 'room_not_found' });
          break;
        }
        this.patch({ error: { id: ++this.errorSeq, code: message.code, message: message.message } });
        break;
      case 'kicked':
        // This device lost the seat: stop offering it, so reopening can't kick the other device back.
        forgetRoom(this.code, this.options.storage);
        this.patch({ ended: message.reason });
        break;
      case 'pong':
        break;
    }
  }

  private patch(next: Partial<RemoteState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of [...this.listeners]) listener();
  }
}

/** POST /rooms; resolves with the new room code. */
export async function createRoom(server: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(`${server}/rooms`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json() as { code?: unknown };
  if (typeof body.code !== 'string') throw new Error('Bad response');
  return body.code;
}
