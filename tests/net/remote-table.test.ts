import { describe, expect, it, vi } from 'vitest';
import { TableSession } from '../../src/session';
import { DEFAULT_SETTINGS, MemoryStorage, loadGameHistory } from '../../src/storage';
import { DEFAULT_ROOM_CONFIG } from '../../src/net/protocol';
import { loadRoom } from '../../src/net/room-store';
import { RemoteTable } from '../../src/net/remote-table';
import { PLAYER_NAME } from '../../src/ui/labels';
import { RemoteController, seatNames, spectatorBottomNames } from '../../src/ui/components/remote-adapter';
import { fakeNetwork, fakeTimers, roomInfo } from './fake-transport';

function joined(initialConfig?: typeof DEFAULT_ROOM_CONFIG) {
  const net = fakeNetwork(), clock = fakeTimers();
  const table = new RemoteTable({ server: 'https://mp.example', code: 'ABC234', name: 'Jason', storage: new MemoryStorage(), initialConfig,
    socketFactory: net.factory, timers: clock.timers, now: () => clock.now });
  table.connect();
  net.last.open();
  net.last.receive({ type: 'welcome', token: 't', seat: 'dong', host: true, serverNow: 0, room: roomInfo() });
  return { net, table, clock };
}

const oneHumanSession = () => new TableSession({ settings: { ...DEFAULT_SETTINGS }, seats: { dong: 'human', nan: 'bot', xi: 'bot', bei: 'bot' }, seed: 5, now: () => 1000 });

it('stops on a silent replacement close and sends reclaim only after the button, never on later reconnects', () => {
  const { net, table, clock } = joined();
  (net.last.onclose as ((event: { code: number }) => void) | null)?.({ code: 4001 });
  expect(table.getState()).toMatchObject({ ended: 'replaced', status: 'stopped' });
  clock.advance(60000); table.onVisible(); expect(net.sockets).toHaveLength(1);
  table.reclaim(); net.last.open();
  expect(net.last.sent[0]).toMatchObject({ type: 'hello', reclaim: true });
  net.last.receive({ type: 'welcome', token: 'new', seat: 'dong', host: true, serverNow: 0, room: roomInfo() });
  net.last.drop(); clock.advance(500); net.last.open();
  expect(net.last.sent[0]).not.toHaveProperty('reclaim');
});

