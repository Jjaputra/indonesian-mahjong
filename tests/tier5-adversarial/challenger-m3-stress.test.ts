/**
 * Milestone 3 Adversarial Challenge & Empirical Verification Suite
 *
 * Authored by Challenger 1 (Empirical Challenger)
 * Focus:
 * 1. 5-Tay minimum gate boundary conditions (1, 2, 3, 4, 5, 6 Tay & configurable minHuTay)
 * 2. Instant Hu vs 14-tile completed hands (#6, #9, #34)
 * 3. Deep edge cases (#3, #10, #11, #12, #19, #30, #31, #32, #33, #34, #36, #39, #40, #41, #42, #43, #44)
 * 4. Bug probes (Se Sam Pu Tat with flowers, Thi Fu on self-draw, instant Hu clearing minHuTay)
 * 5. Global maximum Tay arbitration across candidate decompositions
 * 6. K / NK invariant matrix validation
 */
import { describe, it, expect } from 'vitest';
import {
  PATTERNS,
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

describe('Challenger M3 Suite: 1. 5-Tay Minimum Gate Stress Testing', () => {
  it('hand scoring 1 Tay fails isValidHu and is flagged as Lew Fit below-minimum', () => {
    // Open hand won on discard:
    // Melds: 1T 1T 1T (claimed pung from dong) -> Chicken hand (has pung, so no Ping Fu)
    // Concealed: 4T 5T 6T, 7B 8B 9B, 1S 2S KIM (Kim completes 3S)
    // Eye: WX (non-value wind pair)
    // Winning tile: WX
    // 1 Kim in hand -> Mode K.
    // Patterns: Tile KIM (#7) = 1 Tay.
    // Discard win + open hand -> no Ce Mo, no Mun.
    // Non-value wind pair -> no wind pattern.
    // Chicken hand -> 0 Tay.
    // Total Tay = 1.
    const r = scoringEngine.evaluateHand(
      parseTileHand('4T 5T 6T 7B 8B 9B 1S 2S KIM WX'),
      [meld('pung', '1T 1T 1T', 'dong')],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('WX', 2) },
      TOURNAMENT_RULES
    );
    expect(r.mode).toBe('K');
    expect(tayOf(r, 7)).toBe(1);
    expect(r.totalTay).toBe(1);
    expect(r.isValidHu).toBe(false);
    expect(r.isLewFit).toBe(true);
    expect(r.lewFitReason).toBe('below-minimum');
    expect(r.rejectionReason).toMatch(/kurang dari 5 Tay/);
  });

  it('hand scoring 2 Tay fails isValidHu and is flagged as Lew Fit below-minimum', () => {
    // Same as above, but with 2 Kims:
    // 1 Kim in 1S 2S KIM (as 3S), 1 Kim in 7B 8B KIM (as 9B).
    // Melds: 1T 1T 1T (pung). Concealed: 4T 5T 6T, 7B 8B KIM, 1S 2S KIM, WX.
    // Tile KIM (#7) = 2 Tay. Total Tay = 2.
    const r = scoringEngine.evaluateHand(
      parseTileHand('4T 5T 6T 7B 8B KIM 1S 2S KIM WX'),
      [meld('pung', '1T 1T 1T', 'dong')],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('WX', 2) },
      TOURNAMENT_RULES
    );
    expect(r.mode).toBe('K');
    expect(tayOf(r, 7)).toBe(2);
    expect(r.totalTay).toBe(2);
    expect(r.isValidHu).toBe(false);
    expect(r.isLewFit).toBe(true);
    expect(r.lewFitReason).toBe('below-minimum');
  });

  it('hand scoring 3 Tay fails isValidHu and is flagged as Lew Fit below-minimum', () => {
    // In NK mode: Chicken Hand (0) + Bo Kim (3) = 3 Tay.
    // Claimed pung: 1T 1T 1T. Concealed: 4T 5T 6T, 7B 8B 9B, 1S 2S 3S, WX.
    // Winning tile: WX.
    const r = scoringEngine.evaluateHand(
      parseTileHand('4T 5T 6T 7B 8B 9B 1S 2S 3S WX'),
      [meld('pung', '1T 1T 1T', 'dong')],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('WX', 2) },
      TOURNAMENT_RULES
    );
    expect(r.mode).toBe('NK');
    expect(tayOf(r, 8)).toBe(3);
    expect(r.totalTay).toBe(3);
    expect(r.isValidHu).toBe(false);
    expect(r.isLewFit).toBe(true);
    expect(r.lewFitReason).toBe('below-minimum');
  });

  it('hand scoring 4 Tay fails isValidHu and is flagged as Lew Fit below-minimum', () => {
    // NK mode: Chicken Hand (0) + Bo Kim (3) + 1 Season matching nothing (1) = 4 Tay.
    const r = scoringEngine.evaluateHand(
      parseTileHand('4T 5T 6T 7B 8B 9B 1S 2S 3S WX'),
      [meld('pung', '1T 1T 1T', 'dong')],
      [keyToTile('M1')], // Season 1, but player seat is Nan (2) -> 1 Tay
      { ...BASE_CONTEXT, seatWind: 'nan', winningTile: keyToTile('WX', 2) },
      TOURNAMENT_RULES
    );
    expect(r.mode).toBe('NK');
    expect(tayOf(r, 8)).toBe(3); // Bo Kim
    expect(tayOf(r, 2)).toBe(1); // Tile Musim
    expect(r.totalTay).toBe(4);
    expect(r.isValidHu).toBe(false);
    expect(r.isLewFit).toBe(true);
    expect(r.lewFitReason).toBe('below-minimum');
  });

  it('hand scoring exactly 5 Tay passes isValidHu: true and isLewFit: false', () => {
    // Add 1 more season (2 seasons = 2 Tay) + Bo Kim (3) = 5 Tay.
    const r = scoringEngine.evaluateHand(
      parseTileHand('4T 5T 6T 7B 8B 9B 1S 2S 3S WX'),
      [meld('pung', '1T 1T 1T', 'dong')],
      [keyToTile('M1'), keyToTile('M3')], // Season 1 and Season 3, seat is Nan (2) -> 2 Tay
      { ...BASE_CONTEXT, seatWind: 'nan', winningTile: keyToTile('WX', 2) },
      TOURNAMENT_RULES
    );
    expect(r.mode).toBe('NK');
    expect(r.totalTay).toBe(5);
    expect(r.isValidHu).toBe(true);
    expect(r.isLewFit).toBe(false);
    expect(r.lewFitReason).toBeUndefined();
  });

  it('configurable minHuTay enforces custom gates strictly', () => {
    const hand = parseTileHand('4T 5T 6T 7B 8B 9B 1S 2S 3S WX');
    const melds = [meld('pung', '1T 1T 1T', 'dong')];
    const flowers = [keyToTile('M1'), keyToTile('M3')];
    const ctx = { ...BASE_CONTEXT, seatWind: 'nan' as Seat, winningTile: keyToTile('WX', 2) };

    // At minHuTay = 3: passes (5 >= 3)
    const r3 = scoringEngine.evaluateHand(hand, melds, flowers, ctx, { ...TOURNAMENT_RULES, minHuTay: 3 });
    expect(r3.isValidHu).toBe(true);

    // At minHuTay = 5: passes (5 >= 5)
    const r5 = scoringEngine.evaluateHand(hand, melds, flowers, ctx, { ...TOURNAMENT_RULES, minHuTay: 5 });
    expect(r5.isValidHu).toBe(true);

    // At minHuTay = 6: fails (5 < 6)
    const r6 = scoringEngine.evaluateHand(hand, melds, flowers, ctx, { ...TOURNAMENT_RULES, minHuTay: 6 });
    expect(r6.isValidHu).toBe(false);
    expect(r6.isLewFit).toBe(true);
    expect(r6.lewFitReason).toBe('below-minimum');

    // At minHuTay = 10: fails (5 < 10)
    const r10 = scoringEngine.evaluateHand(hand, melds, flowers, ctx, { ...TOURNAMENT_RULES, minHuTay: 10 });
    expect(r10.isValidHu).toBe(false);
    expect(r10.isLewFit).toBe(true);
    expect(r10.lewFitReason).toBe('below-minimum');
  });
});

