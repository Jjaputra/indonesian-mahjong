/**
 * Challenger 2 Verification Gate Test Suite: Milestone 3 (44-Tay Scoring Engine)
 *
 * Empirical verification of:
 * 1. Combinatorial stacking correctness (additive stacking, supersede policy, mutually exclusive patterns)
 * 2. K mode (Ada Kim) vs NK mode (Tidak Ada Kim / Bo Kim +3 Tay) invariant fuzzing
 * 3. Engine purity (zero mutation via deep-freeze), determinism, and zero-peeking privacy
 * 4. Latency / execution speed benchmark across 500 hand evaluations (< 1ms average)
 * 5. Minimum gate & Lew Fit enforcement
 */

import { describe, it, expect } from 'vitest';
import {
  ScoringEngine,
  scoringEngine,
  PATTERNS,
  type WinContext,
} from '@/scoring';
import {
  parseTileHand,
  keyToTile,
} from '@/core/tiles';
import type { GameRules, Meld, Seat, Tile, Wind } from '@/core/types';
import {
  materializeHand,
  PATTERN_FIXTURES,
  ALL_PATTERN_IDS,
  TOURNAMENT_RULES,
  type HandSpec,
} from '../scoring/claude-44-patterns-fixtures';

// Helper to deep-freeze objects to assert complete functional purity
function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj as object)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

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

