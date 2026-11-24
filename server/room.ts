import { SEAT_ORDER } from '../src/core/tiles';
import type { Seat } from '../src/core/types';
import { TableSession, type SerializedSession, type HandSeed } from '../src/session';
import { DEFAULT_SETTINGS, practiceScoringSettings } from '../src/storage';
import { DEFAULT_ROOM_CONFIG, REACTIONS, MAX_SPECTATORS, NAME_MAX_LENGTH, CHAT_MAX_LENGTH, CHAT_HISTORY, CHAT_INTERVAL_MS, normalizeName, normalizeChat, type ChatLine, type SeatDice, type RoomConfig, type RoomInfo, type ServerMessage, type ErrorCode, type ClientMessage } from '../src/net/protocol';

const RATE_BURST = 10;

function uniqueName(name: string, people: RoomData['people'], ownToken: string): string {
  const base = normalizeName(name).slice(0, NAME_MAX_LENGTH).trimEnd();
  const used = new Set(Object.entries(people).filter(([token]) => token !== ownToken).map(([, p]) => normalizeName(p.name).toLowerCase()));
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    const suffix = ` ${n}`;
    candidate = base.slice(0, NAME_MAX_LENGTH - suffix.length).trimEnd() + suffix;
  }
  return candidate;
}

export interface Socket {
  id: string;
  token?: string;
  userId?: string;
  sessionHash?: string;
  seat?: Seat | null;
  lastMessage?: number;
  /** Token bucket for the per-socket rate limit; refilled from lastMessage. */
  burst?: number;
  lastActivity?: number;
  /** When this person last sent a chat line or reaction; survives reconnects through the attachment. */
  lastReaction?: number;
}
export interface RoomData {
  code: string;
  creatorUserId?: string;
  creatorPending?: boolean;
  matchKey?: string;
  matchNames?: Record<Seat, string>;
  config: RoomConfig;
  host: string | null;
  kickedTokens?: string[];
  kickedUsers?: string[];
  people: Record<string, { name: string; seat: Seat | null; seatedAt?: number; userId?: string; sessionHash?: string; premium?: boolean }>;
  hostOfflineAt?: number | null;
  hostTransferPending?: boolean;
  session: SerializedSession | null;
  createdAt?: number;
  lastActivity: number;
  handEndedAt: number | null;
  ready?: string[];
  takeovers?: Seat[];
  /** The last CHAT_HISTORY chat lines. Persisted with the room, never in D1 or logs, gone with the room. */
  chat?: ChatLine[];
  seatDice?: SeatDice | null;
  schedule: { version: number; deadline: number | null; botAt: number | null } | null;
}
export interface RoomIO {
  /** The verified account's username; null when it has none yet, undefined when the session no longer verifies. */
  accountUsername?(socket: Socket): Promise<string | null | undefined>;
  accountPremium?(socket: Socket): Promise<boolean>;
  joinAccount?(userId: string, code: string, confirmed: boolean): Promise<string | null>;
  settings?(): Promise<{ dailyMatchLimit: number; discardRevealMs: number; loginRequired: boolean }>;
  loginRequired?: boolean;
  authorize?(socket: Socket | undefined, key?: string): Promise<'username_required' | 'login_required' | 'daily_limit' | null>;
  now(): number;
  token(): string;
  seed(): HandSeed;
  log(message: string): void;
  /** `chatOnly` marks a write that only added a chat line, so the adapter can skip the D1 account bookkeeping. */
  put(data: RoomData, opts?: { chatOnly?: boolean }): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(at: number | null): Promise<void>;
  send(socket: Socket, message: ServerMessage): void;
  close(socket: Socket, reason?: 'replaced' | 'room_closed' | 'reconnected' | 'kicked'): void;
  attach(socket: Socket): void;
}
const DAY = 86_400_000;
const HOUR = 3_600_000;
export function validConfig(value: unknown): value is RoomConfig {
  if (!value || typeof value !== 'object') return false;
  const c = value as RoomConfig;
  return ['off', 'dedicated', 'natural'].includes(c.kimMode) && [0, 3, 5, 8].includes(c.minHuTay)
    && [null, 5, 10, 15, 20, 30, 60].includes(c.turnSeconds) && [null, 90].includes(c.timeLimitMinutes)
    && ['easy', 'normal', 'hard'].includes(c.botLevel)
    && ['fillWithBots', 'allowSpectators'].every(k => typeof c[k as keyof RoomConfig] === 'boolean')
    && (c.public === undefined || typeof c.public === 'boolean')
    && Object.keys(c).every(k => Object.hasOwn(DEFAULT_ROOM_CONFIG, k));
}

/** All authoritative mutations are serialized, including across asynchronous storage calls. */
/** Chat and reaction limits follow the account, so a new token or socket doesn't reset them. */
const rateKey = (s: Pick<Socket, 'userId' | 'token'>): string | undefined => s.userId ?? s.token;

