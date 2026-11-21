import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomLobby } from '../../src/ui/components/RoomLobby';
import { HandResult } from '../../src/ui/components/RemoteTableView';
import { RemoteTable } from '../../src/net/remote-table';
import { MemoryStorage, DEFAULT_SETTINGS } from '../../src/storage';
import { countHostedMatch, DAILY_LIMIT_MESSAGE } from '../../src/net/daily-limit';
import { TableSession } from '../../src/session';
import { fakeNetwork, roomInfo } from '../net/fake-transport';

afterEach(() => vi.unstubAllGlobals());
function fixture(used: number, host = true) {
  const storage = new MemoryStorage();
  for (let i = 0; i < used; i++) countHostedMatch('ABC234', i, Date.now(), storage);
  const net = fakeNetwork();
  const table = new RemoteTable({ code: 'ABC234', name: 'Jason', server: 'https://example.com', storage, socketFactory: net.factory });
  table.connect(); net.last.open();
  net.last.receive({ type: 'welcome', host, seat: 'dong', token: 't', room: roomInfo({ phase: 'finished' }), serverNow: Date.now() });
  const session = new TableSession({ settings: DEFAULT_SETTINGS, seats: { dong: 'human', nan: 'bot', xi: 'bot', bei: 'bot' }, now: Date.now, seed: 5 });
  net.last.receive({ type: 'view', view: { ...session.viewFor('dong'), matchOver: true, phase: 'DRAW_SERI' }, serverNow: Date.now() });
  return { table, storage };
}
function lobby(used: number, isHost = true) {
  vi.stubGlobal('window', { location: { origin: 'https://example.com', pathname: '/' } });
  const { table, storage } = fixture(used, isHost);
  const noop = () => {};
  const html = renderToStaticMarkup(createElement(RoomLobby, { room: roomInfo(), seat: 'dong', isHost, dailyLimitStorage: storage,
    onSit: noop, onStand: noop, onStart: noop, onConfig: noop, onLeave: noop, onToast: noop }));
  table.disconnect(); return html;
}
function result(used: number, host = true) {
  const { table } = fixture(used, host);
  const html = renderToStaticMarkup(createElement(HandResult, { table, state: table.getState(), onClose: () => {}, onLeave: () => {} }));
  table.disconnect(); return html;
}
describe('host daily limit UI', () => {
  it('shows the host remaining count in lobby and result', () => {
    expect(lobby(2)).toContain('Sisa 3 dari 5 match hari ini');
    expect(result(2)).toContain('Sisa 3 dari 5 match hari ini');
  });
  it('disables Mulai at zero and explains the limit', () => {
    const html = lobby(5);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*><strong>Mulai/);
    expect(html).toContain(DAILY_LIMIT_MESSAGE);
  });
  it('disables Main lagi at zero and explains the limit', () => {
    const html = result(5);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Main lagi/);
    expect(html).toContain(DAILY_LIMIT_MESSAGE);
  });
  it('shows joiners no limit text', () => {
    for (const html of [lobby(5, false), result(5, false)]) {
      expect(html).not.toContain('match hari ini');
      expect(html).not.toContain(DAILY_LIMIT_MESSAGE);
    }
  });
});