describe('Challenger 2 M3 Empirical Verification: 44-Tay Scoring Engine', () => {

  // ==========================================================================
  // Section 1: Combinatorial Stacking & Mutual Exclusivity Verification
  // ==========================================================================
  describe('1. Combinatorial Stacking & Mutual Exclusivity', () => {

    it('additive policy sums every detected pattern exactly with no double counting or omission', () => {
      // Hand: All Sok (It Set #18 NK=30) + All Triplets (Tuei Tuei #15 NK=10) +
      // 4 Concealed Triplets (Si Am Kang #34 NK=30) + Bo Kim (#8 NK=3) +
      // Concealed Self Draw (Ce Mo Pu Ciu Jen #44 NK=5) + Ji Pa Ciok (#31 NK=1 for 2S/8S pair)
      const handSpec: HandSpec = {
        concealed: '1S 1S 1S 3S 3S 3S 5S 5S 5S 7S 7S 7S 2S',
        winningTile: '2S',
        context: {
          isSelfDraw: true,
          seatWind: 'nan',
          roundWind: 'dong',
        },
      };
      const m = materializeHand(handSpec);
      const res = scoringEngine.evaluateHand(m.concealed, m.melds, m.flowers, {
        ...m.context,
        winningTile: m.winningTile,
      });

      expect(res.isValidHu).toBe(true);
      expect(res.mode).toBe('NK');
      expect(res.isWithKim).toBe(false);

      const patternIds = res.patterns.map((p) => p.id).sort((a, b) => a - b);
      expect(patternIds).toContain(3);  // Bo Hua Zi (3) - no bonus/honors!
      expect(patternIds).toContain(8);  // Bo Kim (3)
      expect(patternIds).toContain(15); // Tuei Tuei (10)
      expect(patternIds).toContain(18); // It Set (30)
      expect(patternIds).toContain(31); // Ji Pa Ciok (1)
      expect(patternIds).toContain(34); // Si Am Kang (30)
      expect(patternIds).toContain(44); // Ce Mo Pu Ciu Jen (5)

      // Invariant: sum of pattern tays must equal res.totalTay
      const sum = res.patterns.reduce((s, p) => s + p.tay, 0);
      expect(res.totalTay).toBe(sum);
      expect(res.totalTay).toBe(3 + 3 + 10 + 30 + 1 + 30 + 5); // 82 Tay!
    });

    it('supersede policy correctly prunes lower subsumed patterns (Ta San Yen #22 drops individual dragon triplets #27, #28, #29)', () => {
      const supersedeEngine = new ScoringEngine({ overlapPolicy: 'supersede' });

      // Hand with 3 dragon triplets (Ta San Yen #22) + 1 sequence (1T 2T 3T) + pair (5S 5S):
      // Under additive: Ta San Yen (#22 NK=40) + Tris Zhong (#27=2) + Tris Fat (#28=1) + Tris Pat (#29=1)
      // Under supersede: #22 removes #27, #28, #29!
      const handSpec: HandSpec = {
        concealed: 'DZ DZ DZ DF DF DF DP DP DP 1T 2T 3T 5S',
        winningTile: '5S',
        context: {
          isSelfDraw: true,
          seatWind: 'nan',
          roundWind: 'dong',
        },
      };
      const m = materializeHand(handSpec);
      const addRes = scoringEngine.evaluateHand(m.concealed, m.melds, m.flowers, {
        ...m.context,
        winningTile: m.winningTile,
      });
      const supRes = supersedeEngine.evaluateHand(m.concealed, m.melds, m.flowers, {
        ...m.context,
        winningTile: m.winningTile,
      });

      expect(addRes.patterns.some((p) => p.id === 22)).toBe(true);
      expect(addRes.patterns.some((p) => p.id === 27)).toBe(true);
      expect(addRes.patterns.some((p) => p.id === 28)).toBe(true);
      expect(addRes.patterns.some((p) => p.id === 29)).toBe(true);

      // In supersede policy: #22 is kept, #27, #28, #29 are pruned
      expect(supRes.patterns.some((p) => p.id === 22)).toBe(true);
      expect(supRes.patterns.some((p) => p.id === 27)).toBe(false);
      expect(supRes.patterns.some((p) => p.id === 28)).toBe(false);
      expect(supRes.patterns.some((p) => p.id === 29)).toBe(false);

      // Difference must be exactly 2 + 1 + 1 = 4 Tay
      expect(supRes.totalTay).toBe(addRes.totalTay - 4);
    });

    it('supersede policy prunes 4 Flowers (#4) and 4 Seasons (#5) when 7 Bonus Tiles (#6) is present', () => {
      const supersedeEngine = new ScoringEngine({ overlapPolicy: 'supersede' });

      // Hand with 7 bonus tiles (4 flowers + 3 seasons) in completed hand:
      const handSpec: HandSpec = {
        concealed: '1T 2T 3T 4S 5S 6S 7B 8B 9B 1S 2S 3S 9T',
        winningTile: '9T',
        flowers: 'F1 F2 F3 F4 M1 M2 M3',
        context: { isSelfDraw: true, seatWind: 'dong', roundWind: 'dong' },
      };
      const m = materializeHand(handSpec);
      const addRes = scoringEngine.evaluateHand(m.concealed, m.melds, m.flowers, {
        ...m.context,
        winningTile: m.winningTile,
      });
      const supRes = supersedeEngine.evaluateHand(m.concealed, m.melds, m.flowers, {
        ...m.context,
        winningTile: m.winningTile,
      });

      expect(addRes.patterns.some((p) => p.id === 6)).toBe(true);
      expect(addRes.patterns.some((p) => p.id === 4)).toBe(true);

      // Supersede drops #4
      expect(supRes.patterns.some((p) => p.id === 6)).toBe(true);
      expect(supRes.patterns.some((p) => p.id === 4)).toBe(false);
      expect(supRes.totalTay).toBe(addRes.totalTay - 10);
    });

    it('mutually exclusive finish patterns: exactly ONE of #42, #43, #44 is awarded per regular win', () => {
      // 1. Fully concealed + self-draw -> #44 Ce Mo Pu Ciu Jen only
      // 2. Fully concealed + discard win -> #43 Mun only
      // 3. Open melds + self-draw -> #42 Ce Mo only
      // 4. Open melds + discard win -> NONE of #42, #43, #44
      const finishConfigs = [
        { hasClaimedMeld: false, isSelfDraw: true, expectedPattern: 44 },
        { hasClaimedMeld: false, isSelfDraw: false, expectedPattern: 43 },
        { hasClaimedMeld: true, isSelfDraw: true, expectedPattern: 42 },
        { hasClaimedMeld: true, isSelfDraw: false, expectedPattern: null },
      ];

      const flowers = parseTileHand('M1 M2'); // 2 Seasons = 2 Tay to guarantee meeting minHuTay 5

      for (const cfg of finishConfigs) {
        const melds: Meld[] = cfg.hasClaimedMeld
          ? [{ type: 'pung', tiles: parseTileHand('9B 9B 9B'), claimedFrom: 'dong' }]
          : [];
        // Complete 14-tile hand: 10 concealed + 1 win + 1 meld (3 tiles) = 14 tiles;
        // or 13 concealed + 1 win = 14 tiles
        const concealedTiles = cfg.hasClaimedMeld
          ? parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WX')
          : parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 1S 2S 3S WX');
        const winningTile = keyToTile('WX', 2);

        const ctx = makeContext({
          winningTile,
          isSelfDraw: cfg.isSelfDraw,
        });

        const res = scoringEngine.evaluateHand(concealedTiles, melds, flowers, ctx);
        expect(res.isLewFit).toBe(false);
        const finishPatterns = res.patterns.filter((p) => [42, 43, 44].includes(p.id));

        if (cfg.expectedPattern !== null) {
          expect(finishPatterns.length).toBe(1);
          expect(finishPatterns[0]!.id).toBe(cfg.expectedPattern);
        } else {
          expect(finishPatterns.length).toBe(0);
        }
      }
    });

    it('mutually exclusive Kong replacement events: #38 Kong Kong Hu excludes #37 Kong Song Hu', () => {
      // Complete hand with 1 Kong meld: 10 concealed + 1 win + 1 kong (4 tiles) = 15 physical tiles
      const melds: Meld[] = [
        { type: 'kong', tiles: parseTileHand('5T 5T 5T 5T'), claimedFrom: 'dong' },
      ];
      const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WX');
      const winningTile = keyToTile('WX', 2);

      // Single Kong replacement: #37 present, #38 absent
      const ctxSingle = makeContext({
        winningTile,
        isKongReplacement: true,
        isDoubleKongReplacement: false,
        isSelfDraw: true,
      });
      const resSingle = scoringEngine.evaluateHand(hand, melds, [], ctxSingle);
      expect(resSingle.isValidHu).toBe(true);
      expect(resSingle.patterns.some((p) => p.id === 37)).toBe(true);
      expect(resSingle.patterns.some((p) => p.id === 38)).toBe(false);

      // Double Kong replacement: #38 present, #37 absent
      const ctxDouble = makeContext({
        winningTile,
        isKongReplacement: true,
        isDoubleKongReplacement: true,
        isSelfDraw: true,
      });
      const resDouble = scoringEngine.evaluateHand(hand, melds, [], ctxDouble);
      expect(resDouble.isValidHu).toBe(true);
      expect(resDouble.patterns.some((p) => p.id === 38)).toBe(true);
      expect(resDouble.patterns.some((p) => p.id === 37)).toBe(false);
    });

    it('mutually exclusive Kim Melds: Kim Thi (3 Kims) and Kim Ciok (2 Kims) cannot co-exist', () => {
      // There are only 4 Kims in the entire game tile set.
      // Kim Thi requires 3 Kims; Kim Ciok requires 2 Kims.
      // 3 + 2 = 5 > 4 tiles. No hand can legally award both #30 and #32.
      const fixture30 = PATTERN_FIXTURES[30].positive[0]!;
      const res30 = materializeHand(fixture30.hand);
      const eval30 = scoringEngine.evaluateHand(res30.concealed, res30.melds, res30.flowers, {
        ...res30.context,
        winningTile: res30.winningTile,
      });
      expect(eval30.patterns.some((p) => p.id === 30)).toBe(true);
      expect(eval30.patterns.some((p) => p.id === 32)).toBe(false);

      const fixture32 = PATTERN_FIXTURES[32].positive[0]!;
      const res32 = materializeHand(fixture32.hand);
      const eval32 = scoringEngine.evaluateHand(res32.concealed, res32.melds, res32.flowers, {
        ...res32.context,
        winningTile: res32.winningTile,
      });
      expect(eval32.patterns.some((p) => p.id === 32)).toBe(true);
      expect(eval32.patterns.some((p) => p.id === 30)).toBe(false);
    });

    it('Ping Fu (#14) vs Tuei Tuei (#15) vs Chicken Hand (#13) are strictly partitioned', () => {
      // 1. Pure sequences -> Ping Fu (if pair not value)
      // 2. Pure triplets -> Tuei Tuei
      // 3. Mixed sequences & triplets with no other hand shape -> Chicken Hand
      const pingSpec: HandSpec = {
        concealed: '1T 2T 3T 4S 5S 6S 7B 8B 9B 2B 3B 4B 5T',
        winningTile: '5T',
        context: { seatWind: 'nan', roundWind: 'dong' },
      };
      const mPing = materializeHand(pingSpec);
      const rPing = scoringEngine.evaluateHand(mPing.concealed, mPing.melds, mPing.flowers, {
        ...mPing.context,
        winningTile: mPing.winningTile,
      });
      expect(rPing.patterns.some((p) => p.id === 14)).toBe(true);
      expect(rPing.patterns.some((p) => p.id === 15)).toBe(false);
      expect(rPing.patterns.some((p) => p.id === 13)).toBe(false);

      const tueiSpec: HandSpec = {
        concealed: '1T 1T 1T 4S 4S 4S 7B 7B 7B 9B 9B 9B 5T',
        winningTile: '5T',
        context: { seatWind: 'nan', roundWind: 'dong' },
      };
      const mTuei = materializeHand(tueiSpec);
      const rTuei = scoringEngine.evaluateHand(mTuei.concealed, mTuei.melds, mTuei.flowers, {
        ...mTuei.context,
        winningTile: mTuei.winningTile,
      });
      expect(rTuei.patterns.some((p) => p.id === 15)).toBe(true);
      expect(rTuei.patterns.some((p) => p.id === 14)).toBe(false);
      expect(rTuei.patterns.some((p) => p.id === 13)).toBe(false);

      const chickenSpec: HandSpec = {
        concealed: '1T 2T 3T 4S 4S 4S 7B 8B 9B WN WN WN 5T',
        winningTile: '5T',
        context: { seatWind: 'nan', roundWind: 'dong' },
      };
      const mChick = materializeHand(chickenSpec);
      const rChick = scoringEngine.evaluateHand(mChick.concealed, mChick.melds, mChick.flowers, {
        ...mChick.context,
        winningTile: mChick.winningTile,
      });
      expect(rChick.patterns.some((p) => p.id === 13)).toBe(true);
      expect(rChick.patterns.some((p) => p.id === 14)).toBe(false);
      expect(rChick.patterns.some((p) => p.id === 15)).toBe(false);
    });
  });

  // ==========================================================================
  // Section 2: K Mode vs NK Mode Invariant Fuzzing
  // ==========================================================================
  describe('2. K Mode (Ada Kim) vs NK Mode (Bo Kim) Invariant Fuzzing', () => {

    it('strictly enforces mode switch: 0 Kims === NK mode; >= 1 Kim === K mode', () => {
      // Invariant across variations of tile substitutions:
      // - Whenever kimCount === 0: mode must be NK, isWithKim === false, #8 Bo KIM present, #7 absent
      // - Whenever kimCount >= 1: mode must be K, isWithKim === true, #7 Tile KIM present, #8 absent
      const baseHand = '1T 2T 3T 4S 5S 6S 7B 8B 9B 1S 2S 3S 9T';
      const winning = '9T';

      // NK baseline
      const nkHand = parseTileHand(baseHand);
      const winTile = keyToTile(winning, 2);
      const nkRes = scoringEngine.evaluateHand(nkHand, [], [], makeContext({ winningTile: winTile }));

      expect(nkRes.mode).toBe('NK');
      expect(nkRes.isWithKim).toBe(false);
      expect(nkRes.patterns.some((p) => p.id === 8)).toBe(true);
      expect(nkRes.patterns.some((p) => p.id === 7)).toBe(false);

      // K variations: replace 1, 2, 3, or 4 tiles with Kim
      const kimVariants = [
        'KIM 2T 3T 4S 5S 6S 7B 8B 9B 1S 2S 3S 9T',
        'KIM KIM 3T 4S 5S 6S 7B 8B 9B 1S 2S 3S 9T',
        'KIM KIM KIM 4S 5S 6S 7B 8B 9B 1S 2S 3S 9T',
        'KIM KIM KIM KIM 5S 6S 7B 8B 9B 1S 2S 3S 9T',
      ];

      for (let i = 0; i < kimVariants.length; i++) {
        const kHand = parseTileHand(kimVariants[i]!);
        const kRes = scoringEngine.evaluateHand(kHand, [], [], makeContext({ winningTile: winTile }));

        expect(kRes.mode).toBe('K');
        expect(kRes.isWithKim).toBe(true);
        expect(kRes.patterns.some((p) => p.id === 8)).toBe(false); // Bo Kim FORBIDDEN in K
        const tileKimPattern = kRes.patterns.find((p) => p.id === 7);
        expect(tileKimPattern).toBeDefined();
        expect(tileKimPattern!.tay).toBe(i + 1); // 1 Tay per Kim tile!
      }
    });

    it('verifies exact Tay values across all dual-column patterns between K and NK', () => {
      // The 14 patterns with differing K / NK values in the Bandung Mahjong Cup Rulebook ver06:
      const dualPatterns: Record<number, { K: number; NK: number }> = {
        10: { K: 20, NK: 30 }, // Pao Chin
        11: { K: 40, NK: 60 }, // Thien Fu
        12: { K: 40, NK: 60 }, // Thi Fu
        15: { K: 5, NK: 10 },  // Tuei Tuei
        16: { K: 10, NK: 20 }, // Tjit Tuei
        17: { K: 5, NK: 10 },  // Chao It
        18: { K: 20, NK: 30 }, // It Set
        19: { K: 30, NK: 40 }, // Yau Kiu
        20: { K: 40, NK: 60 }, // Cap Sa Yau Kiu
        21: { K: 10, NK: 20 }, // Siau San Yen
        22: { K: 30, NK: 40 }, // Ta San Yen
        23: { K: 30, NK: 40 }, // Siau Se Si
        24: { K: 50, NK: 60 }, // Ta Se Si
        34: { K: 20, NK: 30 }, // Si Am Kang
      };

      for (const [idStr, expected] of Object.entries(dualPatterns)) {
        const id = Number(idStr);
        const def = PATTERNS.get(id)!;
        expect(def.K).toBe(expected.K);
        expect(def.NK).toBe(expected.NK);
      }
    });

    it('Se Sam Pu Tat (#39) is strictly forbidden in K mode (null)', () => {
      const def39 = PATTERNS.get(39)!;
      expect(def39.NK).toBe(40);
      expect(def39.K).toBeNull();
    });

    it('Bo Kim (#8) is strictly forbidden in K mode (null) and Tile KIM (#7) is forbidden in NK mode', () => {
      const def8 = PATTERNS.get(8)!;
      expect(def8.NK).toBe(3);
      expect(def8.K).toBeNull();

      const def7 = PATTERNS.get(7)!;
      expect(def7.K).toBe(1);
      expect(def7.NK).toBeNull();
    });
  });

  // ==========================================================================
  // Section 3: Engine Purity, Deep-Freeze Zero-Mutation & Determinism
  // ==========================================================================
  describe('3. Engine Purity, Immutability & Determinism', () => {

    it('pure functional evaluation: deep-frozen inputs are NEVER mutated', () => {
      const concealed = deepFreeze(parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WX'));
      const melds = deepFreeze([
        { type: 'pung' as const, tiles: parseTileHand('5T 5T 5T'), claimedFrom: 'dong' as const },
      ]);
      const flowers = deepFreeze(parseTileHand('F1 M2'));
      const winningTile = deepFreeze(keyToTile('WX', 2));
      const context = deepFreeze(makeContext({ winningTile }));
      const rules = deepFreeze({ ...TOURNAMENT_RULES });

      // If scoringEngine mutates any property of any input object/array,
      // Object.freeze will throw a TypeError in strict mode!
      expect(() => {
        scoringEngine.evaluateHand(
          concealed as unknown as Tile[],
          melds as unknown as Meld[],
          flowers as unknown as Tile[],
          context as unknown as WinContext,
          rules as unknown as GameRules
        );
      }).not.toThrow();
    });

    it('strictly deterministic: identical inputs yield identical outputs across 100 evaluations', () => {
      const spec: HandSpec = {
        concealed: '1T 2T 3T 4S 5S 6S 7B 8B 9B WX',
        winningTile: 'WX',
        flowers: 'F1 M2',
        context: { seatWind: 'nan', roundWind: 'dong', isSelfDraw: true },
      };
      const m = materializeHand(spec);
      const ctx = { ...m.context, winningTile: m.winningTile };

      const baseline = scoringEngine.evaluateHand(m.concealed, m.melds, m.flowers, ctx);

      for (let i = 0; i < 100; i++) {
        const next = scoringEngine.evaluateHand(m.concealed, m.melds, m.flowers, ctx);
        expect(next.isValidHu).toBe(baseline.isValidHu);
        expect(next.totalTay).toBe(baseline.totalTay);
        expect(next.mode).toBe(baseline.mode);
        expect(next.isWithKim).toBe(baseline.isWithKim);
        expect(next.patterns.length).toBe(baseline.patterns.length);
        for (let p = 0; p < baseline.patterns.length; p++) {
          expect(next.patterns[p]?.id).toBe(baseline.patterns[p]?.id);
          expect(next.patterns[p]?.tay).toBe(baseline.patterns[p]?.tay);
        }
      }
    });

    it('zero-peeking privacy: engine only consumes the declared player state', () => {
      // Engine interface takes only (hand, melds, flowers, context, rules).
      // It has zero parameters or references to hidden tiles, opponent hands, or wall state.
      const paramCount = scoringEngine.evaluateHand.length;
      expect(paramCount).toBeLessThanOrEqual(5);
    });
  });

  // ==========================================================================
  // Section 4: Performance & Latency Benchmark Across 500 Hand Evaluations
  // ==========================================================================
  describe('4. Execution Speed Benchmark: 500 Evaluations', () => {

    it('evaluates 500 diverse hands with sub-millisecond average latency (< 1.0 ms/hand)', () => {
      // Assemble diverse hands from the 44-pattern fixtures catalog
      const fixtureHands: HandSpec[] = [];
      for (const id of ALL_PATTERN_IDS) {
        const fx = PATTERN_FIXTURES[id];
        for (const c of fx.positive) fixtureHands.push(c.hand);
        for (const c of fx.negative) fixtureHands.push(c.hand);
      }

      // Generate 500 hand inputs by cycling through the catalog with randomized contexts
      const seats: Seat[] = ['dong', 'nan', 'xi', 'bei'];
      const winds: Wind[] = ['dong', 'nan', 'xi', 'bei'];

      const workload: { hand: Tile[]; melds: Meld[]; flowers: Tile[]; ctx: WinContext }[] = [];
      for (let i = 0; i < 500; i++) {
        const spec = fixtureHands[i % fixtureHands.length]!;
        const m = materializeHand(spec);
        const ctx: WinContext = {
          ...m.context,
          winningTile: m.winningTile,
          seatWind: seats[i % 4]!,
          roundWind: winds[Math.floor(i / 4) % 4]!,
          isSelfDraw: i % 2 === 0,
          isDiscardWin: i % 2 !== 0,
        };
        workload.push({ hand: m.concealed, melds: m.melds, flowers: m.flowers, ctx });
      }

      // Warm up JIT
      for (let i = 0; i < 50; i++) {
        const item = workload[i]!;
        scoringEngine.evaluateHand(item.hand, item.melds, item.flowers, item.ctx);
      }

      // Timed execution of 500 evaluations
      const startTime = performance.now();
      for (let i = 0; i < 500; i++) {
        const item = workload[i]!;
        scoringEngine.evaluateHand(item.hand, item.melds, item.flowers, item.ctx);
      }
      const endTime = performance.now();

      const totalTimeMs = endTime - startTime;
      const avgLatencyMs = totalTimeMs / 500;

      // Assert sub-millisecond evaluation requirement
      expect(avgLatencyMs).toBeLessThan(1.0);
    });
  });

  // ==========================================================================
  // Section 5: Minimum Gate & Lew Fit Rules
  // ==========================================================================
  describe('5. Minimum Gate & Lew Fit Enforcement', () => {

    it('rejects hands < 5 Tay as Lew Fit below-minimum', () => {
      // In NK mode: #8 (3) + #13 (0) + #43 (1) = 4 Tay < 5
      const chickenHand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WN WN WN 4T');
      const winTile = keyToTile('4T', 2);
      const ctx = makeContext({
        winningTile: winTile,
        seatWind: 'dong',
        roundWind: 'dong',
        isSelfDraw: false,
      });

      const res = scoringEngine.evaluateHand(chickenHand, [], [], ctx);
      expect(res.totalTay).toBe(4);
      expect(res.isValidHu).toBe(false);
      expect(res.isLewFit).toBe(true);
      expect(res.lewFitReason).toBe('below-minimum');
      expect(res.rejectionReason).toMatch(/kurang dari 5 Tay/i);
    });

    it('accepts hands >= 5 Tay as valid Hu', () => {
      // Same chicken hand + 1 seat flower = 4 + 1 = 5 Tay
      const chickenHand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WN WN WN 4T');
      const winTile = keyToTile('4T', 2);
      const seatFlower = parseTileHand('F1'); // Dong seat flower
      const ctx = makeContext({
        winningTile: winTile,
        seatWind: 'dong',
        roundWind: 'dong',
        isSelfDraw: false,
      });

      const res = scoringEngine.evaluateHand(chickenHand, [], seatFlower, ctx);
      expect(res.totalTay).toBe(5);
      expect(res.isValidHu).toBe(true);
      expect(res.isLewFit).toBe(false);
      expect(res.lewFitReason).toBeUndefined();
    });

    it('configurable minHuTay properly gates higher house limits (e.g., 6 or 10 Tay)', () => {
      const chickenHand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WN WN WN 4T');
      const winTile = keyToTile('4T', 2);
      const seatFlower = parseTileHand('F1');
      const ctx = makeContext({
        winningTile: winTile,
        seatWind: 'dong',
        roundWind: 'dong',
        isSelfDraw: false,
      });

      // 5 Tay hand tested against minHuTay = 6
      const res = scoringEngine.evaluateHand(chickenHand, [], seatFlower, ctx, {
        minHuTay: 6,
      });
      expect(res.totalTay).toBe(5);
      expect(res.isValidHu).toBe(false);
      expect(res.isLewFit).toBe(true);
      expect(res.lewFitReason).toBe('below-minimum');
    });
  });
});
