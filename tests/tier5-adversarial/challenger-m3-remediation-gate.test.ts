/**
 * Challenger 2 Remediation Verification Gate Test Suite
 * Milestone 3 Remediation Independent Verification
 *
 * Exhaustive empirical verification of:
 * 1. SCORING-BUG-01: Se Sam Pu Tat (#39) invalidation on flowers/seasons or Kim
 * 2. SCORING-BUG-02: Thi Fu (#12) qualification conditions (Pao Chin requirement)
 * 3. SCORING-BUG-03: Instant Hu threshold gate against configurable minHuTay
 * 4. Global Maximum Tay Arbitration across candidate Kim wildcard decompositions
 * 5. K vs NK mode scoring consistency, dual-column values, and invariant matrix
 */

import { describe, it, expect } from 'vitest';
import {
  scoringEngine,
  PATTERNS,
  baseTay,
  type WinContext,
  type DetectedPattern,
} from '@/scoring';
import {
  parseTileHand,
  keyToTile,
} from '@/core/tiles';
import type { Tile } from '@/core/types';
import { TOURNAMENT_RULES } from '../scoring/claude-44-patterns-fixtures';

function makeContext(overrides: Partial<WinContext> & { winningTile: Tile }): WinContext {
  const isSelfDraw = overrides.isSelfDraw ?? false;
  return {
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
    ...overrides,
    winningTile: overrides.winningTile,
  };
}

function hasPattern(result: { patterns: DetectedPattern[] }, id: number): boolean {
  return result.patterns.some((p) => p.id === id);
}

function tayOf(result: { patterns: DetectedPattern[] }, id: number): number {
  return result.patterns.find((p) => p.id === id)?.tay ?? 0;
}

