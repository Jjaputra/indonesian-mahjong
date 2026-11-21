import { SEAT_ORDER } from '../src/core/tiles';
import type { Seat } from '../src/core/types';
import { TableSession, type SerializedSession, type HandSeed } from '../src/session';
import { DEFAULT_SETTINGS } from '../src/storage';
import { DEFAULT_ROOM_CONFIG, REACTIONS, MAX_SPECTATORS, NAME_MAX_LENGTH, normalizeName, type SeatDice, type RoomConfig, type RoomInfo, type ServerMessage, type ErrorCode, type ClientMessage } from '../src/net/protocol';

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
  lastReaction?: number;
}
export interface RoomData {
  code: string;
  creatorUserId?: string;
  matchKey?: string;
  config: RoomConfig;
  host: string | null;
  people: Record<string, { name: string; seat: Seat | null; seatedAt?: number; userId?: string; sessionHash?: string }>;
  hostOfflineAt?: number | null;
  hostTransferPending?: boolean;
  session: SerializedSession | null;
  createdAt?: number;
  lastActivity: number;
  handEndedAt: number | null;
  ready?: string[];
  takeovers?: Seat[];
  seatDice?: SeatDice | null;
  schedule: { version: number; deadline: number | null; botAt: number | null } | null;
}
export interface RoomIO {
  authorize?(socket: Socket | undefined, key?: string): Promise<'login_required' | 'daily_limit' | null>;
  now(): number;
  token(): string;
  seed(): HandSeed;
  log(message: string): void;
  put(data: RoomData): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(at: number | null): Promise<void>;
  send(socket: Socket, message: ServerMessage): void;
  close(socket: Socket): void;
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
    && Object.keys(c).length === Object.keys(DEFAULT_ROOM_CONFIG).length;
}

