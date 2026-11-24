import { afterEach, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup as render } from 'react-dom/server';
import { onlineAuditFixture } from '../../src/ui/dev-online-demo';
import { RoomLobby } from '../../src/ui/components/RoomLobby';
import { PublicTables } from '../../src/ui/components/PublicTables';
import { OpponentPanel, HumanArea } from '../../src/ui/components/GameTable';
import { OnlineStandings } from '../../src/ui/components/RemoteTableView';
import { RemoteController, asGameController, seatNames } from '../../src/ui/components/remote-adapter';
import { DEFAULT_ROOM_CONFIG } from '../../src/net/protocol';

const noop = () => {};
const count = (html: string) => (html.match(/aria-label="Premium"/g) ?? []).length;
afterEach(() => vi.unstubAllGlobals());

it('shows Premium in the lobby seat and spectator lists with old-server fallback', () => {
  vi.stubGlobal('window', { location: { origin: 'https://example.com', pathname: '/' } });
  const { state } = onlineAuditFixture('early');
  const room = { ...state.room!, phase: 'lobby' as const, spectatorDetails: [{ name: 'Watcher', premium: true }, { name: 'Guest' }] };
  const props = { room, seat: 'dong' as const, isHost: false, onSit: noop, onStand: noop, onStart: noop, onConfig: noop, onLeave: noop, onToast: noop };
  expect(count(render(h(RoomLobby, props)))).toBe(2);
  room.seats[0]!.premium = false;
  expect(count(render(h(RoomLobby, { ...props, room: { ...room, spectatorDetails: undefined, spectatorNames: ['Legacy'] } })))).toBe(0);
});

it('shows Premium beside public hosts only when supplied', () => {
  const room = { code: 'ABC234', hostName: 'Host', humans: 1, config: DEFAULT_ROOM_CONFIG, updatedAt: 1 };
  expect(count(render(h(PublicTables, { server: '', initialRooms: [room, { ...room, code: 'ABC235', hostPremium: true }], onJoin: noop, onCreate: noop, onBack: noop })))).toBe(1);
});

it('shows Premium on own and opponent seat heads, hides it for bots, and passes it to final standings', () => {
  const { table, state } = onlineAuditFixture('final');
  const controller = asGameController(new RemoteController(table));
  const names = seatNames(table);
  expect(count(render(h(HumanArea, { controller, names, actions: controller.getHumanActions(), selectedId: null, onSelect: noop })))).toBe(1);
  expect(count(render(h(OpponentPanel, { seat: 'dong', position: 'top', controller, names })))).toBe(1);
  expect(count(render(h(OpponentPanel, { seat: 'nan', position: 'left', controller, names })))).toBe(0);
  expect(count(render(h(OnlineStandings, { table, state, onClose: noop, onLeave: noop, onLastHand: noop })))).toBe(1);
  state.room!.seats[0]!.bot = true;
  expect(count(render(h(OpponentPanel, { seat: 'dong', position: 'top', controller, names })))).toBe(0);
  expect(count(render(h(OnlineStandings, { table, state, onClose: noop, onLeave: noop, onLastHand: noop })))).toBe(0);
});
