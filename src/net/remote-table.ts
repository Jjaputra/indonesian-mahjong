import { authHeaders, authSocket, deviceLimitFallback, refreshAccount } from './auth';
// Client-side room state: lobby info, the latest personal SeatView, and the actions that go back to the server.
import type { Seat } from '../core/types';
import type { SeatView, SessionAction } from '../session';
import { saveGameRecord, type StorageLike } from '../storage';
import { Connection, type ConnectionStatus, type SocketLike, type Timers } from './connection';
import type { ReactionId, ErrorCode, RoomConfig, RoomInfo, ServerMessage } from './protocol';
import { forgetRoom, roomSocketUrl, saveRoom } from './room-store';
import { countHostedMatch, identifyHostedMatch, loadHostBoundary, saveHostBoundary, remainingMatches, type HostBoundary } from './daily-limit';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** An action as the UI builds it; the table stamps the view's version on send. */
export type ActionInput = DistributiveOmit<SessionAction, 'version'>;

export interface LogLine { id: number; text: string; seat?: Seat }

export interface RemoteState {
  status: ConnectionStatus;
  latencyMs?: number | null;
  pongLate?: boolean;
  room: RoomInfo | null;
  /** This device's seat, or null when standing / spectating. Always as the server last said. */
  seat: Seat | null;
  /** This device holds the host token, seated or not. */
  host: boolean;
  view: SeatView | null;
  log: LogLine[];
  reactions?: Partial<Record<Seat, { preset: ReactionId; at: number }>>;
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
  switchRoom?: boolean;
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
  private reclaimRequested = false;
  private switchRequested: boolean;
  private assignedName: string;
  private endedKey: number | null = null;
  private pendingConfig: RoomConfig | undefined;
  private logSeq = 0;
  private errorSeq = 0;
  private hostBoundary: HostBoundary | null = null;