/** All authoritative mutations are serialized, including across asynchronous storage calls. */
export class Room {
  data: RoomData | null;
  session: TableSession | null;
  readonly sockets = new Map<string, Socket>();
  private reactionTimes = new Map<string, number>();
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private io: RoomIO, data: RoomData | null = null, sockets: Socket[] = []) {
    this.data = data ? structuredClone(data) : null;
    this.session = data?.session ? TableSession.deserialize(data.session, io.now, io.seed) : null;
    for (const socket of sockets) { this.sockets.set(socket.id, socket); if (socket.token && socket.lastReaction != null) this.reactionTimes.set(socket.token, socket.lastReaction); }
  }
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.tail.then(fn);
    this.tail = task.catch(() => {});
    return task;
  }
  create(code: string, creatorUserId?: string): Promise<boolean> {
    return this.exclusive(async () => {
      if (this.data) return false;
      this.data = { code, creatorUserId, config: { ...DEFAULT_ROOM_CONFIG }, host: null, people: {}, session: null,
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
      spectators: [...this.sockets.values()].filter(s => s.token && d.people[s.token]?.seat === null).length,
      seats: SEAT_ORDER.map(seat => {
        const entry = Object.entries(d.people).find(([, p]) => p.seat === seat);
        return { seat, name: entry?.[1].name ?? (this.session ? 'Bot' : null), bot: !!this.session && !entry,
          ready: !entry || !this.connected(entry[0]) || !!d.ready?.includes(entry[0]), takeover: !!d.takeovers?.includes(seat),
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
    if (!d.host) return (d.createdAt ?? d.lastActivity) + HOUR;
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
      if (burst < 1) { socket.burst = burst; this.io.attach(socket); this.error(socket, 'rate_limited', 'Terlalu cepat. Tunggu sebentar.'); return; }
      socket.burst = burst - 1; this.io.attach(socket);
      if (!this.data) { this.error(socket, 'room_not_found', 'Room tidak ditemukan.'); return; }
      let m: ClientMessage;
      try { if (raw.length > 16384) throw new Error(); m = JSON.parse(raw); if (!m || typeof m.type !== 'string') throw new Error(); }
      catch { this.error(socket, 'bad_message', 'Pesan tidak valid.'); return; }
      const d = this.data;
      if (m.type === 'ping') { if (socket.token) { socket.lastActivity = now; this.io.attach(socket); } this.safeSend(socket, { type: 'pong', serverNow: now }); return; }
      if (m.type === 'hello') {
        if (socket.token || typeof m.name !== 'string' || (m.token !== undefined && (typeof m.token !== 'string' || m.token.length > 128))) { this.error(socket, 'bad_message', 'Nama atau token tidak valid.'); return; }
        const name = normalizeName(m.name).slice(0, NAME_MAX_LENGTH).trimEnd();
        if (!name) { this.error(socket, 'bad_message', 'Nama wajib diisi.'); return; }
        const token = m.token && Object.hasOwn(d.people, m.token) ? m.token : this.io.token();
        const existing = d.people[token];
        // A room token can reconnect its account, never replace it with another account or anonymity.
        if (existing?.userId && existing.userId !== socket.userId) { this.error(socket, 'login_required', 'Masuk dengan akun yang terikat ke kursi ini.'); return; }
        if (existing && !existing.userId && socket.userId && d.seatDice) { this.error(socket, 'wrong_phase', 'Tunggu pertandingan dimulai sebelum menghubungkan akun.'); return; }
        if (!existing) {
          const first = d.host === null && (!d.creatorUserId || d.creatorUserId === socket.userId);
          const spectators = this.info().spectators;
          const empty = !this.session && !d.seatDice ? SEAT_ORDER.find(seat => !(d.creatorUserId && !d.host && seat === 'dong') && !Object.values(d.people).some(p => p.seat === seat)) ?? null : null;
          if (!first && !empty && (!d.config.allowSpectators || spectators >= MAX_SPECTATORS)) { this.error(socket, 'room_full', 'Penonton sudah penuh atau tidak diizinkan.'); return; }
          d.people[token] = { name: uniqueName(name, d.people, token), seat: first ? 'dong' : empty, seatedAt: now };
          if (first) d.host = token;
        } // A known token keeps its assigned name on reconnect.
        for (const old of this.sockets.values()) if (old.token === token && old.id !== socket.id) {
          this.safeSend(old, { type: 'kicked', reason: 'replaced' });
          this.sockets.delete(old.id); try { this.io.close(old); } catch { /* already closed */ }
        }
        d.people[token]!.userId ??= socket.userId; d.people[token]!.sessionHash = socket.sessionHash;
        if (!d.host && d.creatorUserId === socket.userId && socket.userId) {
          d.host = token; d.people[token]!.seat = 'dong'; d.people[token]!.seatedAt = now;
        }
        socket.token = token; socket.lastReaction = this.reactionTimes.get(token); socket.lastActivity = now; socket.seat = d.people[token]!.seat; this.io.attach(socket);
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
        this.safeSend(socket, { type: 'welcome', token, seat, host: this.isHost(token), serverNow: now, room: this.info(), name: d.people[token]!.name }); this.broadcast(true); return;
      }
      const person = socket.token ? d.people[socket.token] : undefined;
      if (!person) { this.error(socket, 'bad_message', 'Kirim hello terlebih dahulu.'); return; }
      socket.lastActivity = now; this.io.attach(socket);
      if (m.type === 'leave') {
        this.sockets.delete(socket.id);
        if (person.seat) this.session?.setConnected(person.seat, false);
        if (socket.token === d.host) { d.hostOfflineAt = now - 60001; this.handoverHost(); }
        await this.save(); this.broadcast(true); try { this.io.close(socket); } catch { /* closed */ } return;
      }
      if (m.type === 'reaction') {
        if (!person.seat) { this.error(socket, 'not_seated', 'Penonton tidak bisa mengirim reaksi.'); return; }
        if (!this.session) { this.error(socket, 'wrong_phase', 'Permainan belum dimulai.'); return; }
        if (!Number.isInteger(m.preset) || m.preset < 0 || m.preset >= REACTIONS.length || Object.keys(m).length !== 2) { this.error(socket, 'bad_message', 'Reaksi tidak valid.'); return; }
        if (now - (this.reactionTimes.get(socket.token!) ?? -Infinity) < 2000) { this.error(socket, 'rate_limited', 'Tunggu sebelum bereaksi lagi.'); return; }
        this.reactionTimes.set(socket.token!, now); socket.lastReaction = now; this.io.attach(socket);
        for (const s of this.sockets.values()) this.safeSend(s, { type: 'event', text: REACTIONS[m.preset], seat: person.seat, reaction: m.preset });
        return;
      }
      if (m.type === 'rename') {
        if (typeof m.name !== 'string' || !normalizeName(m.name)) { this.error(socket, 'bad_message', 'Nama wajib diisi.'); return; }
        person.name = uniqueName(m.name, d.people, socket.token!);
        this.handoverHost();
        d.lastActivity = now; await this.save(); this.broadcast(true); return;
      }
      if (m.type === 'resync') { this.sendState(socket, true); return; }
      if (m.type === 'rematch') {
        if (!this.isHost(socket.token)) { this.error(socket, 'not_host', 'Hanya host boleh memulai lagi.'); return; }
        if (!this.session?.viewFor(null).matchOver) { this.error(socket, 'wrong_phase', 'Pertandingan belum selesai.'); return; }
        if (!await this.authorize(socket)) return;
        d.matchKey = this.io.token();
        this.session = null; d.session = null; d.handEndedAt = null;
        d.ready = []; d.takeovers = []; d.schedule = null;
        d.seatDice = { groups: [[...SEAT_ORDER]], dice: {}, deadline: now + 15000, botAt: {}, settledAt: null };
        this.scheduleSeatBots();
        this.handoverHost();
        d.lastActivity = now; await this.save(); this.broadcast(true); return;
      }
      if (m.type === 'rollSeats') {
        if (!person.seat) { this.error(socket, 'not_seated', 'Duduk dahulu untuk bermain.'); return; }
        if (!d.seatDice || this.session || d.seatDice.settledAt !== null || d.seatDice.dice[person.seat]) { this.error(socket, 'wrong_phase', 'Tidak bisa kocok sekarang.'); return; }
        this.rollSeat(person.seat); this.resolveSeats();
        await this.save(); this.broadcast(true); return;
      }
      if (m.type === 'replaceBot') {
        if (!this.isHost(socket.token)) { this.error(socket, 'not_host', 'Hanya host boleh mengganti bot.'); return; }
        const target = Object.entries(d.people).find(([, p]) => p.seat === m.seat);
        if (!this.session || !target || this.connected(target[0]) || d.takeovers?.includes(m.seat)) { this.error(socket, 'illegal_action', 'Pemain harus offline.'); return; }
        (d.takeovers ??= []).push(m.seat); this.session.setControl(m.seat, 'bot');
        await this.save(); this.event(`${target[1].name} digantikan bot`, m.seat); this.broadcast(true); return;
      }
      if (m.type === 'ready' || (m.type === 'act' && m.action?.type === 'nextHand')) {
        if (!person.seat) { this.error(socket, 'not_seated', 'Duduk dahulu untuk melanjutkan.'); return; }
        if (!this.session || d.handEndedAt === null || this.session.viewFor(null).matchOver) { this.error(socket, 'wrong_phase', 'Hand belum selesai.'); return; }
        if (!(d.ready ??= []).includes(socket.token!)) d.ready.push(socket.token!);
        this.continueIfReady(); await this.save(); this.broadcast(true); return;
      }
      if (m.type === 'act') {
        if (!this.session) { this.error(socket, 'wrong_phase', 'Permainan belum dimulai.'); return; }
        if (!person.seat && !(this.isHost(socket.token) && m.action?.type === 'nextHand')) { this.error(socket, 'not_seated', 'Duduk dahulu untuk bermain.'); return; }
        if (!m.action || typeof m.action.type !== 'string') { this.error(socket, 'bad_message', 'Aksi tidak valid.'); return; }
        const seat = person.seat!;
        const result = this.session.apply(seat, m.action);
        if (!result.ok) { this.error(socket, result.code === 'stale_version' ? 'stale_version' : 'illegal_action', result.code === 'stale_version' ? 'Versi meja sudah berubah.' : 'Aksi tidak valid untuk keadaan meja ini.'); return; }
        this.handoverHost();
        d.lastActivity = now; await this.save(); this.broadcast(true); return;
      }
      if (this.session || d.seatDice) { this.error(socket, 'wrong_phase', 'Pengaturan hanya bisa di lobi.'); return; }
      switch (m.type) {
        case 'sit':
          if (m.seat === 'dong' && !d.host && d.creatorUserId) { this.error(socket, 'seat_taken', 'Kursi Dong disediakan untuk host pembuat room.'); return; }
          if (!SEAT_ORDER.includes(m.seat)) { this.error(socket, 'bad_message', 'Posisi tidak valid.'); return; }
          if (Object.values(d.people).some(p => p !== person && p.seat === m.seat)) { this.error(socket, 'seat_taken', 'Posisi sudah diisi.'); return; }
          person.seat = m.seat; person.seatedAt = now; break;
        case 'stand':
          if (person.seat && (!d.config.allowSpectators || this.info().spectators >= MAX_SPECTATORS)) { this.error(socket, 'room_full', 'Penonton sudah penuh atau tidak diizinkan.'); return; }
          person.seat = null; break;
        case 'config':
          if (!this.isHost(socket.token)) { this.error(socket, 'not_host', 'Hanya host boleh mengatur room.'); return; }
          if (!validConfig(m.config)) { this.error(socket, 'bad_message', 'Pengaturan room tidak valid.'); return; }
          d.config = structuredClone(m.config); break;
        case 'start': {
          if (!this.isHost(socket.token)) { this.error(socket, 'not_host', 'Hanya host boleh memulai.'); return; }
          const occupied = Object.values(d.people).filter(p => p.seat !== null);
          if (!d.config.fillWithBots && occupied.length !== 4) { this.error(socket, 'room_full', 'Perlu empat pemain untuk mulai.'); return; }
          if (!await this.authorize(socket)) return;
          d.matchKey = this.io.token();
          d.seatDice = { groups: [[...SEAT_ORDER]], dice: {}, deadline: now + 15000, botAt: {}, settledAt: null };
          this.scheduleSeatBots();
          break;
        }
        default: this.error(socket, 'bad_message', 'Pesan tidak dikenal.'); return;
      }
      socket.seat = person.seat; this.io.attach(socket);
      this.handoverHost();
      d.lastActivity = now; await this.save(); this.broadcast(true);
    });
  }
  private handoverHost(): boolean {
    const d = this.data!;
    if (!d.host || (!d.hostTransferPending && (d.hostOfflineAt == null || this.io.now() - d.hostOfflineAt <= 60000))) return false;
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
    if (socket) this.error(socket, error, error === 'login_required' ? 'Host perlu masuk. Kembali ke menu online untuk masuk.' : 'Batas 5 match hari ini tercapai. Coba lagi besok (WIB).');
    return false;
  }
  private async startMatch(): Promise<void> {
    const d = this.data!;
    const host = [...this.sockets.values()].find(s => s.token === d.host) ?? (d.host && d.people[d.host] ? { id: 'offline', ...d.people[d.host] } : undefined);
    if (!await this.authorize(host, `${d.code}:${d.createdAt}:${d.matchKey ?? d.seatDice!.deadline}`)) { d.seatDice = null; return; }
    const ranking = d.seatDice!.groups.flat();
    for (const p of Object.values(d.people)) if (p.seat) p.seat = SEAT_ORDER[ranking.indexOf(p.seat)]!;
    for (const socket of this.sockets.values()) if (socket.token) { socket.seat = d.people[socket.token]?.seat; this.io.attach(socket); }
    const occupied = Object.values(d.people).filter(p => p.seat);
    const seats = Object.fromEntries(SEAT_ORDER.map(s => [s, occupied.some(p => p.seat === s) ? 'human' : 'bot'])) as Record<Seat, 'human' | 'bot'>;
    this.session = new TableSession({ settings: { ...DEFAULT_SETTINGS, kimMode: d.config.kimMode, kimEnabled: d.config.kimMode !== 'off', minHuTay: d.config.minHuTay }, seats,
      seed: 0, handSeed: this.io.seed, now: this.io.now, botLevel: d.config.botLevel, hostSeat: d.people[d.host!]?.seat ?? 'dong', turnTimeMs: d.config.turnSeconds === null ? 1e12 : d.config.turnSeconds * 1000 });
    const snapshot = this.session.serialize(); snapshot.match.timeLimitMinutes = d.config.timeLimitMinutes;
    this.session = TableSession.deserialize(snapshot, this.io.now, this.io.seed);
    for (const [token, p] of Object.entries(d.people)) if (p.seat) this.session.setConnected(p.seat, this.connected(token));
    d.seatDice = null;
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
