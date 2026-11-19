import { describe, it, expect } from 'vitest';
import { Room, validConfig, type RoomData, type Socket, type RoomIO } from '../../server/room';
import { DEFAULT_ROOM_CONFIG, type ClientMessage, type ServerMessage } from '../../src/net/protocol';
import type { HandSeed } from '../../src/session';
import { SEAT_ORDER } from '../../src/core/tiles';

function harness() {
  let now = 1000, counter = 0, alarm: number | null = null, blob: RoomData | null = null, writes = 0, alarmWrites = 0, seeds = 0;
  const frames = new Map<string, ServerMessage[]>(), closed: string[] = [];
  const seedQueue: HandSeed[] = [];
  const io: RoomIO = { seed: () => seedQueue.shift() ?? 1000 + seeds++, log: () => {}, now: () => now, token: () => `token-${++counter}`,
    put: async d => { blob = structuredClone(d); writes++; }, deleteAll: async () => { blob = null; },
    setAlarm: async at => { alarm = at; alarmWrites++; },
    send: (s, m) => { frames.get(s.id)!.push(structuredClone(m)); }, close: s => { closed.push(s.id); }, attach: () => {},
  };
  let room = new Room(io);
  const connect = () => { const s: Socket = { id: `socket-${++counter}` }; frames.set(s.id, []); room.connect(s); return s; };
  const send = async (s: Socket, m: ClientMessage) => { now += 101; await room.message(s, JSON.stringify(m)); };
  const join = async (name = 'Nama', token?: string) => { const s = connect(); await send(s, { type: 'hello', name, token }); return s; };
  return { seedQueue, get room() { return room; }, get blob() { return blob!; }, frames, closed, connect, send, join,
    get writes() { return writes; }, get alarmWrites() { return alarmWrites; }, get alarm() { return alarm; },
    get now() { return now; }, set now(n: number) { now = n; },
    rebuild: () => { room = new Room(io, blob, [...room.sockets.values()]); },
    tick: async () => { expect(alarm).not.toBeNull(); now = alarm!; await room.alarm(); },
    create: () => room.create('ABCDEF'),
  };
}
const errors = (h: ReturnType<typeof harness>, s: Socket) => h.frames.get(s.id)!.filter(m => m.type === 'error');
async function botRoom() {
  const h = harness(); await h.create(); const host = await h.join();
  await h.send(host, { type: 'stand' }); await h.send(host, { type: 'start' }); await finishSeating(h); return { h, host };
}

async function finishSeating(h: ReturnType<typeof harness>) {
  if (!h.room.data?.seatDice) return;
  h.room.data.seatDice = { groups: SEAT_ORDER.map(s => [s]), dice: { dong: [6,6,6], nan: [5,5,5], xi: [4,4,4], bei: [3,3,3] }, deadline: h.now + 15000, botAt: {}, settledAt: h.now };
  h.now += 3000; await h.room.alarm();
}

