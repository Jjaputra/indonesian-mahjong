import { describe, expect, it } from 'vitest';
import { BACKOFF_MS, backoffDelay, clockOffset } from '../../src/net/connection';
import { MemoryStorage } from '../../src/storage';
import { RemoteTable } from '../../src/net/remote-table';
import { loadLastRoom, loadRoom } from '../../src/net/room-store';
import { fakeNetwork, fakeTimers, roomInfo } from './fake-transport';

function setup(token?: string) {
  const net = fakeNetwork(), clock = fakeTimers(), storage = new MemoryStorage();
  const table = new RemoteTable({ server: 'https://mp.example', code: 'ABC234', name: 'A Liong', token, storage,
    socketFactory: net.factory, timers: clock.timers, now: () => 10_000 + clock.now, pingMs: 25_000 });
  return { net, clock, storage, table };
}

const welcome = (token = 'tok-1', serverNow = 50_000) => ({ type: 'welcome' as const, token, seat: 'dong' as const, host: true, serverNow, room: roomInfo() });

describe('hello / welcome', () => {
  it('sends hello with the name on open, and stores the token from welcome', () => {
    const { net, table, storage } = setup();
    table.connect();
    expect(net.last.url).toBe('wss://mp.example/rooms/ABC234/ws');
    net.last.open();
    expect(net.last.sent[0]).toEqual({ type: 'hello', name: 'A Liong' });
    net.last.receive(welcome());
    expect(table.getState()).toMatchObject({ status: 'open', joined: true, seat: 'dong' });
    expect(loadRoom('ABC234', storage)).toEqual({ code: 'ABC234', token: 'tok-1', name: 'A Liong' });
    expect(loadLastRoom(storage)?.code).toBe('ABC234');
  });

  it('reconnects after a drop and says hello with the stored token', () => {
    const { net, clock, table } = setup();
    table.connect();
    net.last.open();
    net.last.receive(welcome('tok-9'));
    net.last.drop();
    expect(table.getState().status).toBe('reconnecting');
    expect(net.sockets).toHaveLength(1);
    clock.advance(BACKOFF_MS[0]);
    expect(net.sockets).toHaveLength(2);
    net.last.open();
    expect(net.last.sent[0]).toMatchObject({ type: 'hello', token: 'tok-9', name: 'A Liong' });
  });

  it('backs off while the server stays down, and resets after a welcome', () => {
    const { net, clock, table } = setup('tok');
    table.connect();
    for (let i = 0; i < 4; i++) {
      net.last.drop();
      clock.advance(backoffDelay(i) - 1);
      expect(net.sockets).toHaveLength(i + 1);
      clock.advance(1);
      expect(net.sockets).toHaveLength(i + 2);
    }
    net.last.open();
    net.last.receive(welcome('tok'));
    net.last.drop();
    clock.advance(BACKOFF_MS[0]);
    expect(net.sockets).toHaveLength(6);
  });

  it('pings while open', () => {
    const { net, clock, table } = setup();
    table.connect();
    net.last.open();
    net.last.receive(welcome());
    expect(net.last.ofType('ping')).toHaveLength(1); // right after welcome
    clock.advance(25_000);
    expect(net.last.ofType('ping')).toHaveLength(2);
  });
});

