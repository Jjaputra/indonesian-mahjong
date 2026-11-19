import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { Meld, MeldType, Seat, Tile } from '@/core/types';
import { keyToTile } from '@/core/tiles';
import { CONFETTI_PIECES, SeatCallouts, calloutsBetween, confettiPiece, huKeyOf, tallyTable, type CalloutPosition } from '@/ui/components/CallToast';
import { RemoteController } from '@/ui/components/remote-adapter';
import type { RemoteTable } from '@/net/remote-table';
import { seatPositions } from '@/ui/components/GameTable';
import { getPreset } from '@/storage';
import { GameController } from '@/ui/game-controller';

const meld = (type: MeldType): Meld => ({ type, tiles: [keyToTile('5T', 1), keyToTile('5T', 2), keyToTile('5T', 3)] });
const flower = (): Tile => keyToTile('F1', 1);
type Players = Parameters<typeof tallyTable>[1];
const players = (patch: Partial<Record<Seat, { melds?: Meld[]; flowers?: Tile[] }>> = {}): Players => {
  const out = {} as Players;
  for (const seat of ['dong', 'nan', 'xi', 'bei'] as Seat[]) out[seat] = { melds: patch[seat]?.melds ?? [], flowers: patch[seat]?.flowers ?? [] };
  return out;
};

describe('calloutsBetween', () => {
  const before = tallyTable(80, players());

  it.each([['pung', 'PUNG'], ['jia', 'JIA'], ['kong', 'KONG'], ['ankong', 'KONG']] as const)('a new %s melds reads %s', (type, word) => {
    const after = tallyTable(79, players({ nan: { melds: [meld(type)] } }));
    const got = calloutsBetween(before, after);
    console.log(`new ${type} for nan → ${JSON.stringify(got)}`);
    expect(got).toEqual([{ seat: 'nan', word }]);
  });

  it('a Kong tambahan (Pung becomes Kong, meld count unchanged) reads KONG', () => {
    const pung = tallyTable(60, players({ xi: { melds: [meld('pung')] } }));
    const kong = tallyTable(59, players({ xi: { melds: [meld('kong')] } }));
    expect(calloutsBetween(pung, kong)).toEqual([{ seat: 'xi', word: 'KONG' }]);
  });

  it('a new flower reads BUNGA, but a claim on the same seat wins', () => {
    expect(calloutsBetween(before, tallyTable(79, players({ bei: { flowers: [flower()] } })))).toEqual([{ seat: 'bei', word: 'BUNGA' }]);
    expect(calloutsBetween(before, tallyTable(78, players({ bei: { flowers: [flower()], melds: [meld('pung')] } })))).toEqual([{ seat: 'bei', word: 'PUNG' }]);
  });

  it('reports each seat that called', () => {
    const got = calloutsBetween(before, tallyTable(79, players({ dong: { melds: [meld('jia')] }, xi: { flowers: [flower()] } })));
    expect(got).toEqual([{ seat: 'dong', word: 'JIA' }, { seat: 'xi', word: 'BUNGA' }]);
  });

  it('stays quiet when nothing changed, and on a new deal (more wall, or counts going down)', () => {
    expect(calloutsBetween(before, before)).toEqual([]);
    const late = tallyTable(12, players({ nan: { melds: [meld('pung')], flowers: [flower(), flower()] } }));
    expect(calloutsBetween(late, tallyTable(95, players({ dong: { flowers: [flower()] } })))).toEqual([]);
    expect(calloutsBetween(late, tallyTable(11, players({ nan: { melds: [meld('pung')] }, dong: { flowers: [flower()] } })))).toEqual([]);
  });
});

describe('seat callouts on the table', () => {
  it('renders one empty slot per screen position and no callout until something is called', () => {
    const controller = new GameController({ settings: { ...getPreset('tournament'), soundEnabled: false }, seed: 7, saveHistory: false });
    const html = renderToString(createElement(SeatCallouts, { controller, positions: seatPositions(controller.humanSeat) }));
    for (const position of ['top', 'right', 'bottom', 'left']) expect(html).toContain(`data-callout-slot="${position}"`);
    expect(html).not.toContain('seat-callout');
  });

  it('flower-tile confetti flies toward the table centre, away from the player hand', () => {
    const aim: Record<CalloutPosition, (p: { dx: number; dy: number }) => boolean> = {
      bottom: (p) => p.dy < 0, top: (p) => p.dy > 0, left: (p) => p.dx > 0, right: (p) => p.dx < 0,
    };
    for (const position of Object.keys(aim) as CalloutPosition[]) {
      const pieces = Array.from({ length: CONFETTI_PIECES }, (_, i) => confettiPiece(i, position));
      console.log(`${position}: ${pieces.map((p) => `${p.dx},${p.dy}`).join(' ')}`);
      expect(pieces.every(aim[position])).toBe(true);
    }
  });
});

describe('online Hu winner', () => {
  const remote = (view: object) => new RemoteController({ getState: () => ({ view, seat: 'dong', room: null }) } as unknown as RemoteTable);
  const ended = (winner: Seat | null, hands: number, lewFit = false, phase = 'RESOLVED_HU') =>
    ({ phase, lastHand: { winner, payments: { lewFit } }, match: { hands: new Array(hands).fill({}) }, discardTrail: [] });

  it('reports the winner of an ended valid Hu, and nobody otherwise', () => {
    const cases: [string, object, Seat | null][] = [
      ['Hu by nan', ended('nan', 3), 'nan'],
      ['Seri (no winner)', ended(null, 3, false, 'DRAW_SERI'), null],
      ['Lew Fit', ended('xi', 3, true), null],
      ['mid hand', { ...ended('nan', 3), phase: 'ACTION_DECISION' }, null],
      ['no last hand yet', { phase: 'RESOLVED_HU', lastHand: null, match: { hands: [] }, discardTrail: [] }, null],
    ];
    for (const [name, view, want] of cases) {
      const got = remote(view).huWinner;
      console.log(`${name} → ${got}`);
      expect(got).toBe(want);
    }
  });

  it('keys one celebration per ended hand: a resync keeps the key, the next hand changes it', () => {
    const asController = (view: object) => remote(view) as unknown as GameController;
    const first = huKeyOf(asController(ended('nan', 3)));
    const resync = huKeyOf(asController(ended('nan', 3)));
    const nextHandSameSeat = huKeyOf(asController(ended('nan', 4)));
    console.log(first, resync, nextHandSameSeat);
    expect(first).toBe('nan#3');
    expect(resync).toBe(first);
    expect(nextHandSameSeat).not.toBe(first);
    expect(huKeyOf(asController({ ...ended('nan', 4), phase: 'TURN_DRAW' }))).toBeNull();
  });
});