export class Room {
  data: RoomData | null;
  session: TableSession | null;
  readonly sockets = new Map<string, Socket>();
  private reactionTimes = new Map<string, number>();
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private io: RoomIO, data: RoomData | null = null, sockets: Socket[] = []) {
    this.data = data ? structuredClone(data) : null;
    if (this.data) this.data.config.public ??= false;
    this.session = data?.session ? TableSession.deserialize(data.session, io.now, io.seed) : null;
    if (this.session && this.data && !this.data.matchNames) this.captureMatchNames();
    for (const socket of sockets) { this.sockets.set(socket.id, socket); const key = rateKey(socket); if (key && socket.lastReaction != null) this.reactionTimes.set(key, socket.lastReaction); }
  }
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.tail.then(fn);
    this.tail = task.catch(() => {});
    return task;
  }
  create(code: string, creatorUserId?: string): Promise<boolean> {
    return this.exclusive(async () => {
      if (this.data) return false;
      this.data = { code, creatorUserId, creatorPending: !!creatorUserId, config: { ...DEFAULT_ROOM_CONFIG }, host: null, people: {}, session: null,
        createdAt: this.io.now(), lastActivity: this.io.now(), handEndedAt: null, schedule: null };
      await this.save(); return true;
    });
  }
  connect(socket: Socket): void { socket.seat ??= null; socket.lastActivity ??= this.io.now(); this.sockets.set(socket.id, socket); }
  private safeSend(socket: Socket, message: ServerMessage): void {
    try { this.io.send(socket, message); } catch { /* A dead peer cannot roll back a committed action. */ }
  }
  private error(socket: Socket, code: ErrorCode, message: string): void { this.safeSend(socket, { type: 'error', code, message }); }
  private connected(token: string): boolean { return [...this.sockets.values()].some(s => s.token === token); }
  private isHost(token: string | undefined): boolean { return !!token && token === this.data!.host && !this.data!.hostTransferPending; }
  info(): RoomInfo {
    const d = this.data!;
    return { code: d.code, config: structuredClone(d.config), seatDice: structuredClone(d.seatDice ?? null), continueAt: d.handEndedAt !== null && !this.session?.viewFor(null).matchOver ? d.handEndedAt + 120000 : null,
      phase: d.seatDice && !this.session ? 'seating' : !this.session ? 'lobby' : this.session.viewFor(null).matchOver ? 'finished' : 'playing',
      hostName: d.host ? d.people[d.host]?.name : undefined,
      spectatorNames: Object.entries(d.people).filter(([token, p]) => p.seat === null && this.connected(token)).map(([, p]) => p.name),
      spectatorDetails: Object.entries(d.people).filter(([token, p]) => p.seat === null && this.connected(token)).map(([, p]) => ({ name: p.name, ...(p.userId && p.premium ? { premium: true } : {}) })),
      spectators: [...this.sockets.values()].filter(s => s.token && d.people[s.token]?.seat === null).length,
      seats: SEAT_ORDER.map(seat => {
        const entry = Object.entries(d.people).find(([, p]) => p.seat === seat);
        return { seat, name: (this.session?.viewFor(null).matchOver ? d.matchNames?.[seat] : null) ?? entry?.[1].name ?? (this.session ? 'Bot' : null), bot: !!this.session && !entry,
          ready: !entry || !this.connected(entry[0]) || !!d.ready?.includes(entry[0]), takeover: !!d.takeovers?.includes(seat),
          ...(entry?.[1].userId && entry[1].premium ? { premium: true } : {}),
          connected: entry ? this.connected(entry[0]) : false, host: !!entry && this.isHost(entry[0]) };
      }) };
  }
  private sendState(socket: Socket, lobby: boolean): void {
    if (!socket.token) return;
    const seat = this.data!.people[socket.token]?.seat ?? null;
    if (lobby) this.safeSend(socket, { type: 'room', room: this.info(), seat, host: this.isHost(socket.token), name: this.data!.people[socket.token]!.name });
    if (this.session) {
      const view = this.session.viewFor(seat);
      if (this.data!.config.turnSeconds === null) {
        view.deadline = null;
        view.pendingDecisions = view.pendingDecisions.map(d => ({ ...d, deadline: null }));
        if (view.claimWindow) view.claimWindow.deadline = null;
      }
      this.safeSend(socket, { type: 'view', view, serverNow: this.io.now() });
    }
  }
  private broadcast(lobby: boolean): void {
    for (const socket of this.sockets.values()) this.sendState(socket, lobby);
  }
  private cleanupAt(): number {
    const d = this.data!;
    if (!this.session && !d.matchKey && ![...this.sockets.values()].some(s => s.token) && !d.host && !Object.values(d.people).some(p => p.seat)) return (d.createdAt ?? d.lastActivity) + HOUR;
    const activity = [...this.sockets.values()].filter(s => s.token).map(s => s.lastActivity ?? d.lastActivity);
    return Math.max(d.lastActivity, ...activity) + DAY;
  }
  private async save(): Promise<void> {
    const d = this.data!;
    if (this.session) {
      this.session.resolveReveal();
      const view = this.session.viewFor(null);
      if (['RESOLVED_HU', 'DRAW_SERI'].includes(view.phase)) d.handEndedAt ??= this.io.now();
      else { d.handEndedAt = null; d.ready = []; }
      const snapshot = this.session.serialize();
      const decisions = this.session.pendingDecisions();
      const humans = decisions.filter(p => snapshot.options.seats[p.seat] === 'human');
      const deadline = d.config.turnSeconds === null || !humans.length ? null : Math.min(...humans.map(p => p.deadline));
      const botDelay = this.session.botDelay();
      const old = d.schedule;
      d.schedule = { version: this.session.version, deadline, botAt: botDelay !== null
        ? old?.version === this.session.version ? old.botAt : this.io.now() + botDelay! : null };
      d.session = snapshot;
    }
    await this.io.put(structuredClone(d));
    await this.scheduleAlarm();
  }
  private async scheduleAlarm(): Promise<void> {
    // Storage may have crossed the reveal deadline since save() took its snapshot.
    if (this.session?.resolveReveal()) { await this.save(); this.broadcast(true); return; }
    const d = this.data!;
    const dice = d.seatDice;
    const diceTimes = dice && !this.session ? dice.settledAt !== null ? [dice.settledAt + 3000] : [dice.deadline, ...Object.values(dice.botAt)] : [];
    const waiting = Object.entries(d.people).some(([token, p]) => p.seat && this.connected(token) && !d.ready?.includes(token));
    const continueAt = d.handEndedAt !== null && !this.session?.viewFor(null).matchOver ? d.handEndedAt + (waiting ? 120000 : 1) : null;
    const hostAt = !d.hostTransferPending && d.host && !this.connected(d.host) && d.hostOfflineAt != null ? d.hostOfflineAt + 60001 : null;
    const candidates = [hostAt !== null && hostAt > this.io.now() ? hostAt : null, ...diceTimes, continueAt, this.session?.revealResolutionAt(), d.schedule?.deadline, d.schedule?.botAt, this.cleanupAt(), ...[...this.sockets.values()].map(s => (s.lastActivity ?? d.lastActivity) + DAY)].filter((n): n is number => n != null);
    const earliest = Math.min(...candidates);
    if (earliest <= this.io.now()) {
      this.io.log(`Room ${d.code}: alarm overdue at version ${this.session?.version ?? 0}; retry in 5000ms`);
      await this.io.setAlarm(this.io.now() + 5000);
    } else await this.io.setAlarm(earliest);
  }
  message(socket: Socket, raw: string): Promise<void> {
    return this.exclusive(async () => {
      if (!this.sockets.has(socket.id)) return;
      const now = this.io.now();
      // About 10 messages per second, with a burst of 10 so hello + config + start right after connecting pass.
      const burst = Math.min(RATE_BURST, (socket.burst ?? RATE_BURST) + (socket.lastMessage == null ? RATE_BURST : (now - socket.lastMessage) / 100));
      socket.lastMessage = now;
      if (burst < 1) { socket.burst = burst; this.io.attach(socket); this.error(socket, 'rate_limited', 'Terlalu cepat. Tunggu bentar.'); return; }
      socket.burst = burst - 1; this.io.attach(socket);
      if (!this.data) { this.error(socket, 'room_not_found', 'Room nggak ketemu. Cek lagi kodenya atau minta link baru.'); return; }
      let m: ClientMessage;
      try { if (raw.length > 16384) throw new Error(); m = JSON.parse(raw); if (!m || typeof m.type !== 'string') throw new Error(); }
      catch { this.error(socket, 'bad_message', 'Pesannya nggak valid. Refresh halaman.'); return; }
      const d = this.data;
      if (m.type === 'ping') { if (socket.token) { socket.lastActivity = now; this.io.attach(socket); } this.safeSend(socket, { type: 'pong', serverNow: now }); return; }
      if (m.type === 'hello') {
        if ((typeof m.token === 'string' && d.kickedTokens?.includes(m.token)) || (socket.userId && d.kickedUsers?.includes(socket.userId))) {
          this.safeSend(socket, { type: 'kicked', reason: 'kicked' }); this.sockets.delete(socket.id); this.io.close(socket, 'kicked'); return;
        }
        if (socket.token || typeof m.name !== 'string' || (m.token !== undefined && (typeof m.token !== 'string' || m.token.length > 128))) { this.error(socket, 'bad_message', 'Nama atau token nggak valid. Refresh, lalu coba lagi.'); return; }
        const accountName = socket.userId && this.io.accountUsername ? await this.io.accountUsername(socket) : undefined;
        // undefined: the session behind this socket expired or the account is gone; null: signed in without a username yet.
        if (socket.userId && this.io.accountUsername && accountName === undefined) { this.error(socket, 'login_required', 'Masuk lagi pakai Google dulu.'); return; }
        const name = accountName || normalizeName(m.name).slice(0, NAME_MAX_LENGTH).trimEnd();
        const owned = socket.userId ? Object.entries(d.people).find(([, p]) => p.userId === socket.userId && p.seat) : undefined;
        // A logged-in spectator who lost the token comes back to the same unseated entry, not a new one each time.
        const watching = socket.userId && !(m.token && Object.hasOwn(d.people, m.token)) ? Object.entries(d.people).find(([, p]) => p.userId === socket.userId && !p.seat) : undefined;
        let token = owned?.[0] ?? (m.token && Object.hasOwn(d.people, m.token) ? m.token : watching?.[0] ?? this.io.token());
        const existing = d.people[token];
        const continuing = existing?.userId === socket.userId && !!this.session && !this.session.viewFor(null).matchOver;
        if (accountName === null && !continuing) { this.error(socket, 'username_required', 'Pilih nama dulu sebelum main.'); return; }
        // A known token keeps its stored name, so only a new person needs one.
        if (!name && !existing) { this.error(socket, 'bad_message', 'Isi nama dulu.'); return; }
        // A room token can reconnect its account, never replace it with another account or anonymity.
        if (existing?.userId && existing.userId !== socket.userId) { this.error(socket, 'login_required', 'Masuk pakai akun yang dipakai buat kursi ini.'); return; }
        if (existing && !existing.userId && socket.userId && d.seatDice) { this.error(socket, 'wrong_phase', 'Tunggu match mulai dulu sebelum menghubungkan akun.'); return; }
        if (!socket.userId && ((await this.io.settings?.())?.loginRequired ?? this.io.loginRequired) && !existing) { this.error(socket, 'login_required', 'Masuk pakai Google dulu buat main online.'); return; }
        if (existing?.userId && existing.seat && this.connected(token) && m.token !== token && m.reclaim !== true) {
          this.safeSend(socket, { type: 'kicked', reason: 'replaced' });
          this.sockets.delete(socket.id); this.io.close(socket, 'replaced'); return;
        }
        const first = d.host === null && !d.hostTransferPending && (!Object.values(d.people).some(p => p.seat) || d.creatorPending) && (!d.creatorUserId || d.creatorUserId === socket.userId) && !Object.values(d.people).some(p => p.seat === 'dong');
        const spectators = this.info().spectators;
        const empty = !this.session && !d.seatDice ? SEAT_ORDER.find(seat => !(d.creatorPending && seat === 'dong') && !Object.values(d.people).some(p => p.seat === seat)) ?? null : null;
        if (!existing && !first && !empty && (!d.config.allowSpectators || spectators >= MAX_SPECTATORS)) { this.error(socket, 'room_full', 'Slot penonton penuh atau penonton nggak diizinkan.'); return; }
        // Admission checks must finish before a confirmed switch can release the old room.
        // A spectator takes no seat, so watching room B never releases the seat in room A.
        if (socket.userId && (existing?.seat || first || empty)) {
          const other = await this.io.joinAccount?.(socket.userId, d.code, m.switchRoom === true);
          if (other) { this.error(socket, 'current_room', `Kamu masih duduk di room ${other}.`); return; }
        }
        if (!existing) {
          d.people[token] = { name: accountName || uniqueName(name, d.people, token), seat: first ? 'dong' : empty, seatedAt: now };
          if (first) d.host = token;
        } // A known token keeps its assigned name on reconnect.
        for (const old of this.sockets.values()) if (old.token === token && old.id !== socket.id) {
          if (m.token !== token) this.safeSend(old, { type: 'kicked', reason: 'replaced' });
          this.sockets.delete(old.id); try { this.io.close(old, m.token === token ? 'reconnected' : 'replaced'); } catch { /* already closed */ }
        }
        // Rotate only account recovery without a valid local token; old tokens cannot retake the seat.
        if (owned && m.token !== token) {
          const fresh = this.io.token();
          d.people[fresh] = d.people[token]!;
          delete d.people[token];
          if (d.host === token) d.host = fresh;
          d.ready = d.ready?.map(t => t === token ? fresh : t);
          const sent = this.reactionTimes.get(token);
          if (sent !== undefined) this.reactionTimes.set(fresh, sent);
          this.reactionTimes.delete(token);
          token = fresh;
        }
        if (accountName) {
          d.people[token]!.name = accountName;
          const seat = d.people[token]!.seat;
          if (seat && d.matchNames) d.matchNames[seat] = accountName;
        }
        d.people[token]!.userId ??= socket.userId; d.people[token]!.sessionHash = socket.sessionHash;
        d.people[token]!.premium = socket.userId && await this.io.accountPremium?.(socket) ? true : undefined;
        if (!d.host && !d.hostTransferPending && d.creatorUserId === socket.userId && socket.userId) {
          if (d.people[token]!.seat) { d.host = token; d.hostTransferPending = false; }
        }
        if (socket.userId === d.creatorUserId) d.creatorPending = false;
        socket.token = token; socket.lastReaction = this.reactionTimes.get(rateKey({ userId: socket.userId, token })!); socket.lastActivity = now; socket.seat = d.people[token]!.seat; this.io.attach(socket);
        const seat = d.people[token]!.seat;
        if (seat) {
          this.session?.setConnected(seat, true);
          if (d.takeovers?.includes(seat)) {
            d.takeovers = d.takeovers.filter(s => s !== seat);
            this.session?.setControl(seat, 'human');
            this.event(`${d.people[token]!.name} kembali`, seat);
          }
        }
        this.handoverHost();
        if (token === d.host && !d.hostTransferPending) d.hostOfflineAt = null;
        d.lastActivity = now; await this.save();
        this.safeSend(socket, { type: 'welcome', token, seat, host: this.isHost(token), serverNow: now, room: this.info(), name: d.people[token]!.name });
        this.safeSend(socket, { type: 'chatHistory', lines: structuredClone(d.chat ?? []) });
        this.broadcast(true); return;
      }
      const person = socket.token ? d.people[socket.token] : undefined;
      if (!person) { this.error(socket, 'bad_message', 'Sambungan belum siap. Refresh halaman.'); return; }
      if (socket.userId && this.io.accountUsername && ['sit', 'start', 'rematch'].includes(m.type)) {
        const username = await this.io.accountUsername(socket);
        if (username === undefined) { this.error(socket, 'login_required', 'Masuk lagi pakai Google dulu.'); return; }
        if (!username) { this.error(socket, 'username_required', 'Pilih nama dulu sebelum main.'); return; }
      }
      socket.lastActivity = now; this.io.attach(socket);
      if (m.type === 'leave') {
        this.sockets.delete(socket.id);
        if (person.seat) this.session?.setConnected(person.seat, false);
        if (socket.token === d.host) { d.hostOfflineAt = now - 60001; this.handoverHost(); }
        if (person.userId || this.session?.viewFor(null).matchOver) {
          if (person.seat) this.session?.setControl(person.seat, 'bot');
          delete d.people[socket.token!];
          if (d.host === socket.token) { d.host = null; d.hostTransferPending = true; }
        }
        await this.save(); this.broadcast(true); try { this.io.close(socket); } catch { /* closed */ } return;
      }
      if (m.type === 'reaction' || m.type === 'chat') {
        let body: Pick<ChatLine, 'text' | 'reaction'>;
        if (m.type === 'reaction') {
          if (!Number.isInteger(m.preset) || m.preset < 0 || m.preset >= REACTIONS.length || Object.keys(m).length !== 2) { this.error(socket, 'bad_message', 'Reaksinya nggak valid.'); return; }
          body = { reaction: m.preset };
        } else {
          const text = typeof m.text === 'string' ? normalizeChat(m.text) : '';
          if (Object.keys(m).length !== 2 || !text) { this.error(socket, 'bad_message', 'Tulis pesannya dulu.'); return; }
          if ([...text].length > CHAT_MAX_LENGTH) { this.error(socket, 'bad_message', `Pesan maksimal ${CHAT_MAX_LENGTH} karakter.`); return; }
          body = { text };
        }
        const key = rateKey(socket)!;
        if (now - (this.reactionTimes.get(key) ?? -Infinity) < CHAT_INTERVAL_MS) { this.error(socket, 'rate_limited', 'Pesan terlalu cepat. Tunggu bentar.'); return; }
        this.reactionTimes.set(key, now); socket.lastReaction = now; this.io.attach(socket);
        const line: ChatLine = { id: (d.chat?.at(-1)?.id ?? 0) + 1, at: now, seat: person.seat, name: (person.seat && d.matchNames?.[person.seat]) || person.name, ...body };
        d.chat = [...(d.chat ?? []), line].slice(-CHAT_HISTORY);
        await this.io.put(structuredClone(d), { chatOnly: true });
        for (const s of this.sockets.values()) if (s.token && d.people[s.token]) this.safeSend(s, { type: 'chat', line });
        return;
      }
      if (m.type === 'rename') {
        if (socket.userId) { this.error(socket, 'username_locked', 'Nama ini permanen dan nggak bisa diganti sendiri.'); return; }
        if (typeof m.name !== 'string' || !normalizeName(m.name)) { this.error(socket, 'bad_message', 'Isi nama dulu.'); return; }
        person.name = uniqueName(m.name, d.people, socket.token!);
        this.handoverHost();
        d.lastActivity = now; await this.save(); this.broadcast(true); return;
      }
      if (m.type === 'resync') { this.sendState(socket, true); return; }
      if (m.type === 'rematch') {
        if (!this.isHost(socket.token)) { this.error(socket, 'not_host', 'Cuma host yang bisa mulai lagi.'); return; }
        if (!this.session?.viewFor(null).matchOver) { this.error(socket, 'wrong_phase', 'Match belum selesai.'); return; }
        if (!person.seat) { this.error(socket, 'not_seated', 'Host harus duduk dulu buat mulai.'); return; }
        if (((await this.io.settings?.())?.loginRequired ?? this.io.loginRequired) && !socket.userId) { this.error(socket, 'login_required', 'Masuk pakai Google dulu buat Main lagi.'); return; }
        if (!await this.authorize(socket)) return;
        // Anonymous seats from before login enforcement last only through the old match.
        if (((await this.io.settings?.())?.loginRequired ?? this.io.loginRequired)) for (const [token, p] of Object.entries(d.people)) if (!p.userId) {
          for (const peer of this.sockets.values()) if (peer.token === token) {
            this.safeSend(peer, { type: 'error', code: 'login_required', message: 'Masuk pakai Google dulu buat Main lagi.' });
            this.safeSend(peer, { type: 'kicked', reason: 'room_closed' });
            this.sockets.delete(peer.id); this.io.close(peer);
          }
          delete d.people[token];
        }
        // Accounts still playing a match from before usernames pick one before the next match.
        if (this.io.accountUsername) for (const [token, p] of Object.entries(d.people)) {
          if (!p.userId || await this.io.accountUsername({ id: token, userId: p.userId, sessionHash: p.sessionHash }) !== null) continue;
          for (const peer of this.sockets.values()) if (peer.token === token) {
            this.safeSend(peer, { type: 'error', code: 'username_required', message: 'Pilih nama dulu sebelum main.' });
            this.safeSend(peer, { type: 'kicked', reason: 'room_closed' });
            this.sockets.delete(peer.id); this.io.close(peer);
          }
          delete d.people[token];
        }
        d.matchKey = this.io.token();
        d.matchNames = undefined;
        this.session = null; d.session = null; d.handEndedAt = null;
        d.ready = []; d.takeovers = []; d.schedule = null;
        d.seatDice = { groups: [[...SEAT_ORDER]], dice: {}, deadline: now + 15000, botAt: {}, settledAt: null };
        this.scheduleSeatBots();
        this.handoverHost();
        d.lastActivity = now; await this.save(); this.broadcast(true); return;
      }
      if (m.type === 'rollSeats') {
        if (!person.seat) { this.error(socket, 'not_seated', 'Duduk dulu buat ikut main.'); return; }
        if (!d.seatDice || this.session || d.seatDice.settledAt !== null || d.seatDice.dice[person.seat]) { this.error(socket, 'wrong_phase', 'Nggak bisa kocok sekarang.'); return; }
        this.rollSeat(person.seat); this.resolveSeats();
        await this.save(); this.broadcast(true); return;
      }
      if (m.type === 'replaceBot') {
        if (!this.isHost(socket.token)) { this.error(socket, 'not_host', 'Cuma host yang bisa ganti pemain dengan bot.'); return; }
        const target = Object.entries(d.people).find(([, p]) => p.seat === m.seat);
        if (!this.session || !target || this.connected(target[0]) || d.takeovers?.includes(m.seat)) { this.error(socket, 'illegal_action', 'Pemainnya harus offline dulu.'); return; }
        (d.takeovers ??= []).push(m.seat); this.session.setControl(m.seat, 'bot');
        await this.save(); this.event(`${target[1].name} digantikan bot`, m.seat); this.broadcast(true); return;
      }
      if (m.type === 'ready' || (m.type === 'act' && m.action?.type === 'nextHand')) {
        if (!person.seat) { this.error(socket, 'not_seated', 'Duduk dulu buat lanjut.'); return; }
        if (!this.session || d.handEndedAt === null || this.session.viewFor(null).matchOver) { this.error(socket, 'wrong_phase', 'Game belum selesai.'); return; }
        if (!(d.ready ??= []).includes(socket.token!)) d.ready.push(socket.token!);
        this.continueIfReady(); await this.save(); this.broadcast(true); return;
      }
      if (m.type === 'act') {
        if (!this.session) { this.error(socket, 'wrong_phase', 'Game belum mulai.'); return; }
        if (!person.seat && !(this.isHost(socket.token) && m.action?.type === 'nextHand')) { this.error(socket, 'not_seated', 'Duduk dulu buat ikut main.'); return; }
        if (!m.action || typeof m.action.type !== 'string') { this.error(socket, 'bad_message', 'Aksinya nggak valid. Coba lagi.'); return; }
        const seat = person.seat!;
        const result = this.session.apply(seat, m.action);
        if (!result.ok) { this.error(socket, result.code === 'stale_version' ? 'stale_version' : 'illegal_action', result.code === 'stale_version' ? 'Meja udah berubah. Coba lagi.' : 'Aksi ini nggak bisa dipakai sekarang.'); return; }
        this.handoverHost();
        d.lastActivity = now; await this.save(); this.broadcast(true); return;
      }
      if (this.session || d.seatDice) { this.error(socket, 'wrong_phase', 'Ini cuma bisa di lobi, sebelum match mulai.'); return; }
      switch (m.type) {
        case 'kick': {
          if (!this.isHost(socket.token)) { this.error(socket, 'not_host', 'Cuma host yang bisa keluarkan pemain.'); return; }
          const target = Object.entries(d.people).find(([, p]) => p.name === m.name);
          if (!target || target[0] === socket.token) { this.error(socket, 'bad_message', 'Pemain nggak valid.'); return; }
          (d.kickedTokens ??= []).push(target[0]);
          if (target[1].userId) (d.kickedUsers ??= []).push(target[1].userId);
          delete d.people[target[0]];
          for (const peer of this.sockets.values()) if (peer.token === target[0]) {
            this.safeSend(peer, { type: 'kicked', reason: 'kicked' }); this.sockets.delete(peer.id); try { this.io.close(peer, 'kicked'); } catch { /* already closed */ }
          }
          break;
        }
        case 'sit':
          if (person.userId) {
            const other = await this.io.joinAccount?.(person.userId, d.code, false);
            if (other) { this.error(socket, 'current_room', `Kamu masih duduk di room ${other}.`); return; }
          }
          if (((await this.io.settings?.())?.loginRequired ?? this.io.loginRequired) && !person.userId) { this.error(socket, 'login_required', 'Masuk pakai Google dulu buat duduk.'); return; }
          if (person.userId && Object.values(d.people).some(p => p !== person && p.userId === person.userId && p.seat)) { this.error(socket, 'seat_taken', 'Akun ini udah punya kursi di room ini.'); return; }
          if (m.seat === 'dong' && !d.host && d.creatorUserId) { this.error(socket, 'seat_taken', 'Kursi Dong buat host yang bikin room.'); return; }
          if (!SEAT_ORDER.includes(m.seat)) { this.error(socket, 'bad_message', 'Kursi nggak valid.'); return; }
          if (Object.values(d.people).some(p => p !== person && p.seat === m.seat)) { this.error(socket, 'seat_taken', 'Kursi udah ada yang duduk.'); return; }
          person.seat = m.seat; person.seatedAt = now; break;
        case 'stand':
          if (person.seat && (!d.config.allowSpectators || this.info().spectators >= MAX_SPECTATORS)) { this.error(socket, 'room_full', 'Slot penonton penuh atau penonton nggak diizinkan.'); return; }
          person.seat = null; break;
        case 'config':
          if (!this.isHost(socket.token)) { this.error(socket, 'not_host', 'Cuma host yang bisa ubah aturan room.'); return; }
          if (!validConfig(m.config)) { this.error(socket, 'bad_message', 'Aturan room nggak valid.'); return; }
          d.config = { ...structuredClone(m.config), public: m.config.public ?? false }; break;
        case 'start': {
          if (!this.isHost(socket.token)) { this.error(socket, 'not_host', 'Cuma host yang bisa mulai.'); return; }
          if (!person.seat) { this.error(socket, 'not_seated', 'Host harus duduk dulu buat mulai.'); return; }
          const occupied = Object.values(d.people).filter(p => p.seat !== null);
          if (!d.config.fillWithBots && occupied.length !== 4) { this.error(socket, 'room_full', 'Butuh empat pemain buat mulai.'); return; }
          if (!await this.authorize(socket)) return;
          d.matchKey = this.io.token();
          d.seatDice = { groups: [[...SEAT_ORDER]], dice: {}, deadline: now + 15000, botAt: {}, settledAt: null };
          this.scheduleSeatBots();
          break;
        }
        default: this.error(socket, 'bad_message', 'Pesan nggak dikenal. Refresh halaman.'); return;
      }
      socket.seat = person.seat; this.io.attach(socket);
      this.handoverHost();
      d.lastActivity = now; await this.save(); this.broadcast(true);
    });
  }
  private handoverHost(): boolean {
    const d = this.data!;
    if (!d.hostTransferPending && (!d.host || d.hostOfflineAt == null || this.io.now() - d.hostOfflineAt <= 60000)) return false;
    const candidate = Object.entries(d.people).filter(([token, p]) => token !== d.host && p.seat && this.connected(token))
      .sort((a, b) => (a[1].seatedAt ?? 0) - (b[1].seatedAt ?? 0))[0];
    if (!candidate) {
      const changed = !d.hostTransferPending;
      d.hostTransferPending = true;
      return changed;
    }
    d.host = candidate[0]; d.hostOfflineAt = null; d.hostTransferPending = false;
    this.session?.setHost(candidate[1].seat!);
    this.event(`${candidate[1].name} sekarang host`, candidate[1].seat!);
    return true;
  }
  private event(text: string, seat: Seat): void {
    for (const s of this.sockets.values()) this.safeSend(s, { type: 'event', text, seat });
  }
  private continueIfReady(): boolean {
    const d = this.data!;
    if (!this.session || d.handEndedAt === null || this.session.viewFor(null).matchOver) return false;
    const waiting = Object.entries(d.people).some(([token, p]) => p.seat && this.connected(token) && !d.ready?.includes(token));
    if (waiting && this.io.now() < d.handEndedAt + 120000) return false;
    return this.session.apply(this.session.serialize().options.hostSeat ?? 'dong', { type: 'nextHand', version: this.session.version }).ok;
  }
  private scheduleSeatBots(): void {
    const d = this.data!, dice = d.seatDice!;
    dice.botAt = {};
    for (const group of dice.groups) if (group.length > 1) for (const seat of group) {
      if (!Object.values(d.people).some(p => p.seat === seat)) dice.botAt[seat] = this.io.now() + 1000 + SEAT_ORDER.indexOf(seat) * 271;
    }
  }
  private rollSeat(seat: Seat): void {
    const dice = this.data!.seatDice!;
    const material = this.io.seed();
    let word = (Array.isArray(material) ? material[0]! : material) >>> 0;
    dice.dice[seat] = Array.from({ length: 3 }, (_, i) => {
      // Server entropy only; mix numeric replay seeds as well as production random words.
      word = (word + 0x6D2B79F5) | 0;
      let t = Math.imul(word ^ word >>> 15, word | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return 1 + ((Array.isArray(material) ? material[i]! : (t ^ t >>> 14) >>> 0) % 6);
    });
    delete dice.botAt[seat];
  }
  private resolveSeats(): void {
    const dice = this.data!.seatDice!;
    if (dice.groups.flat().some(seat => !dice.dice[seat])) return;
    const total = (seat: Seat) => dice.dice[seat]!.reduce((a, b) => a + b, 0);
    dice.groups = dice.groups.flatMap(group => {
      const sorted = [...group].sort((a, b) => total(b) - total(a));
      const groups: Seat[][] = [];
      for (const seat of sorted) {
        if (groups.length && total(groups.at(-1)![0]!) === total(seat)) groups.at(-1)!.push(seat);
        else groups.push([seat]);
      }
      return groups;
    });
    if (dice.groups.every(g => g.length === 1)) { dice.settledAt = this.io.now(); return; }
    for (const group of dice.groups) if (group.length > 1) for (const seat of group) delete dice.dice[seat];
    dice.deadline = this.io.now() + 15000;
    this.scheduleSeatBots();
  }
  private async authorize(socket: Socket | undefined, key?: string): Promise<boolean> {
    const error = await this.io.authorize?.(socket, key);
    if (!error) return true;
    if (socket) this.error(socket, error, error === 'username_required' ? 'Pilih nama dulu sebelum main.' : error === 'login_required' ? 'Host perlu masuk dulu. Balik ke menu, lalu Masuk pakai Google.' : `Jatah host ${(await this.io.settings?.())?.dailyMatchLimit ?? 3} match hari ini udah abis. Coba lagi setelah reset 00.00 WIB.`);
    return false;
  }
  private captureMatchNames(): void {
    const d = this.data!;
    d.matchNames = Object.fromEntries(SEAT_ORDER.map((seat, i) => [seat,
      Object.values(d.people).find(p => p.seat === seat)?.name ?? `Bot ${i + 1}`])) as Record<Seat, string>;
  }
  private async startMatch(): Promise<void> {
    const d = this.data!;
    const host = [...this.sockets.values()].find(s => s.token === d.host) ?? (d.host && d.people[d.host] ? { id: 'offline', ...d.people[d.host] } : undefined);
    if (!await this.authorize(host, `${d.code}:${d.createdAt}:${d.matchKey ?? d.seatDice!.deadline}`)) { d.seatDice = null; return; }
    const ranking = d.seatDice!.groups.flat();
    for (const p of Object.values(d.people)) if (p.seat) p.seat = SEAT_ORDER[ranking.indexOf(p.seat)]!;
    for (const socket of this.sockets.values()) if (socket.token) { socket.seat = d.people[socket.token]?.seat; this.io.attach(socket); }
    this.captureMatchNames();
    const occupied = Object.values(d.people).filter(p => p.seat);
    const seats = Object.fromEntries(SEAT_ORDER.map(s => [s, occupied.some(p => p.seat === s) ? 'human' : 'bot'])) as Record<Seat, 'human' | 'bot'>;
    this.session = new TableSession({ settings: { ...practiceScoringSettings({ ...DEFAULT_SETTINGS }), kimMode: d.config.kimMode, kimEnabled: d.config.kimMode !== 'off', minHuTay: d.config.minHuTay }, seats,
      discardRevealMs: (await this.io.settings?.())?.discardRevealMs ?? 1000, seed: 0, handSeed: this.io.seed, now: this.io.now, botLevel: d.config.botLevel, hostSeat: d.people[d.host!]?.seat ?? 'dong', turnTimeMs: d.config.turnSeconds === null ? 1e12 : d.config.turnSeconds * 1000 });
    const snapshot = this.session.serialize(); snapshot.match.timeLimitMinutes = d.config.timeLimitMinutes;
    this.session = TableSession.deserialize(snapshot, this.io.now, this.io.seed);
    for (const [token, p] of Object.entries(d.people)) if (p.seat) this.session.setConnected(p.seat, this.connected(token));
    d.seatDice = null;
  }
  leaveAccount(userId: string): Promise<void> {
    return this.exclusive(async () => {
      const d = this.data;
      if (!d) return;
      if (d.creatorUserId === userId) d.creatorPending = false;
      for (const [token, person] of Object.entries(d.people)) if (person.userId === userId) {
        for (const socket of this.sockets.values()) if (socket.token === token) {
          this.safeSend(socket, { type: 'kicked', reason: 'room_closed' });
          this.sockets.delete(socket.id); this.io.close(socket);
        }
        if (person.seat) { this.session?.setConnected(person.seat, false); this.session?.setControl(person.seat, 'bot'); }
        if (d.host === token) { d.hostOfflineAt = this.io.now() - 60001; this.handoverHost(); }
        delete d.people[token];
        if (d.host === token) { d.host = null; d.hostTransferPending = true; }
      }
      await this.save(); this.broadcast(true);
    });
  }
  disconnect(socket: Socket): Promise<void> {
    return this.exclusive(async () => {
      if (!this.sockets.delete(socket.id) || !this.data || !socket.token) return;
      const seat = socket.token ? this.data.people[socket.token]?.seat : null;
      if (seat && !this.connected(socket.token!)) this.session?.setConnected(seat, false);
      if (socket.token === this.data.host && !this.connected(socket.token)) this.data.hostOfflineAt ??= this.io.now();
      this.continueIfReady();
      this.data.lastActivity = this.io.now(); await this.save(); this.broadcast(true);
    });
  }
  alarm(): Promise<void> {
    return this.exclusive(async () => {
      const d = this.data; if (!d) return;
      if (this.io.now() >= this.cleanupAt()) {
        for (const socket of this.sockets.values()) {
          this.safeSend(socket, { type: 'kicked', reason: 'room_closed' });
          try { this.io.close(socket); } catch { /* already closed */ }
        }
        this.sockets.clear(); await this.io.deleteAll(); this.data = null; this.session = null; return;
      }
      let presenceChanged = false;
      for (const socket of this.sockets.values()) if (this.io.now() >= (socket.lastActivity ?? d.lastActivity) + DAY) {
        this.sockets.delete(socket.id);
        this.safeSend(socket, { type: 'kicked', reason: 'room_closed' });
        try { this.io.close(socket); } catch { /* already closed */ }
        const seat = socket.token ? d.people[socket.token]?.seat : null;
        if (seat) this.session?.setConnected(seat, false);
        if (socket.token) presenceChanged = true;
      }
      let changed = this.handoverHost();
      const dice = d.seatDice;
      if (dice && !this.session) {
        if (dice.settledAt !== null && this.io.now() >= dice.settledAt + 3000) { await this.startMatch(); changed = true; }
        else if (dice.settledAt === null) {
          for (const seat of dice.groups.flat()) if (!dice.dice[seat] && (this.io.now() >= dice.deadline || (dice.botAt[seat] ?? Infinity) <= this.io.now())) { this.rollSeat(seat); changed = true; }
          if (changed) this.resolveSeats();
        }
      }
      if (this.continueIfReady()) changed = true;
      if (this.session?.resolveReveal()) changed = true;
      const schedule = d.schedule;
      if (this.session && schedule?.version === this.session.version) {
        if (d.config.turnSeconds !== null && schedule.deadline !== null && schedule.deadline <= this.io.now()) {
          const due = this.session.pendingDecisions().find(p => p.deadline === schedule.deadline && this.session!.serialize().options.seats[p.seat] === 'human');
          if (due) changed = this.session.timeout(due.seat).ok;
        }
        if (!changed && schedule.botAt !== null && schedule.botAt <= this.io.now()) {
          changed = this.session.stepBots();
          // Private claim answers keep the public version; the next bot still gets its own delay.
          if (changed) d.schedule = null;
        }
      }
      if (changed || presenceChanged) { await this.save(); this.broadcast(true); }
      else await this.scheduleAlarm();
    });
  }
}
