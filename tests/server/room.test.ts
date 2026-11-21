import { describe, it, expect } from 'vitest';
import { Room, validConfig, type RoomData, type Socket, type RoomIO } from '../../server/room';
import { DEFAULT_ROOM_CONFIG, type ClientMessage, type ServerMessage } from '../../src/net/protocol';
import { TableSession } from '../../src/session';
import type { HandSeed } from '../../src/session';
import { SEAT_ORDER, parseTileHand } from '../../src/core/tiles';

function harness(authorize?: RoomIO['authorize'], loginRequired = false, joinAccount?: RoomIO['joinAccount']) {
  let now = 1000, counter = 0, alarm: number | null = null, blob: RoomData | null = null, writes = 0, alarmWrites = 0, seeds = 0;
  const frames = new Map<string, ServerMessage[]>(), closed: string[] = [];
  const seedQueue: HandSeed[] = [];
  const io: RoomIO = { authorize, loginRequired, joinAccount, seed: () => seedQueue.shift() ?? 1000 + seeds++, log: () => {}, now: () => now, token: () => `token-${++counter}`,
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
    expect(h.closed).toEqual([first.id]); expect(h.frames.get(first.id)!.some(m => m.type === 'kicked')).toBe(false);
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
  it('allows rematch only for the host after the match is over', async () => {
    const h = harness(); await h.create(); const host = await h.join(); const peer = await h.join();
    await h.send(host, { type: 'rematch' }); expect(errors(h, host).at(-1)).toMatchObject({ code: 'wrong_phase' });
    await h.send(host, { type: 'start' });
    await h.send(host, { type: 'rematch' }); expect(errors(h, host).at(-1)).toMatchObject({ code: 'wrong_phase' });
    await finishSeating(h);
    await h.send(host, { type: 'rematch' }); expect(errors(h, host).at(-1)).toMatchObject({ code: 'wrong_phase' });
    const snapshot = h.room.session!.serialize(); snapshot.match.endedBy = 'hands'; snapshot.match.finishedAt = h.now;
    h.room.session = TableSession.deserialize(snapshot, () => h.now);
    await h.send(peer, { type: 'rematch' }); expect(errors(h, peer).at(-1)).toMatchObject({ code: 'not_host' });
    expect(h.room.info().phase).toBe('finished');
  });
  it('persists a clean rematch with the same room, people and settings, then runs seat dice after reload', async () => {
    const h = harness(); await h.create(); const host = await h.join('Host'); const peer = await h.join('Peer');
    await h.send(host, { type: 'config', config: { ...DEFAULT_ROOM_CONFIG, minHuTay: 8, turnSeconds: 30 } });
    await h.send(host, { type: 'start' }); await finishSeating(h);
    await h.room.disconnect(peer); await h.send(host, { type: 'replaceBot', seat: 'nan' });
    const snapshot = h.room.session!.serialize();
    snapshot.match.endedBy = 'hands'; snapshot.match.finishedAt = h.now; snapshot.match.koinTotal.dong = 999;
    h.room.session = TableSession.deserialize(snapshot, () => h.now);
    h.room.data!.ready = [host.token!];
    const people = structuredClone(h.room.data!.people), config = structuredClone(h.room.data!.config);
    await h.send(host, { type: 'rematch' });
    expect(h.blob).toMatchObject({ code: 'ABCDEF', people, config, session: null, ready: [], takeovers: [], handEndedAt: null, schedule: null });
    expect(h.room.info().phase).toBe('seating'); expect(h.blob.seatDice!.dice).toEqual({});
    h.rebuild(); expect(h.room.info().phase).toBe('seating'); expect(h.blob.people).toEqual(people);
    // Humans (including offline humans) auto-roll at the deadline; bots roll via alarms.
    for (let i = 0; h.room.info().phase === 'seating' && i < 50; i++) await h.tick();
    expect(h.room.info().phase).toBe('playing');
    const fresh = h.room.session!.serialize();
    expect(fresh.match.hands).toEqual([]); expect(fresh.match.koinTotal).toEqual({ dong: 0, nan: 0, xi: 0, bei: 0 });
    expect(fresh.match.endedBy).toBeNull(); expect(fresh.match.minHuTay).toBe(8);
    const peerSeat = h.blob.people[peer.token!]!.seat!;
    expect(fresh.options.seats[peerSeat]).toBe('human'); expect(fresh.presence[peerSeat].connected).toBe(false);
    h.rebuild(); expect(h.room.info().phase).toBe('playing');
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
    expect(events.map(e => e.text)).toEqual(['Nama 2 digantikan bot', 'Nama 2 kembali']);
  });
  it('bot schedule stays deterministic with turn and claim delays in range', async () => {
    const { h } = await botRoom();
    for (let i = 0; i < 80 && h.blob.handEndedAt === null; i++) {
      const snapshot = h.room.session!.serialize();
      const delay = h.blob.schedule!.botAt! - h.now;
      if (snapshot.state.phase === 'CLAIM_WINDOW') {
        if (h.blob.schedule!.botAt === null) expect(h.alarm).toBe(snapshot.claimRevealAt);
        else { expect(delay).toBeGreaterThanOrEqual(1000); expect(delay).toBeLessThanOrEqual(2000); }
      }
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


describe('unique room names', () => {
  it('suffixes duplicates ignoring case and surrounding spaces, including spectators', async () => {
    const h = harness(); await h.create();
    for (const name of ['A Liong', ' a liong ', 'A Liong', 'A Liong', 'A Liong']) await h.join(name);
    expect(Object.values(h.blob.people).map(p => p.name)).toEqual(['A Liong', 'a liong 2', 'A Liong 3', 'A Liong 4', 'A Liong 5']);
  });
  it('truncates long bases, avoids suffix collisions and preserves names on reconnect', async () => {
    const h = harness(); await h.create();
    await h.join('ABCDEFGHIJKLMNOPQRST'); await h.join('ABCDEFGHIJKLMNOPQR 2');
    const s = await h.join('ABCDEFGHIJKLMNOPQRST');
    expect(h.blob.people[s.token!]!.name).toBe('ABCDEFGHIJKLMNOPQR 3');
    await h.room.disconnect(s); h.rebuild();
    const rejoined = await h.join('old client name', s.token);
    expect(h.blob.people[s.token!]!.name).toBe('ABCDEFGHIJKLMNOPQR 3');
    expect(h.frames.get(rejoined.id)![0]).toMatchObject({ type: 'welcome', name: 'ABCDEFGHIJKLMNOPQR 3' });
  });
  it('makes renames unique, excludes the owner, and broadcasts the assigned name', async () => {
    const h = harness(); await h.create(); const a = await h.join('A Liong'); const b = await h.join('B');
    await h.send(a, { type: 'rename', name: 'A Liong' }); expect(h.blob.people[a.token!]!.name).toBe('A Liong');
    await h.send(b, { type: 'rename', name: ' A Liong ' }); expect(h.blob.people[b.token!]!.name).toBe('A Liong 2');
    expect(h.frames.get(b.id)!.at(-1)).toMatchObject({ type: 'room', name: 'A Liong 2' });
    await h.send(b, { type: 'rename', name: ' ' }); expect(errors(h, b).at(-1)).toMatchObject({ code: 'bad_message' });
  });
});


describe('canonical room names', () => {
  it('normalizes composition, invisible format characters and Unicode spaces before uniqueness and persistence', async () => {
    const h = harness(); await h.create();
    const first = await h.join('  A\u00a0\u200bLi\u200dong\u2060  ');
    const second = await h.join('a\u2009\u202fliong');
    expect(h.blob.people[first.token!]!.name).toBe('A Liong');
    expect(h.blob.people[second.token!]!.name).toBe('a liong 2');
    const composed = await h.join('Caf\u00e9');
    const decomposed = await h.join('Cafe\u0301');
    expect(h.blob.people[composed.token!]!.name).toBe('Caf\u00e9');
    expect(h.blob.people[decomposed.token!]!.name).toBe('Caf\u00e9 2');
    await h.send(second, { type: 'rename', name: '\u200bCAFE\u0301\u00a0' });
    expect(h.blob.people[second.token!]!.name).toBe('CAF\u00c9 3');
  });

  it('rejects names made only of spaces and format characters on join and rename', async () => {
    const h = harness(); await h.create();
    const blank = await h.join('\u200b\u2060\u00a0\u2003');
    expect(errors(h, blank).at(-1)).toMatchObject({ code: 'bad_message' });
    expect(Object.values(h.blob.people)).toHaveLength(0);
    const player = await h.join('A Liong');
    await h.send(player, { type: 'rename', name: '\u200e\u202f\u200f' });
    expect(errors(h, player).at(-1)).toMatchObject({ code: 'bad_message' });
    expect(h.blob.people[player.token!]!.name).toBe('A Liong');
  });
});

describe('online tidy ups', () => {
  it('hands host to longest-seated connected human after 60 seconds, persists, and never restores old rights', async () => {
    const h = harness(); await h.create(); const host = await h.join('Host'); const first = await h.join('First'); const second = await h.join('Second');
    await h.send(second, { type: 'stand' });
    await h.room.disconnect(host); const disconnectedAt = h.now;
    h.now = disconnectedAt + 60000; await h.room.alarm(); expect(h.blob.host).toBe(host.token);
    h.now++; await h.room.alarm(); expect(h.blob.host).toBe(first.token);
    expect(h.frames.get(first.id)).toContainEqual({ type: 'event', text: 'First sekarang host', seat: 'nan' });
    h.rebuild(); const returned = await h.join('Host', host.token);
    expect(h.frames.get(returned.id)![0]).toMatchObject({ type: 'welcome', host: false });
    await h.send(returned, { type: 'config', config: DEFAULT_ROOM_CONFIG }); expect(errors(h, returned).at(-1)).toMatchObject({ code: 'not_host' });
  });
  it('hands over immediately on leave and excludes spectators even if they joined first', async () => {
    const h = harness(); await h.create(); const host = await h.join('Host'); const watcher = await h.join('Watcher');
    await h.send(watcher, { type: 'stand' }); const player = await h.join('Player');
    await h.send(host, { type: 'leave' }); expect(h.blob.host).toBe(player.token);
    expect(h.blob.people[watcher.token!]!.seat).toBeNull();
  });
  it('broadcasts only preset reactions, limits across reconnect, and rejects spectators', async () => {
    const h = harness(); await h.create(); const host = await h.join(); await h.send(host, { type: 'start' }); await finishSeating(h);
    const watcher = await h.join('Watcher');
    await h.send(host, { type: 'reaction', preset: 0 });
    expect(h.frames.get(watcher.id)!.at(-1)).toMatchObject({ type: 'event', reaction: 0, seat: 'dong' });
    await h.send(host, { type: 'reaction', preset: 1 }); expect(errors(h, host).at(-1)).toMatchObject({ code: 'rate_limited' });
    h.rebuild(); const returned = await h.join('Again', host.token);
    await h.send(returned, { type: 'reaction', preset: 2 }); expect(errors(h, returned).at(-1)).toMatchObject({ code: 'rate_limited' });
    h.now += 2000; await h.send(returned, { type: 'reaction', preset: 7 }); expect(h.frames.get(watcher.id)!.at(-1)).toMatchObject({ reaction: 7 });
    await h.room.message(returned, JSON.stringify({ type: 'reaction', preset: 8 })); expect(errors(h, returned).at(-1)).toMatchObject({ code: 'bad_message' });
    await h.send(watcher, { type: 'reaction', preset: 0 }); expect(errors(h, watcher).at(-1)).toMatchObject({ code: 'not_seated' });
  });
});

it('publishes and persists winning tile id and loads older last-hand records without it', async () => {
  const h = harness(); await h.create(); const host = await h.join(); await h.send(host, { type: 'start' }); await finishSeating(h);
  const snapshot = h.room.session!.serialize();
  snapshot.state.phase = 'ACTION_DECISION'; snapshot.state.currentTurn = 'dong'; snapshot.state.selfDrawSeat = 'dong';
  snapshot.state.rules.kimEnabled = false; snapshot.state.rules.minHuTay = 0; snapshot.options.settings.minHuTay = 0;
  snapshot.state.players.dong.hand = parseTileHand('1T 1T 1T 2T 3T 4T 5T 6T 7T 8T 8T 8T 9T 9T');
  const winningId = snapshot.state.players.dong.hand.at(-1)!.id;
  h.room.session = TableSession.deserialize(snapshot, () => h.now);
  const patternIds = h.room.session.viewFor('dong').legal!.selfHuScore!.patterns.map(p => p.id);
  await h.send(host, { type: 'act', action: { type: 'selfHu', version: h.room.session.version } });
  expect(h.blob.session!.lastHand!.winningTileId).toBe(winningId);
  expect(h.blob.session!.lastHand!.breakdown.map(p => p.id)).toEqual(patternIds);
  expect(h.frames.get(host.id)!.at(-1)).toMatchObject({ type: 'view', view: { lastHand: { winningTileId: winningId } } });
  delete h.blob.session!.lastHand!.winningTileId;
  expect(TableSession.deserialize(h.blob.session!, () => h.now).viewFor(null).lastHand!.winner).toBe('dong');
});

describe('pending host transfer regressions', () => {
  it.each(['leave', 'timeout'] as const)('keeps a %s transfer pending through reload and former-host reconnect until a spectator sits', async kind => {
    const h = harness(); await h.create(); const host = await h.join('Host'); const watcher = await h.join('Watcher');
    await h.send(watcher, { type: 'stand' });
    if (kind === 'leave') await h.send(host, { type: 'leave' });
    else { await h.room.disconnect(host); h.now += 60001; await h.room.alarm(); }
    expect(h.blob.hostTransferPending).toBe(true);
    h.rebuild(); const returned = await h.join('Host', host.token);
    expect(h.frames.get(returned.id)!.find(m => m.type === 'welcome')).toMatchObject({ host: false });
    expect(h.blob.hostTransferPending).toBe(true);
    await h.send(returned, { type: 'config', config: DEFAULT_ROOM_CONFIG });
    expect(errors(h, returned).at(-1)).toMatchObject({ code: 'not_host' });
    await h.send(watcher, { type: 'sit', seat: 'nan' });
    expect(h.blob.host).toBe(watcher.token); expect(h.blob.hostTransferPending).toBe(false);
    expect(h.frames.get(watcher.id)).toContainEqual({ type: 'event', text: 'Watcher sekarang host', seat: 'nan' });
    h.rebuild(); expect(h.room.info().seats.find(s => s.seat === 'nan')!.host).toBe(true);
  });
  it('transfers a pending host on a new seated human connect', async () => {
    const h = harness(); await h.create(); const host = await h.join('Host');
    await h.send(host, { type: 'leave' }); h.rebuild();
    const next = await h.join('Next');
    expect(h.blob.host).toBe(next.token);
    expect(h.frames.get(next.id)!.find(m => m.type === 'welcome')).toMatchObject({ host: true });
  });
  it('includes a longer-seated reconnecting human before selecting an overdue successor', async () => {
    const h = harness(); await h.create(); const host = await h.join('Host'); const oldest = await h.join('Oldest'); const younger = await h.join('Younger');
    await h.room.disconnect(oldest); await h.room.disconnect(host); h.now += 60001;
    const returned = await h.join('Oldest', oldest.token);
    expect(h.blob.host).toBe(oldest.token);
    expect(h.frames.get(returned.id)!.find(m => m.type === 'welcome')).toMatchObject({ host: true });
    expect(h.frames.get(younger.id)).toContainEqual({ type: 'event', text: 'Oldest sekarang host', seat: 'nan' });
  });
});

it('authorizes starts and rematches, charges only the actual match and applies the new host account', async () => {
  const calls: { user?: string; key?: string }[] = [];
  let denied: 'login_required' | 'daily_limit' | null = null;
  const h = harness(async (socket, key) => { calls.push({ user: socket?.userId, key }); return denied; });
  await h.room.create('ABCDEF', 'account1');
  const guest = h.connect();
  await h.send(guest, { type: 'hello', name: 'Guest' });
  expect(h.room.data!.host).toBeNull(); expect(guest.seat).toBe('nan');
  const host = h.connect(); host.userId = 'account1';
  await h.send(host, { type: 'hello', name: 'Host' });
  denied = 'login_required'; await h.send(host, { type: 'start' });
  expect(errors(h, host).at(-1)?.code).toBe('login_required'); expect(h.room.data!.seatDice).toBeUndefined();
  denied = 'daily_limit'; await h.send(host, { type: 'start' });
  expect(errors(h, host).at(-1)?.code).toBe('daily_limit');
  denied = null; await h.send(host, { type: 'start' });
  expect(calls.at(-1)?.key).toBeUndefined();
  await finishSeating(h); expect(calls.at(-1)).toMatchObject({ user: 'account1', key: expect.any(String) });
  const snapshot = h.room.session!.serialize(); snapshot.match.endedBy = 'hands';
  snapshot.match.finishedAt = h.now;
  h.room.session = TableSession.deserialize(snapshot, () => h.now, () => 1);
  denied = 'daily_limit'; await h.send(host, { type: 'rematch' });
  expect(errors(h, host).at(-1)?.code).toBe('daily_limit');
  await h.send(host, { type: 'leave' });
  expect(h.room.data!.host).toBe(guest.token);
  await h.send(guest, { type: 'rematch' });
  expect(calls.at(-1)?.user).toBeUndefined();
});

it('keeps account ownership on reconnect and rejects replacement before kicking the real owner', async () => {
  const charges: string[] = [];
  const h = harness(async (socket, key) => { if (key) charges.push(socket!.userId!); return null; });
  await h.room.create('ABCDEF', 'owner');
  const owner = h.connect(); owner.userId = 'owner'; owner.sessionHash = 'old-session';
  await h.send(owner, { type: 'hello', name: 'Owner' });
  for (const userId of ['other-account', undefined]) {
    const intruder = h.connect(); intruder.userId = userId; intruder.sessionHash = 'other-session';
    await h.send(intruder, { type: 'hello', name: 'Intruder', token: owner.token });
    expect(errors(h, intruder).at(-1)?.code).toBe('login_required');
    expect(intruder.token).toBeUndefined(); expect(h.closed).not.toContain(owner.id);
    expect(h.room.data!.people[owner.token!]!).toMatchObject({ userId: 'owner', sessionHash: 'old-session' });
    expect(h.room.data!.host).toBe(owner.token);
  }
  const refreshed = h.connect(); refreshed.userId = 'owner'; refreshed.sessionHash = 'new-session';
  await h.send(refreshed, { type: 'hello', name: 'Owner', token: owner.token, reclaim: true });
  expect(refreshed.token).toBe(owner.token); expect(h.closed).toContain(owner.id);
  expect(h.room.data!.people[owner.token!]!.sessionHash).toBe('new-session');
  await h.send(refreshed, { type: 'start' }); await finishSeating(h);
  expect(charges).toEqual(['owner']);
});
it('reserves Dong against sit and promotes a creator who logs in from an existing anonymous seat', async () => {
  const h = harness(); await h.room.create('ABCDEF', 'creator');
  const guest = await h.join('Guest');
  await h.send(guest, { type: 'sit', seat: 'dong' });
  expect(errors(h, guest).at(-1)?.code).toBe('seat_taken');
  expect(h.room.data!.host).toBeNull(); expect(h.room.data!.people[guest.token!]!.seat).toBe('nan');
  const creator = h.connect(); creator.userId = 'creator'; creator.sessionHash = 'session';
  await h.send(creator, { type: 'hello', name: 'Creator', token: guest.token });
  expect(h.room.data!.host).toBe(guest.token);
  expect(h.room.data!.people[guest.token!]!).toMatchObject({ seat: 'nan', userId: 'creator' });
  expect(h.room.info().seats.find(s => s.seat === 'nan')!.host).toBe(true);
});
it('does not change the paying identity during seating and promotes a stable account on hand-over', async () => {
  const charges: (string | undefined)[] = [];
  const h = harness(async (socket, key) => { if (key) charges.push(socket?.userId); return null; });
  await h.create(); const host = await h.join('Host');
  const successor = h.connect(); successor.userId = 'successor'; successor.sessionHash = 'successor-session';
  await h.send(successor, { type: 'hello', name: 'Next' });
  await h.send(host, { type: 'start' });
  const changing = h.connect(); changing.userId = 'new-account';
  await h.send(changing, { type: 'hello', name: 'Host', token: host.token });
  expect(errors(h, changing).at(-1)?.code).toBe('wrong_phase');
  expect(h.room.data!.people[host.token!]!.userId).toBeUndefined();
  await h.send(host, { type: 'leave' });
  expect(h.room.data!.host).toBe(successor.token);
  await finishSeating(h); expect(charges).toEqual(['successor']);
  const replacement = h.connect(); replacement.userId = 'replacement';
  await h.send(replacement, { type: 'hello', name: 'Next', token: successor.token });
  expect(errors(h, replacement).at(-1)?.code).toBe('login_required');
  expect(h.room.data!.host).toBe(successor.token);
  expect(h.room.data!.people[successor.token!]!.userId).toBe('successor');
});


it.each([false, true])('resolves an unclaimable discard by alarm, reload=%s', async reload => {
  const h = harness(); await h.create(); const host = await h.join();
  await h.send(host, { type: 'start' }); await finishSeating(h);
  const data = h.room.session!.serialize();
  data.state.players.dong.hand[13] = { type: 'tong', value: 3, id: 'reveal-discard' };
  for (const seat of ['nan', 'xi', 'bei'] as const) data.state.players[seat].hand = Array.from({ length: 13 }, (_, i) => ({ type: 'sok', value: i % 9 + 1, id: `${seat}-${i}` }));
  h.room.session = TableSession.deserialize(data, () => h.now);
  await h.send(host, { type: 'act', action: { type: 'discard', tileId: 'reveal-discard', version: h.room.session.version } });
  const revealAt = h.now + 1000;
  expect(h.room.session.viewFor(null).phase).toBe('CLAIM_WINDOW');
  expect(h.alarm).toBe(revealAt);
  expect(h.blob.session!.claimRevealAt).toBe(revealAt);
  h.now += 500;
  if (reload) h.rebuild();
  await h.room.alarm();
  expect(h.room.session!.viewFor(null).phase).toBe('CLAIM_WINDOW');
  expect(h.alarm).toBe(revealAt);
  await h.tick();
  expect(h.room.session!.viewFor(null).phase).toBe('ACTION_DECISION');
  expect(h.blob.session!.claimRevealAt).toBeNull();
  const resolved = h.room.session!.serialize();
  await h.room.alarm();
  expect(h.room.session!.serialize()).toEqual(resolved);
});

it.each(['hello', 'rename', 'disconnect'] as const)('keeps the reveal deadline across %s before and after expiry', async action => {
  const h = harness(); await h.create(); const host = await h.join();
  await h.send(host, { type: 'start' }); await finishSeating(h);
  const watchers = action === 'disconnect' ? [await h.join('Watcher 1'), await h.join('Watcher 2')] : [];
  const data = h.room.session!.serialize();
  data.state.players.dong.hand[13] = { type: 'tong', value: 3, id: 'reveal-discard' };
  for (const seat of ['nan', 'xi', 'bei'] as const) data.state.players[seat].hand = Array.from({ length: 13 }, (_, i) => ({ type: 'sok', value: i % 9 + 1, id: `${seat}-${i}` }));
  h.room.session = TableSession.deserialize(data, () => h.now);
  await h.send(host, { type: 'act', action: { type: 'discard', tileId: 'reveal-discard', version: h.room.session.version } });
  const revealAt = h.now + 1000;
  let current = host;
  const save = async () => {
    if (action === 'hello') current = await h.join('Host', host.token);
    else if (action === 'rename') await h.send(current, { type: 'rename', name: 'Renamed' });
    else await h.room.disconnect(watchers.shift()!);
  };
  h.now += 200;
  await save();
  expect(h.room.session.viewFor(null).phase).toBe('CLAIM_WINDOW');
  expect(h.alarm).toBe(revealAt);
  expect(h.blob.session!.claimRevealAt).toBe(revealAt);
  h.now = revealAt;
  await save();
  expect(h.room.session.viewFor(null).phase).toBe('ACTION_DECISION');
  expect(h.blob.session!.claimRevealAt).toBeNull();
  expect(h.alarm).toBe(h.blob.schedule!.botAt);
});

it('recovers the same account without a token, rotates the token and replaces the old device', async () => {
  const h = harness(undefined, true); await h.create();
  const a = h.connect(); a.userId = 'owner';
  await h.send(a, { type: 'hello', name: 'Owner' });
  const oldToken = a.token;
  const b = h.connect(); b.userId = 'owner';
  await h.send(b, { type: 'hello', name: 'Device B', reclaim: true });
  expect(b.seat).toBe('dong'); expect(b.token).not.toBe(oldToken);
  expect(h.frames.get(a.id)!.at(-1)).toEqual({ type: 'kicked', reason: 'replaced' });
  expect(Object.values(h.blob.people).filter(p => p.userId === 'owner')).toHaveLength(1);
  expect(h.blob.host).toBe(b.token);
  await h.room.disconnect(a);
  expect(h.room.info().seats[0]!.connected).toBe(true);
  const reload = h.connect(); reload.userId = 'owner';
  await h.room.disconnect(b);
  await h.send(reload, { type: 'hello', name: 'Reload', token: b.token });
  expect(reload.token).toBe(b.token);
});

it('gates new anonymous seats and spectators, preserves legacy seats and permits anonymous rooms when disabled', async () => {
  const h = harness(undefined, true); await h.create();
  const anon = await h.join();
  expect(errors(h, anon).at(-1)?.code).toBe('login_required');
  for (let i = 0; i < 4; i++) {
    const s = h.connect(); s.userId = 'u' + i; await h.send(s, { type: 'hello', name: 'Player' });
  }
  const spectator = await h.join();
  expect(errors(h, spectator).at(-1)?.code).toBe('login_required');
  const free = harness(); await free.create(); const old = await free.join();
  const grandfather = new Room({ now: () => free.now, token: () => 'new', seed: () => 1, log: () => {}, put: async () => {}, deleteAll: async () => {}, setAlarm: async () => {}, send: () => {}, close: () => {}, attach: () => {}, loginRequired: true }, free.blob);
  const reconnect: Socket = { id: 'legacy' }; grandfather.connect(reconnect);
  await grandfather.message(reconnect, JSON.stringify({ type: 'hello', name: 'Legacy', token: old.token }));
  expect(reconnect.seat).toBe('dong');
});

it('does not let an anonymous or different account reclaim a bound seat', async () => {
  const h = harness(undefined, true); await h.create();
  const owner = h.connect(); owner.userId = 'owner'; await h.send(owner, { type: 'hello', name: 'Owner' });
  for (const userId of [undefined, 'intruder']) {
    const s = h.connect(); s.userId = userId;
    await h.send(s, { type: 'hello', name: 'Intruder', token: owner.token });
    expect(errors(h, s).at(-1)?.code).toBe('login_required');
    expect(h.closed).not.toContain(owner.id);
  }
});

it('releases an account seat through server leave, preserving normal host handover', async () => {
  const h = harness(); await h.create();
  const owner = h.connect(); owner.userId = 'owner'; await h.send(owner, { type: 'hello', name: 'Owner' });
  const next = h.connect(); next.userId = 'next'; await h.send(next, { type: 'hello', name: 'Next' });
  await h.room.leaveAccount('owner');
  expect(Object.values(h.blob.people).some(p => p.userId === 'owner')).toBe(false);
  expect(h.blob.host).toBe(next.token);
});

it('prevents a second seat through a previously connected spectator socket', async () => {
  const h = harness(undefined, true); await h.create();
  const spectator = h.connect(); spectator.userId = 'u';
  await h.send(spectator, { type: 'hello', name: 'First' });
  await h.send(spectator, { type: 'stand' });
  const seat = h.connect(); seat.userId = 'u';
  await h.send(seat, { type: 'hello', name: 'Second' });
  await h.send(spectator, { type: 'sit', seat: 'nan' });
  expect(errors(h, spectator).at(-1)?.code).toBe('seat_taken');
  expect(Object.values(h.blob.people).filter(p => p.userId === 'u' && p.seat)).toHaveLength(1);
});

it('expires grandfathered anonymous seats before the next match while keeping logged-in players', async () => {
  const h = harness(undefined, true); await h.create();
  const host = h.connect(); host.userId = 'owner';
  await h.send(host, { type: 'hello', name: 'Owner' });
  h.room.data!.people.legacy = { name: 'Legacy', seat: 'nan' };
  await h.send(host, { type: 'start' }); await finishSeating(h);
  const snapshot = h.room.session!.serialize(); snapshot.match.endedBy = 'hands'; snapshot.match.finishedAt = h.now;
  h.room.session = TableSession.deserialize(snapshot, () => h.now);
  await h.send(host, { type: 'rematch' });
  expect(h.blob.people.legacy).toBeUndefined();
  expect(h.blob.people[host.token!]!.userId).toBe('owner');
  expect(h.room.info().phase).toBe('seating');
});

it('requires login when a legacy anonymous spectator requests a new seat', async () => {
  const h = harness(undefined, true); await h.create();
  h.room.data!.people.legacy = { name: 'Legacy', seat: null };
  const s = h.connect();
  await h.send(s, { type: 'hello', name: 'Legacy', token: 'legacy' });
  await h.send(s, { type: 'sit', seat: 'nan' });
  expect(errors(h, s).at(-1)?.code).toBe('login_required');
  expect(h.blob.people.legacy!.seat).toBeNull();
});

it.each(['socket', 'account'])('keeps host handover pending after %s leave with an offline successor', async mode => {
  const h = harness(); await h.room.create('ABCDEF', 'owner');
  const host = h.connect(); host.userId = 'owner'; await h.send(host, { type: 'hello', name: 'Host' });
  const peer = h.connect(); peer.userId = 'peer'; await h.send(peer, { type: 'hello', name: 'Peer' });
  await h.room.disconnect(peer);
  if (mode === 'socket') await h.send(host, { type: 'leave' }); else await h.room.leaveAccount('owner');
  expect(h.blob.hostTransferPending).toBe(true);
  h.now += 2 * 3600000; await h.room.alarm();
  expect(h.room.data).not.toBeNull();
  h.rebuild();
  const back = h.connect(); back.userId = 'peer'; await h.send(back, { type: 'hello', name: 'Peer' });
  expect(h.blob.host).toBe(back.token); expect(h.blob.hostTransferPending).toBe(false);
});

it('restores the creator to their bound seat when Dong is occupied', async () => {
  const h = harness(); await h.room.create('ABCDEF', 'owner');
  h.room.data!.people.owner = { name: 'Owner', userId: 'owner', seat: 'xi' };
  h.room.data!.people.peer = { name: 'Peer', userId: 'peer', seat: 'dong' };
  h.room.data!.hostTransferPending = true;
  const back = h.connect(); back.userId = 'owner'; await h.send(back, { type: 'hello', name: 'Owner' });
  expect(back.seat).toBe('xi');
  expect(Object.values(h.blob.people).filter(p => p.seat === 'dong')).toHaveLength(1);
  expect(h.blob.host).toBe(back.token);
});

it('rejects automatic device takeover even with its former token; explicit reclaim wins', async () => {
  const h = harness(); await h.create();
  const a = h.connect(); a.userId = 'u'; await h.send(a, { type: 'hello', name: 'A' });
  const b = h.connect(); b.userId = 'u'; await h.send(b, { type: 'hello', name: 'B', reclaim: true });
  const retry = h.connect(); retry.userId = 'u'; await h.send(retry, { type: 'hello', name: 'A', token: a.token });
  expect(retry.token).toBeUndefined(); expect(h.closed).not.toContain(b.id);
  expect(h.frames.get(retry.id)!.at(-1)).toEqual({ type: 'kicked', reason: 'replaced' });
  const reclaim = h.connect(); reclaim.userId = 'u'; await h.send(reclaim, { type: 'hello', name: 'A', reclaim: true });
  expect(reclaim.seat).toBe('dong'); expect(h.closed).toContain(b.id);
});

it('returns a clear current_room error unless the hello confirms a switch', async () => {
  const h = harness(undefined, true, async (_user, _code, confirmed) => confirmed ? null : 'GHJKLM');
  await h.create();
  const a = h.connect(); a.userId = 'u'; await h.send(a, { type: 'hello', name: 'A' });
  expect(errors(h, a).at(-1)).toMatchObject({ code: 'current_room', message: 'Kamu masih duduk di room GHJKLM' });
  expect(Object.values(h.room.data!.people)).toHaveLength(0);
  await h.send(a, { type: 'hello', name: 'A', switchRoom: true }); expect(a.seat).toBe('dong');
});

it('a spectator switch never releases the account seat in another room', async () => {
  const calls: boolean[] = [];
  const h = harness(undefined, false, async (_user, _code, confirmed) => { calls.push(confirmed); return null; });
  await h.create();
  for (const name of ['A', 'B', 'C', 'D']) await h.join(name);
  const watcher = h.connect(); watcher.userId = 'u'; await h.send(watcher, { type: 'hello', name: 'W', switchRoom: true });
  expect(watcher.seat).toBeNull(); expect(calls).toEqual([]);
});

it('still reserves the initial Dong seat for a creator arriving after a guest', async () => {
  const h = harness(); await h.room.create('ABCDEF', 'owner');
  const guest = await h.join('Guest'); expect(guest.seat).toBe('nan');
  const owner = h.connect(); owner.userId = 'owner'; await h.send(owner, { type: 'hello', name: 'Owner' });
  expect(owner.seat).toBe('dong'); expect(h.blob.host).toBe(owner.token);
});


it('accepts an account reload with its own valid token while the old socket is still open', async () => {
  const h = harness(undefined, true); await h.create();
  const a = h.connect(); a.userId = 'u'; await h.send(a, { type: 'hello', name: 'A' });
  const b = h.connect(); b.userId = 'u'; await h.send(b, { type: 'hello', name: 'A', token: a.token });
  expect(b.token).toBe(a.token); expect(b.seat).toBe('dong');
  expect(h.frames.get(b.id)!.some(m => m.type === 'welcome')).toBe(true);
  expect(h.closed).toContain(a.id);
  expect(h.frames.get(a.id)!.some(m => m.type === 'kicked')).toBe(false);
  await h.room.disconnect(a); expect(h.room.info().seats[0]!.connected).toBe(true);
});