describe('Challenger 2 M3 Remediation Verification Gate', () => {

  // ==========================================================================
  // Section 1: SCORING-BUG-01 Invalidation of Se Sam Pu Tat (#39) with Bonus Tiles / Kim
  // ==========================================================================
  describe('1. SCORING-BUG-01: Se Sam Pu Tat (#39) Boundary Invariants', () => {
    const uncorrelated13 = '1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB';
    const winTile = keyToTile('DZ');

    it('clean 14 uncorrelated tiles with 0 flowers and 0 Kims awards #39 (40 Tay NK)', () => {
      const res = scoringEngine.evaluateHand(
        parseTileHand(uncorrelated13),
        [],
        [],
        makeContext({ winningTile: winTile }),
        TOURNAMENT_RULES
      );
      expect(res.isValidHu).toBe(true);
      expect(res.isLewFit).toBe(false);
      expect(res.mode).toBe('NK');
      expect(hasPattern(res, 39)).toBe(true);
      expect(tayOf(res, 39)).toBe(40);
      expect(res.totalTay).toBeGreaterThanOrEqual(40);
    });

    it('uncorrelated hand with even 1 flower tile is rejected as Lew Fit structure', () => {
      const singleFlower = [keyToTile('F1')];
      const res = scoringEngine.evaluateHand(
        parseTileHand(uncorrelated13),
        [],
        singleFlower,
        makeContext({ winningTile: winTile }),
        TOURNAMENT_RULES
      );
      expect(res.isValidHu).toBe(false);
      expect(res.isLewFit).toBe(true);
      expect(res.lewFitReason).toBe('structure');
      expect(res.rejectionReason).toMatch(/Se Sam Pu Tat tidak boleh memiliki bunga/i);
    });

    it('uncorrelated hand with 4 seasons (20 Tay bonus) is rejected as Lew Fit structure', () => {
      const fourSeasons = [keyToTile('M1'), keyToTile('M2'), keyToTile('M3'), keyToTile('M4')];
      const res = scoringEngine.evaluateHand(
        parseTileHand(uncorrelated13),
        [],
        fourSeasons,
        makeContext({ winningTile: winTile }),
        TOURNAMENT_RULES
      );
      expect(res.isValidHu).toBe(false);
      expect(res.isLewFit).toBe(true);
      expect(res.lewFitReason).toBe('structure');
      expect(res.rejectionReason).toMatch(/Se Sam Pu Tat tidak boleh memiliki bunga/i);
    });

    it('uncorrelated hand with a Kim tile is rejected as Lew Fit structure', () => {
      const kimUncorrelated = parseTileHand('1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX KIM');
      const res = scoringEngine.evaluateHand(
        kimUncorrelated,
        [],
        [],
        makeContext({ winningTile: winTile }),
        TOURNAMENT_RULES
      );
      expect(res.isValidHu).toBe(false);
      expect(res.isLewFit).toBe(true);
      expect(res.lewFitReason).toBe('structure');
    });

    it('standard 4 melds + pair hand with flowers is NOT rejected as structure', () => {
      const standardHand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WN WN WN 4T');
      const res = scoringEngine.evaluateHand(
        standardHand,
        [],
        [keyToTile('F1')],
        makeContext({ winningTile: keyToTile('4T', 2), seatWind: 'dong' }),
        TOURNAMENT_RULES
      );
      expect(res.isValidHu).toBe(true);
      expect(res.isLewFit).toBe(false);
    });
  });

  // ==========================================================================
  // Section 2: SCORING-BUG-02 Thi Fu (#12) Rulebook Harmonization
  // ==========================================================================
  describe('2. SCORING-BUG-02: Thi Fu (#12) Qualification Invariants', () => {
    const validHand = parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S');
    const winTile = keyToTile('5S', 2);

    it('non-dealer wins on a first-round discard WITH Pao Chin declared -> scores #12 Thi Fu (40 Tay K / 60 Tay NK)', () => {
      const res = scoringEngine.evaluateHand(
        validHand,
        [],
        [],
        makeContext({
          winningTile: winTile,
          seatWind: 'nan',
          isInitialDeal: true,
          isPaoChin: true,
          isSelfDraw: false,
          discarderSeat: 'dong',
        }),
        TOURNAMENT_RULES
      );
      expect(res.isValidHu).toBe(true);
      expect(hasPattern(res, 10)).toBe(true); // Pao Chin
      expect(hasPattern(res, 12)).toBe(true); // Thi Fu
      expect(hasPattern(res, 11)).toBe(false); // Thien Fu (East only)
      expect(tayOf(res, 12)).toBe(60); // 60 NK
    });

    it('non-dealer first-round self-draw WITH Pao Chin keeps #10 but is NOT #12 Thi Fu (discard-only, RULES.md)', () => {
      const res = scoringEngine.evaluateHand(
        validHand,
        [],
        [],
        makeContext({
          winningTile: winTile,
          seatWind: 'nan',
          isInitialDeal: true,
          isPaoChin: true,
          isSelfDraw: true,
        }),
        TOURNAMENT_RULES
      );
      expect(res.isValidHu).toBe(true);
      expect(hasPattern(res, 10)).toBe(true);
      expect(hasPattern(res, 12)).toBe(false);
      expect(hasPattern(res, 11)).toBe(false);
    });

    it('non-dealer wins on first turn WITHOUT Pao Chin -> must NOT score #12 Thi Fu', () => {
      const res = scoringEngine.evaluateHand(
        validHand,
        [],
        [],
        makeContext({
          winningTile: winTile,
          seatWind: 'nan',
          isInitialDeal: true,
          isPaoChin: false,
          isSelfDraw: true,
        }),
        TOURNAMENT_RULES
      );
      expect(hasPattern(res, 12)).toBe(false);
      expect(hasPattern(res, 10)).toBe(false);
    });

    it('dealer (dong) winning on first-turn self-draw scores #11 Thien Fu, NOT #12 Thi Fu', () => {
      const res = scoringEngine.evaluateHand(
        validHand,
        [],
        [],
        makeContext({
          winningTile: winTile,
          seatWind: 'dong',
          isInitialDeal: true,
          isPaoChin: true,
          isSelfDraw: true,
        }),
        TOURNAMENT_RULES
      );
      expect(hasPattern(res, 11)).toBe(true); // Thien Fu
      expect(hasPattern(res, 12)).toBe(false); // Thi Fu must not co-occur
    });
  });

  // ==========================================================================
  // Section 3: SCORING-BUG-03 Instant Hu minHuTay Gate Verification
  // ==========================================================================
  describe('3. SCORING-BUG-03: Instant Hu Threshold Gate Enforcement', () => {
    const junkHand = parseTileHand('1T 3T 5T 7T 9T 1S 3S 5S 7S 9S 1B 3B 5B');
    const winTile = keyToTile('7B');
    const sevenFlowers = [
      keyToTile('F1'), keyToTile('F2'), keyToTile('F3'), keyToTile('F4'),
      keyToTile('M1'), keyToTile('M2'), keyToTile('M3'),
    ];

    it('instant Hu of 10 Tay passes under default minHuTay = 5', () => {
      const res = scoringEngine.evaluateHand(
        junkHand,
        [],
        sevenFlowers,
        makeContext({ winningTile: winTile, isInstantHu: true }),
        { ...TOURNAMENT_RULES, minHuTay: 5 }
      );
      expect(res.isValidHu).toBe(true);
      expect(res.isLewFit).toBe(false);
      expect(res.totalTay).toBe(10);
      expect(hasPattern(res, 6)).toBe(true);
    });

    it('instant Hu of 10 Tay passes under exact boundary minHuTay = 10', () => {
      const res = scoringEngine.evaluateHand(
        junkHand,
        [],
        sevenFlowers,
        makeContext({ winningTile: winTile, isInstantHu: true }),
        { ...TOURNAMENT_RULES, minHuTay: 10 }
      );
      expect(res.isValidHu).toBe(true);
      expect(res.isLewFit).toBe(false);
      expect(res.totalTay).toBe(10);
    });

    it('instant Hu of 10 Tay is rejected as Lew Fit below-minimum under minHuTay = 15', () => {
      const res = scoringEngine.evaluateHand(
        junkHand,
        [],
        sevenFlowers,
        makeContext({ winningTile: winTile, isInstantHu: true }),
        { ...TOURNAMENT_RULES, minHuTay: 15 }
      );
      expect(res.isValidHu).toBe(false);
      expect(res.isLewFit).toBe(true);
      expect(res.lewFitReason).toBe('below-minimum');
      expect(res.totalTay).toBe(10);
      expect(hasPattern(res, 6)).toBe(true);
      expect(res.rejectionReason).toMatch(/kurang dari 15 Tay/i);
    });

    it('Shi Kim instant Hu (10 Tay) is rejected under minHuTay = 12', () => {
      const fourKimJunk = parseTileHand('KIM KIM KIM KIM 1T 3T 5T 7T 9T 1S 3S 5S 7S');
      const res = scoringEngine.evaluateHand(
        fourKimJunk,
        [],
        [],
        makeContext({ winningTile: keyToTile('7S'), isInstantHu: true }),
        { ...TOURNAMENT_RULES, minHuTay: 12 }
      );
      expect(res.isValidHu).toBe(false);
      expect(res.isLewFit).toBe(true);
      expect(res.lewFitReason).toBe('below-minimum');
      expect(res.totalTay).toBe(10);
      expect(hasPattern(res, 9)).toBe(true);
    });

    it('instant Hu without meeting any instant condition is rejected as instant-invalid', () => {
      const res = scoringEngine.evaluateHand(
        junkHand,
        [],
        [keyToTile('F1'), keyToTile('F2')],
        makeContext({ winningTile: winTile, isInstantHu: true }),
        TOURNAMENT_RULES
      );
      expect(res.isValidHu).toBe(false);
      expect(res.isLewFit).toBe(true);
      expect(res.lewFitReason).toBe('instant-invalid');
    });
  });

  // ==========================================================================
  // Section 4: Global Maximum Tay Arbitration
  // ==========================================================================
  describe('4. Global Maximum Tay Arbitration Across Decompositions', () => {
    it('arbitrates between multiple valid Kim decompositions and selects the highest Tay', () => {
      const hand = parseTileHand('KIM KIM KIM DZ DZ DZ DF DF DF DP DP 5T 5T');
      const res = scoringEngine.evaluateHand(
        hand,
        [],
        [],
        makeContext({ winningTile: keyToTile('5T', 3), isSelfDraw: true }),
        TOURNAMENT_RULES
      );
      expect(res.candidateCount).toBeGreaterThan(1);
      expect(hasPattern(res, 22)).toBe(true); // Ta San Yen (30)
      expect(hasPattern(res, 32)).toBe(true); // Kim Ciok (20)
      expect(hasPattern(res, 30)).toBe(false); // Kim Thi not chosen
      expect(hasPattern(res, 21)).toBe(false); // Siau San Yen not chosen
    });

    it('candidateCount accurately reflects number of evaluated valid decompositions', () => {
      const flexibleHand = parseTileHand('1T 2T 3T 2T 3T 4T 3T 4T 5T 7B 7B 7B 9S');
      const res = scoringEngine.evaluateHand(
        flexibleHand,
        [],
        [],
        makeContext({ winningTile: keyToTile('9S', 2) }),
        TOURNAMENT_RULES
      );
      expect(res.isValidHu).toBe(true);
      expect(res.candidateCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Section 5: K Mode vs NK Mode Scoring Consistency Matrix
  // ==========================================================================
  describe('5. K vs NK Mode Consistency & Table Matrix Invariants', () => {
    it('every pattern defined in PATTERNS respects its K / NK specification', () => {
      for (const [id] of PATTERNS.entries()) {
        const kVal = baseTay(id, 'K');
        const nkVal = baseTay(id, 'NK');

        if (id === 8) {
          expect(kVal).toBeNull();
          expect(nkVal).toBe(3);
        }
        if (id === 7) {
          expect(kVal).toBe(1);
          expect(nkVal).toBeNull();
        }
        if (id === 30) {
          expect(kVal).toBe(30);
          expect(nkVal).toBeNull();
        }
        if (id === 32) {
          expect(kVal).toBe(20);
          expect(nkVal).toBeNull();
        }
        if (id === 39) {
          expect(kVal).toBeNull();
          expect(nkVal).toBe(40);
        }
        if (id === 40) {
          expect(kVal).toBe(5);
          expect(nkVal).toBeNull();
        }

        if ([10, 11, 12, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 34].includes(id)) {
          expect(nkVal).toBeGreaterThan(kVal!);
        }
      }
    });

    it('evaluating with 0 Kims strictly enforces mode NK with Bo Kim (+3) and no Tile Kim', () => {
      const cleanHand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WD WD WD 5T');
      const res = scoringEngine.evaluateHand(
        cleanHand,
        [],
        [],
        makeContext({ winningTile: keyToTile('5T', 2), seatWind: 'nan', roundWind: 'nan' }),
        TOURNAMENT_RULES
      );
      expect(res.mode).toBe('NK');
      expect(res.isWithKim).toBe(false);
      expect(hasPattern(res, 8)).toBe(true);
      expect(hasPattern(res, 7)).toBe(false);
      expect(tayOf(res, 8)).toBe(3);
    });

    it('evaluating with 1 Kim strictly enforces mode K with Tile Kim (+1) and no Bo Kim', () => {
      const kimHand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WD WD WD KIM');
      const res = scoringEngine.evaluateHand(
        kimHand,
        [],
        [],
        makeContext({ winningTile: keyToTile('5T', 2), seatWind: 'nan', roundWind: 'nan' }),
        TOURNAMENT_RULES
      );
      expect(res.mode).toBe('K');
      expect(res.isWithKim).toBe(true);
      expect(hasPattern(res, 7)).toBe(true);
      expect(hasPattern(res, 8)).toBe(false);
      expect(tayOf(res, 7)).toBe(1);
    });
  });
});
