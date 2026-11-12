import { describe, expect, it } from 'vitest';
import { keyToTile, parseTileHand } from '@/core/tiles';
import type { Meld, Tile } from '@/core/types';
import { ScoringEngine } from '@/scoring';
import { buildWinContext, scoreHu, toFullRules } from '@/ui/win-context';
import { DEFAULT_SETTINGS } from '@/storage';

const engine = new ScoringEngine({ overlapPolicy: 'supersede' });
const flags = { isSelfDraw: false, isRobbingKong: false, consecutiveKongs: 0, isFirstGoAround: false, isPaoChin: false };
const pung: Meld = { type: 'pung', tiles: parseTileHand('5T 5T 5T'), claimedFrom: 'dong' };
const tay = (r: ReturnType<typeof engine.evaluateHand>, id: number) => r.patterns.find(p => p.id === id)?.tay;
function score(hand: string, win: string, self = false, melds: Meld[] = []) {
  const winningTile = keyToTile(win, 4);
  return engine.evaluateHand(parseTileHand(hand), melds, [], buildWinContext('nan', 'dong', winningTile, { ...flags, isSelfDraw: self }, melds));
}

describe('Research-confirmed concealed triplets', () => {
  it('discard completing a triplet exposes it; self-draw preserves it', () => {
    const hand = '1T 1T 1T 5S 5S 5S 9B 9B 9B 3T 3T 7S 7S';
    const ron = score(hand, '3T');
    expect(tay(ron, 34)).toBeUndefined();
    expect(tay(ron, 33)).toBe(5);
    expect(tay(ron, 15)).toBe(10); // Tuei Tuei stacks
    expect(ron.totalTay).toBe(22); // Previously 47: #34 (30) becomes #33 (5).
    const draw = score(hand, '3T', true);
    expect(tay(draw, 34)).toBe(30);
    expect(tay(draw, 33)).toBeUndefined();
    expect(tay(draw, 15)).toBe(10);
  });
  it('a discard completing the pair keeps four concealed triplets', () => {
    expect(tay(score('1T 1T 1T 5S 5S 5S 9B 9B 9B 3T 3T 3T 7S', '7S'), 34)).toBe(30);
  });
  it('a discard completing the third triplet no longer awards Sam Am Kang', () => {
    expect(tay(score('1T 1T 1T 5S 5S 5S 9B 9B 2T 3T 4T 7S 7S', '9B'), 33)).toBeUndefined();
    expect(tay(score('1T 1T 1T 5S 5S 5S 9B 9B 2T 3T 4T 7S 7S', '9B', true), 33)).toBe(5);
  });
  it('chooses sequence completion when identical winning copies could instead complete a triplet', () => {
    const r = score('1T 1T 1T 5S 5S 5S 3B 3B 3B 4B 5B 7S 7S', '3B');
    expect(tay(r, 33)).toBe(5);
    // Changing which physical 3B copy is designated as winning cannot change Tay.
    const tiles = parseTileHand('1T 1T 1T 5S 5S 5S 3B 3B 3B 3B 4B 5B 7S 7S');
    for (const win of tiles.filter(t => t.type === 'ban' && t.value === 3)) {
      expect(engine.evaluateHand(tiles, [], [], buildWinContext('nan', 'dong', win, flags)).totalTay).toBe(r.totalTay);
    }
  });
});