describe('room', () => {
  it('creates, rejects collisions, joins and restores a trimmed name and token seat', async () => {
    const h = harness(); expect(await h.create()).toBe(true); expect(await h.create()).toBe(false);
    const s = await h.join('  Jason  '); const token = s.token!;
    expect(h.room.info().seats[0]).toMatchObject({ name: 'Jason', host: true, connected: true });
    await h.room.disconnect(s); h.rebuild(); const rejoin = await h.join('Jason', token);
    expect(h.blob.people[rejoin.token!]!.seat).toBe('dong');
    expect(h.frames.get(rejoin.id)![0]).toMatchObject({ type: 'welcome', token, seat: 'dong' });
  });
  it('replaces the first device and ignores its late close', async () => {
    const h = harness(); await h.create(); const first = await h.join(); const second = await h.join('Lagi', first.token);
    expect(h.closed).toEqual([first.id]); expect(h.frames.get(first.id)!.at(-1)).toEqual({ type: 'kicked', reason: 'replaced' });
    await h.room.disconnect(first); expect(h.room.info().seats[0]!.connected).toBe(true);
    expect(second.token).toBe(first.token);
  });
  it('validates all lobby settings and blocks non-host configuration', async () => {
    for (const [key, value] of Object.entries(DEFAULT_ROOM_CONFIG)) {
      expect(validConfig({ ...DEFAULT_ROOM_CONFIG, [key]: typeof value === 'boolean' ? 'true' : 'invalid' })).toBe(false);
    }
    expect(validConfig(DEFAULT_ROOM_CONFIG)).toBe(true);
    const h = harness(); await h.create(); const host = await h.join(); const peer = await h.join();
    await h.send(peer, { type: 'config', config: DEFAULT_ROOM_CONFIG }); expect(errors(h, peer).at(-1)).toMatchObject({ code: 'not_host' });
    await h.send(host, { type: 'config', config: { ...DEFAULT_ROOM_CONFIG, allowSpectators: false, fillWithBots: false } });
    await h.send(host, { type: 'start' }); await finishSeating(h); expect(errors(h, host).at(-1)).toMatchObject({ code: 'room_full' });
    await h.join(); await h.join(); const extra = await h.join(); expect(errors(h, extra).at(-1)).toMatchObject({ code: 'room_full' });
    await h.send(host, { type: 'start' }); await finishSeating(h); expect(h.room.session).not.toBeNull();
    await h.send(host, { type: 'stand' }); expect(errors(h, host).at(-1)).toMatchObject({ code: 'wrong_phase' });
  });
  it('seat rolls use server dice, sort descending, persist, and reassign socket seats', async () => {
    const h = harness(); await h.create(); const host = await h.join(); const peer = await h.join();
    h.seedQueue.push(...[0, 5, 3, 1].map(n => Array(148).fill(n)));
    await h.send(host, { type: 'start' }); expect(h.room.info().phase).toBe('seating');
    await h.send(host, { type: 'rollSeats' }); await h.send(peer, { type: 'rollSeats' });
    const before = structuredClone(h.blob.seatDice); h.rebuild(); expect(h.room.info().seatDice).toEqual(before);
    while (!h.blob.seatDice!.settledAt) await h.tick();
    expect(h.blob.seatDice!.groups).toEqual([['nan'], ['xi'], ['bei'], ['dong']]);
    expect(h.blob.seatDice!.dice.nan).toEqual([6,6,6]);
    const at = h.now; await h.tick(); expect(h.now - at).toBe(3000);
    expect(h.room.info().phase).toBe('playing'); expect(host.seat).toBe('bei'); expect(peer.seat).toBe('dong');
    expect(h.room.session!.viewFor(null).dealer).toBe('dong');
  });
  it('tied seats reroll only within their rank and humans auto-roll after 15 seconds', async () => {
    const h = harness(); await h.create(); const host = await h.join();
    h.seedQueue.push(...[5, 5, 2, 0, 1, 4].map(n => Array(148).fill(n)));
    await h.send(host, { type: 'start' }); const start = h.now;
    while (h.now < start + 15000) await h.tick();
    expect(h.blob.seatDice!.groups).toEqual([['nan', 'xi'], ['bei'], ['dong']]);
    expect(h.blob.seatDice!.dice).toEqual({ bei: [3,3,3], dong: [1,1,1] });
    h.rebuild(); await h.tick(); await h.tick();
    expect(h.blob.seatDice!.groups).toEqual([['xi'], ['nan'], ['bei'], ['dong']]);
    expect(h.blob.seatDice!.dice.dong).toEqual([1,1,1]);
    expect(h.blob.seatDice!.settledAt).not.toBeNull();
    // Bot rolls happen first: nan=18, xi=18, bei=9; human dong=3.
  });
  it('host alone may swap an offline human; reconnect restores control and emits events', async () => {
    const h = harness(); await h.create(); const host = await h.join(); const peer = await h.join();
    await h.send(host, { type: 'start' }); await finishSeating(h);
    await h.send(peer, { type: 'replaceBot', seat: 'dong' }); expect(errors(h, peer).at(-1)).toMatchObject({ code: 'not_host' });
    await h.send(host, { type: 'replaceBot', seat: 'nan' }); expect(errors(h, host).at(-1)).toMatchObject({ code: 'illegal_action' });
    await h.room.disconnect(peer); expect(h.room.session!.serialize().options.seats.nan).toBe('human');
    await h.send(host, { type: 'replaceBot', seat: 'nan' }); expect(h.room.session!.serialize().options.seats.nan).toBe('bot');
    h.rebuild(); await h.join('Peer', peer.token); expect(h.room.session!.serialize().options.seats.nan).toBe('human');
    const events = h.frames.get(host.id)!.filter(m => m.type === 'event');
    expect(events.map(e => e.text)).toEqual(['Nama digantikan bot', 'Peer kembali']);
  });
  it('bot schedule stays deterministic with turn and claim delays in range', async () => {
    const { h } = await botRoom();
    for (let i = 0; i < 80 && h.blob.handEndedAt === null; i++) {
      const snapshot = h.room.session!.serialize();
      const delay = h.blob.schedule!.botAt! - h.now;
      if (snapshot.state.phase === 'CLAIM_WINDOW') { expect(delay).toBeGreaterThanOrEqual(1000); expect(delay).toBeLessThanOrEqual(2000); }
      else if (snapshot.state.phase === 'TURN_DRAW') expect(delay).toBe(1);
      else { expect(delay).toBeGreaterThanOrEqual(1500); expect(delay).toBeLessThanOrEqual(3000); }
      const before = h.blob.schedule; h.rebuild(); expect(h.room.data!.schedule).toEqual(before); await h.tick();
    }
  });
  it('limits spectators and caps names', async () => {
    const h = harness(); await h.create(); for (let i = 0; i < 12; i++) await h.join('x'.repeat(40));
    expect(h.room.info().spectators).toBe(8); expect(h.room.info().seats[0]!.name).toHaveLength(20);
    const s = await h.join(); expect(errors(h, s).at(-1)).toMatchObject({ code: 'room_full' });
  });
  it('rate limits a socket across reconstruction', async () => {
    const h = harness(); await h.create(); const s = await h.join(); h.rebuild();
    for (let i = 0; i < 10; i++) await h.room.message(s, JSON.stringify({ type: 'ping' }));
    expect(errors(h, s).at(-1)).toMatchObject({ code: 'rate_limited' });
    await h.send(s, { type: 'ping' }); expect(h.frames.get(s.id)!.at(-1)).toMatchObject({ type: 'pong' });
  });
  it('lets hello, config and start through back to back', async () => {
    const h = harness(); await h.create(); const s = await h.join();
    for (const m of [{ type: 'config', config: { ...DEFAULT_ROOM_CONFIG, turnSeconds: 5 } }, { type: 'resync' }, { type: 'ping' }]) await h.room.message(s, JSON.stringify(m));
    expect(errors(h, s)).toEqual([]); expect(h.room.info().config.turnSeconds).toBe(5);
  });
  it('a duplicate alarm cannot double-discard and mid-hand eviction resumes identically', async () => {
    const { h } = await botRoom();
    for (let i = 0; i < 20; i++) await h.tick();
    const before = structuredClone(h.blob); h.rebuild();
    const version = h.room.session!.version; await h.tick(); const after = h.room.session!.serialize();
    await h.room.alarm(); expect(h.room.session!.serialize()).toEqual(after); expect(after.version).toBe(version + 1);
    // Recreate the same saved room at the exact alarm time in an independent harness.
    let stored: RoomData | null = null;
    const r = new Room({ seed: () => 777, log: () => {}, now: () => h.now, token: () => '', put: async d => { stored = d; }, deleteAll: async () => {}, setAlarm: async () => {}, send: () => {}, close: () => {}, attach: () => {} }, before, [...h.room.sockets.values()]);
    await r.alarm(); expect(stored!.session).toEqual(after);
  });
  it('a stale alarm after a fast human action does nothing; unlimited turns never timeout', async () => {
    const h = harness(); await h.create(); const host = await h.join();
    await h.send(host, { type: 'config', config: { ...DEFAULT_ROOM_CONFIG, turnSeconds: null } });
    await h.send(host, { type: 'start' }); await finishSeating(h); const s = h.room.session!;
    const tileId = s.viewFor('dong').legal!.discardableTileIds[0]!;
    await h.send(host, { type: 'act', action: { type: 'discard', tileId, version: s.version } });
    const before = s.serialize(); await h.room.alarm(); expect(s.serialize()).toEqual(before);
    expect(h.blob.schedule!.deadline).toBeNull();
  });
  it('checks finite deadline and version again after a fast human discard', async () => {
    const h = harness(); await h.create(); const host = await h.join();
    await h.send(host, { type: 'start' }); await finishSeating(h);
    const oldAlarm = h.alarm!;
    const s = h.room.session!;
    await h.send(host, { type: 'act', action: { type: 'discard', tileId: s.viewFor('dong').legal!.discardableTileIds[0]!, version: s.version } });
    const before = s.serialize(); await h.room.alarm(); expect(s.serialize()).toEqual(before);
    expect(h.now).toBeLessThan(oldAlarm);
  });
  it('persists before broadcasting and absorbs failed sends', async () => {
    let blob: RoomData | null = null;
    let checks = 0;
    const r = new Room({ seed: () => 777, log: () => {}, now: () => 1000, token: () => 'token',
      put: async d => { blob = d; }, deleteAll: async () => {}, setAlarm: async () => {},
      send: () => { expect(blob!.people.token).toBeDefined(); checks++; throw new Error('closed'); }, close: () => {}, attach: () => {},
    });
    await r.create('ABCDEF'); const socket = { id: 'one' }; r.connect(socket);
    await expect(r.message(socket, JSON.stringify({ type: 'hello', name: 'Jason' }))).resolves.toBeUndefined();
    expect(checks).toBeGreaterThan(0);
  });
  it('all connected seated humans must ready; offline players count as ready', async () => {
    const { h, host } = await botRoom(); const a = await h.join(); const b = await h.join();
    while (h.blob.handEndedAt === null) await h.tick();
    h.room.data!.people[a.token!]!.seat = 'nan'; h.room.data!.people[b.token!]!.seat = 'xi';
    await h.send(host, { type: 'ready' }); expect(errors(h, host).at(-1)).toMatchObject({ code: 'not_seated' });
    await h.send(a, { type: 'ready' }); expect(h.blob.handEndedAt).not.toBeNull();
    expect(h.room.info().seats.find(s => s.seat === 'nan')!.ready).toBe(true);
    await h.send(b, { type: 'ready' }); expect(h.blob.handEndedAt).toBeNull();
    while (h.blob.handEndedAt === null) await h.tick();
    await h.send(a, { type: 'ready' }); await h.room.disconnect(b); expect(h.blob.handEndedAt).toBeNull();
  }, 120000);
  it('120-second continuation survives storage reload and needs no client', async () => {
    const { h } = await botRoom();
    while (h.blob.handEndedAt === null) await h.tick();
    const human = await h.join(); h.room.data!.people[human.token!]!.seat = 'nan';
    await h.send(human, { type: 'resync' });
    // Persist the fixture's connected human before rebuilding.
    await h.join('Human', human.token);
    const end = h.blob.handEndedAt!;
    h.rebuild(); expect(h.alarm).toBe(end + 120000);
    await h.tick(); expect(h.blob.handEndedAt).toBeNull();
  }, 120000);
  it('plays a complete four-bot match using only paced alarms and measures writes', async () => {
    const { h } = await botRoom(); let steps = 0; const startWrites = h.writes, startAlarms = h.alarmWrites;
    while (!h.room.session!.viewFor(null).matchOver && steps++ < 15000) {
      await h.tick();
    }
    expect(h.room.session!.viewFor(null).match.hands).toHaveLength(16);
    console.log(`Room budget: ${h.writes - startWrites} blob writes + ${h.alarmWrites - startAlarms} alarm writes / 16 hands = ${((h.writes + h.alarmWrites - startWrites - startAlarms) / 16).toFixed(1)} writes/hand`);
  }, 120000);
  it('never sends opponent concealed tiles, reveals only the Hu winner', async () => {
    const { h, host } = await botRoom();
    for (let i = 0; i < 100; i++) {
      const s = h.room.session!, snap = s.serialize();
      const text = JSON.stringify(h.frames.get(host.id)!.at(-1));
      for (const seat of SEAT_ORDER) if (s.viewFor(null).lastHand?.winner !== seat || s.viewFor(null).phase !== 'RESOLVED_HU') {
        for (const t of snap.state.players[seat].hand) expect(text).not.toContain(`"${t.id}"`);
      }
      if (h.blob.handEndedAt !== null) break;
      await h.tick();
    }
    // Winner disclosure is a detached, persisted public receipt.
    const s = h.room.session!;
    while (h.blob.handEndedAt === null) await h.tick();
    const last = s.viewFor(null).lastHand!; expect(last).not.toBeNull();
    if (last.winner) { expect(last.hand).toEqual(s.serialize().state.players[last.winner].hand); expect(last.breakdown.length).toBeGreaterThan(0); }
    h.rebuild(); expect(h.room.session!.viewFor(null).lastHand).toEqual(last);
  }, 120000);
  it('deletes empty rooms after 24 hours and keeps the earliest game alarm', async () => {
    const { h, host } = await botRoom(); await h.room.disconnect(host);
    expect(h.alarm!).toBeLessThan(h.now + 86400000);
    h.now = h.blob.lastActivity + 86400000; await h.room.alarm(); expect(h.room.data).toBeNull();
  });
});
