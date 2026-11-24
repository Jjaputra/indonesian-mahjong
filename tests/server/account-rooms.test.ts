import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { RoomData, RoomIO } from '../../server/room';
import { DEFAULT_ROOM_CONFIG } from '../../src/net/protocol';
import type { Env } from '../../server/router';

const captured = vi.hoisted(() => ({ io: undefined as RoomIO | undefined, sockets: new Map<string, { token: string }>() }));
vi.mock('../../server/settings', () => ({ readSettings: async () => ({ loginRequired: false }) }));
vi.mock('../../server/room', () => ({ Room: class {
  sockets = captured.sockets;
  data: RoomData | null;
  constructor(io: RoomIO, data: RoomData | null) { captured.io = io; this.data = data; }
} }));

// A fixed clock keeps every save inside one 10-minute rewrite bucket.
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-23T00:01:00Z')); });
afterEach(() => vi.useRealTimers());

async function fixture() {
  const data: RoomData = { code: 'ABCDEF', creatorPending: true, creatorUserId: 'creator', config: DEFAULT_ROOM_CONFIG,
    people: { a: { name: 'A', userId: 'a', seat: 'dong' }, b: { name: 'B', userId: 'b', seat: 'nan' } },
    host: 'a', session: null, lastActivity: 1, handEndedAt: null, schedule: null };
  const statement = { bind: vi.fn().mockReturnThis(), run: vi.fn().mockResolvedValue({}), first: vi.fn().mockResolvedValue(null) };
  const db = { prepare: vi.fn((_sql: string) => statement), batch: vi.fn().mockResolvedValue([]) };
  const storage = { put: vi.fn().mockResolvedValue(undefined), get: async () => data, deleteAll: vi.fn().mockResolvedValue(undefined) };
  let ready: Promise<unknown> | undefined;
  const ctx = { storage, getWebSockets: () => [], blockConcurrencyWhile: (fn: () => Promise<unknown>) => { ready = fn(); } };
  // Import at runtime to keep Workers' ambient types out of the browser tsconfig.
  const adapterPath = '../../server/index.ts';
  const { RoomDO } = await import(adapterPath);
  new RoomDO(ctx, { DB: db } as unknown as Env);
  await ready;
  captured.sockets.clear();
  return { io: captured.io!, data, db, storage, statement };
}

it('writes once for unchanged seats despite activity, names, ordering, spectators and chat saves', async () => {
  const { io, data, db, storage } = await fixture();
  await io.put(data);
  data.lastActivity++; data.people.a!.name = 'Renamed';
  data.people = { spectator: { name: 'S', userId: 'watcher', seat: null }, b: data.people.b!, a: data.people.a! };
  await io.put(data); await io.put(data, { chatOnly: true }); await io.put(data);
  expect(db.batch).toHaveBeenCalledTimes(1);
  expect(storage.put).toHaveBeenCalledTimes(4);
});

it('writes again for a seat change, leave, pending creator off, account change and room code', async () => {
  const { io, data, db, statement } = await fixture();
  await io.put(data);
  data.people.a!.seat = 'xi'; data.lastActivity = 50; await io.put(data);
  expect(db.batch).toHaveBeenCalledTimes(2);
  expect(statement.bind).toHaveBeenCalledWith('a', 'ABCDEF', 'xi', 50);
  delete data.people.b; await io.put(data); expect(db.batch).toHaveBeenCalledTimes(3);
  data.creatorPending = false; await io.put(data); expect(db.batch).toHaveBeenCalledTimes(4);
  data.people.a!.userId = 'new'; await io.put(data); expect(db.batch).toHaveBeenCalledTimes(5);
  data.code = 'BCDEFG'; await io.put(data); expect(db.batch).toHaveBeenCalledTimes(6);
});

it('resets the cache on deleteAll and starts fresh after eviction', async () => {
  const { io, data, db, storage } = await fixture();
  await io.put(data); await io.deleteAll(); await io.put(data);
  expect(storage.deleteAll).toHaveBeenCalledOnce(); expect(db.batch).toHaveBeenCalledTimes(2);
  const fresh = await fixture(); await fresh.io.put(fresh.data); expect(fresh.db.batch).toHaveBeenCalledOnce();
});

it('retries a failed batch and does not cache chat-only writes', async () => {
  const { io, data, db } = await fixture();
  await io.put(data, { chatOnly: true }); expect(db.batch).not.toHaveBeenCalled();
  db.batch.mockRejectedValueOnce(new Error('unavailable'));
  await expect(io.put(data)).rejects.toThrow('unavailable');
  await io.put(data); await io.put(data); expect(db.batch).toHaveBeenCalledTimes(2);
});