describe('Challenger M3 Suite: 2. Instant Hu vs 14-Tile Completed Hands', () => {
  it('Pattern #6: 7 Flowers instant Hu (10 Tay) vs completed 14-tile hand (30 Tay)', () => {
    const flowers7 = [
      keyToTile('F1'), keyToTile('F2'), keyToTile('F3'), keyToTile('F4'),
      keyToTile('M1'), keyToTile('M2'), keyToTile('M3'),
    ];
    // Instant Hu declaration: incomplete hand, isInstantHu: true
    const instant = scoringEngine.evaluateHand(
      parseTileHand('1T 3T 5T 7T 9T 1S 3S 5S 7S 9S 1B 3B 5B'),
      [],
      flowers7,
      { ...BASE_CONTEXT, winningTile: keyToTile('7B'), isInstantHu: true },
      TOURNAMENT_RULES
    );
    expect(instant.isValidHu).toBe(true);
    expect(instant.isInstantHu).toBe(true);
    expect(tayOf(instant, 6)).toBe(10);
    expect(instant.totalTay).toBe(10);

    // Completed 14-tile hand with 7 flowers:
    // Ping Fu (3) + Bo Kim (3) + Mun (1) + 4 Flowers (10) + 7 Flowers (30) + seasons
    const complete = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S'),
      [],
      flowers7,
      { ...BASE_CONTEXT, winningTile: keyToTile('5S', 2), isInstantHu: false },
      TOURNAMENT_RULES
    );
    expect(complete.isValidHu).toBe(true);
    expect(complete.isInstantHu).toBe(false);
    expect(tayOf(complete, 6)).toBe(30);
  });

  it('Pattern #9: Shi Kim (4 Kims) instant Hu (10 Tay) vs completed hand (40 Tay)', () => {
    // Instant Hu: incomplete hand holding 4 Kims
    const instant = scoringEngine.evaluateHand(
      parseTileHand('1T 3T 5T 7T 9T 1S 3S 5S 7S KIM KIM KIM KIM'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('1B'), isInstantHu: true },
      TOURNAMENT_RULES
    );
    expect(instant.isValidHu).toBe(true);
    expect(instant.isInstantHu).toBe(true);
    expect(tayOf(instant, 9)).toBe(10);
    expect(instant.totalTay).toBe(10);

    // Completed 14-tile hand: Shi Kim #9 is 40 Tay
    const complete = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B KIM KIM KIM KIM'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('1T', 2), isInstantHu: false },
      TOURNAMENT_RULES
    );
    expect(complete.isValidHu).toBe(true);
    expect(complete.isInstantHu).toBe(false);
    expect(tayOf(complete, 9)).toBe(40);
  });

  it('Pattern #34: Si Am Kang instant Hu (10 Tay) vs completed hand (20 K / 30 NK)', () => {
    // Incomplete hand with 4 concealed triplets
    const instant = scoringEngine.evaluateHand(
      parseTileHand('1T 1T 1T 3S 3S 3S 5B 5B 5B DZ DZ DZ 9S'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('9B'), isInstantHu: true },
      TOURNAMENT_RULES
    );
    expect(instant.isValidHu).toBe(true);
    expect(instant.isInstantHu).toBe(true);
    expect(tayOf(instant, 34)).toBe(10);
    expect(instant.totalTay).toBe(10);

    // Completed 14-tile hand in NK: 30 Tay
    const completeNK = scoringEngine.evaluateHand(
      parseTileHand('1T 1T 1T 3S 3S 3S 5B 5B 5B DZ DZ DZ WX'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('WX', 2), isInstantHu: false },
      TOURNAMENT_RULES
    );
    expect(tayOf(completeNK, 34)).toBe(30);

    // Completed 14-tile hand in K: 20 Tay
    const completeK = scoringEngine.evaluateHand(
      parseTileHand('1T 1T 1T 3S 3S 3S 5B 5B KIM DZ DZ DZ WX'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('WX', 2), isInstantHu: false },
      TOURNAMENT_RULES
    );
    expect(tayOf(completeK, 34)).toBe(20);
  });

  it('instant Hu declaration without sufficient triggers is rejected as instant-invalid', () => {
    // 6 flowers (needs 7)
    const flowers6 = [
      keyToTile('F1'), keyToTile('F2'), keyToTile('F3'),
      keyToTile('M1'), keyToTile('M2'), keyToTile('M3'),
    ];
    const r6 = scoringEngine.evaluateHand(
      parseTileHand('1T 3T 5T 7T 9T 1S 3S 5S 7S 9S 1B 3B 5B'),
      [],
      flowers6,
      { ...BASE_CONTEXT, winningTile: keyToTile('7B'), isInstantHu: true },
      TOURNAMENT_RULES
    );
    expect(r6.isValidHu).toBe(false);
    expect(r6.isLewFit).toBe(true);
    expect(r6.lewFitReason).toBe('instant-invalid');

    // 3 Kims (needs 4)
    const rKim3 = scoringEngine.evaluateHand(
      parseTileHand('1T 3T 5T 7T 9T 1S 3S 5S 7S 9S KIM KIM KIM'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('1B'), isInstantHu: true },
      TOURNAMENT_RULES
    );
    expect(rKim3.isValidHu).toBe(false);
    expect(rKim3.isLewFit).toBe(true);
    expect(rKim3.lewFitReason).toBe('instant-invalid');

    // 3 concealed triplets (needs 4)
    const rTrips3 = scoringEngine.evaluateHand(
      parseTileHand('1T 1T 1T 3S 3S 3S 5B 5B 5B 1S 2S 3S 9S'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('9B'), isInstantHu: true },
      TOURNAMENT_RULES
    );
    expect(rTrips3.isValidHu).toBe(false);
    expect(rTrips3.isLewFit).toBe(true);
    expect(rTrips3.lewFitReason).toBe('instant-invalid');
  });
});

