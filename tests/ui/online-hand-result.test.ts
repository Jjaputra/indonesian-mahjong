import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HandResult, ReadyStrip } from '../../src/ui/components/RemoteTableView';
import type { RemoteState, RemoteTable } from '../../src/net/remote-table';
import { parseTileHand } from '../../src/core/tiles';
import { roomInfo } from '../net/fake-transport';

function fixture(patch: { winner?: 'dong' | null; lewFit?: boolean; ready?: boolean; dealer?: 'dong' | 'nan' } = {}) {
  const winner = patch.winner === undefined ? 'dong' : patch.winner;
  const seats = roomInfo().seats.map((s, i) => ({ ...s, name: ['A Liong', 'Disa', null, 'Ce Mo'][i]!, bot: i === 2, connected: i !== 3, ready: i === 2 || (i === 0 && !!patch.ready) }));
  const state = {
    status: 'open', seat: 'dong', host: true, log: [], error: null,
    room: roomInfo({ phase: 'playing', seats, continueAt: 60000 }),
    view: {
      matchOver: false,
      dealer: patch.dealer ?? 'dong',
      lastHand: { winner, winMethod: winner ? 'tsumo' : 'draw', discarder: null, hand: parseTileHand('1T 2T 3T 5S 5S'), melds: [],
        breakdown: [{ pattern: 'Tile Bunga 2', tay: 0 }, { pattern: 'Tan Tiau', tay: 5 }, { pattern: 'Ce Mo', tay: 1 }],
        payments: { totalTay: 6, lewFit: !!patch.lewFit, gameDeltas: { dong: 57, nan: -19, xi: -19, bei: -19 } } },
    },
  } as unknown as RemoteState;
  const table = { getState: () => state, serverNow: () => 0, ready: () => {}, rematch: () => {} } as unknown as RemoteTable;
  return { table, state };
}

const render = (f: ReturnType<typeof fixture>) => renderToStaticMarkup(createElement(HandResult, { ...f, onClose: () => {}, onLeave: () => {} }));

describe('online hand result', () => {
  it('labels winds from the dealer, not the chair', () => {
    // Dealer on chair nan: nan is Timur and chair dong ends up Utara.
    const html = render(fixture({ dealer: 'nan' }));
    expect(html).toContain('A Liong · Utara · 6 Tay');
    expect(html).toContain('<td class="wind">Timur</td><td>Disa</td>');
  });

  it('shows banner, win chip, tay table without 0 rows, koin table and ready strip', () => {
    const html = render(fixture());
    console.log(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    expect(html).toContain('hu-banner'); expect(html).toContain('>HU<');
    expect(html).toContain('Ce Mo · tarik sendiri');
    expect(html).toContain('A Liong · Timur · 6 Tay · +57 koin');
    expect(html).not.toContain('Tile Bunga 2');
    expect(html).toContain('Total Tay');
    expect(html).toContain('is-winner'); expect(html).toContain('is-up'); expect(html).toContain('is-down');
    expect(html).toContain('mp-ready-strip'); expect(html).toContain('offline'); expect(html).toContain('mp-next-bar');
    expect(html).toContain('>Lanjut<'); expect(html).toContain('Lihat meja');
  });
  it('marks pressed Lanjut as Siap and handles Seri / Lew Fit', () => {
    expect(render(fixture({ ready: true }))).toContain('Siap ✓');
    const seri = render(fixture({ winner: null }));
    expect(seri).toContain('>SERI<'); expect(seri).toContain('Tembok habis');
    expect(render(fixture({ lewFit: true }))).toContain('LEW FIT');
  });
  it('highlights own chip and treats bots as ready', () => {
    const html = renderToStaticMarkup(createElement(ReadyStrip, { seats: fixture().state.room!.seats, self: 'dong', nameOf: s => s }));
    expect(html).toContain('is-self'); expect(html).toContain('✓ siap'); expect(html).toContain('⏳ tunggu');
  });
});
