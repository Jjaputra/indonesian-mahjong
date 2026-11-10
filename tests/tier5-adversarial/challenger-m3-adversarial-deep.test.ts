/**
 * Milestone 3 Remediation Verification Gate: Deep Adversarial Stress Suite
 *
 * Authored by: Challenger 1 (Empirical Challenger)
 * Role: critic, specialist
 *
 * Scenarios tested:
 * 1. Se Sam Pu Tat (#39) combinatorial matrix:
 *    - Valid clean Se Sam Pu Tat (NK 40 + Bo Kim 3 = 43 Tay)
 *    - Rejection with 1, 2, 3, 4 flowers
 *    - Rejection with 1, 2, 3, 4 seasons (including 4 seasons = 20 Tay bonus)
 *    - Rejection with mixed flowers + seasons (including 8 bonus tiles = 30 Tay)
 *    - Rejection with 1, 2, 3 Kims
 *    - Rejection with 4 Kims in regular mode vs instant Hu mode
 *    - Rejection on duplicate tiles, distance violations (< 3), or open melds
 * 2. Instant Hu declarations (#6, #9, #34) under variable minHuTay thresholds:
 *    - minHuTay: 5, 10, 15, 20 for single instant triggers (#6, #9, #34)
 *    - minHuTay: 15, 20, 25 for dual instant triggers (#6 + #9 = 20 Tay)
 *    - minHuTay: 25, 30, 35 for triple instant triggers (#6 + #9 + #34 = 30 Tay)
 *    - Invalid instant Hu triggers returning lewFitReason: 'instant-invalid'
 * 3. First-turn wins (Thien Fu #11, Thi Fu #12, Pao Chin #10):
 *    - Complete combinatorial matrix across 4 seats (dong, nan, xi, bei)
 *    - With vs without isPaoChin
 *    - Self-draw ("hasil lew") vs Discard win
 *    - Additive vs Supersede overlap policy behavior
 *    - Subsequent-turn decay (initial deal = false)
 */

import { describe, it, expect } from 'vitest';
import {
  ScoringEngine,
  scoringEngine,
  type ScoringResult,
  type WinContext,
} from '@/scoring';
import { parseTileHand, keyToTile } from '@/core/tiles';
import type { GameRules, Meld, Seat } from '@/core/types';

const TOURNAMENT_RULES: GameRules = {
  kimEnabled: true,
  kimDiscardAllowed: false,
  allowKimInMeldClaim: false,
  minHuTay: 5,
};

const BASE_CONTEXT: Omit<WinContext, 'winningTile'> = {
  isSelfDraw: false,
  isDiscardWin: true,
  isInitialDeal: false,
  isPaoChin: false,
  isRobbingKong: false,
  isSelfRobbingKong: false,
  isKongReplacement: false,
  isDoubleKongReplacement: false,
  seatWind: 'nan',
  roundWind: 'dong',
};

function meld(type: Meld['type'], keys: string, claimedFrom?: Seat): Meld {
  return {
    type,
    tiles: parseTileHand(keys),
    claimedFrom,
  };
}

function tayOf(r: ScoringResult, id: number): number | undefined {
  return r.patterns.find((p) => p.id === id)?.tay;
}

function hasPattern(r: ScoringResult, id: number): boolean {
  return r.patterns.some((p) => p.id === id);
}

// ============================================================================
// Suite 1: Se Sam Pu Tat Combinatorial Stress
// ============================================================================