describe('clock offset', () => {
  it('is server time minus local time, plus half the round trip when known', () => {
    expect(clockOffset(50_000, 10_000)).toBe(40_000);
    expect(clockOffset(50_000, 10_000, 200)).toBe(40_100);
  });

  it('is learned from welcome and refined by pong', () => {
    const { net, clock, table } = setup();
    table.connect();
    net.last.open();
    net.last.receive(welcome('t', 50_000));
    expect(table.offset).toBe(40_000);
    expect(table.serverNow()).toBe(50_000);
    // The ping sent with the welcome comes back 200 ms later: the server stamped 50_100 at the midpoint.
    clock.advance(200);
    net.last.receive({ type: 'pong', serverNow: 50_100 });
    expect(table.offset).toBe(50_100 + 100 - (10_000 + 200));
  });

  it('is not overwritten by later views, which carry no round trip', () => {
    const { net, clock, table } = setup();
    table.connect();
    net.last.open();
    net.last.receive(welcome('t', 50_000));
    clock.advance(200);
    net.last.receive({ type: 'pong', serverNow: 50_100 });
    const refined = table.offset;
    clock.advance(1_000);
    net.last.receive({ type: 'view', serverNow: 99_999, view: { version: 1, phase: 'ACTION_DECISION' } as never });
    expect(table.offset).toBe(refined);
  });

  it('converts a server deadline to the local clock', () => {
    const { net, table } = setup();
    table.connect();
    net.last.open();
    net.last.receive(welcome('t', 50_000));
    net.last.receive({ type: 'view', serverNow: 50_000, view: { version: 3, deadline: 65_000 } as never });
    expect(table.deadlineLocal()).toBe(25_000);
  });
});

describe('errors and kicks', () => {
  it('a stale-version error triggers a resync message on the live socket', () => {
    const { net, table } = setup();
    table.connect();
    net.last.open();
    net.last.receive(welcome('tok-2'));
    net.last.receive({ type: 'error', code: 'stale_version', message: 'Versi meja sudah berubah.' });
    expect(net.last.ofType('hello')).toHaveLength(1);
    expect(net.last.ofType('resync')).toHaveLength(1);
    expect(table.getState().error).toBeNull();
  });

  it('kicked stops reconnecting', () => {
    const { net, clock, table } = setup();
    table.connect();
    net.last.open();
    net.last.receive(welcome());
    net.last.receive({ type: 'kicked', reason: 'replaced' });
    expect(table.getState()).toMatchObject({ ended: 'replaced', status: 'stopped' });
    net.last.drop();
    clock.advance(60_000);
    expect(net.sockets).toHaveLength(1);
    table.onVisible();
    expect(net.sockets).toHaveLength(1);
  });

  it('kicked forgets the stored room so the menu stops offering it', () => {
    const { net, table, storage } = setup();
    table.connect();
    net.last.open();
    net.last.receive(welcome('tok-k'));
    expect(loadLastRoom(storage)?.code).toBe('ABC234');
    net.last.receive({ type: 'kicked', reason: 'replaced' });
    expect(loadRoom('ABC234', storage)).toBeNull();
    expect(loadLastRoom(storage)).toBeNull();
  });

  it('room_not_found forgets the stored room and stops', () => {
    const { net, clock, table, storage } = setup('old');
    table.connect();
    net.last.open();
    net.last.receive({ type: 'error', code: 'room_not_found', message: 'Room tidak ditemukan.' });
    expect(table.getState().ended).toBe('room_not_found');
    expect(loadRoom('ABC234', storage)).toBeNull();
    clock.advance(60_000);
    expect(net.sockets).toHaveLength(1);
  });

  it('other errors surface for a toast without dropping the connection', () => {
    const { net, table } = setup();
    table.connect();
    net.last.open();
    net.last.receive(welcome());
    net.last.receive({ type: 'error', code: 'seat_taken', message: 'Kursi sudah terisi.' });
    expect(table.getState().error).toMatchObject({ code: 'seat_taken', message: 'Kursi sudah terisi.' });
    expect(table.getState().status).toBe('open');
  });

  it('the tab becoming visible resyncs when open and reconnects at once when down', () => {
    const { net, table } = setup();
    table.connect();
    net.last.open();
    net.last.receive(welcome());
    table.onVisible();
    expect(net.last.ofType('resync')).toHaveLength(1);
    expect(net.last.ofType('hello')).toHaveLength(1);
    net.last.drop();
    table.onVisible();
    expect(net.sockets).toHaveLength(2);
  });
});
