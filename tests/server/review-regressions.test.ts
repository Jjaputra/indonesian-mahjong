import { describe, expect, it, vi } from 'vitest';
import { Room, type RoomData, type RoomIO, type Socket } from '../../server/room';
import worker, { type Env } from '../../server/router';
import { TableSession } from '../../src/session';
import { DEFAULT_SETTINGS } from '../../src/storage';
import { SEAT_ORDER } from '../../src/core/tiles';
import type { Seat, Tile } from '../../src/core/types';
import { DEFAULT_ROOM_CONFIG, type ClientMessage, type ServerMessage } from '../../src/net/protocol';

const HOUR = 3600000, DAY = HOUR * 24;
const humans = { dong: 'human', nan: 'human', xi: 'human', bei: 'human' } as const;
function harness() {
  let now = 1000, count = 0, stored: RoomData | null = null, alarm = 0;
  const frames = new Map<string, ServerMessage[]>();
  const writes = vi.fn(async (d: RoomData) => { stored = structuredClone(d); });
  const close = vi.fn(), log = vi.fn();
  const seed = vi.fn(() => 0x13579bdf + count++ * 901);
  const io: RoomIO = { now: () => now, seed, log, token: () => `t${++count}`, put: writes,
    deleteAll: async () => { stored = null; }, setAlarm: async at => { alarm = at ?? 0; },
    send: (s, m) => frames.get(s.id)!.push(structuredClone(m)), close, attach: () => {},
  };
  let room = new Room(io);
  const connect = () => { const s = { id: `s${++count}` }; frames.set(s.id, []); room.connect(s); return s; };
  const send = async (s: Socket, m: ClientMessage) => { now += 101; await room.message(s, JSON.stringify(m)); };
  const join = async () => { const s = connect(); await send(s, { type: 'hello', name: s.id }); return s; };
  return { io, frames, writes, close, log, seed, connect, send, join,
    get room() { return room; }, get stored() { return stored!; }, get alarm() { return alarm; },
    get now() { return now; }, set now(n: number) { now = n; },
    rebuild() { room = new Room(io, stored, [...room.sockets.values()]); },
    create: () => room.create('ABCDEF'),
  };
}
function rigSession(edit: (s: ReturnType<TableSession['serialize']>) => void, seats: Record<Seat, 'human' | 'bot'> = humans) {
  const s = new TableSession({ settings: { ...DEFAULT_SETTINGS }, seats, seed: 1, now: () => 1000 });
  const data = s.serialize(); edit(data); return TableSession.deserialize(data, () => 1000);
}
const tile = (value: number, id: string): Tile => ({ type: 'tong', value, id });