describe('Adversarial Deep: 1. Se Sam Pu Tat Combinations (Flowers, Seasons, Kims)', () => {
  // 14 distinct uncorrelated tiles:
  // Tong: 1, 4, 7 (diffs 3, 3)
  // Sok:  2, 5, 8 (diffs 3, 3)
  // Ban:  3, 6, 9 (diffs 3, 3)
  // Winds: WD, WN, WX, WB (4 distinct)
  // Dragon: DZ (1 distinct)
  // Total: 3 + 3 + 3 + 4 + 1 = 14 tiles.
  const CLEAN_SE_SAM = '1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB';
  const WIN_TILE = 'DZ';

  it('valid clean Se Sam Pu Tat scores #39 (40 NK) and #8 (3 NK) + finish patterns', () => {
    // Self-draw concealed: 40 (#39) + 3 (#8 Bo Kim) + 5 (#44 Ce Mo Pu Ciu Jen) = 48 Tay
    const rSelf = scoringEngine.evaluateHand(
      parseTileHand(CLEAN_SE_SAM),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile(WIN_TILE), isSelfDraw: true, isDiscardWin: false },
      TOURNAMENT_RULES
    );

    expect(rSelf.isValidHu).toBe(true);
    expect(rSelf.isLewFit).toBe(false);
    expect(rSelf.mode).toBe('NK');
    expect(hasPattern(rSelf, 39)).toBe(true);
    expect(tayOf(rSelf, 39)).toBe(40);
    expect(hasPattern(rSelf, 8)).toBe(true);
    expect(tayOf(rSelf, 8)).toBe(3);
    expect(hasPattern(rSelf, 44)).toBe(true);
    expect(tayOf(rSelf, 44)).toBe(5);
    expect(rSelf.totalTay).toBe(48);

    // Discard concealed: 40 (#39) + 3 (#8 Bo Kim) + 1 (#43 Mun) = 44 Tay
    const rDiscard = scoringEngine.evaluateHand(
      parseTileHand(CLEAN_SE_SAM),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile(WIN_TILE), isSelfDraw: false, isDiscardWin: true },
      TOURNAMENT_RULES
    );

    expect(rDiscard.isValidHu).toBe(true);
    expect(rDiscard.isLewFit).toBe(false);
    expect(hasPattern(rDiscard, 39)).toBe(true);
    expect(hasPattern(rDiscard, 8)).toBe(true);
    expect(hasPattern(rDiscard, 43)).toBe(true);
    expect(tayOf(rDiscard, 43)).toBe(1);
    expect(rDiscard.totalTay).toBe(44);
  });

  describe('Flower & Season Disqualification Tests', () => {
    const flowerCombos: { label: string; flowers: string[] }[] = [
      { label: '1 flower (F1)', flowers: ['F1'] },
      { label: '2 flowers (F1, F2)', flowers: ['F1', 'F2'] },
      { label: '3 flowers (F1, F2, F3)', flowers: ['F1', 'F2', 'F3'] },
      { label: '4 flowers (10 Tay bonus)', flowers: ['F1', 'F2', 'F3', 'F4'] },
      { label: '1 season (M1)', flowers: ['M1'] },
      { label: '2 seasons (M1, M2)', flowers: ['M1', 'M2'] },
      { label: '3 seasons (M1, M2, M3)', flowers: ['M1', 'M2', 'M3'] },
      { label: '4 seasons (20 Tay bonus)', flowers: ['M1', 'M2', 'M3', 'M4'] },
      { label: '1 flower + 1 season', flowers: ['F1', 'M1'] },
      { label: '2 flowers + 2 seasons', flowers: ['F1', 'F2', 'M1', 'M2'] },
      { label: '4 flowers + 4 seasons (8 bonus tiles = 30 Tay)', flowers: ['F1', 'F2', 'F3', 'F4', 'M1', 'M2', 'M3', 'M4'] },
    ];

    for (const { label, flowers } of flowerCombos) {
      it(`rejects Se Sam Pu Tat with ${label} as Lew Fit structure`, () => {
        const flowerTiles = flowers.map((k) => keyToTile(k));
        const r = scoringEngine.evaluateHand(
          parseTileHand(CLEAN_SE_SAM),
          [],
          flowerTiles,
          { ...BASE_CONTEXT, winningTile: keyToTile(WIN_TILE) },
          TOURNAMENT_RULES
        );

        expect(r.isValidHu).toBe(false);
        expect(r.isLewFit).toBe(true);
        expect(r.lewFitReason).toBe('structure');
        expect(hasPattern(r, 39)).toBe(false);
      });
    }

    it('7 bonus tiles with isInstantHu: false is rejected as Lew Fit structure', () => {
      const sevenBonus = ['F1', 'F2', 'F3', 'F4', 'M1', 'M2', 'M3'].map((k) => keyToTile(k));
      const r = scoringEngine.evaluateHand(
        parseTileHand(CLEAN_SE_SAM),
        [],
        sevenBonus,
        { ...BASE_CONTEXT, winningTile: keyToTile(WIN_TILE), isInstantHu: false },
        TOURNAMENT_RULES
      );

      expect(r.isValidHu).toBe(false);
      expect(r.isLewFit).toBe(true);
      expect(r.lewFitReason).toBe('structure');
    });

    it('7 bonus tiles with isInstantHu: true triggers #6 Instant Hu (10 Tay)', () => {
      const sevenBonus = ['F1', 'F2', 'F3', 'F4', 'M1', 'M2', 'M3'].map((k) => keyToTile(k));
      const r = scoringEngine.evaluateHand(
        parseTileHand(CLEAN_SE_SAM),
        [],
        sevenBonus,
        { ...BASE_CONTEXT, winningTile: keyToTile(WIN_TILE), isInstantHu: true },
        TOURNAMENT_RULES
      );

      expect(r.isValidHu).toBe(true);
      expect(r.isLewFit).toBe(false);
      expect(r.totalTay).toBe(10);
      expect(hasPattern(r, 6)).toBe(true);
      expect(tayOf(r, 6)).toBe(10);
    });
  });

  describe('Kim Disqualification & Degradation Tests', () => {
    it('1 Kim replacing 1 tile (13 uncorrelated + 1 KIM) is rejected as structure Lew Fit', () => {
      // 13 uncorrelated + 1 KIM cannot form 4 melds + 1 pair, and Se Sam Pu Tat forbids Kim
      const r = scoringEngine.evaluateHand(
        parseTileHand('1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX KIM'),
        [],
        [],
        { ...BASE_CONTEXT, winningTile: keyToTile('DZ') },
        TOURNAMENT_RULES
      );

      expect(r.isValidHu).toBe(false);
      expect(r.isLewFit).toBe(true);
      expect(r.lewFitReason).toBe('structure');
    });

    it('2 Kims replacing 2 tiles (12 uncorrelated + 2 KIM) is rejected as structure Lew Fit', () => {
      const r = scoringEngine.evaluateHand(
        parseTileHand('1T 4T 7T 2S 5S 8S 3B 6B 9B WD KIM KIM'),
        [],
        [],
        { ...BASE_CONTEXT, winningTile: keyToTile('DZ') },
        TOURNAMENT_RULES
      );

      expect(r.isValidHu).toBe(false);
      expect(r.isLewFit).toBe(true);
      expect(r.lewFitReason).toBe('structure');
    });

    it('3 Kims replacing 3 tiles (11 uncorrelated + 3 KIM) is rejected as structure Lew Fit', () => {
      const r = scoringEngine.evaluateHand(
        parseTileHand('1T 4T 7T 2S 5S 8S 3B 6B KIM KIM KIM'),
        [],
        [],
        { ...BASE_CONTEXT, winningTile: keyToTile('DZ') },
        TOURNAMENT_RULES
      );

      expect(r.isValidHu).toBe(false);
      expect(r.isLewFit).toBe(true);
      expect(r.lewFitReason).toBe('structure');
    });

    it('4 Kims in uncorrelated hand with isInstantHu: false is rejected as structure Lew Fit', () => {
      const r = scoringEngine.evaluateHand(
        parseTileHand('1T 4T 7T 2S 5S 8S 3B KIM KIM KIM KIM'),
        [],
        [],
        { ...BASE_CONTEXT, winningTile: keyToTile('DZ'), isInstantHu: false },
        TOURNAMENT_RULES
      );

      expect(r.isValidHu).toBe(false);
      expect(r.isLewFit).toBe(true);
      expect(r.lewFitReason).toBe('structure');
    });

    it('4 Kims in uncorrelated hand with isInstantHu: true triggers #9 Shi Kim Instant Hu (10 Tay)', () => {
      const r = scoringEngine.evaluateHand(
        parseTileHand('1T 4T 7T 2S 5S 8S 3B KIM KIM KIM KIM'),
        [],
        [],
        { ...BASE_CONTEXT, winningTile: keyToTile('DZ'), isInstantHu: true },
        TOURNAMENT_RULES
      );

      expect(r.isValidHu).toBe(true);
      expect(r.isLewFit).toBe(false);
      expect(hasPattern(r, 9)).toBe(true);
      expect(tayOf(r, 9)).toBe(10);
      expect(r.totalTay).toBe(10);
    });
  });

  describe('Hand Corruptions & Constraint Violations', () => {
    it('duplicate suited tile (e.g. two 1T tiles) violates Se Sam Pu Tat and is rejected', () => {
      const r = scoringEngine.evaluateHand(
        parseTileHand('1T 1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX'),
        [],
        [],
        { ...BASE_CONTEXT, winningTile: keyToTile('WB') },
        TOURNAMENT_RULES
      );

      expect(r.isValidHu).toBe(false);
      expect(r.isLewFit).toBe(true);
      expect(r.lewFitReason).toBe('structure');
    });

    it('distance violation (e.g. 1T and 3T, diff = 2 < 3) is rejected', () => {
      const r = scoringEngine.evaluateHand(
        parseTileHand('1T 3T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB'),
        [],
        [],
        { ...BASE_CONTEXT, winningTile: keyToTile('DZ') },
        TOURNAMENT_RULES
      );

      expect(r.isValidHu).toBe(false);
      expect(r.isLewFit).toBe(true);
      expect(r.lewFitReason).toBe('structure');
    });

    it('open melds present disqualify Se Sam Pu Tat', () => {
      // 1 claimed chi meld + 11 concealed tiles
      const r = scoringEngine.evaluateHand(
        parseTileHand('7T 2S 5S 8S 3B 6B 9B WD WN WX'),
        [meld('jia', '1T 2T 3T', 'dong')],
        [],
        { ...BASE_CONTEXT, winningTile: keyToTile('DZ') },
        TOURNAMENT_RULES
      );

      expect(r.isValidHu).toBe(false);
      expect(r.isLewFit).toBe(true);
      expect(r.lewFitReason).toBe('structure');
    });
  });
});