describe('Challenger M3 Suite: 3. Deep Edge Cases', () => {
  it('#3 Bo Hua Zi: requires NO flowers/seasons AND NO winds/dragons', () => {
    // Pure suited hand, no honors, no bonus tiles -> Bo Hua Zi (3 Tay)
    const cleanHand = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('5S', 2) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(cleanHand, 3)).toBe(true);
    expect(tayOf(cleanHand, 3)).toBe(3);

    // With 1 flower -> disqualified
    const withFlower = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S'),
      [],
      [keyToTile('F1')],
      { ...BASE_CONTEXT, winningTile: keyToTile('5S', 2) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(withFlower, 3)).toBe(false);

    // With 1 wind pair (WX) -> disqualified
    const withWind = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B WX'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('WX', 2) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(withWind, 3)).toBe(false);

    // With dragon triplet (DZ) -> disqualified
    const withDragon = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S DZ DZ DZ 5S'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('5S', 2) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(withDragon, 3)).toBe(false);
  });

  it('#10, #11, #12: First Turn Wins (Pao Chin, Thien Fu, Thi Fu)', () => {
    // East dealer opening deal self-draw -> Thien Fu (40 K / 60 NK), NOT Thi Fu
    const thienFu = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S'),
      [],
      [],
      {
        ...BASE_CONTEXT,
        seatWind: 'dong',
        isInitialDeal: true,
        isSelfDraw: true,
        isDiscardWin: false,
        winningTile: keyToTile('5S', 2),
      },
      TOURNAMENT_RULES
    );
    expect(hasPattern(thienFu, 11)).toBe(true);
    expect(tayOf(thienFu, 11)).toBe(60);
    expect(hasPattern(thienFu, 12)).toBe(false);

    // Win on first discard with Pao Chin -> Thi Fu (40 K / 60 NK)
    const thiFu = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S'),
      [],
      [],
      {
        ...BASE_CONTEXT,
        seatWind: 'nan',
        isInitialDeal: true,
        isPaoChin: true,
        isSelfDraw: false,
        isDiscardWin: true,
        winningTile: keyToTile('5S', 2),
      },
      TOURNAMENT_RULES
    );
    expect(hasPattern(thiFu, 12)).toBe(true);
    expect(tayOf(thiFu, 12)).toBe(60);

    // First discard win WITHOUT Pao Chin -> NOT Thi Fu
    const notThiFu = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S'),
      [],
      [],
      {
        ...BASE_CONTEXT,
        seatWind: 'nan',
        isInitialDeal: true,
        isPaoChin: false,
        isSelfDraw: false,
        isDiscardWin: true,
        winningTile: keyToTile('5S', 2),
      },
      TOURNAMENT_RULES
    );
    expect(hasPattern(notThiFu, 12)).toBe(false);
  });

  it('#19 Yau Kiu: Only suited 1s and 9s (honors strictly disqualify)', () => {
    // Pure suited terminals: 1T 1T 1T, 9T 9T 9T, 1S 1S 1S, 9S 9S 9S, 1B 1B
    const pureYauKiu = scoringEngine.evaluateHand(
      parseTileHand('1T 1T 1T 9T 9T 9T 1S 1S 1S 9S 9S 9S 1B'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('1B', 2) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(pureYauKiu, 19)).toBe(true);
    expect(tayOf(pureYauKiu, 19)).toBe(40); // 40 NK

    // Hand with 1s, 9s, and a dragon triplet: disqualified from #19
    const withDragon = scoringEngine.evaluateHand(
      parseTileHand('1T 1T 1T 9T 9T 9T 1S 1S 1S DZ DZ DZ 1B'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('1B', 2) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(withDragon, 19)).toBe(false);
  });

  it('#30 Kim Thi (3 Kims triplet) vs scattered Kims', () => {
    // 3 Kims in triplet -> Kim Thi (30 Tay)
    const kimThiHand = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B KIM KIM KIM WX'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('WX', 2) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(kimThiHand, 30)).toBe(true);
    expect(tayOf(kimThiHand, 30)).toBe(30);

    // 3 Kims scattered in different melds:
    // 1T 2T KIM, 4S 5S KIM, 7B 8B KIM, DZ DZ DZ, WX WX
    const scatteredHand = scoringEngine.evaluateHand(
      parseTileHand('1T 2T KIM 4S 5S KIM 7B 8B KIM DZ DZ DZ WX'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('WX', 2) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(scatteredHand, 30)).toBe(false);
    expect(tayOf(scatteredHand, 7)).toBe(3); // 3 × Tile KIM
  });

  it('#31 Ji Pa Ciok (suited 2 or 8 eye) vs non-suited value 2 (wind)', () => {
    // Eye is 2 Tong -> Ji Pa Ciok (1 Tay)
    const eye2Tong = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 2T'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('2T', 3) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(eye2Tong, 31)).toBe(true);

    // Eye is 8 Sok -> Ji Pa Ciok (1 Tay)
    const eye8Sok = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 8S'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('8S', 2) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(eye8Sok, 31)).toBe(true);

    // Eye is 5 Ban -> NO Ji Pa Ciok
    const eye5Ban = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5B'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('5B', 2) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(eye5Ban, 31)).toBe(false);

    // Eye is Nan wind (wind with numeric value 2) -> NO Ji Pa Ciok (suited only!)
    const eyeNanWind = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B WN'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('WN', 2) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(eyeNanWind, 31)).toBe(false);
  });

  it('#32 Kim Ciok (2 Kims eye) awards 20 Tay', () => {
    const kimCiokHand = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B DZ DZ DZ KIM'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('KIM', 2) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(kimCiokHand, 32)).toBe(true);
    expect(tayOf(kimCiokHand, 32)).toBe(20);
    // Does NOT award Ji Pa Ciok
    expect(hasPattern(kimCiokHand, 31)).toBe(false);
  });

  it('#36 Ce Chiong Kong requires self-draw (Ce Mo)', () => {
    // 4T-6T, 4S-5S-6S, 7B-8B-9B, WX-WX (10 concealed tiles) + meld 5T-5T-5T (3 tiles) + win 5T (1 tile) = 14 tiles
    const ccSelf = scoringEngine.evaluateHand(
      parseTileHand('4T 6T 4S 5S 6S 7B 8B 9B WX WX'),
      [meld('pung', '5T 5T 5T', 'dong')],
      [keyToTile('F1')],
      {
        ...BASE_CONTEXT,
        isSelfDraw: true,
        isDiscardWin: false,
        isSelfRobbingKong: true,
        winningTile: keyToTile('5T', 4),
      },
      TOURNAMENT_RULES
    );
    expect(hasPattern(ccSelf, 36)).toBe(true);
    expect(tayOf(ccSelf, 36)).toBe(5);

    // Same flag with discard win: does NOT award #36
    const ccDiscard = scoringEngine.evaluateHand(
      parseTileHand('4T 6T 4S 5S 6S 7B 8B 9B WX WX'),
      [meld('pung', '5T 5T 5T', 'dong')],
      [keyToTile('F1')],
      {
        ...BASE_CONTEXT,
        isSelfDraw: false,
        isDiscardWin: true,
        isSelfRobbingKong: true,
        winningTile: keyToTile('5T', 4),
      },
      TOURNAMENT_RULES
    );
    expect(hasPattern(ccDiscard, 36)).toBe(false);
  });

  it('#40 Pyong Pi: self-draw final tile pairing with single Kim in hand', () => {
    // Self-draw 8S, pairing with lone KIM to form 8S-KIM eye:
    const pyongPiHand = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B KIM'),
      [],
      [],
      {
        ...BASE_CONTEXT,
        isSelfDraw: true,
        isDiscardWin: false,
        winningTile: keyToTile('8S'),
      },
      TOURNAMENT_RULES
    );
    expect(hasPattern(pyongPiHand, 40)).toBe(true);
    expect(tayOf(pyongPiHand, 40)).toBe(5);

    // Won on discard: does NOT award #40
    const discardWin = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B KIM'),
      [],
      [],
      {
        ...BASE_CONTEXT,
        isSelfDraw: false,
        isDiscardWin: true,
        winningTile: keyToTile('8S'),
      },
      TOURNAMENT_RULES
    );
    expect(hasPattern(discardWin, 40)).toBe(false);
  });

  it('#41 Tan Tiau: exactly 4 claimed melds with 1 single tile wait', () => {
    // 4 claimed melds + pair completed by winning tile:
    const tanTiau = scoringEngine.evaluateHand(
      parseTileHand('5S'),
      [
        meld('jia', '1T 2T 3T', 'dong'),
        meld('jia', '4T 5T 6T', 'dong'),
        meld('jia', '1S 2S 3S', 'dong'),
        meld('jia', '7B 8B 9B', 'dong'),
      ],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('5S', 2) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(tanTiau, 41)).toBe(true);
    expect(tayOf(tanTiau, 41)).toBe(5);

    // Only 3 claimed melds + 1 concealed sequence in hand -> NO Tan Tiau
    const notTanTiau = scoringEngine.evaluateHand(
      parseTileHand('7B 8B 9B 5S'),
      [
        meld('jia', '1T 2T 3T', 'dong'),
        meld('jia', '4T 5T 6T', 'dong'),
        meld('jia', '1S 2S 3S', 'dong'),
      ],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('5S', 2) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(notTanTiau, 41)).toBe(false);
  });

  it('#42, #43, #44: Mutually exclusive win finishes', () => {
    // Case A: Concealed + Self-draw -> #44 Ce Mo Pu Ciu Jen (5 Tay)
    const caseA = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S'),
      [],
      [],
      { ...BASE_CONTEXT, isSelfDraw: true, isDiscardWin: false, winningTile: keyToTile('5S', 2) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(caseA, 44)).toBe(true);
    expect(hasPattern(caseA, 42)).toBe(false);
    expect(hasPattern(caseA, 43)).toBe(false);

    // Case B: Concealed + Discard win -> #43 Mun (1 Tay)
    const caseB = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S'),
      [],
      [],
      { ...BASE_CONTEXT, isSelfDraw: false, isDiscardWin: true, winningTile: keyToTile('5S', 2) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(caseB, 43)).toBe(true);
    expect(hasPattern(caseB, 42)).toBe(false);
    expect(hasPattern(caseB, 44)).toBe(false);

    // Case C: Open meld + Self-draw -> #42 Ce Mo (1 Tay)
    const caseC = scoringEngine.evaluateHand(
      parseTileHand('4T 5T 6T 2S 3S 4S 6B 7B 8B 5S'),
      [meld('jia', '1T 2T 3T', 'dong')],
      [],
      { ...BASE_CONTEXT, isSelfDraw: true, isDiscardWin: false, winningTile: keyToTile('5S', 2) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(caseC, 42)).toBe(true);
    expect(hasPattern(caseC, 43)).toBe(false);
    expect(hasPattern(caseC, 44)).toBe(false);

    // Case D: Open meld + Discard win -> None of {42, 43, 44}
    const caseD = scoringEngine.evaluateHand(
      parseTileHand('4T 5T 6T 2S 3S 4S 6B 7B 8B 5S'),
      [meld('jia', '1T 2T 3T', 'dong')],
      [],
      { ...BASE_CONTEXT, isSelfDraw: false, isDiscardWin: true, winningTile: keyToTile('5S', 2) },
      TOURNAMENT_RULES
    );
    expect(hasPattern(caseD, 42)).toBe(false);
    expect(hasPattern(caseD, 43)).toBe(false);
    expect(hasPattern(caseD, 44)).toBe(false);
  });
});