describe('Research-confirmed Ce Chiong Kong from live candidates', () => {
  it('builds the Pung event and awards #36 on the concealed winning sequence', () => {
    const win = keyToTile('5T', 4);
    expect(buildWinContext('nan', 'dong', win, { ...flags, isSelfDraw: true }, [pung]).isSelfRobbingKong).toBe(true);
    const r = scoreHu({ hand: parseTileHand('4T 6T 4S 5S 6S 7B 8B 9B WX WX'), melds: [pung], flowers: [], winningTile: win }, 'nan', 'dong', { ...flags, isSelfDraw: true }, toFullRules(DEFAULT_SETTINGS), 'supersede');
    expect(tay(r, 36)).toBe(5);
    expect(r.totalTay).toBe(9); // Previously 4 from a live candidate.
  });
  it('rejects a discard win, an unrelated winning tile, and no matching Pung', () => {
    expect(tay(score('4T 6T 4S 5S 6S 7B 8B 9B WX WX', '5T', false, [pung]), 36)).toBeUndefined();
    expect(tay(score('4T 5T 6T 4S 5S 6S 7B 8B 9B WX', 'WX', true, [pung]), 36)).toBeUndefined();
    expect(tay(score('4T 6T 4S 5S 6S 7B 8B 9B WX WX 1B 1B 1B', '5T', true), 36)).toBeUndefined();
  });
  it.each(['pair', 'triplet', 'exposed sequence'] as const)('a forged event flag cannot award #36 for %s', role => {
    const win = keyToTile('5T', 4);
    const hand = role === 'pair' ? '5T 1S 2S 3S 4B 5B 6B 7B 8B 9B' : role === 'triplet' ? '5T 5T 1S 2S 3S 4B 5B 6B WX WX' : '1S 2S 3S 4B 5B 6B WX';
    const melds = role === 'exposed sequence' ? [pung, { type: 'jia', tiles: parseTileHand('4T 5T 6T'), claimedFrom: 'dong' } as Meld] : [pung];
    const winningTile = role === 'exposed sequence' ? keyToTile('WX', 4) : win;
    const r = engine.evaluateHand(parseTileHand(hand), melds, [], { ...buildWinContext('nan', 'dong', winningTile, { ...flags, isSelfDraw: true }, melds), isSelfRobbingKong: true });
    expect(tay(r, 36)).toBeUndefined();
  });
});

describe('Research-confirmed Se Sam Pu Tat and Ji Pa Ciok', () => {
  for (const scoringBasis of ['match_table', 'hand_kim_usage'] as const) {
    for (const kimEnabled of [true, false]) {
      it(`${scoringBasis}, Kim enabled ${kimEnabled}: #39 always 40 and valid`, () => {
        const r = engine.evaluateHand(parseTileHand('1T 4T 7T 1S 4S 7S 1B 4B 7B WD WN WX WB'), [], [], buildWinContext('nan', 'dong', keyToTile('DZ'), flags), { scoringBasis, kimEnabled });
        expect(tay(r, 39)).toBe(40);
        expect(r.isValidHu).toBe(true);
        expect(r.totalTay).toBe(44); // Kim-off match table previously scored 4.
      });
    }
  }
  it('all-natural Kim also qualifies for #39 under both bases', () => {
    for (const scoringBasis of ['match_table', 'hand_kim_usage'] as const) {
      const hand: Tile[] = parseTileHand('1T 4T 7T 1S 4S 7S 1B 4B 7B WD WN WX WB').map(t => t.type === 'tong' && t.value === 1 ? { ...t, isKim: true } : t);
      const r = engine.evaluateHand(hand, [], [], buildWinContext('nan', 'dong', keyToTile('DZ'), flags), { scoringBasis, kimEnabled: true });
      expect(tay(r, 39)).toBe(40);
      expect(r.isWithKim).toBe(false);
      expect(r.handKimCount).toBe(1);
    }
  });
  it('only the pair of 2 or 8 earns #31', () => {
    expect(tay(score('1T 2T 3T 4S 5S 6S 7B 8B 9B 1S 1S 1S 2B', '2B'), 31)).toBe(1);
    expect(score('1T 2T 3T 4S 5S 6S 7B 8B 9B 1S 1S 1S 2B', '2B').totalTay).toBe(8);
    expect(tay(score('1T 2T 3T 4S 5S 6S 7B 8B 9B 1S 1S 1S 5B', '5B'), 31)).toBeUndefined();
  });
});

it('records Thi Fu and unchanged stacking example totals', () => {
  const win = keyToTile('5B', 4);
  const r = engine.evaluateHand(parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 2S 3S 4S 5B'), [], [], buildWinContext('nan', 'dong', win, { ...flags, isSelfDraw: true, isFirstGoAround: true, isPaoChin: true }));
  expect(r.totalTay).toBe(74); // Previously 44; #12 (60) supersedes #10 (30).
  const exposed: Meld = { type: 'pung', tiles: parseTileHand('3T 3T 3T'), claimedFrom: 'dong' };
  const stacked = score('1T 1T 1T 5S 5S 5S 9B 9B 9B 7S', '7S', false, [exposed]);
  expect(stacked.totalTay).toBe(21); // Unchanged: Tuei Tuei 10 + Sam Am Kang 5 + Bo KIM 3 + Bo Hua Zi 3.
});
