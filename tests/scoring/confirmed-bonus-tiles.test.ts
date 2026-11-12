import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { keyToTile, parseTileHand, SEAT_ORDER } from '@/core/tiles';
import type { Seat } from '@/core/types';
import { scoringEngine } from '@/scoring';
import { HOUSE_SETTINGS, MemoryStorage, loadGameHistory, saveGameRecord } from '@/storage';
import { buildWinContext, seatWindOf, toFullRules } from '@/ui/win-context';
import { createMatch, nextSeating, recordHand } from '@/ui/match';
import { buildHuReceipt, buildCalculatorReceipt, calculateTay } from '@/ui/tay-calculator';
import { TayCalculator } from '@/ui/components/TayCalculator';

const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WN WN WN 4T');
const win = keyToTile('4T', 2);
const flags = { isSelfDraw: false, isRobbingKong: false, consecutiveKongs: 0, isFirstGoAround: false, isPaoChin: false };
function score(seat: Seat, keys = ['F3', 'F1', 'M3']) {
  return scoringEngine.evaluateHand(hand, [], keys.map(k => keyToTile(k)), buildWinContext(seat, 'nan', win, flags), toFullRules(HOUSE_SETTINGS));
}
const points = (r: ReturnType<typeof score>, id: number) => r.patterns.find(p => p.id === id)?.tay;

describe('players 2026-11-12 confirmed bonus tiles', () => {
  it('game 6: Xi on discard with F3 + F1 + M3 scores Bunga 1 and Musim 2', () => {
    const r = score('xi');
    expect(points(r, 1)).toBe(1);
    expect(points(r, 2)).toBe(2);
    const without = score('xi', []);
    expect(r.totalTay - without.totalTay).toBe(3);
    const text = buildHuReceipt({ kind: 'hu', winner: 'nan', seatWind: 'xi', winningTile: win, winMethod: 'ron', discarder: 'dong', hand: [...hand, win], melds: [], flowers: ['F3', 'F1', 'M3'].map(k => keyToTile(k)), scoring: r, durationSeconds: 1 });
    expect(text).toContain('Tile Musim 3 (sesuai tempat duduk) 2');
    expect(text).toContain('Tile Bunga 1 0');
  });

  it('the same chair changes bonus number after dealer rotation', () => {
    const before = { dealer: 'xi' as const, prevailingWind: 'nan' as const, dealerPasses: 1 };
    const after = nextSeating(before, { kind: 'hu', winner: 'nan' });
    expect(after.dealer).toBe('bei');
    const firstWind = seatWindOf({ dealerSeat: before.dealer }, 'nan');
    const nextWind = seatWindOf({ dealerSeat: after.dealer }, 'nan');
    expect(firstWind).toBe('bei');
    expect(nextWind).toBe('xi');
    expect(points(score(firstWind), 1)).toBe(0);
    expect(points(score(firstWind), 2)).toBe(1);
    expect(points(score(nextWind), 1)).toBe(1);
    expect(points(score(nextWind), 2)).toBe(2);
  });

  it('all chairs use their rotated Bunga and Musim number across 16 dealer wins', () => {
    let match = createMatch();
    for (let game = 0; game < 16; game++) {
      for (const [chair, seat] of SEAT_ORDER.entries()) {
        const wind = seatWindOf({ dealerSeat: match.seating.dealer }, seat);
        const number = (chair - game % 4 + 4) % 4 + 1;
        expect(SEAT_ORDER.indexOf(wind) + 1).toBe(number);
        const own = score(wind, [`F${number}`, `M${number}`]);
        expect(points(own, 1)).toBe(1);
        expect(points(own, 2)).toBe(2);
        const other = number % 4 + 1;
        const unmatched = score(wind, [`F${other}`, `M${other}`]);
        expect(points(unmatched, 1)).toBe(0);
        expect(points(unmatched, 2)).toBe(1);
      }
      match = recordHand(match, match.seating.dealer, true, 5);
    }
  });

  it('all collection totals and supersedes remain unchanged', () => {
    for (const [keys, id, value] of [
      [['F1', 'F2', 'F3', 'F4'], 4, 10],
      [['M1', 'M2', 'M3', 'M4'], 5, 20],
      [['F1', 'F2', 'F3', 'F4', 'M1', 'M2', 'M3'], 6, 30],
    ] as const) {
      const result = calculateTay([1, 2, id], true, 0, { bonus: { flowers: keys.filter(k => k.startsWith('F')).length, seasons: keys.filter(k => k.startsWith('M')).length } });
      expect(result.lines.find(p => p.id === id)?.tay).toBe(value);
      expect(result.removedIds).toContain(id === 4 ? 1 : 2);
    }
  });

  it('calculator labels a matching Musim 3 with its full 2 Tay and has no retired rule option', () => {
    const result = calculateTay([2], true, 0, { bonus: { seasons: 1, seasonSeatMatches: 1, seatNumber: 3 } });
    expect(result.lines).toEqual([{ id: 2, name: 'Tile Musim 3 (sesuai tempat duduk)', tay: 2 }]);
    expect(buildCalculatorReceipt(result)).toContain('Tile Musim 3 (sesuai tempat duduk): 2 Tay');
    const html = renderToStaticMarkup(createElement(TayCalculator, { defaultMinHuTay: 5, bonusTileRule: 'own_seat_only' }));
    expect(html).not.toContain('own_seat_only');
    expect(html).not.toContain('Hanya posisi sendiri');
  });

  it('legacy history keeps its original rule, total and labels', () => {
    const store = new MemoryStorage();
    saveGameRecord({ id: 'legacy', timestamp: 1, winner: 'nan', winningHand: [win], winningTile: win, scoringBreakdown: [{ id: 2, name: 'Tile Musim', tay: 1 }], totalTay: 1, isWithKim: false, winMethod: 'ron', durationSeconds: 1, bonusTileRule: 'own_seat_only' }, store);
    const [record] = loadGameHistory(store);
    expect(record).toMatchObject({ bonusTileRule: 'own_seat_only', totalTay: 1 });
    expect(record?.scoringBreakdown[0]).toMatchObject({ name: 'Tile Musim', tay: 1 });
  });
});