describe('Challenger M3 Suite: 4. Bug Probes (Empirical Adversarial Findings)', () => {
  it('PROBE-BUG-01: Se Sam Pu Tat (#39) must NOT be a legal Hu if hand has flowers or seasons', () => {
    // 14 uncorrelated tiles
    const uncorrelatedTiles = '1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB';
    const winningTile = 'DZ';

    // Without flower/season: legal Hu (40 Tay NK)
    const legalClean = scoringEngine.evaluateHand(
      parseTileHand(uncorrelatedTiles),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile(winningTile) },
      TOURNAMENT_RULES
    );
    expect(legalClean.isValidHu).toBe(true);
    expect(hasPattern(legalClean, 39)).toBe(true);
    expect(tayOf(legalClean, 39)).toBe(40);

    // With bonus tiles (e.g. 4 seasons = 20 Tay):
    // The hand has NO standard melds + pair.
    // §5.1 #39 explicitly forbids flowers/seasons: "tidak ada bunga atau musim, dan tidak ada kim".
    // If flowers exist, Se Sam Pu Tat is voided, leaving a 14-tile irregular hand that is NOT a valid Mahjong hand.
    // It must be rejected as Lew Fit structure!
    const withFlowers = scoringEngine.evaluateHand(
      parseTileHand(uncorrelatedTiles),
      [],
      [keyToTile('M1'), keyToTile('M2'), keyToTile('M3'), keyToTile('M4')],
      { ...BASE_CONTEXT, winningTile: keyToTile(winningTile) },
      TOURNAMENT_RULES
    );
    const isBugPresent = withFlowers.isValidHu === true;
    expect(isBugPresent, 'Se Sam Pu Tat with flowers must be rejected').toBe(false);
    expect(withFlowers.isLewFit).toBe(true);
    expect(withFlowers.lewFitReason).toBe('structure');
  });

  it('PROBE-BUG-02: Non-dealer first turn without Pao Chin must NOT score #12 Thi Fu', () => {
    // First turn win without Pao Chin cannot score Thi Fu
    const southSelfDrawNoPaoChin = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S'),
      [],
      [],
      {
        ...BASE_CONTEXT,
        seatWind: 'nan',
        isInitialDeal: true,
        isPaoChin: false,
        isSelfDraw: true,
        isDiscardWin: false,
        winningTile: keyToTile('5S', 2),
      },
      TOURNAMENT_RULES
    );
    const hasIncorrectThiFu = hasPattern(southSelfDrawNoPaoChin, 12);
    expect(hasIncorrectThiFu).toBe(false);
  });

  it('PROBE-BUG-03: Instant Hu must NOT bypass configured minHuTay if minHuTay > 10', () => {
    // 7 flowers instant Hu yields 10 Tay.
    // If house rule sets minHuTay = 15:
    // 10 Tay is less than minHuTay 15!
    const instantHand = scoringEngine.evaluateHand(
      parseTileHand('1T 3T 5T 7T 9T 1S 3S 5S 7S 9S 1B 3B 5B'),
      [],
      [
        keyToTile('F1'), keyToTile('F2'), keyToTile('F3'), keyToTile('F4'),
        keyToTile('M1'), keyToTile('M2'), keyToTile('M3'),
      ],
      { ...BASE_CONTEXT, winningTile: keyToTile('7B'), isInstantHu: true },
      { ...TOURNAMENT_RULES, minHuTay: 15 }
    );
    const bypassedGate = instantHand.isValidHu === true;
    expect(bypassedGate, 'Instant Hu must respect minHuTay').toBe(false);
    expect(instantHand.isLewFit).toBe(true);
    expect(instantHand.lewFitReason).toBe('below-minimum');
  });
});

