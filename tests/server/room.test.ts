import { describe, it, expect } from 'vitest';
import { Room, validConfig, type RoomData, type Socket, type RoomIO } from '../../server/room';
import { DEFAULT_ROOM_CONFIG, type ClientMessage, type ServerMessage } from '../../src/net/protocol';
import { TableSession } from '../../src/session';
import type { HandSeed } from '../../src/session';
import { SEAT_ORDER, parseTileHand } from '../../src/core/tiles';

it('refreshes account Premium on hello and exposes only public flags for seats and spectators', async () => {
  let premium = false, reads = 0;
  const h = harness(undefined, false, undefined, async () => { reads++; return premium; });
  await h.create();
  const host = h.connect(); host.userId = 'account';
  await h.send(host, { type: 'hello', name: 'Host' });
  expect(h.room.info().seats[0]!.premium).toBeUndefined();
  premium = true;
  const again = h.connect(); again.userId = 'account';
  await h.send(again, { type: 'hello', name: 'Host', token: host.token });
  expect(h.room.info().seats[0]!.premium).toBe(true);
  const anon = await h.join('Anonymous');
  expect(h.room.info().seats[1]!.premium).toBeUndefined();
  expect(reads).toBe(2);
  await h.send(anon, { type: 'stand' });
  await h.send(again, { type: 'start' });
  expect(h.room.info().seats.filter(s => s.bot).every(s => s.premium === undefined)).toBe(true);
  const watcher = h.connect(); watcher.userId = 'watcher-account';
  await h.send(watcher, { type: 'hello', name: 'Watcher' });
  expect(h.room.info().spectatorDetails).toContainEqual({ name: 'Watcher', premium: true });
  const wire = JSON.stringify(h.room.info());
  expect(wire).not.toContain('userId'); expect(wire).not.toContain('sessionHash'); expect(wire).not.toContain('email');
  premium = false;
  const third = h.connect(); third.userId = 'account';
  await h.send(third, { type: 'hello', name: 'Host', token: again.token });
  expect(h.room.info().seats[0]!.premium).toBeUndefined();
});