it('refreshes the account at welcome, match end, kick and leave, avoiding room broadcast polling', () => {
  const fetcher = vi.fn(async () => Response.json(null)); vi.stubGlobal('fetch', fetcher);
  try {
    const { net, table } = joined(); expect(fetcher).toHaveBeenCalledTimes(1);
    const room = roomInfo();
    for (let i = 0; i < 10; i++) net.last.receive({ type: 'room', room, seat: 'dong', host: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    net.last.receive({ type: 'room', room: { ...room, phase: 'finished' }, seat: 'dong', host: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    net.last.receive({ type: 'room', room: { ...room, phase: 'finished' }, seat: 'dong', host: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    net.last.receive({ type: 'kicked', reason: 'replaced' }); expect(fetcher).toHaveBeenCalledTimes(3);
    table.leave(); expect(fetcher).toHaveBeenCalledTimes(4);
  } finally { vi.unstubAllGlobals(); }
});

describe('RemoteTable actions', () => {
  it('act carries the version of the latest view', () => {
    const { net, table } = joined();
    const session = oneHumanSession();
    net.last.receive({ type: 'view', serverNow: 0, view: session.viewFor('dong') });
    expect(table.act({ type: 'draw' })).toBe(true);
    expect(net.last.ofType('act')[0]!.action).toEqual({ type: 'draw', version: session.version });
    session.setConnected('nan', false);
    expect(session.version).toBeGreaterThan(0);
    net.last.receive({ type: 'view', serverNow: 0, view: session.viewFor('dong') });
    table.act({ type: 'discard', tileId: 'x' });
    expect(net.last.ofType('act')[1]!.action).toMatchObject({ type: 'discard', tileId: 'x', version: session.version });
  });

  it('requests a rematch and clears the old match view and log when seating starts', () => {
    const { net, table } = joined();
    const v = oneHumanSession().viewFor('dong');
    net.last.receive({ type: 'view', view: { ...v, phase: 'RESOLVED_HU', matchOver: true }, serverNow: 0 });
    net.last.receive({ type: 'event', text: 'Old match' });
    table.rematch(); expect(net.last.sent.at(-1)).toEqual({ type: 'rematch' });
    net.last.receive({ type: 'room', room: { ...roomInfo(), phase: 'seating' }, seat: 'dong', host: true });
    expect(table.getState()).toMatchObject({ view: null, handEndedAt: null, log: [] });
    net.last.receive({ type: 'view', view: v, serverNow: 0 });
    expect(table.getState().view).toEqual(v);
  });

  it('refuses to act before the first view', () => {
    const { net, table } = joined();
    expect(table.act({ type: 'pass' })).toBe(false);
    expect(net.last.ofType('act')).toHaveLength(0);
  });

  it('sends the Buat Room config once after the first welcome of a created room', () => {
    const config = { ...DEFAULT_ROOM_CONFIG, minHuTay: 8 as const };
    const { net, table } = joined(config);
    expect(net.last.ofType('config')).toEqual([{ type: 'config', config }]);
    net.last.receive({ type: 'welcome', token: 't', seat: 'dong', host: true, serverNow: 0, room: roomInfo() });
    expect(net.last.ofType('config')).toHaveLength(1);
    expect(table.isHost).toBe(true);
  });

  it('sit and stand only send; seat and host come from the server', () => {
    const { net, table } = joined();
    table.stand();
    table.sit('xi');
    expect(net.last.sent.slice(-2)).toEqual([{ type: 'stand' }, { type: 'sit', seat: 'xi' }]);
    expect(table.getState().seat).toBe('dong');
    net.last.receive({ type: 'room', room: roomInfo(), seat: 'xi', host: false });
    expect(table.getState()).toMatchObject({ seat: 'xi', host: false });
    net.last.receive({ type: 'room', room: roomInfo(), seat: null, host: true });
    expect(table.getState()).toMatchObject({ seat: null, host: true });
    expect(table.isHost).toBe(true);
  });
});

describe('end of hand', () => {
  it.each([false, true])('clears old match activity after reconnecting past seating (new hand finished: %s)', finished => {
    const { net, table, clock } = joined();
    const view = oneHumanSession().viewFor('dong');
    net.last.receive({ type: 'view', serverNow: 0, view: { ...view, phase: 'RESOLVED_HU', matchOver: true } });
    net.last.receive({ type: 'event', text: 'Old match activity' });
    clock.advance(1000);
    net.last.drop(); table.onVisible(); net.last.open();
    const room = roomInfo({ phase: 'playing' });
    net.last.receive({ type: 'welcome', token: 't', seat: 'dong', host: true, serverNow: 1000, room });
    net.last.receive({ type: 'room', room, seat: 'dong', host: true });
    // A same-match resync keeps activity; no seating/lobby message arrives during this reconnect.
    net.last.receive({ type: 'view', serverNow: 1000, view: { ...view, phase: 'RESOLVED_HU', matchOver: true } });
    expect(table.getState().log.map(l => l.text)).toEqual(['Old match activity']);
    const nextView = { ...view, match: { ...view.match, startedAt: view.match.startedAt + 1000 },
      phase: finished ? 'RESOLVED_HU' as const : view.phase };
    net.last.receive({ type: 'view', serverNow: 1000, view: nextView });
    expect(table.getState().log).toEqual([]);
    expect(table.getState().handEndedAt).toBe(finished ? 1000 : null);
    net.last.receive({ type: 'event', text: 'New match activity' });
    net.last.receive({ type: 'view', serverNow: 1000, view: { ...nextView, version: nextView.version + 1 } });
    expect(table.getState().log.map(l => l.text)).toEqual(['New match activity']);
    table.disconnect();
  });

  it('stamps the end once; later views of the same finished hand keep the first time', () => {
    const { net, table, clock } = joined();
    const view = oneHumanSession().viewFor('dong');
    net.last.receive({ type: 'view', serverNow: 0, view });
    expect(table.getState().handEndedAt).toBeNull();
    clock.advance(1_000);
    net.last.receive({ type: 'view', serverNow: 0, view: { ...view, phase: 'RESOLVED_HU' } });
    expect(table.getState().handEndedAt).toBe(1_000);
    clock.advance(5_000);
    net.last.receive({ type: 'view', serverNow: 0, view: { ...view, phase: 'RESOLVED_HU', version: view.version + 1 } });
    expect(table.getState().handEndedAt).toBe(1_000);
    net.last.receive({ type: 'view', serverNow: 0, view });
    expect(table.getState().handEndedAt).toBeNull();
  });
});

describe('names and spectators', () => {
  it('builds room names without touching the shared PLAYER_NAME', () => {
    const before = { ...PLAYER_NAME };
    const { table } = joined();
    expect(seatNames(table)).toMatchObject({ dong: 'Jason (Anda)', nan: 'Kursi Selatan' });
    expect(PLAYER_NAME).toEqual(before);
  });

  it('renders a spectator from Dong with every hand hidden and a Menonton label', () => {
    const { net, table } = joined();
    const session = oneHumanSession();
    net.last.receive({ type: 'room', room: roomInfo(), seat: null, host: false });
    net.last.receive({ type: 'view', serverNow: 0, view: session.viewFor(null) });
    const remote = new RemoteController(table);
    expect(remote.spectator).toBe(true);
    expect(remote.humanSeat).toBe('dong');
    const players = remote.getState().players;
    expect(players.dong.hand).toHaveLength(14);
    expect(Object.values(players).every(p => p.hand.every(t => t.id.startsWith('hidden-')))).toBe(true);
    expect(remote.getHumanActions()).toMatchObject({ canDiscard: false, canDraw: false, claim: null });
    expect(spectatorBottomNames(table).dong).toBe('Jason · Menonton');
    expect(seatNames(table).dong).toBe('Jason');
  });
});

describe('RemoteController (table adapter)', () => {
  it('exposes the own hand, hidden opponent tiles and legal actions from a SeatView', () => {
    const { net, table } = joined();
    const session = oneHumanSession();
    net.last.receive({ type: 'view', serverNow: 0, view: session.viewFor('dong') });
    const remote = new RemoteController(table);
    const state = remote.getState();
    expect(state.players.dong.hand).toHaveLength(session.viewFor('dong').hand.length);
    expect(state.players.nan.hand.every(t => t.id.startsWith('hidden-'))).toBe(true);
    const actions = remote.getHumanActions();
    expect(actions.claim).toBeNull();
    expect(actions.canDiscard).toBe(true);
    remote.humanDiscard(actions.discardableTileIds[0]!);
    expect(net.last.ofType('act').at(-1)!.action).toMatchObject({ type: 'discard', tileId: actions.discardableTileIds[0], version: session.version });
  });

  it('badges a human seat that is offline or AFK, never a bot', () => {
    const { net, table } = joined();
    const session = oneHumanSession();
    session.setConnected('nan', false);
    net.last.receive({ type: 'room', seat: 'dong', host: true, room: roomInfo({ seats: roomInfo().seats.map(s => s.seat === 'xi' ? { ...s, name: 'Bot', bot: true } : s) }) });
    net.last.receive({ type: 'view', serverNow: 0, view: session.viewFor('dong') });
    const remote = new RemoteController(table);
    expect(remote.presence('nan')).toBe('Offline');
    expect(remote.presence('dong')).toBeNull();
    session.setConnected('xi', false);
    net.last.receive({ type: 'view', serverNow: 0, view: session.viewFor('dong') });
    expect(remote.presence('xi')).toBeNull();
  });

  it('shows no actions to a spectator', () => {
    const { net, table } = joined();
    const session = oneHumanSession();
    net.last.receive({ type: 'welcome', token: 't', seat: null, host: false, serverNow: 0, room: roomInfo() });
    net.last.receive({ type: 'view', serverNow: 0, view: session.viewFor(null) });
    const remote = new RemoteController(table);
    expect(remote.getHumanActions()).toMatchObject({ canDraw: false, canDiscard: false, claim: null });
  });
});

it('saves online final history with room code once across repeated views and excludes spectators', () => {
  const storage = new MemoryStorage(), net = fakeNetwork();
  const table = new RemoteTable({ server: 'https://mp.example', code: 'ABC234', name: 'Jason', storage, socketFactory: net.factory });
  table.connect(); net.last.open(); net.last.receive({ type: 'welcome', token: 't', seat: 'dong', host: true, serverNow: 0, room: roomInfo() });
  const view = oneHumanSession().viewFor('dong');
  view.matchOver = true; view.match.finishedAt = 2000;
  view.match.koinTotal = { dong: 100, nan: -80, xi: -10, bei: -10 };
  view.match.tayTotal = { dong: 50, nan: 9, xi: 0, bei: 0 }; view.match.huCount.dong = 3;
  view.match.hands = Array.from({ length: 16 }, (_, i) => ({ hand: i + 1, dealer: 'dong', prevailingWind: 'dong', winner: null, totalTay: 0, roundScore: null, kongPayments: [], gameDeltas: { dong: 0, nan: 0, xi: 0, bei: 0 } }));
  view.lastHand = { winner: null, winMethod: 'draw', discarder: null, hand: [], melds: [], breakdown: [{ id: 37, pattern: 'Original pattern', tay: 2 }], payments: { hand: 16, dealer: 'dong', prevailingWind: 'dong', winner: null, totalTay: 0, roundScore: null, kongPayments: [], gameDeltas: { dong: 0, nan: 0, xi: 0, bei: 0 } } };
  net.last.receive({ type: 'view', view, serverNow: 2000 }); net.last.receive({ type: 'view', view, serverNow: 2000 });
  expect(loadGameHistory(storage)).toHaveLength(1); expect(loadGameHistory(storage)[0]).toMatchObject({ online: true, roomCode: 'ABC234', matchSummary: { seat: 'dong', handsPlayed: 16, huCount: 3, koinTotal: { dong: 100, nan: -80, xi: -10, bei: -10 }, tayTotal: { dong: 50, nan: 9, xi: 0, bei: 0 } }, scoringBreakdown: [{ id: 37, name: 'Original pattern', tay: 2 }] });
  net.last.receive({ type: 'room', room: roomInfo(), seat: null, host: false });
  view.match.startedAt++; net.last.receive({ type: 'view', view, serverNow: 2000 });
  expect(loadGameHistory(storage)).toHaveLength(1); table.disconnect();
});

it('uses server chronology after reload even when Kong disrupts seat rotation', () => {
  const { net, table } = joined(); const view = oneHumanSession().viewFor('dong');
  const a = { id: 'first', type: 'tong' as const, value: 1 }, b = { id: 'kong-turn', type: 'tong' as const, value: 2 }, c = { id: 'third', type: 'tong' as const, value: 3 };
  view.players.dong.discards = [a, c]; view.players.nan.discards = [b];
  view.discardTrail = [{ seat: 'dong', tile: a }, { seat: 'nan', tile: b }, { seat: 'dong', tile: c }];
  net.last.receive({ type: 'view', view, serverNow: 0 });
  expect(new RemoteController(table).discardTrail.map(d => d.tile.id)).toEqual(['first', 'kong-turn', 'third']); table.disconnect();
});

it('stops after device replacement and explicitly reclaims without the superseded token', () => {
  const { net, table, clock } = joined();
  net.last.receive({ type: 'kicked', reason: 'replaced' });
  expect(table.getState().ended).toBe('replaced');
  expect(table.getState().status).toBe('stopped');
  const replaced = net.last;
  clock.advance(60000); table.onVisible();
  expect(net.sockets).toHaveLength(1);
  table.reclaim();
  expect(net.last).not.toBe(replaced);
  net.last.open();
  expect(net.last.ofType('hello').at(-1)?.token).toBeUndefined();
  net.last.receive({ type: 'welcome', token: 'new-token', seat: 'dong', host: true, serverNow: clock.now, room: roomInfo() });
  expect(table.getState().ended).toBeNull();
  expect(table.getState().seat).toBe('dong');
  expect(table.getState().status).toBe('open');
  table.disconnect();
});


it('handles a silent room_closed close without showing device replacement', () => {
  const { net, table, clock } = joined();
  (net.last.onclose as ((event: { code: number }) => void) | null)?.({ code: 4002 });
  expect(table.getState()).toMatchObject({ ended: 'room_closed', status: 'stopped' });
  clock.advance(60000); expect(net.sockets).toHaveLength(1);
});

it('quietly stops the older same-token socket without forgetting the device token', () => {
  const net = fakeNetwork(), storage = new MemoryStorage(), clock = fakeTimers();
  const table = new RemoteTable({ server: 'https://mp.example', code: 'ABC234', name: 'Jason', storage,
    socketFactory: net.factory, timers: clock.timers });
  table.connect(); net.last.open();
  net.last.receive({ type: 'welcome', token: 'same', seat: 'dong', host: true, serverNow: 0, room: roomInfo() });
  (net.last.onclose as ((event: { code: number }) => void) | null)?.({ code: 4003 });
  expect(table.getState()).toMatchObject({ ended: null, status: 'stopped' });
  expect(loadRoom('ABC234', storage)?.token).toBe('same');
  clock.advance(60000); table.onVisible(); expect(net.sockets).toHaveLength(1);
});


it('preserves the stored token when a different device replaces the seat', () => {
  const net = fakeNetwork(), storage = new MemoryStorage();
  const table = new RemoteTable({ server: 'https://mp.example', code: 'ABC234', name: 'Jason', storage, socketFactory: net.factory });
  table.connect(); net.last.open();
  net.last.receive({ type: 'welcome', token: 'old-device', seat: 'dong', host: true, serverNow: 0, room: roomInfo() });
  net.last.receive({ type: 'kicked', reason: 'replaced' });
  expect(loadRoom('ABC234', storage)?.token).toBe('old-device');
  expect(table.getState()).toMatchObject({ ended: 'replaced', status: 'stopped' });
});
