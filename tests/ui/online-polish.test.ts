import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SeatRolls } from '../../src/ui/components/OnlineScreen';
import { RemoteTable } from '../../src/net/remote-table';
import { fakeNetwork, roomInfo } from '../net/fake-transport';

function render(seat: 'dong' | null, rolled = false, settled = false) {
  const net = fakeNetwork();
  const table = new RemoteTable({ server: 'http://localhost:8787', code: 'ABC234', name: 'Test', socketFactory: net.factory });
  table.connect(); net.last.open();
  net.last.receive({ type: 'room', seat, host: true, room: roomInfo({ phase: 'seating', seatDice: {
    groups: [['dong', 'nan', 'xi', 'bei']], dice: rolled ? { dong: [1, 2, 3] } : {},
    botAt: {}, deadline: Date.now() + 15000, settledAt: settled ? Date.now() : null,
  } }) });
  const html = renderToStaticMarkup(createElement(SeatRolls, { table })); table.disconnect(); return html;
}

describe('online seat dice', () => {
  it('offers the main dice action and highlights the local player', () => {
    const html = render('dong');
    expect(html).toContain('Kocok dadu'); expect(html).toContain('online-roll');
    expect(html).toContain('class="is-self"'); expect(html).toContain('(kamu)');
  });
  it('hides the action for spectators, completed rolls and settled dice', () => {
    expect(render(null)).not.toContain('online-roll');
    expect(render('dong', true)).not.toContain('online-roll');
    expect(render('dong', false, true)).not.toContain('online-roll');
  });
});
