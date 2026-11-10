/**
 * Independent verification test suite by Reviewer 1 for Milestone 3 Verification Gate.
 * Adversarially tests:
 * 1. Conformance of all 44 Tay rules against Bandung Mahjong Cup ver06.
 * 2. Strict 5-Tay minimum Hu threshold & Lew Fit penalty behavior.
 * 3. Instant Hu triggers (#6, #9, #34) and illegal instant Hu rejection.
 * 4. Critical patterns: #3, #12, #19, #30, #31, #32, #33, #34, #36, #39, #40, #41, #42, #43, #44.
 * 5. Multi-decomposition arbitration selecting global maximum total Tay.
 */
import { describe, it, expect } from 'vitest';
import {
  PATTERNS,
  scoringEngine,
  type WinContext,
} from '@/scoring';
import { parseTileHand, keyToTile } from '@/core/tiles';
import type { GameRules, Meld } from '@/core/types';

const DEFAULT_TEST_RULES: GameRules = {
  kimEnabled: true,
  kimDiscardAllowed: false,
  allowKimInMeldClaim: false,
  minHuTay: 5,
};

const BASE_CTX: WinContext = {
  winningTile: keyToTile('5T'),
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
  discarderSeat: 'xi',
};

describe('Reviewer 1 Verification: 44-Tay Conformance & Invariants', () => {
  it('BMC ver06 Table Conformance: all 44 pattern definitions exist with exact K and NK values', () => {
    expect(PATTERNS.size).toBe(44);

    const expectedMatrix: Record<number, { K: number | null; NK: number | null; instant?: number }> = {
      1: { K: 0, NK: 0 },
      2: { K: 1, NK: 1 },
      3: { K: 3, NK: 3 },
      4: { K: 10, NK: 10 },
      5: { K: 20, NK: 20 },
      6: { K: 30, NK: 30, instant: 10 },
      7: { K: 1, NK: null },
      8: { K: null, NK: 3 },
      9: { K: 40, NK: null, instant: 10 },
      10: { K: 20, NK: 30 },
      11: { K: 40, NK: 60 },
      12: { K: 40, NK: 60 },
      13: { K: 0, NK: 0 },
      14: { K: 3, NK: 3 },
      15: { K: 5, NK: 10 },
      16: { K: 10, NK: 20 },
      17: { K: 5, NK: 10 },
      18: { K: 20, NK: 30 },
      19: { K: 30, NK: 40 },
      20: { K: 40, NK: 60 },
      21: { K: 10, NK: 20 },
      22: { K: 30, NK: 40 },
      23: { K: 30, NK: 40 },
      24: { K: 50, NK: 60 },
      25: { K: 1, NK: 1 },
      26: { K: 1, NK: 1 },
      27: { K: 2, NK: 2 },
      28: { K: 1, NK: 1 },
      29: { K: 1, NK: 1 },
      30: { K: 30, NK: null },
      31: { K: 1, NK: 1 },
      32: { K: 20, NK: null },
      33: { K: 5, NK: 5 },
      34: { K: 20, NK: 30, instant: 10 },
      35: { K: 5, NK: 5 },
      36: { K: 5, NK: 5 },
      37: { K: 5, NK: 5 },
      38: { K: 30, NK: 30 },
      39: { K: null, NK: 40 },
      40: { K: 5, NK: null },
      41: { K: 5, NK: 5 },
      42: { K: 1, NK: 1 },
      43: { K: 1, NK: 1 },
      44: { K: 5, NK: 5 },
    };

    for (let id = 1; id <= 44; id++) {
      const def = PATTERNS.get(id);
      expect(def, `Pattern #${id} must exist`).toBeDefined();
      const exp = expectedMatrix[id]!;
      expect(def!.K, `Pattern #${id} K value`).toBe(exp.K);
      expect(def!.NK, `Pattern #${id} NK value`).toBe(exp.NK);
      if (exp.instant !== undefined) {
        expect(def!.instantHu, `Pattern #${id} instantHu value`).toBe(exp.instant);
      }
    }
  });

  describe('5-Tay Gate & Lew Fit Rejection', () => {
    it('rejects hands with 4 Tay as below-minimum Lew Fit', () => {
      // Construct a valid Chicken Hand (0 Tay) with 1 flower (0 Tay) + Bo Kim (3 Tay) + Mun (1 Tay) = 4 Tay total
      // Chicken hand: mixed sequence and triplet, e.g. 1-2-3T, 4-5-6T, 7-8-9T, 2-2-2S, pair 5S.
      // Wait, 1-2-3T 4-5-6T 7-8-9T 2-2-2S pair 5S is 3 sequences + 1 triplet + pair 5S.
      // Not Ping Fu (has triplet), not Tuei Tuei (has sequences), not Chao It (mixed suits), not Yau Kiu.
      // Detected patterns: Chicken Hand (0 Tay) + Bo KIM (3 Tay) + Mun (1 Tay) + Flower F1 (0 Tay) = 4 Tay!
      const hand = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 2S 2S 2S 5S');
      const flowers = [keyToTile('F1')]; // non-matching flower = 0 Tay
      const winTile = keyToTile('5S', 2);
      const res = scoringEngine.evaluateHand(hand, [], flowers, { ...BASE_CTX, winningTile: winTile }, DEFAULT_TEST_RULES);

      expect(res.totalTay).toBe(4);
      expect(res.isValidHu).toBe(false);
      expect(res.isLewFit).toBe(true);
      expect(res.lewFitReason).toBe('below-minimum');
      expect(res.rejectionReason).toContain('Lew Fit: Hu kurang dari 5 Tay (hanya 4 Tay)');
    });

    it('accepts hands with exactly 5 Tay as valid Hu', () => {
      // Same Chicken Hand (0 Tay) + Bo Kim (3 Tay) + Mun (1 Tay) + Flower matching seat (+1 Tay) = 5 Tay!
      // Seat is nan (seat number 2). Flower F2 has value 2.
      const hand = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 2S 2S 2S 5S');
      const flowers = [keyToTile('F2')]; // matching seat = 1 Tay
      const winTile = keyToTile('5S', 2);
      const res = scoringEngine.evaluateHand(hand, [], flowers, { ...BASE_CTX, winningTile: winTile }, DEFAULT_TEST_RULES);

      expect(res.totalTay).toBe(5);
      expect(res.isValidHu).toBe(true);
      expect(res.isLewFit).toBe(false);
      expect(res.lewFitReason).toBeUndefined();
    });

    it('rejects structurally invalid hands as structure Lew Fit', () => {
      const hand = parseTileHand('1T 1T 2T 2T 3T 3T 4T 4T 5T 5T 6T 6T 7T');
      const winTile = keyToTile('8T');
      const res = scoringEngine.evaluateHand(hand, [], [], { ...BASE_CTX, winningTile: winTile }, DEFAULT_TEST_RULES);

      expect(res.isValidHu).toBe(false);
      expect(res.isLewFit).toBe(true);
      expect(res.lewFitReason).toBe('structure');
    });

    it('rejects Kim in claimed meld under tournament rules as kim-claim Lew Fit', () => {
      const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WX');
      const claimedMeld: Meld = {
        type: 'pung',
        tiles: [keyToTile('DZ'), keyToTile('DZ'), keyToTile('KIM')],
        claimedFrom: 'xi',
      };
      const winTile = keyToTile('WX', 2);
      const res = scoringEngine.evaluateHand(hand, [claimedMeld], [], { ...BASE_CTX, winningTile: winTile }, DEFAULT_TEST_RULES);

      expect(res.isValidHu).toBe(false);
      expect(res.isLewFit).toBe(true);
      expect(res.lewFitReason).toBe('kim-claim');
      expect(res.rejectionReason).toContain('Penalti #3');
    });
  });

  describe('Instant Hu Triggers (#6, #9, #34)', () => {
    it('#6: 7 Flowers/Seasons triggers instant Hu with 10 Tay regardless of incomplete hand', () => {
      const incompleteHand = parseTileHand('1T 3T 5T 7T 9T 2S 4S 6S 8S 1B 3B 5B 7B');
      const flowers = [
        keyToTile('F1'), keyToTile('F2'), keyToTile('F3'), keyToTile('F4'),
        keyToTile('M1'), keyToTile('M2'), keyToTile('M3'),
      ];
      const winTile = keyToTile('9B');
      const res = scoringEngine.evaluateHand(
        incompleteHand,
        [],
        flowers,
        { ...BASE_CTX, winningTile: winTile, isInstantHu: true },
        DEFAULT_TEST_RULES
      );

      expect(res.isValidHu).toBe(true);
      expect(res.isLewFit).toBe(false);
      expect(res.isInstantHu).toBe(true);
      expect(res.totalTay).toBe(10);
      expect(res.patterns).toHaveLength(1);
      expect(res.patterns[0]!.id).toBe(6);
      expect(res.patterns[0]!.tay).toBe(10);
    });

    it('#9: 4 Kims in hand triggers instant Hu with 10 Tay regardless of incomplete hand', () => {
      const incompleteHand = [
        keyToTile('KIM', 1), keyToTile('KIM', 2), keyToTile('KIM', 3), keyToTile('KIM', 4),
        keyToTile('1T'), keyToTile('4T'), keyToTile('7T'),
        keyToTile('2S'), keyToTile('5S'), keyToTile('8S'),
        keyToTile('3B'), keyToTile('6B'), keyToTile('9B'),
      ];
      const winTile = keyToTile('WD');
      const res = scoringEngine.evaluateHand(
        incompleteHand,
        [],
        [],
        { ...BASE_CTX, winningTile: winTile, isInstantHu: true },
        DEFAULT_TEST_RULES
      );

      expect(res.isValidHu).toBe(true);
      expect(res.isLewFit).toBe(false);
      expect(res.isInstantHu).toBe(true);
      expect(res.totalTay).toBe(10);
      expect(res.patterns).toHaveLength(1);
      expect(res.patterns[0]!.id).toBe(9);
      expect(res.patterns[0]!.tay).toBe(10);
    });

    it('#34: 4 concealed triplets triggers instant Hu with 10 Tay when hand eye is incomplete', () => {
      // 4 concealed triplets: 1T-1T-1T, 3S-3S-3S, 5B-5B-5B, DZ-DZ-DZ, plus 1 odd tile (e.g. 9B)
      const incompleteHand = parseTileHand('1T 1T 1T 3S 3S 3S 5B 5B 5B DZ DZ DZ 9B');
      const winTile = keyToTile('2T'); // does not complete the eye
      const res = scoringEngine.evaluateHand(
        incompleteHand,
        [],
        [],
        { ...BASE_CTX, winningTile: winTile, isInstantHu: true },
        DEFAULT_TEST_RULES
      );

      expect(res.isValidHu).toBe(true);
      expect(res.isLewFit).toBe(false);
      expect(res.isInstantHu).toBe(true);
      expect(res.totalTay).toBe(10);
      expect(res.patterns).toHaveLength(1);
      expect(res.patterns[0]!.id).toBe(34);
      expect(res.patterns[0]!.tay).toBe(10);
    });

    it('rejects instant Hu when none of the 3 instant conditions are met', () => {
      const incompleteHand = parseTileHand('1T 3T 5T 7T 9T 2S 4S 6S 8S 1B 3B 5B 7B');
      const flowers = [keyToTile('F1'), keyToTile('F2'), keyToTile('F3'), keyToTile('F4'), keyToTile('M1'), keyToTile('M2')]; // only 6 flowers!
      const winTile = keyToTile('9B');
      const res = scoringEngine.evaluateHand(
        incompleteHand,
        [],
        flowers,
        { ...BASE_CTX, winningTile: winTile, isInstantHu: true },
        DEFAULT_TEST_RULES
      );

      expect(res.isValidHu).toBe(false);
      expect(res.isLewFit).toBe(true);
      expect(res.lewFitReason).toBe('instant-invalid');
      expect(res.rejectionReason).toContain('Lew Fit: Hu langsung dideklarasikan tanpa syarat');
    });
  });

  describe('Critical Pattern Rules', () => {
    it('#3 Bo Hua Zi: requires 0 flowers/seasons AND 0 wind/dragon honors', () => {
      // All suited hand, 0 flowers, 0 honors: Ping Fu 3 + Bo Hua Zi 3 + Bo Kim 3 + Mun 1 = 10 Tay
      const suitedHand = parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S');
      const winTile = keyToTile('5S', 2);
      const resOk = scoringEngine.evaluateHand(suitedHand, [], [], { ...BASE_CTX, winningTile: winTile }, DEFAULT_TEST_RULES);
      expect(resOk.patterns.some((p) => p.id === 3)).toBe(true);

      // Disqualified by 1 flower
      const resDisqFlower = scoringEngine.evaluateHand(suitedHand, [], [keyToTile('F1')], { ...BASE_CTX, winningTile: winTile }, DEFAULT_TEST_RULES);
      expect(resDisqFlower.patterns.some((p) => p.id === 3)).toBe(false);

      // Disqualified by honor tile eye (e.g. WX pair)
      const honorHand = parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B WX');
      const winTileHonor = keyToTile('WX', 2);
      const resDisqHonor = scoringEngine.evaluateHand(honorHand, [], [], { ...BASE_CTX, winningTile: winTileHonor }, DEFAULT_TEST_RULES);
      expect(resDisqHonor.patterns.some((p) => p.id === 3)).toBe(false);
    });

    it('#12 Thi Fu: strictly requires prior isPaoChin', () => {
      const hand = parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S');
      const winTile = keyToTile('5S', 2);

      // Without Pao Chin on initial deal: Thi Fu is NOT awarded
      const resNoPaoChin = scoringEngine.evaluateHand(
        hand,
        [],
        [],
        { ...BASE_CTX, winningTile: winTile, isInitialDeal: true, isPaoChin: false },
        DEFAULT_TEST_RULES
      );
      expect(resNoPaoChin.patterns.some((p) => p.id === 12)).toBe(false);

      // With Pao Chin on initial deal (non-dealer): Thi Fu is awarded (60 Tay in NK)
      const resWithPaoChin = scoringEngine.evaluateHand(
        hand,
        [],
        [],
        { ...BASE_CTX, winningTile: winTile, isInitialDeal: true, isPaoChin: true },
        DEFAULT_TEST_RULES
      );
      expect(resWithPaoChin.patterns.some((p) => p.id === 12)).toBe(true);
      expect(resWithPaoChin.patterns.find((p) => p.id === 12)!.tay).toBe(60);
    });

    it('#19 Yau Kiu: strictly suited 1s and 9s only — any honor tile disqualifies', () => {
      // Pure 1s and 9s suited: 1T-1T-1T, 9T-9T-9T, 1S-1S-1S, 9B-9B-9B, pair 9S
      const pureTerminals = parseTileHand('1T 1T 1T 9T 9T 9T 1S 1S 1S 9B 9B 9B 9S');
      const winTile = keyToTile('9S', 2);
      const resPure = scoringEngine.evaluateHand(pureTerminals, [], [keyToTile('F1')], { ...BASE_CTX, winningTile: winTile }, DEFAULT_TEST_RULES);
      expect(resPure.patterns.some((p) => p.id === 19)).toBe(true);
      expect(resPure.patterns.find((p) => p.id === 19)!.tay).toBe(40);

      // Replacing 9B triplet with White Dragon (Pat) triplet: disqualified!
      const withHonors = parseTileHand('1T 1T 1T 9T 9T 9T 1S 1S 1S DP DP DP 9S');
      const resWithHonors = scoringEngine.evaluateHand(withHonors, [], [keyToTile('F1')], { ...BASE_CTX, winningTile: winTile }, DEFAULT_TEST_RULES);
      expect(resWithHonors.patterns.some((p) => p.id === 19)).toBe(false);
    });

    it('#30 Kim Thi vs #32 Kim Ciok: Kim triplet (30 Tay) vs Kim eye (20 Tay)', () => {
      // Hand with 3 Kims as triplet: KIM KIM KIM + 123T + 456S + 789B + 5T pair
      const kimThiHand = [
        keyToTile('KIM', 1), keyToTile('KIM', 2), keyToTile('KIM', 3),
        ...parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 5T'),
      ];
      const winTile5T = keyToTile('5T', 2);
      const resKimThi = scoringEngine.evaluateHand(kimThiHand, [], [keyToTile('F1')], { ...BASE_CTX, winningTile: winTile5T }, DEFAULT_TEST_RULES);
      expect(resKimThi.patterns.some((p) => p.id === 30)).toBe(true);
      expect(resKimThi.patterns.find((p) => p.id === 30)!.tay).toBe(30);

      // Hand with 2 Kims as eye: 123T + 456T + 789T + 123S + KIM KIM
      const kimCiokHand = [
        ...parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 1S 2S 3S'),
        keyToTile('KIM', 1),
      ];
      const winTileKim = keyToTile('KIM', 2);
      const resKimCiok = scoringEngine.evaluateHand(kimCiokHand, [], [keyToTile('F1')], { ...BASE_CTX, winningTile: winTileKim }, DEFAULT_TEST_RULES);
      expect(resKimCiok.patterns.some((p) => p.id === 32)).toBe(true);
      expect(resKimCiok.patterns.find((p) => p.id === 32)!.tay).toBe(20);
    });

    it('#31 Ji Pa Ciok: awards 1 Tay when the eye is suited 2 or 8', () => {
      // 8B eye
      const hand8 = parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 7B 8B 9B 8B');
      const winTile8 = keyToTile('8B', 3);
      const res8 = scoringEngine.evaluateHand(hand8, [], [keyToTile('F1')], { ...BASE_CTX, winningTile: winTile8 }, DEFAULT_TEST_RULES);
      expect(res8.patterns.some((p) => p.id === 31)).toBe(true);
      expect(res8.patterns.find((p) => p.id === 31)!.tay).toBe(1);

      // 5B eye (not 2 or 8)
      const hand5 = parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 7B 8B 9B 5B');
      const winTile5 = keyToTile('5B', 2);
      const res5 = scoringEngine.evaluateHand(hand5, [], [keyToTile('F1')], { ...BASE_CTX, winningTile: winTile5 }, DEFAULT_TEST_RULES);
      expect(res5.patterns.some((p) => p.id === 31)).toBe(false);
    });

    it('#36 Ce Chiong Kong: requires exposed Pung + 4th in concealed sequence + self draw', () => {
      // Exposed Pung of 5T; concealed hand has 4T-6T waiting on 5T; draws 5T from wall
      const concealed = parseTileHand('4T 6T 4S 5S 6S 7B 8B 9B WX WX');
      const exposedPung: Meld = {
        type: 'pung',
        tiles: [keyToTile('5T', 1), keyToTile('5T', 2), keyToTile('5T', 3)],
        claimedFrom: 'dong',
      };
      const winTile5T = keyToTile('5T', 4);

      // Self draw: Ce Chiong Kong fires (5 Tay)
      const resSelfDraw = scoringEngine.evaluateHand(
        concealed,
        [exposedPung],
        [keyToTile('F1')],
        { ...BASE_CTX, winningTile: winTile5T, isSelfDraw: true, isDiscardWin: false, isSelfRobbingKong: true },
        DEFAULT_TEST_RULES
      );
      expect(resSelfDraw.patterns.some((p) => p.id === 36)).toBe(true);
      expect(resSelfDraw.patterns.find((p) => p.id === 36)!.tay).toBe(5);

      // Ron (not self draw): Ce Chiong Kong does NOT fire
      const resRon = scoringEngine.evaluateHand(
        concealed,
        [exposedPung],
        [keyToTile('F1')],
        { ...BASE_CTX, winningTile: winTile5T, isSelfDraw: false, isDiscardWin: true, isSelfRobbingKong: true },
        DEFAULT_TEST_RULES
      );
      expect(resRon.patterns.some((p) => p.id === 36)).toBe(false);
    });

    it('#39 Se Sam Pu Tat: 14 uncorrelated tiles, NK 40 only, strictly no flowers/seasons', () => {
      const hand = parseTileHand('1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB');
      const winTile = keyToTile('DZ');

      // Valid Se Sam Pu Tat: 40 Tay
      const resValid = scoringEngine.evaluateHand(hand, [], [], { ...BASE_CTX, winningTile: winTile }, DEFAULT_TEST_RULES);
      expect(resValid.isValidHu).toBe(true);
      expect(resValid.patterns.some((p) => p.id === 39)).toBe(true);
      expect(resValid.patterns.find((p) => p.id === 39)!.tay).toBe(40);

      // Disqualified if any flower/season is exposed
      const resWithFlower = scoringEngine.evaluateHand(hand, [], [keyToTile('F1')], { ...BASE_CTX, winningTile: winTile }, DEFAULT_TEST_RULES);
      expect(resWithFlower.patterns.some((p) => p.id === 39)).toBe(false);
    });

    it('#40 Pyong Pi: self-drawn tile pairs with lone Kim as eye', () => {
      // Hand with 1 Kim waiting for pair: 123T + 456S + 789B + WX-WX-WX + KIM, draws 9S
      const hand = [
        ...parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX WX'),
        keyToTile('KIM'),
      ];
      const winTile9S = keyToTile('9S');

      // Self draw: Pyong Pi fires (5 Tay)
      const resSelf = scoringEngine.evaluateHand(
        hand,
        [],
        [keyToTile('F1')],
        { ...BASE_CTX, winningTile: winTile9S, isSelfDraw: true, isDiscardWin: false },
        DEFAULT_TEST_RULES
      );
      expect(resSelf.patterns.some((p) => p.id === 40)).toBe(true);
      expect(resSelf.patterns.find((p) => p.id === 40)!.tay).toBe(5);

      // Ron (not self-draw): Pyong Pi does NOT fire
      const resRon = scoringEngine.evaluateHand(
        hand,
        [],
        [keyToTile('F1')],
        { ...BASE_CTX, winningTile: winTile9S, isSelfDraw: false, isDiscardWin: true },
        DEFAULT_TEST_RULES
      );
      expect(resRon.patterns.some((p) => p.id === 40)).toBe(false);
    });

    it('#41 Tan Tiau: 4 claimed melds leaving 1-tile wait in hand', () => {
      const melds: Meld[] = [
        { type: 'jia', tiles: parseTileHand('1T 2T 3T'), claimedFrom: 'dong' },
        { type: 'jia', tiles: parseTileHand('4S 5S 6S'), claimedFrom: 'dong' },
        { type: 'pung', tiles: parseTileHand('WX WX WX'), claimedFrom: 'xi' },
        { type: 'pung', tiles: parseTileHand('9B 9B 9B'), claimedFrom: 'bei' },
      ];
      const hand = parseTileHand('5S');
      const winTile = keyToTile('5S', 2);

      const res = scoringEngine.evaluateHand(hand, melds, [keyToTile('F1')], { ...BASE_CTX, winningTile: winTile }, DEFAULT_TEST_RULES);
      expect(res.patterns.some((p) => p.id === 41)).toBe(true);
      expect(res.patterns.find((p) => p.id === 41)!.tay).toBe(5);
    });

    it('#42 Ce Mo, #43 Mun, #44 Ce Mo Pu Ciu Jen: strictly partition open/concealed and draw/ron', () => {
      const openMelds: Meld[] = [
        { type: 'pung', tiles: parseTileHand('1T 1T 1T'), claimedFrom: 'dong' },
      ];
      const openConcealedHand = parseTileHand('4T 5T 6T 4S 5S 6S 7B 8B 9B WX');
      const fullyConcealedHand = parseTileHand('1T 1T 1T 4T 5T 6T 4S 5S 6S 7B 8B 9B WX');
      const winTile = keyToTile('WX', 2);

      // 1. Open + Self Draw -> #42 Ce Mo (1 Tay), neither 43 nor 44
      const r42 = scoringEngine.evaluateHand(
        openConcealedHand,
        openMelds,
        [keyToTile('F1')],
        { ...BASE_CTX, winningTile: winTile, isSelfDraw: true, isDiscardWin: false },
        DEFAULT_TEST_RULES
      );
      expect(r42.patterns.some((p) => p.id === 42)).toBe(true);
      expect(r42.patterns.some((p) => p.id === 43)).toBe(false);
      expect(r42.patterns.some((p) => p.id === 44)).toBe(false);

      // 2. Concealed + Ron -> #43 Mun (1 Tay), neither 42 nor 44
      const r43 = scoringEngine.evaluateHand(
        fullyConcealedHand,
        [],
        [keyToTile('F1')],
        { ...BASE_CTX, winningTile: winTile, isSelfDraw: false, isDiscardWin: true },
        DEFAULT_TEST_RULES
      );
      expect(r43.patterns.some((p) => p.id === 43)).toBe(true);
      expect(r43.patterns.some((p) => p.id === 42)).toBe(false);
      expect(r43.patterns.some((p) => p.id === 44)).toBe(false);

      // 3. Concealed + Self Draw -> #44 Ce Mo Pu Ciu Jen (5 Tay), neither 42 nor 43
      const r44 = scoringEngine.evaluateHand(
        fullyConcealedHand,
        [],
        [keyToTile('F1')],
        { ...BASE_CTX, winningTile: winTile, isSelfDraw: true, isDiscardWin: false },
        DEFAULT_TEST_RULES
      );
      expect(r44.patterns.some((p) => p.id === 44)).toBe(true);
      expect(r44.patterns.find((p) => p.id === 44)!.tay).toBe(5);
      expect(r44.patterns.some((p) => p.id === 42)).toBe(false);
      expect(r44.patterns.some((p) => p.id === 43)).toBe(false);

      // 4. Open + Ron -> neither 42, 43, nor 44
      const rOpenRon = scoringEngine.evaluateHand(
        openConcealedHand,
        openMelds,
        [keyToTile('F1')],
        { ...BASE_CTX, winningTile: winTile, isSelfDraw: false, isDiscardWin: true },
        DEFAULT_TEST_RULES
      );
      expect(rOpenRon.patterns.some((p) => p.id === 42)).toBe(false);
      expect(rOpenRon.patterns.some((p) => p.id === 43)).toBe(false);
      expect(rOpenRon.patterns.some((p) => p.id === 44)).toBe(false);
    });
  });

  describe('Multi-Decomposition Global Maximum Tay Arbitration', () => {
    it('arbitrates to select the decomposition yielding the global maximum Tay', () => {
      // Consider a hand with Kim tiles where Kim can form:
      // Option A: Kim Ciok (#32, 20 Tay)
      // Option B: Kim Thi (#30, 30 Tay)
      // Hand: KIM KIM KIM + 123T + 456S + 789B + 5T pair
      // Decompositions include 3 Kims as triplet (30 Tay) vs 2 Kims as pair (20 Tay)
      const hand = [
        keyToTile('KIM', 1), keyToTile('KIM', 2), keyToTile('KIM', 3),
        ...parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 5T'),
      ];
      const winTile = keyToTile('5T', 2);
      const res = scoringEngine.evaluateHand(hand, [], [keyToTile('F1')], { ...BASE_CTX, winningTile: winTile }, DEFAULT_TEST_RULES);

      expect(res.candidateCount).toBeGreaterThan(1);
      // Global max selects Kim Thi (30 Tay), not Kim Ciok (20 Tay)
      expect(res.patterns.some((p) => p.id === 30)).toBe(true);
      expect(res.patterns.some((p) => p.id === 32)).toBe(false);
      expect(res.totalTay).toBeGreaterThanOrEqual(30);
    });

    it('arbitrates when one decomposition satisfies Tuei Tuei (triplets) and another satisfies Ping Fu (sequences)', () => {
      // Hand: 222T 333T 444T + 555S + pair 8B (natural tiles)
      // Notice: 222T 333T 444T can ALSO be decomposed as 3 sequences: 234T, 234T, 234T!
      // Decomposition A: 4 triplets (Tuei Tuei #15: NK 10 Tay) + pair 8B (Ji Pa Ciok #31: 1 Tay) + Sam Am Kang (#33: 5 Tay)
      // Decomposition B: 3 sequences + 1 triplet (Chicken hand: 0 Tay)
      const hand = parseTileHand('2T 2T 2T 3T 3T 3T 4T 4T 4T 5S 5S 5S 8B');
      const winTile = keyToTile('8B', 3);
      const res = scoringEngine.evaluateHand(hand, [], [keyToTile('F1')], { ...BASE_CTX, winningTile: winTile }, DEFAULT_TEST_RULES);

      expect(res.candidateCount).toBeGreaterThan(1);
      // Tuei Tuei (#15) must be chosen because it scores higher than Chicken hand (#13)
      expect(res.patterns.some((p) => p.id === 15)).toBe(true);
      expect(res.patterns.some((p) => p.id === 13)).toBe(false);
      expect(res.isValidHu).toBe(true);
    });
  });

  describe('Adversarial Stress Cases: Complete Hand vs Instant Hu for #6, #9, #34', () => {
    it('#6: Complete hand with 7 flowers scores full 30 Tay (#6) + tile bonuses, NOT 10 Tay instant', () => {
      const hand = parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S');
      const winTile = keyToTile('5S', 3);
      const flowers = [
        keyToTile('F1'), keyToTile('F2'), keyToTile('F3'), keyToTile('F4'),
        keyToTile('M1'), keyToTile('M2'), keyToTile('M3'),
      ];
      // Completed hand, isInstantHu: false
      const res = scoringEngine.evaluateHand(hand, [], flowers, { ...BASE_CTX, winningTile: winTile, isInstantHu: false }, DEFAULT_TEST_RULES);

      expect(res.isValidHu).toBe(true);
      expect(res.patterns.some((p) => p.id === 6)).toBe(true);
      // Pattern #6 awards 30 Tay in a completed hand
      expect(res.patterns.find((p) => p.id === 6)!.tay).toBe(30);
      expect(res.totalTay).toBeGreaterThanOrEqual(30);
    });

    it('#9: Complete hand with 4 Kims scores full 40 Tay (#9) + 4 Tay (#7) + other patterns', () => {
      // 4 Kims in completed hand: KIM KIM KIM as triplet (Kim Thi 30), KIM in sequence 1T-2T-KIM, etc.
      // Or 4 Kims in 7 pairs: 1T-1T, 2T-2T, 3T-3T, 4T-4T, 5T-5T, KIM-KIM, KIM-KIM
      const hand = [
        ...parseTileHand('1T 1T 2T 2T 3T 3T 4T 4T 5T 5T'),
        keyToTile('KIM', 1), keyToTile('KIM', 2), keyToTile('KIM', 3),
      ];
      const winTile = keyToTile('KIM', 4);
      const res = scoringEngine.evaluateHand(hand, [], [keyToTile('F1')], { ...BASE_CTX, winningTile: winTile, isInstantHu: false }, DEFAULT_TEST_RULES);

      expect(res.isValidHu).toBe(true);
      expect(res.patterns.some((p) => p.id === 9)).toBe(true);
      expect(res.patterns.find((p) => p.id === 9)!.tay).toBe(40);
      expect(res.patterns.some((p) => p.id === 7)).toBe(true); // 4 Kims = 4 Tay
      expect(res.patterns.find((p) => p.id === 7)!.tay).toBe(4);
    });

    it('#34: Complete hand with 4 concealed triplets scores 30 Tay in NK, superseding #33', () => {
      const hand = parseTileHand('2T 2T 2T 5S 5S 5S 8B 8B 8B DZ DZ DZ WX');
      const winTile = keyToTile('WX', 3);
      const res = scoringEngine.evaluateHand(
        hand,
        [],
        [keyToTile('F1')],
        { ...BASE_CTX, winningTile: winTile, isSelfDraw: true, isDiscardWin: false },
        DEFAULT_TEST_RULES
      );

      expect(res.isValidHu).toBe(true);
      expect(res.patterns.some((p) => p.id === 34)).toBe(true);
      expect(res.patterns.find((p) => p.id === 34)!.tay).toBe(30); // Si Am Kang NK = 30
      // Tuei Tuei (#15) also present
      expect(res.patterns.some((p) => p.id === 15)).toBe(true);
      // Ce Mo Pu Ciu Jen (#44: 5 Tay) present
      expect(res.patterns.some((p) => p.id === 44)).toBe(true);
    });
  });
});
