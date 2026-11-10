import { describe, expect, it } from 'vitest';
import { createCompleteTileSet, keyToTile, parseTileHand } from '@/core/tiles';
import type { ClaimDeclaration, Meld, Tile } from '@/core/types';
import {
  arbitrateKimDecompositions,
  canFormWinningHandWithKim,
  CASUAL_KIM_RULES,
  checkShiKimInstantHu,
  compareTiles,
  evaluateInstantHu,
  findWinningDecompositions,
  isKim,
  KimValidator,
  KimWinContext,
  solveSevenPairs,
  solveStandardHand,
  solveThirteenOrphans,
  STRICT_NO_KIM_RULES,
  tileKind,
  TOURNAMENT_KIM_RULES,
  validateKimMeldLegality,
} from '@/kim';

function makeTile(key: string, idx = 1): Tile {
  return keyToTile(key, idx);
}

function makeContext(winningKey: string, isSelfDraw: boolean, isInstantHu = false): KimWinContext {
  return {
    winningTile: makeTile(winningKey),
    isSelfDraw,
    isInstantHu,
  };
}

describe('Tier 5 Adversarial Stress & Property-Based Suite: Kim Joker System', () => {
  // ==========================================================================
  // Section 0: Foundation Helpers & Comparators
  // ==========================================================================
  describe('0. Foundation Helpers & Invariants', () => {
    it('0.1 tileKind and compareTiles preserve strict ordering', () => {
      const t1 = makeTile('1T');
      const t2 = makeTile('9S');
      const kim = makeTile('KIM');

      expect(tileKind(t1)).toBe('tong-1');
      expect(tileKind(t2)).toBe('sok-9');
      expect(tileKind(kim)).toBe('kim-0');

      expect(compareTiles(t1, t2)).toBeLessThan(0);
      expect(compareTiles(t1, kim)).toBeLessThan(0);
      expect(compareTiles(kim, t1)).toBeGreaterThan(0);
    });

    it('0.2 checkShiKimInstantHu correctly checks 4 Kims', () => {
      const hand4 = parseTileHand('KIM KIM KIM KIM 1T 2T 3T 4S 5S 6S 7B 8B 9B WX');
      const hand3 = parseTileHand('KIM KIM KIM 1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX');
      expect(checkShiKimInstantHu(hand4)).toBe(true);
      expect(checkShiKimInstantHu(hand3)).toBe(false);
    });
  });

  // ==========================================================================
  // Section 1: 4-Kim Combinatorics, Instant Hu vs Completed Hu
  // ==========================================================================
  describe('1. 4-Kim Permutations & Shi Kim (#9) Invariants', () => {
    it('1.1 Shi Kim Instant Hu on broken/unwinnable hand awards 10 Tay (Pattern #9)', () => {
      // 14 tiles: completely broken, but has all 4 Kims
      const hand = parseTileHand('1T 5T 9T 2S 6S WD WN DZ DF KIM KIM KIM 3B KIM');
      expect(hand.filter(isKim)).toHaveLength(4);

      // Instant Hu declared
      const solutions = findWinningDecompositions({ hand, isInstantHu: true });
      expect(solutions).toHaveLength(1);
      expect(solutions[0]!.shape).toBe('shi_kim');
      expect(solutions[0]!.totalKims).toBe(4);
      expect(solutions[0]!.signature).toBe('SHI_KIM:INSTANT_HU');

      const evalResult = evaluateInstantHu(hand, makeContext('KIM', true, true));
      expect(evalResult.mode).toBe('K');
      expect(evalResult.kimTay).toBe(10);
      expect(evalResult.patterns).toHaveLength(1);
      expect(evalResult.patterns[0]?.id).toBe(9);
      expect(evalResult.patterns[0]?.tay).toBe(10);
      expect(evalResult.hasShiKim).toBe(true);
    });

    it('1.2 Shi Kim completed hand awards 40 Tay (#9) + 4 Tay (#7 Tile KIM) = 44 Tay', () => {
      // 14 tiles: 1T 2T KIM, 4S KIM 6S, 7B 8B 9B, KIM KIM (pair), WX WX WX
      const hand = parseTileHand('1T 2T KIM 4S KIM 6S 7B 8B 9B KIM KIM WX WX WX');
      expect(hand.filter(isKim)).toHaveLength(4);

      const solutions = findWinningDecompositions({ hand, isInstantHu: false });
      expect(solutions.length).toBeGreaterThan(0);

      const best = arbitrateKimDecompositions(solutions, makeContext('WX', false));
      expect(best.mode).toBe('K');
      expect(best.patterns.map((p) => p.id)).toContain(9); // Shi Kim (40 Tay)
      expect(best.patterns.map((p) => p.id)).toContain(7); // Tile KIM (4 Tay)
      expect(best.patterns.find((p) => p.id === 9)?.tay).toBe(40);
      expect(best.patterns.find((p) => p.id === 7)?.tay).toBe(4);
      expect(best.kimTay).toBeGreaterThanOrEqual(44);
    });

    it('1.3 4 Kims decomposed as Kim Thi (3 Kims) + 1 Kim in sequence', () => {
      // KIM KIM KIM + 1T KIM 3T + 4S 5S 6S + 7B 8B 9B + WX WX
      const hand = parseTileHand('KIM KIM KIM 1T KIM 3T 4S 5S 6S 7B 8B 9B WX WX');
      const solutions = findWinningDecompositions({ hand });

      expect(solutions.length).toBeGreaterThan(0);
      const hasKimThi = solutions.some((s) =>
        s.melds.some((m) => m.type === 'kim_thi' || (m.type === 'pung' && m.kimCount === 3))
      );
      expect(hasKimThi).toBe(true);

      const best = arbitrateKimDecompositions(solutions, makeContext('WX', false));
      expect(best.mode).toBe('K');
      expect(best.hasShiKim).toBe(true); // Holding 4 Kims qualifies for Shi Kim 40 Tay
      expect(best.patterns.map((p) => p.id)).toContain(9);
      expect(best.patterns.map((p) => p.id)).toContain(30); // Kim Thi (30 Tay)
      expect(best.patterns.map((p) => p.id)).toContain(7); // Tile KIM (4 Tay)
      // 40 (Shi Kim) + 30 (Kim Thi) + 4 (Tile KIM) = 74 Tay
      expect(best.kimTay).toBe(74);
    });

    it('1.4 4 Kims decomposed into two sequence wildcards + Kim Ciok pair', () => {
      // 1T KIM 3T + 4S KIM 6S + 7B 8B 9B + WD WD WD + KIM KIM (pair)
      const hand = parseTileHand('1T KIM 3T 4S KIM 6S 7B 8B 9B WD WD WD KIM KIM');
      const solutions = findWinningDecompositions({ hand });
      expect(solutions.length).toBeGreaterThan(0);

      const best = arbitrateKimDecompositions(solutions, makeContext('WD', false));
      expect(best.hasShiKim).toBe(true);
      expect(best.hasKimCiok).toBe(true);
      expect(best.patterns.map((p) => p.id)).toContain(9); // Shi Kim (40)
      expect(best.patterns.map((p) => p.id)).toContain(32); // Kim Ciok (20)
      expect(best.patterns.map((p) => p.id)).toContain(7); // Tile KIM (4)
      expect(best.kimTay).toBe(64);
    });

    it('1.5 4 Kims decomposed across 4 separate melds', () => {
      // 1T KIM 3T + 4S KIM 6S + 7B KIM 9B + WD WD KIM + DZ DZ
      const hand = parseTileHand('1T KIM 3T 4S KIM 6S 7B KIM 9B WD WD KIM DZ DZ');
      const solutions = findWinningDecompositions({ hand });
      expect(solutions.length).toBeGreaterThan(0);

      const best = arbitrateKimDecompositions(solutions, makeContext('DZ', false));
      expect(best.hasShiKim).toBe(true);
      expect(best.patterns.map((p) => p.id)).toContain(9); // 40
      expect(best.patterns.map((p) => p.id)).toContain(7); // 4
      expect(best.kimTay).toBe(44);
    });
  });

  // ==========================================================================
  // Section 2: 3-Kim Combinatorics (Kim Thi vs Scattered Wildcards)
  // ==========================================================================
  describe('2. 3-Kim Permutations & Kim Thi (#30) Invariants', () => {
    it('2.1 Pure Kim Thi triplet: KIM-KIM-KIM + 3 natural sequences + natural pair', () => {
      const hand = parseTileHand('KIM KIM KIM 1T 2T 3T 4S 5S 6S 7B 8B 9B 2T 2T');
      const solutions = findWinningDecompositions({ hand });
      expect(solutions.length).toBeGreaterThan(0);

      const best = arbitrateKimDecompositions(solutions, makeContext('2T', false));
      expect(best.mode).toBe('K');
      expect(best.hasKimThi).toBe(true);
      expect(best.patterns.map((p) => p.id)).toContain(30); // 30 Tay
      expect(best.patterns.map((p) => p.id)).toContain(7); // 3 Tay
      expect(best.kimTay).toBe(33);
    });

    it('2.2 3 Kims as Kim Ciok (2 Kims) + 1 Kim wildcard in sequence', () => {
      // 1T KIM 3T + 4S 5S 6S + 7B 8B 9B + WX WX WX + KIM KIM (pair)
      const hand = parseTileHand('1T KIM 3T 4S 5S 6S 7B 8B 9B WX WX WX KIM KIM');
      const solutions = findWinningDecompositions({ hand });
      expect(solutions.length).toBeGreaterThan(0);

      const best = arbitrateKimDecompositions(solutions, makeContext('WX', false));
      expect(best.hasKimCiok).toBe(true);
      expect(best.hasKimThi).toBe(false);
      expect(best.patterns.map((p) => p.id)).toContain(32); // Kim Ciok (20)
      expect(best.patterns.map((p) => p.id)).toContain(7); // Tile KIM (3)
      expect(best.kimTay).toBe(23);
    });

    it('2.3 3 Kims scattered across 3 separate sequences (0 extra Tay, only Tile KIM)', () => {
      // 1T KIM 3T + 4S KIM 6S + 7B KIM 9B + WX WX WX + 5T 5T
      const hand = parseTileHand('1T KIM 3T 4S KIM 6S 7B KIM 9B WX WX WX 5T 5T');
      const solutions = findWinningDecompositions({ hand });
      expect(solutions.length).toBeGreaterThan(0);

      const best = arbitrateKimDecompositions(solutions, makeContext('5T', false));
      expect(best.hasKimThi).toBe(false);
      expect(best.hasKimCiok).toBe(false);
      expect(best.patterns.map((p) => p.id)).toEqual([7]);
      expect(best.kimTay).toBe(3); // 3 Tay
    });

    it('2.4 Hand permitting BOTH Kim Thi and scattered wildcards arbitrates to Kim Thi (30 Tay)', () => {
      // Hand: 1T 2T 3T + 4S 5S 6S + 7B 8B 9B + 5T 5T + KIM KIM KIM
      const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 5T 5T KIM KIM KIM');
      const solutions = findWinningDecompositions({ hand });
      expect(solutions.length).toBeGreaterThan(0);

      const best = arbitrateKimDecompositions(solutions, makeContext('5T', false));
      expect(best.hasKimThi).toBe(true);
      expect(best.kimTay).toBe(33);
    });
  });

  // ==========================================================================
  // Section 3: 2-Kim Combinatorics (Kim Ciok vs Sequences vs Triplet)
  // ==========================================================================
  describe('3. 2-Kim Permutations & Kim Ciok (#32) Invariants', () => {
    it('3.1 Hand permitting BOTH Kim Ciok and sequence wildcards arbitrates to Kim Ciok (20 Tay)', () => {
      // Hand: 1T 2T 3T + 4S 5S 6S + 7B 8B 9B + WX WX WX + KIM KIM
      const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX WX KIM KIM');
      const solutions = findWinningDecompositions({ hand });
      expect(solutions.length).toBeGreaterThan(0);

      const best = arbitrateKimDecompositions(solutions, makeContext('WX', false));
      expect(best.hasKimCiok).toBe(true);
      expect(best.kimTay).toBe(22);
    });

    it('3.2 2 Kims in a single triplet (5T + KIM + KIM) awards Tile KIM but not Kim Ciok', () => {
      const hand = parseTileHand('5T KIM KIM 1S 2S 3S 4B 5B 6B 7T 8T 9T WX WX');
      const solutions = findWinningDecompositions({ hand });
      expect(solutions.length).toBeGreaterThan(0);

      const best = arbitrateKimDecompositions(solutions, makeContext('WX', false));
      expect(best.hasKimCiok).toBe(false);
      expect(best.kimTay).toBe(2); // 2 Tay for 2 Kims
    });

    it('3.3 2 Kims in two separate sequences awards Tile KIM only', () => {
      const hand = parseTileHand('1T KIM 3T 4S KIM 6S 7B 8B 9B WD WD WD DZ DZ');
      const solutions = findWinningDecompositions({ hand });
      expect(solutions.length).toBeGreaterThan(0);

      const best = arbitrateKimDecompositions(solutions, makeContext('DZ', false));
      expect(best.hasKimCiok).toBe(false);
      expect(best.kimTay).toBe(2);
    });
  });

  // ==========================================================================
  // Section 4: Pattern #40 Pyong Pi & Ambiguity Resolution
  // ==========================================================================
  describe('4. Pattern #40 Pyong Pi & Multi-Solution Tie-Breaking', () => {
    it('4.1 Pyong Pi: Self-draw winning tile pairs with lone Kim in hand (5 Tay + 1 Tay = 6 Tay)', () => {
      const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX WX KIM');
      const winningTile = makeTile('9S');
      const context: KimWinContext = { winningTile, isSelfDraw: true };

      const solutions = findWinningDecompositions({
        hand,
        winningTile,
        isSelfDraw: true,
      });
      expect(solutions.length).toBeGreaterThan(0);

      const best = arbitrateKimDecompositions(solutions, context);
      expect(best.hasPyongPi).toBe(true);
      expect(best.patterns.map((p) => p.id)).toContain(40);
      expect(best.patterns.map((p) => p.id)).toContain(7);
      expect(best.kimTay).toBe(6);
    });

    it('4.2 Rejects Pyong Pi if winning tile is claimed by Ron (discard win)', () => {
      const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX WX KIM');
      const winningTile = makeTile('9S');
      const context: KimWinContext = { winningTile, isSelfDraw: false }; // Discard win

      const solutions = findWinningDecompositions({
        hand,
        winningTile,
        isSelfDraw: false,
      });
      expect(solutions.length).toBeGreaterThan(0);

      const best = arbitrateKimDecompositions(solutions, context);
      expect(best.hasPyongPi).toBe(false);
      expect(best.patterns.map((p) => p.id)).not.toContain(40);
      expect(best.kimTay).toBe(1); // Tile KIM only
    });

    it('4.3 Rejects Pyong Pi if 2 Kims form the pair (that is Kim Ciok #32, 20 Tay)', () => {
      const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX WX KIM');
      const winningTile = makeTile('KIM', 2);
      const context: KimWinContext = { winningTile, isSelfDraw: true };

      const solutions = findWinningDecompositions({
        hand,
        winningTile,
        isSelfDraw: true,
      });
      expect(solutions.length).toBeGreaterThan(0);

      const best = arbitrateKimDecompositions(solutions, context);
      expect(best.hasPyongPi).toBe(false);
      expect(best.hasKimCiok).toBe(true);
      expect(best.kimTay).toBe(22); // 20 + 2
    });

    it('4.4 Ambiguous hand with multiple candidate decompositions chooses highest Tay', () => {
      const dummyA = {
        melds: [],
        pair: { tiles: [makeTile('WX'), makeTile('WX')] as [Tile, Tile], kimCount: 0 },
        totalKimCount: 1,
        wildcardKimCount: 1,
      };
      const dummyB = {
        melds: [],
        pair: { tiles: [makeTile('WX'), makeTile('KIM')] as [Tile, Tile], kimCount: 1 },
        totalKimCount: 1,
        wildcardKimCount: 1,
      };

      const res = arbitrateKimDecompositions([dummyA, dummyB], makeContext('WX', true));
      expect(res.hasPyongPi).toBe(true);
      expect(res.kimTay).toBe(6);
    });
  });

  // ==========================================================================
  // Section 5: Non-Standard Hands (Seven Pairs & Thirteen Orphans with Kims)
  // ==========================================================================
  describe('5. Non-Standard Hands (7 Pairs and 13 Orphans)', () => {
    describe('5.1 Seven Pairs (Tjit Tuei) with 0, 1, 2, 3, 4 Kims', () => {
      it('5.1.1 0 Kims: 7 natural pairs (NK mode)', () => {
        const hand = parseTileHand('1T 1T 3T 3T 5S 5S 7S 7S 2B 2B WD WD DZ DZ');
        const sol = solveSevenPairs(hand);
        expect(sol).toHaveLength(1);
        expect(sol[0]!.mode).toBe('NK');
        expect(sol[0]!.pairs).toHaveLength(7);
        expect(sol[0]!.totalKims).toBe(0);
      });

      it('5.1.2 1 Kim: 6 natural pairs + 1 singleton paired with Kim (K mode)', () => {
        const hand = parseTileHand('1T 1T 3T 3T 5S 5S 7S 7S 2B 2B WD WD DZ KIM');
        const sol = solveSevenPairs(hand);
        expect(sol).toHaveLength(1);
        expect(sol[0]!.mode).toBe('K');
        expect(sol[0]!.pairs).toHaveLength(7);
        expect(sol[0]!.wildcardAssignments).toHaveLength(1);
        expect(sol[0]!.wildcardAssignments[0]?.representedTile.type).toBe('dragon');
      });

      it('5.1.3 2 Kims: 5 natural pairs + 2 singletons paired with 2 Kims', () => {
        const hand = parseTileHand('1T 1T 3T 3T 5S 5S 7S 7S 2B 2B WD WN KIM KIM');
        const sol = solveSevenPairs(hand);
        expect(sol).toHaveLength(1);
        expect(sol[0]!.pairs).toHaveLength(7);
        expect(sol[0]!.wildcardAssignments).toHaveLength(2);
      });

      it('5.1.4 2 Kims: 6 natural pairs + KIM-KIM pair (Kim Ciok)', () => {
        const hand = parseTileHand('1T 1T 3T 3T 5S 5S 7S 7S 2B 2B WD WD KIM KIM');
        const sol = solveSevenPairs(hand);
        expect(sol).toHaveLength(1);
        expect(sol[0]!.pairs).toHaveLength(7);
        const kimCiokPair = sol[0]!.pairs?.find((p) => p.isKimCiok);
        expect(kimCiokPair).toBeDefined();
        expect(kimCiokPair!.kimCount).toBe(2);
      });

      it('5.1.5 3 Kims: 5 natural pairs + 1 singleton + 1 Kim Ciok pair', () => {
        const hand = parseTileHand('1T 1T 3T 3T 5S 5S 7S 7S 2B 2B WD KIM KIM KIM');
        const sol = solveSevenPairs(hand);
        expect(sol).toHaveLength(1);
        expect(sol[0]!.pairs).toHaveLength(7);
        expect(sol[0]!.pairs?.some((p) => p.isKimCiok)).toBe(true);
        expect(sol[0]!.pairs?.some((p) => p.kimCount === 1)).toBe(true);
      });

      it('5.1.6 4 Kims: 5 natural pairs + two Kim Ciok pairs', () => {
        const hand = parseTileHand('1T 1T 3T 3T 5S 5S 7S 7S 2B 2B KIM KIM KIM KIM');
        const sol = solveSevenPairs(hand);
        expect(sol).toHaveLength(1);
        expect(sol[0]!.pairs).toHaveLength(7);
        const kimCiokPairs = sol[0]!.pairs?.filter((p) => p.isKimCiok);
        expect(kimCiokPairs).toHaveLength(2);
      });

      it('5.1.7 4 Kims: 4 natural pairs + 2 singletons paired + 1 Kim Ciok pair', () => {
        const hand = parseTileHand('1T 1T 3T 3T 5S 5S 7S 7S 2B 4B KIM KIM KIM KIM');
        const sol = solveSevenPairs(hand);
        expect(sol).toHaveLength(1);
        expect(sol[0]!.pairs).toHaveLength(7);
        expect(sol[0]!.pairs?.filter((p) => p.isKimCiok)).toHaveLength(1);
      });

      it('5.1.8 Rejects 7 pairs if open melds are present', () => {
        const hand = parseTileHand('1T 1T 3T 3T 5S 5S 7S 7S 2B 2B WD');
        const openMeld: Meld = {
          type: 'pung',
          tiles: [makeTile('DZ', 1), makeTile('DZ', 2), makeTile('DZ', 3)],
        };
        const sol = solveSevenPairs(hand, [openMeld]);
        expect(sol).toHaveLength(0);
      });

      it('5.1.9 Rejects 7 pairs if singletons exceed available Kims', () => {
        // 5 singletons, only 2 Kims
        const hand = parseTileHand('1T 1T 3T 3T 5S 5S 7S 2B 4B WD WN KIM KIM');
        const sol = solveSevenPairs(hand);
        expect(sol).toHaveLength(0);
      });

      it('5.1.10 Solves 7 pairs with 2 singletons and 2 Kims', () => {
        const hand14 = parseTileHand('1T 1T 3T 3T 5S 5S 7S 7S 2B 2B 4B WD KIM KIM');
        expect(solveSevenPairs(hand14)).toHaveLength(1);
      });
    });

    describe('5.2 Thirteen Orphans (Cap Sa Yau Kiu) with 0, 1, 2, 3, 4 Kims', () => {
      it('5.2.1 0 Kims: 13 unique + 1 natural pair', () => {
        const hand = parseTileHand('1T 9T 1S 9S 1B 9B WD WN WX WB DZ DF DP 1T');
        const sol = solveThirteenOrphans(hand);
        expect(sol).toHaveLength(1);
        expect(sol[0]!.mode).toBe('NK');
        expect(sol[0]!.orphanTiles).toHaveLength(14);
      });

      it('5.2.2 1 Kim: 12 unique + 1 natural pair, Kim substitutes missing orphan', () => {
        // Missing DP, has natural 1T pair
        const hand = parseTileHand('1T 9T 1S 9S 1B 9B WD WN WX WB DZ DF KIM 1T');
        const sol = solveThirteenOrphans(hand);
        expect(sol).toHaveLength(1);
        expect(sol[0]!.mode).toBe('K');
        expect(sol[0]!.wildcardAssignments).toHaveLength(1);
        expect(sol[0]!.wildcardAssignments[0]?.representedTile.type).toBe('dragon');
        expect(sol[0]!.wildcardAssignments[0]?.representedTile.value).toBe(3);
      });

      it('5.2.3 1 Kim: 13 unique + 0 natural pairs, Kim forms pair with anchor orphan', () => {
        const hand = parseTileHand('1T 9T 1S 9S 1B 9B WD WN WX WB DZ DF DP KIM');
        const sol = solveThirteenOrphans(hand);
        expect(sol).toHaveLength(1);
        expect(sol[0]!.mode).toBe('K');
        expect(sol[0]!.pair?.kimCount).toBe(1);
      });

      it('5.2.4 2 Kims: 11 unique + 1 natural pair + 2 Kims', () => {
        // Missing DF, DP; natural 1T pair
        const hand = parseTileHand('1T 9T 1S 9S 1B 9B WD WN WX WB DZ KIM KIM 1T');
        const sol = solveThirteenOrphans(hand);
        expect(sol).toHaveLength(1);
        expect(sol[0]!.wildcardAssignments).toHaveLength(2);
      });

      it('5.2.5 2 Kims: 12 unique + 0 natural pairs + 2 Kims', () => {
        // Missing DP; 1 Kim replaces DP, 1 Kim forms pair
        const hand = parseTileHand('1T 9T 1S 9S 1B 9B WD WN WX WB DZ DF KIM KIM');
        const sol = solveThirteenOrphans(hand);
        expect(sol).toHaveLength(1);
        expect(sol[0]!.wildcardAssignments).toHaveLength(2);
      });

      it('5.2.6 3 Kims: 10 unique + 1 natural pair + 3 Kims', () => {
        // Missing DZ, DF, DP; natural 1T pair
        const hand = parseTileHand('1T 9T 1S 9S 1B 9B WD WN WX WB KIM KIM KIM 1T');
        const sol = solveThirteenOrphans(hand);
        expect(sol).toHaveLength(1);
        expect(sol[0]!.wildcardAssignments).toHaveLength(3);
      });

      it('5.2.7 4 Kims: 9 unique + 1 natural pair + 4 Kims', () => {
        // Missing WB, DZ, DF, DP; natural 1T pair
        const hand = parseTileHand('1T 9T 1S 9S 1B 9B WD WN WX KIM KIM KIM KIM 1T');
        const sol = solveThirteenOrphans(hand);
        expect(sol).toHaveLength(1);
        expect(sol[0]!.wildcardAssignments).toHaveLength(4);
      });

      it('5.2.8 Rejects 13 orphans if any non-orphan natural tile is present', () => {
        // Contains 2T (middle tile, not terminal or honor)
        const hand = parseTileHand('1T 9T 1S 9S 1B 9B WD WN WX WB DZ DF 2T KIM');
        const sol = solveThirteenOrphans(hand);
        expect(sol).toHaveLength(0);
      });

      it('5.2.9 Rejects 13 orphans if open melds are present', () => {
        const hand = parseTileHand('1T 9T 1S 9S 1B 9B WD WN WX WB DZ');
        const openMeld: Meld = {
          type: 'pung',
          tiles: [makeTile('DF', 1), makeTile('DF', 2), makeTile('DF', 3)],
        };
        const sol = solveThirteenOrphans(hand, [openMeld]);
        expect(sol).toHaveLength(0);
      });
    });
  });

  // ==========================================================================
  // Section 6: Illegal Hands, Boundary Conditions & Robustness
  // ==========================================================================
  describe('6. Illegal Hands, Foul Hand Detection & Exception Safety', () => {
    it('6.1 Hand with 0 tiles returns empty array without throwing', () => {
      expect(findWinningDecompositions({ hand: [] })).toEqual([]);
      expect(canFormWinningHandWithKim([])).toBe(false);
    });

    it('6.2 Hand with irregular tile count (1, 5, 8, 12, 13, 15 tiles) returns empty array without throwing', () => {
      const counts = [1, 5, 8, 12, 13, 15];
      for (const count of counts) {
        const tiles = Array.from({ length: count }, (_, i) => makeTile('1T', i + 1));
        expect(() => findWinningDecompositions({ hand: tiles })).not.toThrow();
        expect(findWinningDecompositions({ hand: tiles })).toEqual([]);
        expect(canFormWinningHandWithKim(tiles)).toBe(false);
      }
    });

    it('6.3 Completely disjoint unwinnable hands return empty array', () => {
      // 14 tiles across all 3 suits with no sequences and no pairs (broken hand)
      const hand = parseTileHand('1T 2T 4T 2S 3S 5S 7B 8B WD WN WX DZ DF DP');
      expect(findWinningDecompositions({ hand })).toEqual([]);
      expect(canFormWinningHandWithKim(hand)).toBe(false);
    });

    it('6.4 Honor sequence attempt is strictly rejected (winds and dragons cannot form sequences)', () => {
      // Hand trying to form sequence WD-WN-WX with Kim: WD KIM WX
      const hand = parseTileHand('WD KIM WX 1S 2S 3S 4B 5B 6B 7T 8T 9T 5T 5T');
      const sol = findWinningDecompositions({ hand });
      expect(sol).toHaveLength(0);
    });

    it('6.5 Discarding Kim under tournament rules is strictly prohibited', () => {
      const validator = new KimValidator(TOURNAMENT_KIM_RULES);
      const kim = makeTile('KIM');
      const nat = makeTile('5T');

      expect(validator.canDiscard(nat).valid).toBe(true);
      expect(() => validator.validateDiscard(nat)).not.toThrow();

      const kimDiscard = validator.canDiscard(kim);
      expect(kimDiscard.valid).toBe(false);
      expect(kimDiscard.reason).toMatch(/prohibited under tournament rules/i);
      expect(() => validator.validateDiscard(kim)).toThrow(/prohibited under tournament rules/i);

      // getDiscardableTileIds filters out all Kims
      const handWithKims = parseTileHand('1T 2T 3T KIM 5S 6S KIM');
      const discardable = validator.getDiscardableTileIds(handWithKims);
      expect(discardable).toHaveLength(5);
      expect(discardable).not.toContain(handWithKims.find(isKim)?.id);
    });

    it('6.6 Discarding Kim under casual rules is permitted when kimDiscardAllowed is enabled', () => {
      const validator = new KimValidator({ ...CASUAL_KIM_RULES, kimDiscardAllowed: true });
      const kim = makeTile('KIM');

      expect(validator.canDiscard(kim).valid).toBe(true);
      expect(() => validator.validateDiscard(kim)).not.toThrow();

      const handWithKims = parseTileHand('1T 2T 3T KIM 5S 6S KIM');
      const discardable = validator.getDiscardableTileIds(handWithKims);
      expect(discardable).toHaveLength(7);
    });

    it('6.7 Claiming discards with Kim under tournament rules triggers Lew Fit prohibition', () => {
      const validator = new KimValidator(TOURNAMENT_KIM_RULES);
      const discard = makeTile('5T');

      const naturalClaim: ClaimDeclaration = {
        action: 'jia',
        seat: 'nan',
        meldTiles: [makeTile('4T'), discard, makeTile('6T')],
      };
      expect(validator.canClaimDeclaration(naturalClaim, discard).valid).toBe(true);

      const kimClaim: ClaimDeclaration = {
        action: 'jia',
        seat: 'nan',
        meldTiles: [makeTile('4T'), discard, makeTile('KIM')],
      };
      const kimRes = validator.canClaimDeclaration(kimClaim, discard);
      expect(kimRes.valid).toBe(false);
      expect(kimRes.reason).toMatch(/prohibited.*Lew Fit/i);
      expect(() => validator.validateClaimDeclaration(kimClaim, discard)).toThrow(/prohibited.*Lew Fit/i);
    });

    it('6.8 Claiming discards with Kim under casual rules is permitted', () => {
      const validator = new KimValidator(CASUAL_KIM_RULES);
      const discard = makeTile('5T');

      const kimClaim: ClaimDeclaration = {
        action: 'jia',
        seat: 'nan',
        meldTiles: [makeTile('4T'), discard, makeTile('KIM')],
      };
      expect(validator.canClaimDeclaration(kimClaim, discard).valid).toBe(true);
    });

    it('6.9 validateKimMeldLegality detects illegal open melds with Kim and marks Lew Fit', () => {
      const illegalMeld: Meld = {
        type: 'jia',
        tiles: [makeTile('4T'), makeTile('5T'), makeTile('KIM')],
        claimedFrom: 'dong',
      };
      const report = validateKimMeldLegality([illegalMeld], TOURNAMENT_KIM_RULES);
      expect(report.isLegal).toBe(false);
      expect(report.isLewFit).toBe(true);
      expect(report.rejectionReason).toMatch(/Lew Fit/i);

      // Concealed Ankong with Kim is NOT an open claim and does not trigger Lew Fit
      const ankongMeld: Meld = {
        type: 'ankong',
        tiles: [makeTile('5T', 1), makeTile('5T', 2), makeTile('5T', 3), makeTile('KIM')],
      };
      const ankongReport = validateKimMeldLegality([ankongMeld], TOURNAMENT_KIM_RULES);
      expect(ankongReport.isLegal).toBe(true);
      expect(ankongReport.isLewFit).toBe(false);
    });

    it('6.10 Strict No-Kim rules disables all Kim wildcards and meld usage', () => {
      const hand = parseTileHand('1T KIM 3T 4S 5S 6S 7B 8B 9B WD WD WD DZ DZ');
      const sol = findWinningDecompositions({ hand, rules: STRICT_NO_KIM_RULES });
      expect(sol).toHaveLength(0);
      expect(canFormWinningHandWithKim(hand, [], STRICT_NO_KIM_RULES)).toBe(false);
    });

    it('6.11 solveStandardHand directly handles concealed standard hand', () => {
      const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WD WD WD DZ DZ');
      const sol = solveStandardHand(hand);
      expect(sol.length).toBeGreaterThan(0);
      expect(sol[0]!.shape).toBe('standard');
    });
  });

  // ==========================================================================
  // Section 7: Performance & Latency Benchmark (<5ms per call)
  // ==========================================================================
  describe('7. Performance & Latency Verification (<5ms per call)', () => {
    it('7.1 Wildcard solver executes under worst-case 4-Kim permutations in <5ms', () => {
      // 4-Kim hand with high branching factor
      const complexHand = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T KIM KIM KIM KIM WX');
      const iterations = 50;

      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        const res = findWinningDecompositions({ hand: complexHand });
        expect(res.length).toBeGreaterThan(0);
      }
      const totalMs = performance.now() - start;
      const avgMs = totalMs / iterations;

      expect(avgMs).toBeLessThan(5.0);
    });

    it('7.2 Fuzzing benchmark across 200 diverse hands: 100% of calls complete <5ms', () => {
      const fullTileSet = createCompleteTileSet();
      const testCases: { hand: Tile[]; melds?: Meld[] }[] = [];

      // Warm up JIT optimizer
      for (let w = 0; w < 10; w++) {
        findWinningDecompositions({ hand: fullTileSet.slice(0, 14) });
      }

      // Pseudo-random deterministic shuffle helper
      let seed = 42;
      function pseudoRandom(): number {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      }

      for (let i = 0; i < 200; i++) {
        const copy = [...fullTileSet];
        for (let j = copy.length - 1; j > 0; j--) {
          const k = Math.floor(pseudoRandom() * (j + 1));
          const tmp = copy[j]!;
          copy[j] = copy[k]!;
          copy[k] = tmp;
        }
        const hand = copy.slice(0, 14);
        testCases.push({ hand });
      }

      let maxDuration = 0;
      let totalDuration = 0;

      for (const tc of testCases) {
        // Run 3 trials and take min to eliminate OS thread context-switch spikes
        let trialMin = Infinity;
        for (let t = 0; t < 3; t++) {
          const t0 = performance.now();
          findWinningDecompositions(tc);
          const elapsed = performance.now() - t0;
          if (elapsed < trialMin) trialMin = elapsed;
        }

        if (trialMin > maxDuration) {
          maxDuration = trialMin;
        }
        totalDuration += trialMin;
      }

      const meanDuration = totalDuration / testCases.length;

      // Assert worst-case is strictly less than 5ms
      expect(maxDuration).toBeLessThan(5.0);
      // Assert average is strictly less than 1ms
      expect(meanDuration).toBeLessThan(1.0);
    });
  });
});
