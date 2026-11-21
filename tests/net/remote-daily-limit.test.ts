import { describe, expect, it } from 'vitest';
import { RemoteTable } from '../../src/net/remote-table';
import { countHostedMatch, remainingMatches } from '../../src/net/daily-limit';
import { MemoryStorage, DEFAULT_SETTINGS } from '../../src/storage';
import { TableSession } from '../../src/session';
import { fakeNetwork, roomInfo } from './fake-transport';
import type { RoomPhase } from '../../src/net/protocol';

const now = Date.parse('2026-11-21T10:00:00Z');
function fixture(host = true, phase: RoomPhase = 'lobby', storage = new MemoryStorage(), welcomeRoom = roomInfo({ phase })) {
  const net = fakeNetwork();
  const table = new RemoteTable({ code: 'ABC234', name: 'Jason', server: 'https://example.com', storage, socketFactory: net.factory, now: () => now });
  table.connect(); net.last.open();
  net.last.receive({ type: 'welcome', host, seat: 'dong', token: 't', room: welcomeRoom, serverNow: now });
  const room = (phase: RoomPhase, hostNow = host, deadline = now + 15000) => net.last.receive({ type: 'room', host: hostNow, seat: 'dong', room: roomInfo({ phase,
    seatDice: phase === 'seating' ? { groups: [['dong', 'nan', 'xi', 'bei']], dice: {}, botAt: {}, deadline, settledAt: null } : null }) });
  const view = (startedAt = now, matchOver = false) => {
    const session = new TableSession({ settings: DEFAULT_SETTINGS, seats: { dong: 'human', nan: 'bot', xi: 'bot', bei: 'bot' }, now: () => startedAt, seed: 5 });
    net.last.receive({ type: 'view', serverNow: now, view: { ...session.viewFor('dong'), matchOver } });
  };
  return { table, net, storage, room, view, remaining: () => remainingMatches(now, storage) };
}

describe('confirmed online host starts', () => {
  it.each(['seating', 'playing'] as const)('recovers a missed confirmation from a reload welcome in %s', phase => {
    const before = fixture(); before.table.start(); before.table.disconnect();
    expect(before.remaining()).toBe(5);
    const reloaded = fixture(true, phase, before.storage);
    // A seating welcome may have no dice in this fixture: its following room supplies them.
    if (phase === 'seating') { reloaded.room('seating'); reloaded.room('playing'); }
    reloaded.view(now + 1000); reloaded.view(now + 1000);
    expect(reloaded.remaining()).toBe(4);
    reloaded.table.disconnect();
  });
  it('counts a seating welcome before any following room message', () => {
    const before = fixture(); before.table.disconnect();
    const reloaded = fixture(true, 'seating', before.storage,
      roomInfo({ phase: 'seating', seatDice: { groups: [['dong', 'nan', 'xi', 'bei']], dice: {}, botAt: {}, deadline: now + 16000, settledAt: null } }));
    expect(reloaded.remaining()).toBe(4);
    reloaded.table.disconnect();
  });
  it('recovers a missed rematch confirmation after a finished boundary', () => {
    const before = fixture(true, 'finished'); before.view(now - 1000, true); before.table.disconnect();
    const reloaded = fixture(true, 'playing', before.storage); reloaded.view(now + 1000);
    expect(reloaded.remaining()).toBe(4); reloaded.table.disconnect();
  });
  it('does not count the old match after a finished-boundary reload', () => {
    const before = fixture(true, 'finished'); before.view(now - 1000, true); before.table.disconnect();
    const reloaded = fixture(true, 'playing', before.storage); reloaded.view(now - 1000);
    expect(reloaded.remaining()).toBe(5); reloaded.table.disconnect();
  });
  it('does not count a match that predates the saved lobby observation', () => {
    const before = fixture(); before.table.disconnect();
    const reloaded = fixture(true, 'playing', before.storage); reloaded.view(now - 1000);
    expect(reloaded.remaining()).toBe(5); reloaded.table.disconnect();
  });
  it('does not use another host token or an observed loss of host rights as start evidence', () => {
    const before = fixture(); before.table.disconnect();
    const reloaded = fixture(true, 'playing', before.storage);
    reloaded.net.last.receive({ type: 'welcome', token: 'other', host: true, seat: 'dong', serverNow: now, room: roomInfo({ phase: 'playing' }) });
    reloaded.view(now + 1000); expect(reloaded.remaining()).toBe(5); reloaded.table.disconnect();
    const lost = fixture(); lost.room('lobby', false); lost.table.disconnect();
    const inherited = fixture(true, 'playing', lost.storage); inherited.view(now + 1000);
    expect(inherited.remaining()).toBe(5); inherited.table.disconnect();
  });
  it('counts the confirmation, not button presses, and dedupes seating rerolls and next hands', () => {
    const f = fixture();
    f.table.start(); f.table.start();
    expect(f.remaining()).toBe(5);
    f.room('seating'); expect(f.remaining()).toBe(4);
    f.room('seating', true, 30000); expect(f.remaining()).toBe(4);
    f.room('playing'); f.view(); f.view();
    countHostedMatch('ABC234', now, now, f.storage);
    expect(f.remaining()).toBe(4);
    f.table.disconnect();
  });
  it('counts a confirmed rematch once', () => {
    const f = fixture(true, 'finished');
    f.view(now, true); f.table.rematch(); expect(f.remaining()).toBe(5);
    f.room('seating'); f.room('playing'); f.view(now + 1000);
    expect(f.remaining()).toBe(4);
    f.table.disconnect();
  });
  it('preserves a seating count through reload and reconnect', () => {
    const f = fixture(); f.room('seating'); f.table.disconnect();
    const reloaded = fixture(true, 'seating', f.storage);
    reloaded.room('seating'); reloaded.room('playing'); reloaded.view();
    expect(reloaded.remaining()).toBe(4);
    reloaded.net.last.receive({ type: 'welcome', host: true, seat: 'dong', token: 't', room: roomInfo({ phase: 'playing' }), serverNow: now });
    reloaded.room('playing'); reloaded.view();
    expect(reloaded.remaining()).toBe(4);
    reloaded.table.disconnect();
  });
  it('never counts joiners, including host handover mid-match, but counts their next rematch', () => {
    const f = fixture(false);
    f.room('seating'); f.room('playing'); f.view();
    f.room('playing', true); f.view(); expect(f.remaining()).toBe(5);
    f.room('finished', true); f.view(now, true);
    f.room('seating', true); f.room('playing', true); f.view(now + 1000);
    expect(f.remaining()).toBe(4);
    f.table.disconnect();
  });
  it('does not count a first welcome into an ongoing match', () => {
    const f = fixture(true, 'playing'); f.room('playing'); f.view();
    expect(f.remaining()).toBe(5); f.table.disconnect();
  });
  it('guards both actions against an exhausted device allowance', () => {
    const f = fixture();
    for (let i = 0; i < 5; i++) countHostedMatch('XYZ234', i, now, f.storage);
    f.table.start(); f.table.rematch();
    expect(f.net.last.ofType('start')).toHaveLength(0);
    expect(f.net.last.ofType('rematch')).toHaveLength(0);
    f.table.disconnect();
  });
});