describe('Challenger M3 Suite: 5. Global Maximum Tay Arbitration', () => {
  it('arbitration picks Kim Thi (30) over Kim Ciok (20) when that maximizes total Tay', () => {
    // KIM KIM KIM, 1T 1T 1T, 9T 9T 9T, 1S 1S 1S, 9S 9S
    const r = scoringEngine.evaluateHand(
      parseTileHand('KIM KIM KIM 1T 1T 1T 9T 9T 9T 1S 1S 1S 9S'),
      [],
      [],
      { ...BASE_CONTEXT, isSelfDraw: true, isDiscardWin: false, winningTile: keyToTile('9S', 2) },
      TOURNAMENT_RULES
    );
    expect(r.candidateCount).toBeGreaterThan(1);
    expect(hasPattern(r, 30)).toBe(true); // Kim Thi 30 awarded
    expect(hasPattern(r, 32)).toBe(false); // Kim Ciok 20 not awarded
    expect(tayOf(r, 30)).toBe(30);
  });

  it('arbitration picks Kim Ciok (20) + Ta San Yen (30) when that total beats Kim Thi (30)', () => {
    // KIM KIM KIM, DZ DZ DZ, DF DF DF, DP DP, 5T 5T 5T
    // If Kims form Kim Ciok (2 Kims pair) + 1 Kim completing DP:
    // Ta San Yen 30 + Kim Ciok 20 + 3 dragon pungs 4 + Tile KIM 3 = 57+ Tay
    // If Kims form Kim Thi (3 Kims pung) + DP DP pair:
    // Siau San Yen 10 + Kim Thi 30 + 2 dragon pungs 3 + Tile KIM 3 = 46+ Tay
    const r = scoringEngine.evaluateHand(
      parseTileHand('KIM KIM KIM DZ DZ DZ DF DF DF DP DP 5T 5T'),
      [],
      [],
      { ...BASE_CONTEXT, isSelfDraw: true, isDiscardWin: false, winningTile: keyToTile('5T', 3) },
      TOURNAMENT_RULES
    );
    expect(r.candidateCount).toBeGreaterThan(1);
    expect(hasPattern(r, 32)).toBe(true); // Kim Ciok awarded
    expect(hasPattern(r, 22)).toBe(true); // Ta San Yen awarded
    expect(hasPattern(r, 30)).toBe(false); // Kim Thi not awarded
  });
});