describe('server review regressions', () => {
  it('personalizes host/seat and resyncs only the caller without a state write', async () => {
    const h = harness(); await h.create(); const host = await h.join(); const peer = await h.join();
    expect(h.frames.get(host.id)![0]).toMatchObject({ type: 'welcome', host: true, seat: 'dong' });
    expect(h.frames.get(peer.id)![0]).toMatchObject({ type: 'welcome', host: false, seat: 'nan' });
    await h.send(host, { type: 'stand' });
    expect(h.frames.get(host.id)!.at(-1)).toMatchObject({ type: 'room', seat: null, host: true });
    await h.send(host, { type: 'start' });
    const before = h.room.session!.serialize(), writes = h.writes.mock.calls.length, peerFrames = h.frames.get(peer.id)!.length;
    const hostFrames = h.frames.get(host.id)!.length;
    await h.send(peer, { type: 'resync' });
    expect(h.frames.get(peer.id)!.slice(-2)).toMatchObject([{ type: 'room', seat: 'nan', host: false }, { type: 'view' }]);
    expect(h.frames.get(peer.id)!.at(-1)).toMatchObject({ view: { hand: h.room.session!.viewFor('nan').hand } });
    expect(h.frames.get(host.id)!).toHaveLength(hostFrames);
    expect(h.frames.get(peer.id)!.length).toBe(peerFrames + 2);
    expect(h.writes).toHaveBeenCalledTimes(writes); expect(h.room.session!.serialize()).toEqual(before);
  });
  it('uses independent private hand seeds, including across eviction without consuming a seed on load', () => {
    const handSeed = vi.fn().mockReturnValueOnce(0xdeadbeef).mockReturnValueOnce(0x12345678);
    const s = new TableSession({ settings: { ...DEFAULT_SETTINGS }, seats: humans, seed: 7, now: () => 1000, handSeed });
    expect(s.serialize().handSeed).toBe(0xdeadbeef); expect(handSeed).toHaveBeenCalledTimes(1);
    const first = s.serialize(); first.state.phase = 'DRAW_SERI'; first.decisions = [];
    const resumed = TableSession.deserialize(first, () => 1000, handSeed);
    expect(handSeed).toHaveBeenCalledTimes(1);
    expect(resumed.apply('dong', { type: 'nextHand', version: resumed.version }).ok).toBe(true);
    expect(handSeed).toHaveBeenCalledTimes(2); expect(resumed.serialize().handSeed).toBe(0x12345678);
    const expected = new TableSession({ settings: { ...DEFAULT_SETTINGS }, seats: humans, seed: 0x12345678, now: () => 1000 });
    expect(resumed.serialize().state.wall).toEqual(expected.serialize().state.wall);
    const guessed = new TableSession({ settings: { ...DEFAULT_SETTINGS }, seats: humans, seed: 0xdeadbeef + 1, now: () => 1000 });
    expect(resumed.serialize().state.wall).not.toEqual(guessed.serialize().state.wall);
    for (const viewer of [null, ...SEAT_ORDER]) {
      const frame = JSON.stringify(resumed.viewFor(viewer));
      expect(frame).not.toMatch(/seed|rngState|handIndex|"wall"/i);
      expect(frame).not.toContain(String(0xdeadbeef)); expect(frame).not.toContain(String(0x12345678));
    }
  });
  it('room start and subsequent hand use the injected source and eviction keeps the live wall', async () => {
    const h = harness(); await h.create(); const host = await h.join(); await h.send(host, { type: 'start' });
    expect(h.seed).toHaveBeenCalledTimes(1); expect(h.stored.session!.handSeed).toBe(h.seed.mock.results[0]!.value);
    const before = h.room.session!.serialize(); h.rebuild(); expect(h.seed).toHaveBeenCalledTimes(1);
    expect(h.room.session!.serialize()).toEqual(before);
    const ended = h.room.session!.serialize(); ended.state.phase = 'DRAW_SERI'; ended.decisions = [];
    h.room.session = TableSession.deserialize(ended, h.io.now, h.seed);
    await h.send(host, { type: 'act', action: { type: 'nextHand', version: h.room.session.version } });
    expect(h.seed).toHaveBeenCalledTimes(2); expect(h.stored.session!.handSeed).toBe(h.seed.mock.results[1]!.value);
  });
  it('uses every independent shuffle word rather than reducing entropy to one numeric seed', () => {
    const seed = Array.from(crypto.getRandomValues(new Uint32Array(148)));
    const other = [...seed]; other[40] = (other[40]! ^ 0x40000000) >>> 0;
    const make = (words: number[]) => new TableSession({ settings: { ...DEFAULT_SETTINGS }, seats: humans, seed: 1, now: () => 1000, handSeed: () => words });
    const s = make(seed), different = make(other);
    expect(different.serialize().state.wall).not.toEqual(s.serialize().state.wall);
    const snapshot = s.serialize();
    expect(snapshot.handSeed).toEqual(seed);
    expect(TableSession.deserialize(snapshot, () => 1000).serialize()).toEqual(snapshot);
    expect(JSON.stringify(s.viewFor(null))).not.toContain('handSeed');
    expect(make([...seed]).serialize().state.wall).toEqual(snapshot.state.wall);
  });
  it.each(['bot', 'human'] as const)('backs off failed %s decisions, including after eviction', async mode => {
    const h = harness(); await h.create(); const host = await h.join();
    if (mode === 'bot') await h.send(host, { type: 'stand' });
    await h.send(host, { type: 'start' });
    const stall = () => mode === 'bot'
      ? vi.spyOn(h.room.session!, 'stepBots').mockReturnValue(false)
      : vi.spyOn(h.room.session!, 'timeout').mockReturnValue({ ok: false, code: 'illegal_action', message: 'Gagal.' });
    const failed = stall(); const before = h.room.session!.serialize(); const writes = h.writes.mock.calls.length;
    h.now = h.alarm; await h.room.alarm();
    expect(failed).toHaveBeenCalledOnce(); expect(h.alarm).toBe(h.now + 5000); expect(h.log).toHaveBeenCalledOnce();
    expect(h.writes).toHaveBeenCalledTimes(writes); expect(h.room.session!.serialize()).toEqual(before);
    h.rebuild(); stall(); h.now = h.alarm; await h.room.alarm(); expect(h.alarm).toBe(h.now + 5000);
  });
  it.each(['natural', 'dedicated'] as const)('lets only a stranded all-Kim bot discard in %s mode, restoring the ban', mode => {
    const s = rigSession(d => {
      d.options.settings.minHuTay = 10000; d.state.rules.minHuTay = 10000;
      d.options.settings.kimMode = mode; d.state.rules.kimMode = mode;
      d.state.rules.kimDiscardAllowed = false;
      d.state.players.dong.hand = [0, 1].map(i => ({ ...tile(i + 1, `kim-${i}`), isKim: true }));
      d.state.players.dong.melds = Array.from({ length: 4 }, (_, m) => ({ type: 'pung', claimedFrom: 'nan', tiles: [0, 1, 2].map(i => tile(m + 2, `meld-${m}-${i}`)) }));
    }, { ...humans, dong: 'bot' });
    expect(s.viewFor('dong').legal!.discardableTileIds).toEqual([]);
    expect(s.apply('dong', { type: 'discard', tileId: 'kim-0', version: s.version }).ok).toBe(false);
    const rules = s.serialize().state.rules;
    expect(s.stepBots()).toBe(true); expect(s.viewFor('dong').hand).toHaveLength(1);
    expect(s.serialize().state.rules).toEqual(rules);
    expect(s.viewFor(null).pendingDiscard?.tile.id ?? s.viewFor(null).players.dong.discards.at(-1)?.id).toBe('kim-0');
  });
  it('uses a normal discard whenever one exists, preserving the Kim ban', () => {
    const s = rigSession(d => {
      d.options.settings.minHuTay = 10000; d.state.rules.minHuTay = 10000;
      d.state.players.dong.hand[0] = { ...tile(1, 'keep-kim'), isKim: true };
    }, { ...humans, dong: 'bot' });
    const rules = s.serialize().state.rules;
    expect(s.viewFor('dong').legal!.discardableTileIds.length).toBeGreaterThan(0);
    expect(s.stepBots()).toBe(true);
    expect(s.viewFor('dong').hand.some(t => t.id === 'keep-kim')).toBe(true);
    expect(s.serialize().state.rules).toEqual(rules);
  });
  it('keeps unlimited human claim prompts and legal choices, while nulling only deadlines', async () => {
    const h = harness(); await h.create(); const host = await h.join(); const peer = await h.join();
    await h.send(host, { type: 'config', config: { ...DEFAULT_ROOM_CONFIG, turnSeconds: null } });
    await h.send(host, { type: 'start' });
    const data = h.room.session!.serialize();
    data.state.players.dong.hand[13] = tile(3, 'discard');
    for (const seat of ['nan', 'xi', 'bei'] as const) data.state.players[seat].hand = Array.from({ length: 13 }, (_, i) => ({ type: 'sok', value: i % 9 + 1, id: `${seat}-${i}` }));
    data.state.players.nan.hand[0] = tile(3, 'claim-a'); data.state.players.nan.hand[1] = tile(3, 'claim-b');
    h.room.session = TableSession.deserialize(data, h.io.now, h.io.seed);
    await h.send(host, { type: 'act', action: { type: 'discard', tileId: 'discard', version: h.room.session.version } });
    const frame = h.frames.get(peer.id)!.at(-1)!;
    expect(frame.type).toBe('view'); if (frame.type !== 'view') return;
    expect(frame.view.deadline).toBeNull(); expect(frame.view.claimWindow).toEqual({ deadline: null });
    expect(frame.view.pendingDecisions).toEqual([{ seat: 'nan', kind: 'claim', deadline: null }]); expect(frame.view.legal!.canPung).toBe(true);
    const timeout = vi.spyOn(h.room.session, 'timeout'); h.now += DAY / 2; await h.room.alarm(); expect(timeout).not.toHaveBeenCalled();
    await h.send(peer, { type: 'act', action: { type: 'pass', version: h.room.session.version } });
    expect(h.room.session.viewFor(null).phase).not.toBe('CLAIM_WINDOW');
  });
  it('does not write on anonymous close and deletes unclaimed rooms in one hour despite idle sockets', async () => {
    const h = harness(); await h.create(); expect(h.alarm).toBe(h.now + HOUR);
    const s = h.connect(); await h.room.disconnect(s); expect(h.writes).toHaveBeenCalledOnce();
    const idle = h.connect(); h.rebuild(); h.now = h.alarm; await h.room.alarm();
    expect(h.room.data).toBeNull(); expect(h.close).toHaveBeenCalledWith(idle);
  });
  it('closes joined idle sockets after 24h and anonymous sockets cannot block cleanup', async () => {
    const h = harness(); await h.create(); const host = await h.join(); const anonymous = h.connect();
    const expiry = h.now + DAY; expect(h.alarm).toBe(expiry);
    h.now = expiry; await h.room.alarm(); expect(h.room.data).toBeNull();
    expect(h.close).toHaveBeenCalledWith(host); expect(h.close).toHaveBeenCalledWith(anonymous);
  });
  it('evicts individual idle peers while an active peer remains, then eventually cleans up', async () => {
    const h = harness(); await h.create(); const host = await h.join(); const peer = await h.join();
    const hostExpiry = h.now - 101 + DAY;
    h.now += DAY / 2; await h.send(peer, { type: 'ping' });
    const writes = h.writes.mock.calls.length;
    h.rebuild(); h.now = hostExpiry; await h.room.alarm();
    expect(h.close).toHaveBeenCalledWith(host); expect(h.close).not.toHaveBeenCalledWith(peer);
    expect(h.room.data).not.toBeNull(); expect(h.writes).toHaveBeenCalledTimes(writes + 1);
    h.now = h.alarm; await h.room.alarm(); expect(h.room.data).toBeNull();
  });
  it('closes an anonymous idle peer without writing while a joined peer remains active', async () => {
    const h = harness(); await h.create(); const anonymous = h.connect(); const host = await h.join();
    h.now += DAY / 2; await h.send(host, { type: 'ping' });
    const writes = h.writes.mock.calls.length;
    h.now = 1000 + DAY; await h.room.alarm();
    expect(h.close).toHaveBeenCalledWith(anonymous); expect(h.close).not.toHaveBeenCalledWith(host);
    expect(h.writes).toHaveBeenCalledTimes(writes); expect(h.room.data).not.toBeNull();
  });
  it('limits room creation by CF client IP before any DO creation and preserves CORS', async () => {
    const limit = vi.fn(async () => ({ success: false }));
    const get = vi.fn(); const env: Env = { ROOM_CREATION_LIMITER: { limit }, ROOMS: { idFromName: s => s, get } };
    const request = new Request('https://server.test/rooms', { method: 'POST', headers: { Origin: 'http://localhost:5199', 'CF-Connecting-IP': '192.0.2.4', 'X-Forwarded-For': 'spoofed' } });
    const result = await worker.fetch(request, env); expect(result.status).toBe(429);
    expect(await result.json()).toMatchObject({ code: 'rate_limited' }); expect(limit).toHaveBeenCalledWith({ key: '192.0.2.4' });
    expect(get).not.toHaveBeenCalled(); expect(result.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5199');
    expect(result.headers.get('Retry-After')).toBe('60');
  });
});
