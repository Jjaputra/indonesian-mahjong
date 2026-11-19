import { SEAT_ORDER } from '../src/core/tiles';
import type { Seat } from '../src/core/types';
import { TableSession, type SerializedSession, type HandSeed } from '../src/session';
import { DEFAULT_SETTINGS } from '../src/storage';
import { DEFAULT_ROOM_CONFIG, MAX_SPECTATORS, NAME_MAX_LENGTH, type SeatDice, type RoomConfig, type RoomInfo, type ServerMessage, type ErrorCode, type ClientMessage } from '../src/net/protocol';

const RATE_BURST = 10;

export interface Socket {
  id: string;
  token?: string;
  seat?: Seat | null;
  lastMessage?: number;
  /** Token bucket for the per-socket rate limit; refilled from lastMessage. */
  burst?: number;
  lastActivity?: number;
}
export interface RoomData {
  code: string;
  config: RoomConfig;
  host: string | null;
  people: Record<string, { name: string; seat: Seat | null }>;
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
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private io: RoomIO, data: RoomData | null = null, sockets: Socket[] = []) {
    this.data = data ? structuredClone(data) : null;
    this.session = data?.session ? TableSession.deserialize(data.session, io.now, io.seed) : null;
    for (const socket of sockets) this.sockets.set(socket.id, socket);
  }
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.tail.then(fn);
    this.tail = task.catch(() => {});
    return task;
  }
  create(code: string): Promise<boolean> {
    return this.exclusive(async () => {
      if (this.data) return false;
      this.data = { code, config: { ...DEFAULT_ROOM_CONFIG }, host: null, people: {}, session: null,
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
  info(): RoomInfo {
    const d = this.data!;
    return { code: d.code, config: structuredClone(d.config), seatDice: structuredClone(d.seatDice ?? null), continueAt: d.handEndedAt !== null && !this.session?.viewFor(null).matchOver ? d.handEndedAt + 120000 : null,
      phase: d.seatDice && !this.session ? 'seating' : !this.session ? 'lobby' : this.session.viewFor(null).matchOver ? 'finished' : 'playing',
      spectators: [...this.sockets.values()].filter(s => s.token && d.people[s.token]?.seat === null).length,
      seats: SEAT_ORDER.map(seat => {
        const entry = Object.entries(d.people).find(([, p]) => p.seat === seat);
        return { seat, name: entry?.[1].name ?? (this.session ? 'Bot' : null), bot: !!this.session && !entry,
          ready: !entry || !this.connected(entry[0]) || !!d.ready?.includes(entry[0]), takeover: !!d.takeovers?.includes(seat),
          connected: entry ? this.connected(entry[0]) : false, host: !!entry && entry[0] === d.host };
      }) };
  }
  private sendState(socket: Socket, lobby: boolean): void {
    if (!socket.token) return;
    const seat = this.data!.people[socket.token]?.seat ?? null;
    if (lobby) this.safeSend(socket, { type: 'room', room: this.info(), seat, host: socket.token === this.data!.host });
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
    const d = this.data!;
    const dice = d.seatDice;
    const diceTimes = dice && !this.session ? dice.settledAt !== null ? [dice.settledAt + 3000] : [dice.deadline, ...Object.values(dice.botAt)] : [];
    const waiting = Object.entries(d.people).some(([token, p]) => p.seat && this.connected(token) && !d.ready?.includes(token));
    const continueAt = d.handEndedAt !== null && !this.session?.viewFor(null).matchOver ? d.handEndedAt + (waiting ? 120000 : 1) : null;
    const candidates = [...diceTimes, continueAt, d.schedule?.deadline, d.schedule?.botAt, this.cleanupAt(), ...[...this.sockets.values()].map(s => (s.lastActivity ?? d.lastActivity) + DAY)].filter((n): n is number => n != null);
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
        const name = m.name.trim().slice(0, NAME_MAX_LENGTH);
        if (!name) { this.error(socket, 'bad_message', 'Nama wajib diisi.'); return; }
        const token = m.token && Object.hasOwn(d.people, m.token) ? m.token : this.io.token();
        if (!d.people[token]) {
          const first = d.host === null;
          const spectators = this.info().spectators;
          const empty = !this.session && !d.seatDice ? SEAT_ORDER.find(seat => !Object.values(d.people).some(p => p.seat === seat)) ?? null : null;
          if (!first && !empty && (!d.config.allowSpectators || spectators >= MAX_SPECTATORS)) { this.error(socket, 'room_full', 'Penonton sudah penuh atau tidak diizinkan.'); return; }
          d.people[token] = { name, seat: first ? 'dong' : empty };
          if (first) d.host = token;
        } else d.people[token]!.name = name;
        for (const old of this.sockets.values()) if (old.token === token && old.id !== socket.id) {
          this.safeSend(old, { type: 'kicked', reason: 'replaced' });
          this.sockets.delete(old.id); try { this.io.close(old); } catch { /* already closed */ }
        }
        socket.token = token; socket.lastActivity = now; socket.seat = d.people[token]!.seat; this.io.attach(socket);
        const seat = d.people[token]!.seat;
        if (seat) {
          this.session?.setConnected(seat, true);
          if (d.takeovers?.includes(seat)) {
            d.takeovers = d.takeovers.filter(s => s !== seat);
            this.session?.setControl(seat, 'human');
            this.event(`${name} kembali`, seat);
          }
        }
        d.lastActivity = now; await this.save();
        this.safeSend(socket, { type: 'welcome', token, seat, host: token === d.host, serverNow: now, room: this.info() }); this.broadcast(true); return;
      }
      const person = socket.token ? d.people[socket.token] : undefined;
      if (!person) { this.error(socket, 'bad_message', 'Kirim hello terlebih dahulu.'); return; }
      socket.lastActivity = now; this.io.attach(socket);
      if (m.type === 'resync') { this.sendState(socket, true); return; }
      if (m.type === 'rollSeats') {
        if (!person.seat) { this.error(socket, 'not_seated', 'Duduk dahulu untuk bermain.'); return; }
        if (!d.seatDice || this.session || d.seatDice.settledAt !== null || d.seatDice.dice[person.seat]) { this.error(socket, 'wrong_phase', 'Tidak bisa kocok sekarang.'); return; }
        this.rollSeat(person.seat); this.resolveSeats();
        await this.save(); this.broadcast(true); return;
      }
      if (m.type === 'replaceBot') {
        if (socket.token !== d.host) { this.error(socket, 'not_host', 'Hanya host boleh mengganti bot.'); return; }
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
        if (!person.seat && !(socket.token === d.host && m.action?.type === 'nextHand')) { this.error(socket, 'not_seated', 'Duduk dahulu untuk bermain.'); return; }
        if (!m.action || typeof m.action.type !== 'string') { this.error(socket, 'bad_message', 'Aksi tidak valid.'); return; }
        const seat = person.seat!;
        const result = this.session.apply(seat, m.action);
        if (!result.ok) { this.error(socket, result.code === 'stale_version' ? 'stale_version' : 'illegal_action', result.code === 'stale_version' ? 'Versi meja sudah berubah.' : 'Aksi tidak valid untuk keadaan meja ini.'); return; }
        d.lastActivity = now; await this.save(); this.broadcast(true); return;
      }
      if (this.session || d.seatDice) { this.error(socket, 'wrong_phase', 'Pengaturan hanya bisa di lobi.'); return; }
      switch (m.type) {
        case 'sit':
          if (!SEAT_ORDER.includes(m.seat)) { this.error(socket, 'bad_message', 'Posisi tidak valid.'); return; }
          if (Object.values(d.people).some(p => p !== person && p.seat === m.seat)) { this.error(socket, 'seat_taken', 'Posisi sudah diisi.'); return; }
          person.seat = m.seat; break;
        case 'stand':
          if (person.seat && (!d.config.allowSpectators || this.info().spectators >= MAX_SPECTATORS)) { this.error(socket, 'room_full', 'Penonton sudah penuh atau tidak diizinkan.'); return; }
          person.seat = null; break;
        case 'config':
          if (socket.token !== d.host) { this.error(socket, 'not_host', 'Hanya host boleh mengatur room.'); return; }
          if (!validConfig(m.config)) { this.error(socket, 'bad_message', 'Pengaturan room tidak valid.'); return; }
          d.config = structuredClone(m.config); break;
        case 'start': {
          if (socket.token !== d.host) { this.error(socket, 'not_host', 'Hanya host boleh memulai.'); return; }
          const occupied = Object.values(d.people).filter(p => p.seat !== null);
          if (!d.config.fillWithBots && occupied.length !== 4) { this.error(socket, 'room_full', 'Perlu empat pemain untuk mulai.'); return; }
          d.seatDice = { groups: [[...SEAT_ORDER]], dice: {}, deadline: now + 15000, botAt: {}, settledAt: null };
          this.scheduleSeatBots();
          break;
        }
        default: this.error(socket, 'bad_message', 'Pesan tidak dikenal.'); return;
      }
      socket.seat = person.seat; this.io.attach(socket);
      d.lastActivity = now; await this.save(); this.broadcast(true);
    });
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
  private startMatch(): void {
    const d = this.data!;
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
      let changed = false;
      const dice = d.seatDice;
      if (dice && !this.session) {
        if (dice.settledAt !== null && this.io.now() >= dice.settledAt + 3000) { this.startMatch(); changed = true; }
        else if (dice.settledAt === null) {
          for (const seat of dice.groups.flat()) if (!dice.dice[seat] && (this.io.now() >= dice.deadline || (dice.botAt[seat] ?? Infinity) <= this.io.now())) { this.rollSeat(seat); changed = true; }
          if (changed) this.resolveSeats();
        }
      }
      if (this.continueIfReady()) changed = true;
      const schedule = d.schedule;
      if (this.session && schedule?.version === this.session.version) {
        if (d.config.turnSeconds !== null && schedule.deadline !== null && schedule.deadline <= this.io.now()) {
          const due = this.session.pendingDecisions().find(p => p.deadline === schedule.deadline && this.session!.serialize().options.seats[p.seat] === 'human');
          if (due) changed = this.session.timeout(due.seat).ok;
        }
        if (!changed && schedule.botAt !== null && schedule.botAt <= this.io.now()) changed = this.session.stepBots();
      }
      if (changed || presenceChanged) { await this.save(); this.broadcast(true); }
      else await this.scheduleAlarm();
    });
  }
}