describe('Challenger M3 Suite: 6. K / NK Matrix Invariant Stress', () => {
  it('all 44 patterns adhere to the K / NK nullity invariants', () => {
    for (const [id, def] of PATTERNS.entries()) {
      // In K mode: patterns with K: null cannot exist
      if (def.K === null) {
        expect([8, 39, 40].includes(id) || id === 8 || id === 39).toBe(true);
      }
      // In NK mode: patterns with NK: null cannot exist
      if (def.NK === null) {
        expect([7, 9, 30, 32, 40].includes(id)).toBe(true);
      }
    }
  });

  it('Bo Kim (#8) is strictly awarded only when Kim count is 0', () => {
    const noKim = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('5S', 2) },
      TOURNAMENT_RULES
    );
    expect(noKim.mode).toBe('NK');
    expect(hasPattern(noKim, 8)).toBe(true);
    expect(hasPattern(noKim, 7)).toBe(false);

    const withKim = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B KIM 5S'),
      [],
      [],
      { ...BASE_CONTEXT, winningTile: keyToTile('5S', 2) },
      TOURNAMENT_RULES
    );
    expect(withKim.mode).toBe('K');
    expect(hasPattern(withKim, 8)).toBe(false);
    expect(hasPattern(withKim, 7)).toBe(true);
  });
});