  constructor(private readonly options: RemoteTableOptions) {
    this.code = options.code;
    this.switchRequested = options.switchRoom === true;
    this.assignedName = options.name;
    this.token = options.token;
    this.pendingConfig = options.initialConfig;
    this.conn = new Connection({
      url: roomSocketUrl(options.server, options.code),
      hello: () => ({ token: this.token, name: this.assignedName, ...(this.reclaimRequested ? { reclaim: true } : {}), ...(this.switchRequested ? { switchRoom: true } : {}) }),
      onMessage: m => this.receive(m),
      onStatus: status => this.patch({ status }),
      onQuality: (latencyMs, pongLate) => this.patch({ latencyMs, pongLate }),
      socketFactory: options.socketFactory ?? (url => authSocket(url) as unknown as SocketLike),
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

  get playerName(): string { return this.assignedName; }
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
  get dailyLimitStorage(): StorageLike | undefined { return this.options.storage; }

  leave(): void { this.conn.send({ type: 'leave' }); this.conn.stop(); void refreshAccount().catch(() => {}); }
  reclaim(): void { this.reclaimRequested = true; this.token = undefined; this.patch({ ended: null, joined: false }); this.conn.restart(); }
  react(preset: ReactionId): void { if (this.state.seat) this.conn.send({ type: 'reaction', preset }); }
  rename(name: string): void { this.conn.send({ type: 'rename', name }); }
  sit(seat: Seat): void { this.conn.send({ type: 'sit', seat }); }
  stand(): void { this.conn.send({ type: 'stand' }); }
  setConfig(config: RoomConfig): void { this.conn.send({ type: 'config', config }); }
  ready(): void { this.conn.send({ type: 'ready' }); }
  rollSeats(): void { this.conn.send({ type: 'rollSeats' }); }
  replaceBot(seat: Seat): void { this.conn.send({ type: 'replaceBot', seat }); }
  start(): void { if (!deviceLimitFallback() || remainingMatches(this.now(), this.options.storage) > 0) this.conn.send({ type: 'start' }); }
  rematch(): void { if (!deviceLimitFallback() || remainingMatches(this.now(), this.options.storage) > 0) this.conn.send({ type: 'rematch' }); }

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
        this.reclaimRequested = false;
        this.switchRequested = false;
        this.token = message.token;
        this.assignedName = message.name ?? this.assignedName;
        saveRoom({ code: this.code, token: message.token, name: this.assignedName }, this.options.storage);
        void refreshAccount().catch(() => {});
        this.observeRoom(message.room, message.host);
        this.patch({ seat: message.seat, host: message.host, room: message.room, joined: true, ended: null });
        if (this.pendingConfig && message.room.phase === 'lobby') {
          const config = this.pendingConfig;
          this.pendingConfig = undefined;
          this.setConfig(config);
        }
        break;
      case 'room':
        if (message.room.phase === 'finished' && this.state.room?.phase !== 'finished') void refreshAccount().catch(() => {});
        this.observeRoom(message.room, message.host);
        if (message.name) {
          this.assignedName = message.name;
          if (this.token) saveRoom({ code: this.code, token: this.token, name: message.name }, this.options.storage);
        }
        if (message.room.phase === 'seating' || message.room.phase === 'lobby') {
          this.endedKey = null;
          this.patch({ room: message.room, seat: message.seat, host: message.host, view: null, handEndedAt: null, log: [] });
        } else this.patch({ room: message.room, seat: message.seat, host: message.host });
        break;
      case 'view': {
        const boundary = this.hostBoundary;
        const identity = message.view.match?.startedAt;
        if (boundary && this.state.host && identity !== undefined &&
          (this.state.room?.phase === 'playing' || this.state.room?.phase === 'seating')) {
          if (identity >= boundary.observedAt && identity !== boundary.previousMatch) {
            if (deviceLimitFallback()) countHostedMatch(this.code, identity, this.now(), this.options.storage);
          }
          this.setHostBoundary(null);
        }
        if (deviceLimitFallback() && message.view.match) identifyHostedMatch(this.code, message.view.match.startedAt, this.now(), this.options.storage);
        if (this.state.host && this.state.room?.phase === 'finished' && identity !== undefined && this.token) {
          this.setHostBoundary({ token: this.token, observedAt: this.serverNow(), previousMatch: identity });
        }
        const matchChanged = this.state.view !== null && this.state.view.match.startedAt !== message.view.match.startedAt;
        const finished = message.view.phase === 'DRAW_SERI' || message.view.phase === 'RESOLVED_HU';
        // Stamp the end of a hand once; later views of the same finished hand keep the first time.
        const key = finished ? message.view.match.hands.length : null;
        const next: Partial<RemoteState> = { view: message.view };
        // A reconnect may miss the rematch's seating/lobby messages entirely.
        if (matchChanged) next.log = [];
        if (key !== this.endedKey || matchChanged) { this.endedKey = key; next.handEndedAt = key === null ? null : this.now(); }
        const v = message.view, last = v.lastHand;
        if (v.matchOver && this.state.seat && last) {
          saveGameRecord({ id: `online-${this.code}-${v.match.startedAt}`, timestamp: v.match.finishedAt ?? this.now(), online: true, roomCode: this.code,
            winner: last.payments.winner, winningHand: last.hand, winningTile: last.hand.find(t => t.id === last.winningTileId) ?? null,
            melds: last.melds, scoringBreakdown: last.breakdown.flatMap(b => b.id === undefined ? [] : [{ id: b.id, name: b.pattern, tay: b.tay }]),
            matchSummary: { seat: this.state.seat, koinTotal: v.match.koinTotal, tayTotal: v.match.tayTotal, handsPlayed: v.match.hands.length, huCount: v.match.huCount[this.state.seat] },
            totalTay: last.payments.totalTay, roundScore: last.payments.roundScore, kongPayments: last.payments.kongPayments,
            isWithKim: last.hand.some(t => t.isKim), winMethod: last.winMethod, ...(last.discarder ? { discarder: last.discarder } : {}),
            durationSeconds: Math.max(0, Math.round(((v.match.finishedAt ?? this.now()) - v.match.startedAt) / 1000)),
          }, this.options.storage);
        }
        this.patch(next);
        break;
      }
      case 'event':
        if (message.reaction !== undefined && message.seat) { this.patch({ reactions: { ...this.state.reactions, [message.seat]: { preset: message.reaction, at: this.now() } } }); break; }
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
        void refreshAccount().catch(() => {});
        // Preserve this device's token on replacement; only explicit reclaim may retake the seat.
        if (message.reason === 'room_closed') forgetRoom(this.code, this.options.storage);
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

  private setHostBoundary(value: HostBoundary | null): void {
    this.hostBoundary = value;
    saveHostBoundary(this.code, value, this.options.storage);
  }

  private observeRoom(room: RoomInfo, host: boolean): void {
    if (!host || !deviceLimitFallback()) { this.setHostBoundary(null); return; }
    if (!this.token) return;
    if (room.phase === 'lobby' || room.phase === 'finished') {
      this.setHostBoundary({ token: this.token, observedAt: this.serverNow(),
        previousMatch: room.phase === 'finished' ? this.state.view?.match.startedAt ?? null : null });
      return;
    }
    const boundary = loadHostBoundary(this.code, this.options.storage) ?? this.hostBoundary;
    // Being host in an active room alone is insufficient: require this same host token's prior boundary.
    this.hostBoundary = boundary?.token === this.token ? boundary : null;
    const deadline = room.seatDice?.deadline;
    if (this.hostBoundary && room.phase === 'seating' && deadline !== undefined && deadline > this.hostBoundary.observedAt) {
      if (deviceLimitFallback()) countHostedMatch(this.code, `seating:${deadline}`, this.now(), this.options.storage);
      this.setHostBoundary(null);
    }
  }
}

/** POST /rooms; resolves with the new room code. */
export async function createRoom(server: string, fetchImpl: typeof fetch = fetch, replace = false): Promise<string> {
  const res = await fetchImpl(`${server}/rooms`, { method: 'POST', credentials: 'include', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ replace }) });
  if (!res.ok) { const error = await res.json().catch(() => ({})); throw new Error(error.message ?? `HTTP ${res.status}`); }
  const body = await res.json() as { code?: unknown };
  if (typeof body.code !== 'string') throw new Error('Bad response');
  return body.code;
}