it('rewrites unchanged seats once per 10 minutes, so a row another room overwrote heals', async () => {
  const { io, data, db } = await fixture();
  await io.put(data);
  vi.setSystemTime(new Date('2026-11-23T00:09:00Z')); await io.put(data); expect(db.batch).toHaveBeenCalledTimes(1);
  vi.setSystemTime(new Date('2026-11-23T00:11:00Z')); await io.put(data); expect(db.batch).toHaveBeenCalledTimes(2);
});

it('lists on value changes and unlists full, private, started and hostless rooms', async () => {
  const { io, data, db, statement } = await fixture();
  data.config = { ...DEFAULT_ROOM_CONFIG, public: true };
  captured.sockets.set('host', { token: 'a' });
  const writes = () => db.prepare.mock.calls.filter(([sql]) => sql.includes('public_rooms')).length;
  await io.put(data); expect(writes()).toBe(1);
  expect(statement.bind).toHaveBeenCalledWith('ABCDEF', 'A', 0, 2, JSON.stringify(data.config), 1);
  data.lastActivity++; await io.put(data); await io.put(data, { chatOnly: true }); expect(writes()).toBe(1);
  data.people.b!.seat = null; await io.put(data); expect(writes()).toBe(2);
  data.people.b!.seat = 'nan'; await io.put(data); expect(writes()).toBe(3);
  data.people.c = { name: 'C', seat: 'xi' }; data.people.d = { name: 'D', seat: 'bei' };
  await io.put(data); expect(writes()).toBe(4);
  delete data.people.d; await io.put(data); expect(writes()).toBe(5);
  data.config.public = false; await io.put(data); expect(writes()).toBe(6);
  data.config.public = true; await io.put(data); expect(writes()).toBe(7);
  data.seatDice = { groups: [], dice: {}, deadline: 100, botAt: {}, settledAt: null };
  await io.put(data); expect(writes()).toBe(8);
  data.seatDice = null; await io.put(data); expect(writes()).toBe(9);
  captured.sockets.clear(); await io.put(data); expect(writes()).toBe(10);
  captured.sockets.set('host', { token: 'a' }); await io.put(data); expect(writes()).toBe(11);
  // A host waiting on handover can't run the room, so it isn't listed even while connected.
  data.hostTransferPending = true; await io.put(data); expect(writes()).toBe(12);
  data.hostTransferPending = false; await io.put(data); expect(writes()).toBe(13);
  await io.deleteAll(); expect(writes()).toBe(14);
});

it('rewrites the public listing when only host Premium changes', async () => {
  const { io, data, db, statement } = await fixture();
  data.config = { ...DEFAULT_ROOM_CONFIG, public: true };
  captured.sockets.set('host', { token: 'a' });
  await io.put(data);
  data.people.a!.premium = true; await io.put(data);
  expect(statement.bind).toHaveBeenCalledWith('ABCDEF', 'A', 1, 2, JSON.stringify(data.config), 1);
  expect(db.prepare.mock.calls.filter(([sql]) => sql.includes('INSERT INTO public_rooms'))).toHaveLength(2);
  await io.put(data);
  expect(db.prepare.mock.calls.filter(([sql]) => sql.includes('INSERT INTO public_rooms'))).toHaveLength(2);
});

it('resolves Premium from the session account and fails closed for absent or mismatched accounts', async () => {
  const { io, db, statement } = await fixture();
  statement.first.mockResolvedValue({ id: 'u', premium: 1 } as never);
  expect(await io.accountPremium!({ id: 's', userId: 'u', sessionHash: 'hash' })).toBe(true);
  expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('u.picture,u.premium FROM sessions'));
  statement.first.mockResolvedValue({ id: 'u', premium: 0 } as never);
  expect(await io.accountPremium!({ id: 's', userId: 'u', sessionHash: 'hash' })).toBe(false);
  statement.first.mockResolvedValue({ id: 'other', premium: 1 } as never);
  expect(await io.accountPremium!({ id: 's', userId: 'u', sessionHash: 'hash' })).toBe(false);
  statement.first.mockResolvedValue(null);
  expect(await io.accountPremium!({ id: 's', userId: 'u', sessionHash: 'hash' })).toBe(false);
  expect(await io.accountPremium!({ id: 's' })).toBe(false);
});