function harness(authorize?: RoomIO['authorize'], loginRequired = false, joinAccount?: RoomIO['joinAccount'], accountPremium?: RoomIO['accountPremium']) {
  let now = 1000, counter = 0, alarm: number | null = null, blob: RoomData | null = null, writes = 0, alarmWrites = 0, seeds = 0;
  const frames = new Map<string, ServerMessage[]>(), closed: string[] = [];
  const seedQueue: HandSeed[] = [];
  const io: RoomIO = { authorize, loginRequired, joinAccount, accountPremium, seed: () => seedQueue.shift() ?? 1000 + seeds++, log: () => {}, now: () => now, token: () => `token-${++counter}`,
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
it('accepts old private configs and defaults their visibility', async () => {
  const h = harness(); await h.create(); const host = await h.join('Host');
  const { public: _, ...legacy } = DEFAULT_ROOM_CONFIG;
  expect(validConfig(legacy)).toBe(true);
  await h.room.message(host, JSON.stringify({ type: 'config', config: legacy }));
  expect(h.room.data!.config.public).toBe(false);
});
it.each([false, true])('kicks players and spectators and persists token/account bans (spectator=%s)', async spectator => {
  const h = harness(); await h.create(); const host = await h.join('Host');
  const target = h.connect(); target.userId = 'target-account';
  await h.send(target, { type: 'hello', name: 'Target' });
  if (spectator) await h.send(target, { type: 'stand' });
  await h.send(host, { type: 'kick', name: 'Target' });
  expect(h.frames.get(target.id)!.at(-1)).toEqual({ type: 'kicked', reason: 'kicked' });
  expect(h.closed).toContain(target.id);
  expect(h.room.data!.people[target.token!]).toBeUndefined();
  h.rebuild();
  const tokenJoin = await h.join('Again', target.token);
  expect(h.frames.get(tokenJoin.id)!.at(-1)).toEqual({ type: 'kicked', reason: 'kicked' });
  const accountJoin = h.connect(); accountJoin.userId = 'target-account';
  await h.send(accountJoin, { type: 'hello', name: 'Again' });
  expect(h.frames.get(accountJoin.id)!.at(-1)).toEqual({ type: 'kicked', reason: 'kicked' });
});
it('restricts removal to the host, another person, and lobby phase', async () => {
  const h = harness(); await h.create(); const host = await h.join('Host'), guest = await h.join('Guest');
  await h.send(guest, { type: 'kick', name: 'Host' }); expect(errors(h, guest).at(-1)).toMatchObject({ code: 'not_host' });
  await h.send(host, { type: 'kick', name: 'Host' }); expect(errors(h, host).at(-1)).toMatchObject({ code: 'bad_message' });
  await h.send(host, { type: 'start' });
  await h.send(host, { type: 'kick', name: 'Guest' }); expect(errors(h, host).at(-1)).toMatchObject({ code: 'wrong_phase' });
  await finishSeating(h);
  await h.send(host, { type: 'kick', name: 'Guest' }); expect(errors(h, host).at(-1)).toMatchObject({ code: 'wrong_phase' });
});
it.each([false, true])('uses the 24-hour idle deadline with only a spectator remaining (finished=%s)', async finished => {
  const h = harness(); await h.create();
  const host = h.connect(); host.userId = 'host'; await h.send(host, { type: 'hello', name: 'Host' });
  const spectator = await h.join('Watcher'); await h.send(spectator, { type: 'stand' });
  if (finished) {
    await h.send(host, { type: 'start' }); await finishSeating(h);
    const snapshot = h.room.session!.serialize(); snapshot.match.endedBy = 'hands'; snapshot.match.finishedAt = h.now;
    h.room.session = TableSession.deserialize(snapshot, () => h.now);
  }
  await h.room.leaveAccount('host');
  expect(h.room.info().spectators).toBe(1);
  expect(h.room.data!.host).toBeNull();
  h.now += 2 * 3600000; await h.room.alarm(); expect(h.room.data).not.toBeNull();
  await h.send(spectator, { type: 'ping' });
  const lastActivity = h.now;
  h.now = lastActivity + 86400000 - 1; await h.room.alarm(); expect(h.room.data).not.toBeNull();
  h.now++; await h.room.alarm(); expect(h.room.data).toBeNull();
});

it('keeps an empty finished match for 24 hours but expires a never-started room after one hour', async () => {
  const h = harness(); await h.create(); const host = await h.join('Host');
  await h.send(host, { type: 'start' }); await finishSeating(h);
  const snapshot = h.room.session!.serialize(); snapshot.match.endedBy = 'hands'; snapshot.match.finishedAt = h.now;
  h.room.session = TableSession.deserialize(snapshot, () => h.now);
  await h.send(host, { type: 'leave' });
  h.now += 2 * 3600000; await h.room.alarm(); expect(h.room.data).not.toBeNull();
  h.now = h.room.data!.lastActivity + 86400000; await h.room.alarm(); expect(h.room.data).toBeNull();
  const empty = harness(); await empty.create(); empty.now += 3600000;
  await empty.room.alarm(); expect(empty.room.data).toBeNull();
});
async function botRoom() {
  const h = harness(); await h.create(); const host = await h.join();
  await h.send(host, { type: 'start' });
  // Synthetic four-bot fixture: real hosts must stay seated to start.
  h.room.data!.people[host.token!]!.seat = null; host.seat = null;
  await finishSeating(h); return { h, host };
}

async function finishSeating(h: ReturnType<typeof harness>) {
  if (!h.room.data?.seatDice) return;
  h.room.data.seatDice = { groups: SEAT_ORDER.map(s => [s]), dice: { dong: [6,6,6], nan: [5,5,5], xi: [4,4,4], bei: [3,3,3] }, deadline: h.now + 15000, botAt: {}, settledAt: h.now };
  h.now += 3000; await h.room.alarm();
}

it.each([false, true])('finished-match leave removes the player before rematch (account=%s)', async account => {
  const h = harness(); await h.create();
  const host = await h.join('Host'), staying = await h.join('Staying');
  const leaving = h.connect(); if (account) leaving.userId = 'leaving';
  await h.send(leaving, { type: 'hello', name: 'Leaving' });
  await h.send(host, { type: 'start' }); await finishSeating(h);
  const snapshot = h.room.session!.serialize(); snapshot.match.endedBy = 'hands'; snapshot.match.finishedAt = h.now;
  h.room.session = TableSession.deserialize(snapshot, () => h.now);
  if (account) await h.room.leaveAccount('leaving'); else await h.send(leaving, { type: 'leave' });
  expect(h.blob.people[leaving.token!]).toBeUndefined();
  expect(h.room.info().seats.find(s => s.seat === leaving.seat)?.name).toBe('Leaving');
  h.rebuild();
  expect(h.room.info().seats.find(s => s.seat === leaving.seat)?.name).toBe('Leaving');
  await h.send(host, { type: 'rematch' }); await finishSeating(h);
  expect(h.room.info().phase).toBe('playing');
  expect(Object.values(h.blob.people).map(p => p.name)).toEqual(['Host', 'Staying']);
  expect(h.room.info().seats.find(s => s.name === 'Staying')?.connected).toBe(true);
  expect(h.blob.people[staying.token!]).toBeDefined();
});

describe('room', () => {
  it.each([false, true])('requires the host to sit before starting (fillWithBots=%s)', async fillWithBots => {
    let authorizations = 0;
    const h = harness(async () => { authorizations++; return null; });
    await h.create(); const host = await h.join('Host');
    await h.send(host, { type: 'stand' });
    expect(h.blob.people[host.token!]!.seat).toBeNull();
    expect(errors(h, host)).toEqual([]);
    for (let i = 0; i < 4; i++) await h.join(`Friend ${i}`);
    await h.send(host, { type: 'config', config: { ...DEFAULT_ROOM_CONFIG, fillWithBots } });
    await h.send(host, { type: 'start' });
    expect(errors(h, host).at(-1)).toMatchObject({ code: 'not_seated', message: 'Host harus duduk dulu buat mulai.' });
    expect(h.room.info().phase).toBe('lobby');
    expect(h.room.data!.seatDice).toBeUndefined();
    expect(h.room.session).toBeNull();
    expect(authorizations).toBe(0);
    const friend = [...h.room.sockets.values()].find(s => s !== host && s.seat === 'dong')!;
    await h.send(friend, { type: 'stand' });
    await h.send(host, { type: 'sit', seat: 'dong' });
    await h.send(host, { type: 'start' });
    expect(h.room.info().phase).toBe('seating');
    expect(authorizations).toBe(1);
    await finishSeating(h);
    expect(h.room.session).not.toBeNull();
    expect(authorizations).toBe(2);
  });
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
    // A host who stood up after the match can't start the next one from the spectator seats.
    h.room.data!.people[host.token!]!.seat = null;
    await h.send(host, { type: 'rematch' }); expect(errors(h, host).at(-1)).toMatchObject({ code: 'not_seated' });
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
  it('turns preset reactions into chat lines, limits across reconnect, and lets spectators react', async () => {
    const h = harness(); await h.create(); const host = await h.join(); await h.send(host, { type: 'start' }); await finishSeating(h);
    const watcher = await h.join('Watcher');
    await h.send(host, { type: 'reaction', preset: 0 });
    expect(h.frames.get(watcher.id)!.at(-1)).toMatchObject({ type: 'chat', line: { reaction: 0, seat: 'dong', name: 'Nama' } });
    await h.send(host, { type: 'reaction', preset: 1 }); h.now -= 50; expect(errors(h, host).at(-1)).toMatchObject({ code: 'rate_limited' });
    h.rebuild(); const returned = await h.join('Again', host.token);
    await h.send(returned, { type: 'reaction', preset: 2 }); expect(errors(h, returned).at(-1)).toMatchObject({ code: 'rate_limited' });
    h.now += 2000; await h.send(returned, { type: 'reaction', preset: 7 }); expect(h.frames.get(watcher.id)!.at(-1)).toMatchObject({ line: { reaction: 7 } });
    h.now += 2000; await h.room.message(returned, JSON.stringify({ type: 'reaction', preset: 8 })); expect(errors(h, returned).at(-1)).toMatchObject({ code: 'bad_message' });
    await h.send(watcher, { type: 'reaction', preset: 0 }); expect(h.frames.get(returned.id)!.at(-1)).toMatchObject({ type: 'chat', line: { reaction: 0, seat: null, name: 'Watcher' } });
  });
  it('validates chat text: trims, 120 characters, no empty or extra fields', async () => {
    const h = harness(); await h.create(); const host = await h.join('Host');
    const say = async (m: unknown) => { h.now += 1100; await h.room.message(host, JSON.stringify(m)); };
    await say({ type: 'chat', text: `  halo ${String.fromCharCode(10, 0)} semua  ` });
    expect(h.frames.get(host.id)!.at(-1)).toMatchObject({ type: 'chat', line: { text: 'halo semua', seat: 'dong', name: 'Host' } });
    await say({ type: 'chat', text: 'a'.repeat(120) }); expect(h.frames.get(host.id)!.at(-1)).toMatchObject({ type: 'chat', line: { text: 'a'.repeat(120) } });
    await say({ type: 'chat', text: '😂'.repeat(120) }); expect(h.frames.get(host.id)!.at(-1)).toMatchObject({ type: 'chat' });
    for (const bad of [{ type: 'chat', text: 'a'.repeat(121) }, { type: 'chat', text: '   ' }, { type: 'chat', text: String.fromCharCode(0x200b) }, { type: 'chat' }, { type: 'chat', text: 5 }, { type: 'chat', text: 'x', extra: 1 }]) {
      const before = h.room.data!.chat!.length;
      await say(bad); expect(errors(h, host).at(-1)).toMatchObject({ code: 'bad_message' }); expect(h.room.data!.chat).toHaveLength(before);
    }
    console.log(h.room.data!.chat!.map(l => `${l.id} ${l.name}: ${l.text}`.slice(0, 40)));
  });
  it('rate limits chat to one per second per person, across reconnect, and only for people in the room', async () => {
    const h = harness(); await h.create(); const host = await h.join('Host'); const other = await h.join('Other');
    const at = async (s: Socket, text: string, ms: number) => { h.now += ms - 101; await h.send(s, { type: 'chat', text }); };
    await at(host, 'satu', 1500); expect(h.room.data!.chat).toHaveLength(1);
    await at(host, 'dua', 500); expect(errors(h, host).at(-1)).toMatchObject({ code: 'rate_limited' }); expect(h.room.data!.chat).toHaveLength(1);
    await at(other, 'lain orang', 200); expect(h.room.data!.chat).toHaveLength(2);
    await at(host, 'tiga', 1000); expect(h.room.data!.chat).toHaveLength(3);
    h.rebuild(); const again = await h.join('Host', host.token);
    await at(again, 'empat', 300); expect(errors(h, again).at(-1)).toMatchObject({ code: 'rate_limited' });
    await at(again, 'empat', 1000); expect(h.room.data!.chat!.map(l => l.text)).toEqual(['satu', 'lain orang', 'tiga', 'empat']);
    // Not in the room: no hello yet, or a token that was removed.
    const stranger = h.connect(); await h.send(stranger, { type: 'chat', text: 'halo' });
    expect(errors(h, stranger).at(-1)).toMatchObject({ code: 'bad_message' });
    expect(h.frames.get(stranger.id)!.some(m => m.type === 'chat')).toBe(false);
    expect(h.room.data!.chat).toHaveLength(4);
  });
  it('keeps the chat limit for an account across a reconnect without a token and a token rotation', async () => {
    const h = harness(); await h.create();
    const host = h.connect(); host.userId = 'u-host'; await h.send(host, { type: 'hello', name: 'Host' });
    await h.send(host, { type: 'chat', text: 'satu' }); expect(h.room.data!.chat).toHaveLength(1);
    // Account recovery without a token rotates the seat's token; the one-second window must carry over.
    const again = h.connect(); again.userId = 'u-host'; await h.send(again, { type: 'hello', name: 'Host', reclaim: true });
    expect(again.token).not.toBe(host.token);
    await h.send(again, { type: 'chat', text: 'dua' }); expect(errors(h, again).at(-1)).toMatchObject({ code: 'rate_limited' });
    await h.send(again, { type: 'reaction', preset: 0 }); expect(errors(h, again).filter(e => e.code === 'rate_limited')).toHaveLength(2);
    // A second recovery after a rebuild (Durable Object hibernation) still remembers the last send.
    h.rebuild(); const third = h.connect(); third.userId = 'u-host'; third.lastReaction = again.lastReaction; await h.send(third, { type: 'hello', name: 'Host', reclaim: true });
    h.now += 2000; await h.send(third, { type: 'chat', text: 'tiga' }); expect(h.room.data!.chat!.map(l => l.text)).toEqual(['satu', 'tiga']);
    expect(Object.keys(h.room.data!.people)).toHaveLength(1);
  });
  it('reuses the unseated entry of a logged-in spectator who reconnects without a token', async () => {
    const h = harness(); await h.create(); const host = await h.join('Host'); await h.send(host, { type: 'start' }); await finishSeating(h);
    const watch = async () => { const s = h.connect(); s.userId = 'u-watch'; await h.send(s, { type: 'hello', name: 'Watcher' }); return s; };
    const first = await watch(); await h.send(first, { type: 'chat', text: 'halo' });
    const second = await watch(), third = await watch();
    expect(second.token).toBe(first.token); expect(third.token).toBe(first.token);
    expect(Object.values(h.room.data!.people).filter(p => p.userId === 'u-watch')).toHaveLength(1);
    expect(h.room.info().spectators).toBe(1);
    await h.send(third, { type: 'chat', text: 'lagi' }); expect(errors(h, third).at(-1)).toMatchObject({ code: 'rate_limited' });
    // A seated account still gets its own entry back, and a different account gets a new one.
    const other = h.connect(); other.userId = 'u-other'; await h.send(other, { type: 'hello', name: 'Other' });
    expect(other.token).not.toBe(first.token); expect(h.room.info().spectators).toBe(2);
  });
  it('stamps chat lines with the match name of the seat, not a later rename', async () => {
    const h = harness(); await h.create(); const host = await h.join('Host'); await h.send(host, { type: 'start' }); await finishSeating(h);
    expect(h.room.data!.matchNames!.dong).toBe('Host');
    await h.send(host, { type: 'rename', name: 'Orang Lain' }); expect(h.room.data!.people[host.token!]!.name).toBe('Orang Lain');
    h.now += 1100; await h.send(host, { type: 'chat', text: 'halo' });
    expect(h.room.data!.chat!.at(-1)).toMatchObject({ seat: 'dong', name: 'Host', text: 'halo' });
    const watcher = await h.join('Watcher'); await h.send(watcher, { type: 'chat', text: 'nonton' });
    expect(h.room.data!.chat!.at(-1)).toMatchObject({ seat: null, name: 'Watcher' });
  });
  it('sends the last 50 lines on join and reconnect, to players and spectators, and caps the history', async () => {
    const h = harness(); await h.create(); const host = await h.join('Host');
    for (let i = 1; i <= 55; i++) { h.now += 1100; await h.room.message(host, JSON.stringify({ type: 'chat', text: `pesan ${i}` })); }
    expect(h.room.data!.chat).toHaveLength(50); expect(h.blob.chat).toHaveLength(50);
    expect(h.room.data!.chat![0]).toMatchObject({ id: 6, text: 'pesan 6' });
    const joiner = await h.join('Joiner'); await h.send(joiner, { type: 'stand' });
    const history = (s: Socket) => h.frames.get(s.id)!.find(m => m.type === 'chatHistory') as Extract<ServerMessage, { type: 'chatHistory' }>;
    expect(history(joiner).lines).toHaveLength(50); expect(history(joiner).lines.at(-1)).toMatchObject({ text: 'pesan 55', name: 'Host', seat: 'dong' });
    const frames = h.frames.get(joiner.id)!; expect(frames.findIndex(m => m.type === 'welcome')).toBeLessThan(frames.findIndex(m => m.type === 'chatHistory'));
    const refreshed = await h.join('Joiner', joiner.token);
    expect(history(refreshed).lines.map(l => l.id)).toEqual(h.room.data!.chat!.map(l => l.id));
    expect(h.frames.get(host.id)!.filter(m => m.type === 'chat')).toHaveLength(55);
  });
  it('keeps chat across a Durable Object hibernation and deletes it with the room', async () => {
    const h = harness(); await h.create(); const host = await h.join('Host'); await h.send(host, { type: 'stand' });
    const writes = h.writes;
    h.now += 1100; await h.room.message(host, JSON.stringify({ type: 'chat', text: 'masih ada?' }));
    expect(h.writes).toBe(writes + 1);
    h.rebuild(); expect(h.room.data!.chat).toMatchObject([{ text: 'masih ada?', name: 'Host', seat: null }]);
    const returned = await h.join('Host', host.token);
    expect(h.frames.get(returned.id)!.find(m => m.type === 'chatHistory')).toMatchObject({ lines: [{ text: 'masih ada?' }] });
    h.now = h.room.data!.createdAt! + 2 * 86400000; await h.room.alarm();
    expect(h.room.data).toBeNull(); expect(h.blob).toBeNull();
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
  // The reconnecting account gets its own unseated entry back, so there is nothing to seat twice.
  expect(seat.token).toBe(spectator.token);
  expect(Object.values(h.blob.people).filter(p => p.userId === 'u')).toHaveLength(1);
  await h.send(seat, { type: 'sit', seat: 'nan' });
  await h.send(spectator, { type: 'sit', seat: 'xi' });
  expect(Object.values(h.blob.people).filter(p => p.userId === 'u' && p.seat).map(p => p.seat)).toEqual(['nan']);
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
  expect(errors(h, a).at(-1)).toMatchObject({ code: 'current_room', message: 'Kamu masih duduk di room GHJKLM.' });
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


it('new room matches and rematches use practice scoring while restored matches keep their frozen basis', async () => {
  const h = harness(); await h.create(); const host = await h.join('Host');
  await h.send(host, { type: 'start' }); await finishSeating(h);
  expect(h.room.session!.viewFor(null).settings).toMatchObject({ scoringBasis: 'match_table', bonusTileRule: 'rulebook_per_tile' });
  const frozen = h.room.session!.serialize();
  frozen.options.settings.scoringBasis = 'hand_kim_usage';
  h.room.session = TableSession.deserialize(frozen, () => h.now);
  expect(h.room.session.viewFor(null).settings.scoringBasis).toBe('hand_kim_usage');
  frozen.match.endedBy = 'hands'; frozen.match.finishedAt = h.now;
  h.room.session = TableSession.deserialize(frozen, () => h.now);
  await h.send(host, { type: 'rematch' }); await finishSeating(h);
  expect(h.room.session!.viewFor(null).settings.scoringBasis).toBe('match_table');
});