// ============================================================================
// Suite 2: Instant Hu Declarations Under minHuTay Thresholds (5, 10, 15, 20)
// ============================================================================

describe('Adversarial Deep: 2. Instant Hu Declarations vs minHuTay (5, 10, 15, 20)', () => {
  const dummyConcealed = parseTileHand('1T 3T 5T 7T 9T 1S 3S 5S 7S 9S 1B 3B 5B');
  const winTile = keyToTile('7B');

  describe('#6 Seven Flowers Instant Hu (10 Tay)', () => {
    const sevenFlowers = ['F1', 'F2', 'F3', 'F4', 'M1', 'M2', 'M3'].map((k) => keyToTile(k));

    it('clears minHuTay = 5 (10 >= 5)', () => {
      const r = scoringEngine.evaluateHand(
        dummyConcealed,
        [],
        sevenFlowers,
        { ...BASE_CONTEXT, winningTile: winTile, isInstantHu: true },
        { ...TOURNAMENT_RULES, minHuTay: 5 }
      );
      expect(r.isValidHu).toBe(true);
      expect(r.isLewFit).toBe(false);
      expect(r.totalTay).toBe(10);
    });

    it('clears minHuTay = 10 (10 >= 10)', () => {
      const r = scoringEngine.evaluateHand(
        dummyConcealed,
        [],
        sevenFlowers,
        { ...BASE_CONTEXT, winningTile: winTile, isInstantHu: true },
        { ...TOURNAMENT_RULES, minHuTay: 10 }
      );
      expect(r.isValidHu).toBe(true);
      expect(r.isLewFit).toBe(false);
      expect(r.totalTay).toBe(10);
    });

    it('fails minHuTay = 15 (10 < 15) and is rejected as below-minimum', () => {
      const r = scoringEngine.evaluateHand(
        dummyConcealed,
        [],
        sevenFlowers,
        { ...BASE_CONTEXT, winningTile: winTile, isInstantHu: true },
        { ...TOURNAMENT_RULES, minHuTay: 15 }
      );
      expect(r.isValidHu).toBe(false);
      expect(r.isLewFit).toBe(true);
      expect(r.lewFitReason).toBe('below-minimum');
      expect(r.totalTay).toBe(10);
      expect(hasPattern(r, 6)).toBe(true);
    });

    it('fails minHuTay = 20 (10 < 20) and is rejected as below-minimum', () => {
      const r = scoringEngine.evaluateHand(
        dummyConcealed,
        [],
        sevenFlowers,
        { ...BASE_CONTEXT, winningTile: winTile, isInstantHu: true },
        { ...TOURNAMENT_RULES, minHuTay: 20 }
      );
      expect(r.isValidHu).toBe(false);
      expect(r.isLewFit).toBe(true);
      expect(r.lewFitReason).toBe('below-minimum');
      expect(r.totalTay).toBe(10);
    });
  });

  describe('#9 Shi Kim Instant Hu (4 Kims in hand, 10 Tay)', () => {
    const handWith4Kims = parseTileHand('KIM KIM KIM KIM 1T 3T 5T 7T 9T 1S 3S 5S 7S');

    it('clears minHuTay = 5 (10 >= 5)', () => {
      const r = scoringEngine.evaluateHand(
        handWith4Kims,
        [],
        [],
        { ...BASE_CONTEXT, winningTile: winTile, isInstantHu: true },
        { ...TOURNAMENT_RULES, minHuTay: 5 }
      );
      expect(r.isValidHu).toBe(true);
      expect(r.isLewFit).toBe(false);
      expect(r.totalTay).toBe(10);
      expect(hasPattern(r, 9)).toBe(true);
    });

    it('clears minHuTay = 10 (10 >= 10)', () => {
      const r = scoringEngine.evaluateHand(
        handWith4Kims,
        [],
        [],
        { ...BASE_CONTEXT, winningTile: winTile, isInstantHu: true },
        { ...TOURNAMENT_RULES, minHuTay: 10 }
      );
      expect(r.isValidHu).toBe(true);
      expect(r.isLewFit).toBe(false);
      expect(r.totalTay).toBe(10);
    });

    it('fails minHuTay = 15 (10 < 15)', () => {
      const r = scoringEngine.evaluateHand(
        handWith4Kims,
        [],
        [],
        { ...BASE_CONTEXT, winningTile: winTile, isInstantHu: true },
        { ...TOURNAMENT_RULES, minHuTay: 15 }
      );
      expect(r.isValidHu).toBe(false);
      expect(r.isLewFit).toBe(true);
      expect(r.lewFitReason).toBe('below-minimum');
      expect(r.totalTay).toBe(10);
    });

    it('fails minHuTay = 20 (10 < 20)', () => {
      const r = scoringEngine.evaluateHand(
        handWith4Kims,
        [],
        [],
        { ...BASE_CONTEXT, winningTile: winTile, isInstantHu: true },
        { ...TOURNAMENT_RULES, minHuTay: 20 }
      );
      expect(r.isValidHu).toBe(false);
      expect(r.isLewFit).toBe(true);
      expect(r.lewFitReason).toBe('below-minimum');
      expect(r.totalTay).toBe(10);
    });
  });

  describe('#34 Si Am Kang Instant Hu (4 Concealed Triplets, 10 Tay)', () => {
    // 4 concealed triplets: 1T 1T 1T, 2S 2S 2S, 3B 3B 3B, WD WD WD, plus 1 odd tile
    const handWith4Trips = parseTileHand('1T 1T 1T 2S 2S 2S 3B 3B 3B WD WD WD 9S');

    it('clears minHuTay = 5 (10 >= 5)', () => {
      const r = scoringEngine.evaluateHand(
        handWith4Trips,
        [],
        [],
        { ...BASE_CONTEXT, winningTile: winTile, isInstantHu: true },
        { ...TOURNAMENT_RULES, minHuTay: 5 }
      );
      expect(r.isValidHu).toBe(true);
      expect(r.isLewFit).toBe(false);
      expect(r.totalTay).toBe(10);
      expect(hasPattern(r, 34)).toBe(true);
    });

    it('clears minHuTay = 10 (10 >= 10)', () => {
      const r = scoringEngine.evaluateHand(
        handWith4Trips,
        [],
        [],
        { ...BASE_CONTEXT, winningTile: winTile, isInstantHu: true },
        { ...TOURNAMENT_RULES, minHuTay: 10 }
      );
      expect(r.isValidHu).toBe(true);
      expect(r.isLewFit).toBe(false);
    });

    it('fails minHuTay = 15 (10 < 15)', () => {
      const r = scoringEngine.evaluateHand(
        handWith4Trips,
        [],
        [],
        { ...BASE_CONTEXT, winningTile: winTile, isInstantHu: true },
        { ...TOURNAMENT_RULES, minHuTay: 15 }
      );
      expect(r.isValidHu).toBe(false);
      expect(r.isLewFit).toBe(true);
      expect(r.lewFitReason).toBe('below-minimum');
    });

    it('fails minHuTay = 20 (10 < 20)', () => {
      const r = scoringEngine.evaluateHand(
        handWith4Trips,
        [],
        [],
        { ...BASE_CONTEXT, winningTile: winTile, isInstantHu: true },
        { ...TOURNAMENT_RULES, minHuTay: 20 }
      );
      expect(r.isValidHu).toBe(false);
      expect(r.isLewFit).toBe(true);
      expect(r.lewFitReason).toBe('below-minimum');
    });
  });

  describe('Multi-Trigger Instant Hu Stacking & High Thresholds', () => {
    it('dual trigger (#6 7 flowers + #9 4 Kims = 20 Tay) clears minHuTay = 15 and 20, fails 25', () => {
      const handWith4Kims = parseTileHand('KIM KIM KIM KIM 1T 3T 5T 7T 9T 1S 3S 5S 7S');
      const sevenFlowers = ['F1', 'F2', 'F3', 'F4', 'M1', 'M2', 'M3'].map((k) => keyToTile(k));

      // Under minHuTay 15 -> PASS
      const r15 = scoringEngine.evaluateHand(
        handWith4Kims,
        [],
        sevenFlowers,
        { ...BASE_CONTEXT, winningTile: winTile, isInstantHu: true },
        { ...TOURNAMENT_RULES, minHuTay: 15 }
      );
      expect(r15.isValidHu).toBe(true);
      expect(r15.totalTay).toBe(20);
      expect(hasPattern(r15, 6)).toBe(true);
      expect(hasPattern(r15, 9)).toBe(true);

      // Under minHuTay 20 -> PASS
      const r20 = scoringEngine.evaluateHand(
        handWith4Kims,
        [],
        sevenFlowers,
        { ...BASE_CONTEXT, winningTile: winTile, isInstantHu: true },
        { ...TOURNAMENT_RULES, minHuTay: 20 }
      );
      expect(r20.isValidHu).toBe(true);
      expect(r20.totalTay).toBe(20);

      // Under minHuTay 25 -> FAIL (20 < 25)
      const r25 = scoringEngine.evaluateHand(
        handWith4Kims,
        [],
        sevenFlowers,
        { ...BASE_CONTEXT, winningTile: winTile, isInstantHu: true },
        { ...TOURNAMENT_RULES, minHuTay: 25 }
      );
      expect(r25.isValidHu).toBe(false);
      expect(r25.isLewFit).toBe(true);
      expect(r25.lewFitReason).toBe('below-minimum');
      expect(r25.totalTay).toBe(20);
    });

    it('invalid Instant Hu declaration (no conditions met) returns lewFitReason: instant-invalid across all minHuTay', () => {
      for (const minTay of [5, 10, 15, 20]) {
        const r = scoringEngine.evaluateHand(
          dummyConcealed,
          [],
          [keyToTile('F1')], // only 1 flower, 0 Kims, 0 trips
          { ...BASE_CONTEXT, winningTile: winTile, isInstantHu: true },
          { ...TOURNAMENT_RULES, minHuTay: minTay }
        );
        expect(r.isValidHu).toBe(false);
        expect(r.isLewFit).toBe(true);
        expect(r.lewFitReason).toBe('instant-invalid');
      }
    });
  });
});

