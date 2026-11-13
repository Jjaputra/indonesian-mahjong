/**
 * Regression: Tjit Tuei (#16) and Pyong Pi (#40) are independent patterns.
 * Pyong Pi used to read only the standard-hand eye, so it was never found on a seven-pairs hand.
 */
import { describe, expect, it } from 'vitest';
import { keyToTile, parseTileHand } from '@/core/tiles';
import type { GameRules, Tile } from '@/core/types';
import { scoringEngine, type ScoringResult, type WinContext } from '@/scoring';

const RULES: GameRules = { kimEnabled: true, kimDiscardAllowed: false, allowKimInMeldClaim: false, minHuTay: 5 };

function ctx(winningTile: Tile, isSelfDraw: boolean): WinContext {
  return {
    winningTile,
    isSelfDraw,
    isDiscardWin: !isSelfDraw,
    isInitialDeal: false,
    isPaoChin: false,
    isRobbingKong: false,
    isSelfRobbingKong: false,
    isKongReplacement: false,
    isDoubleKongReplacement: false,
    seatWind: 'nan',
    roundWind: 'dong',
  };
}

function score(hand: string, win: string, isSelfDraw: boolean): ScoringResult {
  const winningTile = keyToTile(win, 9);
  return scoringEngine.evaluateHand(parseTileHand(hand), [], [], ctx(winningTile, isSelfDraw), RULES);
}

const tay = (r: ScoringResult, id: number) => r.patterns.find((p) => p.id === id)?.tay;

function breakdown(label: string, r: ScoringResult): void {
  const rows = r.patterns.map((p) => `  #${p.id} ${p.name}: ${p.tay}`).join('\n');
  console.log(`${label}\n${rows}\n  TOTAL: ${r.totalTay} Tay`);
}

// Seven pairs; the lone Kim pairs with the winning tile.
const SEVEN_PAIRS_WITH_KIM = '1T 1T 3T 3T 5S 5S 7S 7S 2B 2B 8B 8B KIM';
// Seven natural pairs; no Kim in the hand.
const SEVEN_PAIRS_NATURAL = '1T 1T 3T 3T 5S 5S 7S 7S 2B 2B 8B 8B 4S';
// 4 sets + 1 pair; the Kim waits as the eye.
const STANDARD_WITH_KIM = '1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B KIM';

describe('Tjit Tuei + Pyong Pi are scored independently', () => {
  it('TEST 1: seven pairs, Ce Mo, winning tile pairs the Kim -> Tjit Tuei 10 + Pyong Pi 5', () => {
    const r = score(SEVEN_PAIRS_WITH_KIM, '4S', true);
    breakdown('TEST 1 — Tjit Tuei + Pyong Pi', r);
    expect(r.isValidHu).toBe(true);
    expect(tay(r, 16)).toBe(10);
    expect(tay(r, 40)).toBe(5);
    expect(r.totalTay).toBe(r.patterns.reduce((s, p) => s + p.tay, 0));
  });

  it('TEST 2: seven natural pairs, no Kim -> Tjit Tuei only', () => {
    const r = score(SEVEN_PAIRS_NATURAL, '4S', true);
    breakdown('TEST 2 — Tjit Tuei only', r);
    expect(r.isValidHu).toBe(true);
    expect(tay(r, 16)).toBeDefined();
    expect(tay(r, 40)).toBeUndefined();
  });

  it('TEST 3: same seven pairs with Kim but won on a discard -> no Pyong Pi', () => {
    const r = score(SEVEN_PAIRS_WITH_KIM, '4S', false);
    breakdown('TEST 3 — Pyong Pi conditions not met (discard)', r);
    expect(r.isValidHu).toBe(true);
    expect(tay(r, 16)).toBe(10);
    expect(tay(r, 40)).toBeUndefined();
  });

  it('TEST 4: 4 sets + 1 pair, Ce Mo, winning tile pairs the Kim -> Pyong Pi still detected', () => {
    const r = score(STANDARD_WITH_KIM, '5S', true);
    breakdown('TEST 4 — 4 sets + 1 pair with Pyong Pi', r);
    expect(r.isValidHu).toBe(true);
    expect(tay(r, 16)).toBeUndefined();
    expect(tay(r, 40)).toBe(5);
  });

  it('adding Pyong Pi changes the seven-pairs total by exactly its 5 Tay', () => {
    const selfDraw = score(SEVEN_PAIRS_WITH_KIM, '4S', true);
    const discard = score(SEVEN_PAIRS_WITH_KIM, '4S', false);
    const others = (r: ScoringResult) => r.patterns.filter((p) => p.id !== 40 && p.id !== 42 && p.id !== 43 && p.id !== 44);
    expect(others(selfDraw)).toEqual(others(discard));
  });
});