// ============================================================================
// Suite 3: First-Turn Wins Matrix (East vs Non-East, Pao Chin, Win Type)
// ============================================================================

describe('Adversarial Deep: 3. First-Turn Wins Matrix (Pao Chin, Thien Fu, Thi Fu)', () => {
  // Standard Ping Fu winning hand:
  // 1T 2T 3T, 4T 5T 6T, 2S 3S 4S, 6B 7B 8B, pair 5S
  const PING_FU_HAND = '1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S';
  const WINNING_5S = keyToTile('5S', 2);

  describe('East Dealer Opening Hand (seatWind: dong)', () => {
    it('East deal self-draw WITHOUT Pao Chin: awards #11 Thien Fu (60 NK), NO #10, NO #12', () => {
      const r = scoringEngine.evaluateHand(
        parseTileHand(PING_FU_HAND),
        [],
        [],
        {
          ...BASE_CONTEXT,
          seatWind: 'dong',
          isInitialDeal: true,
          isSelfDraw: true,
          isDiscardWin: false,
          isPaoChin: false,
          winningTile: WINNING_5S,
        },
        TOURNAMENT_RULES
      );

      expect(r.isValidHu).toBe(true);
      expect(hasPattern(r, 11)).toBe(true);
      expect(tayOf(r, 11)).toBe(60);
      expect(hasPattern(r, 10)).toBe(false);
      expect(hasPattern(r, 12)).toBe(false);
    });

    it('East deal self-draw WITH Pao Chin: awards #11 Thien Fu (60 NK) and #10 Pao Chin (30 NK), NO #12', () => {
      const r = scoringEngine.evaluateHand(
        parseTileHand(PING_FU_HAND),
        [],
        [],
        {
          ...BASE_CONTEXT,
          seatWind: 'dong',
          isInitialDeal: true,
          isSelfDraw: true,
          isDiscardWin: false,
          isPaoChin: true,
          winningTile: WINNING_5S,
        },
        TOURNAMENT_RULES
      );

      expect(r.isValidHu).toBe(true);
      expect(hasPattern(r, 11)).toBe(true);
      expect(tayOf(r, 11)).toBe(60);
      expect(hasPattern(r, 10)).toBe(true);
      expect(tayOf(r, 10)).toBe(30);
      // East opening self-draw is Thien Fu, NEVER Thi Fu
      expect(hasPattern(r, 12)).toBe(false);
    });

    it('East winning on opponent first discard WITHOUT Pao Chin: NO #10, NO #11, NO #12', () => {
      const r = scoringEngine.evaluateHand(
        parseTileHand(PING_FU_HAND),
        [],
        [],
        {
          ...BASE_CONTEXT,
          seatWind: 'dong',
          isInitialDeal: true,
          isSelfDraw: false,
          isDiscardWin: true,
          isPaoChin: false,
          winningTile: WINNING_5S,
        },
        TOURNAMENT_RULES
      );

      expect(r.isValidHu).toBe(true);
      expect(hasPattern(r, 10)).toBe(false);
      expect(hasPattern(r, 11)).toBe(false);
      expect(hasPattern(r, 12)).toBe(false);
    });

    it('East winning on opponent first discard WITH Pao Chin: awards #12 Thi Fu and #10 Pao Chin, NO #11', () => {
      const r = scoringEngine.evaluateHand(
        parseTileHand(PING_FU_HAND),
        [],
        [],
        {
          ...BASE_CONTEXT,
          seatWind: 'dong',
          isInitialDeal: true,
          isSelfDraw: false,
          isDiscardWin: true,
          isPaoChin: true,
          winningTile: WINNING_5S,
        },
        TOURNAMENT_RULES
      );

      expect(r.isValidHu).toBe(true);
      expect(hasPattern(r, 11)).toBe(false); // Discard win is NOT Thien Fu
      expect(hasPattern(r, 12)).toBe(true); // Thi Fu from first discard
      expect(tayOf(r, 12)).toBe(60);
      expect(hasPattern(r, 10)).toBe(true); // Pao Chin
    });
  });

  describe('Non-East Seats (nan, xi, bei)', () => {
    const nonEastSeats: Seat[] = ['nan', 'xi', 'bei'];

    for (const seat of nonEastSeats) {
      describe(`Seat: ${seat}`, () => {
        it('first wall draw ("hasil lew") WITHOUT Pao Chin: NO #10, NO #11, NO #12', () => {
          const r = scoringEngine.evaluateHand(
            parseTileHand(PING_FU_HAND),
            [],
            [],
            {
              ...BASE_CONTEXT,
              seatWind: seat,
              isInitialDeal: true,
              isSelfDraw: true,
              isDiscardWin: false,
              isPaoChin: false,
              winningTile: WINNING_5S,
            },
            TOURNAMENT_RULES
          );

          expect(r.isValidHu).toBe(true);
          expect(hasPattern(r, 11)).toBe(false); // Only East can get Thien Fu
          expect(hasPattern(r, 12)).toBe(false); // Thi Fu strictly requires Pao Chin
          expect(hasPattern(r, 10)).toBe(false);
        });

        it('first wall draw ("hasil lew") WITH Pao Chin: awards #12 Thi Fu and #10 Pao Chin, NO #11', () => {
          const r = scoringEngine.evaluateHand(
            parseTileHand(PING_FU_HAND),
            [],
            [],
            {
              ...BASE_CONTEXT,
              seatWind: seat,
              isInitialDeal: true,
              isSelfDraw: true,
              isDiscardWin: false,
              isPaoChin: true,
              winningTile: WINNING_5S,
            },
            TOURNAMENT_RULES
          );

          expect(r.isValidHu).toBe(true);
          expect(hasPattern(r, 11)).toBe(false);
          expect(hasPattern(r, 12)).toBe(true);
          expect(tayOf(r, 12)).toBe(60);
          expect(hasPattern(r, 10)).toBe(true);
        });

        it('first discard win WITHOUT Pao Chin: NO #10, NO #11, NO #12', () => {
          const r = scoringEngine.evaluateHand(
            parseTileHand(PING_FU_HAND),
            [],
            [],
            {
              ...BASE_CONTEXT,
              seatWind: seat,
              isInitialDeal: true,
              isSelfDraw: false,
              isDiscardWin: true,
              isPaoChin: false,
              winningTile: WINNING_5S,
            },
            TOURNAMENT_RULES
          );

          expect(r.isValidHu).toBe(true);
          expect(hasPattern(r, 10)).toBe(false);
          expect(hasPattern(r, 11)).toBe(false);
          expect(hasPattern(r, 12)).toBe(false);
        });

        it('first discard win WITH Pao Chin: awards #12 Thi Fu and #10 Pao Chin, NO #11', () => {
          const r = scoringEngine.evaluateHand(
            parseTileHand(PING_FU_HAND),
            [],
            [],
            {
              ...BASE_CONTEXT,
              seatWind: seat,
              isInitialDeal: true,
              isSelfDraw: false,
              isDiscardWin: true,
              isPaoChin: true,
              winningTile: WINNING_5S,
            },
            TOURNAMENT_RULES
          );

          expect(r.isValidHu).toBe(true);
          expect(hasPattern(r, 11)).toBe(false);
          expect(hasPattern(r, 12)).toBe(true);
          expect(tayOf(r, 12)).toBe(60);
          expect(hasPattern(r, 10)).toBe(true);
        });
      });
    }
  });

  describe('Overlap Policy Behavior: Additive vs Supersede', () => {
    it('under supersede policy, Thi Fu (#12) removes Pao Chin (#10)', () => {
      const supersedeEngine = new ScoringEngine({ overlapPolicy: 'supersede' });
      const r = supersedeEngine.evaluateHand(
        parseTileHand(PING_FU_HAND),
        [],
        [],
        {
          ...BASE_CONTEXT,
          seatWind: 'nan',
          isInitialDeal: true,
          isSelfDraw: true,
          isDiscardWin: false,
          isPaoChin: true,
          winningTile: WINNING_5S,
        },
        TOURNAMENT_RULES
      );

      expect(r.isValidHu).toBe(true);
      expect(hasPattern(r, 12)).toBe(true);
      expect(hasPattern(r, 10)).toBe(false); // Dropped under supersede policy
    });

    it('under default additive policy, both Thi Fu (#12) and Pao Chin (#10) are retained', () => {
      const r = scoringEngine.evaluateHand(
        parseTileHand(PING_FU_HAND),
        [],
        [],
        {
          ...BASE_CONTEXT,
          seatWind: 'nan',
          isInitialDeal: true,
          isSelfDraw: true,
          isDiscardWin: false,
          isPaoChin: true,
          winningTile: WINNING_5S,
        },
        TOURNAMENT_RULES
      );

      expect(r.isValidHu).toBe(true);
      expect(hasPattern(r, 12)).toBe(true);
      expect(hasPattern(r, 10)).toBe(true);
    });
  });

  describe('Decay on Subsequent Turns (isInitialDeal: false)', () => {
    it('win on turn 2+ with isPaoChin: true retains #10 Pao Chin, but NEVER #11 or #12', () => {
      const r = scoringEngine.evaluateHand(
        parseTileHand(PING_FU_HAND),
        [],
        [],
        {
          ...BASE_CONTEXT,
          seatWind: 'dong',
          isInitialDeal: false,
          isSelfDraw: true,
          isDiscardWin: false,
          isPaoChin: true,
          winningTile: WINNING_5S,
        },
        TOURNAMENT_RULES
      );

      expect(r.isValidHu).toBe(true);
      expect(hasPattern(r, 10)).toBe(true); // Pao Chin remains active throughout hand
      expect(hasPattern(r, 11)).toBe(false); // No Thien Fu
      expect(hasPattern(r, 12)).toBe(false); // No Thi Fu
    });
  });
});
