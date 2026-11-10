import { describe, expect, it } from 'vitest';
import { keyToTile, parseTileHand } from '@/core/tiles';
import type { Meld, Tile } from '@/core/types';
import {
  canFormWinningHandWithKim,
  compareTiles,
  findAllSolutions,
  findWinningDecompositions,
  isKim,
  solveSevenPairs,
  solveStandardHand,
  solveThirteenOrphans,
  tileKind,
} from '@/kim/wildcard-solver';
import { KIM_EDGE_CASES, materializeHand } from '../scoring/claude-44-patterns-fixtures';

function makeTile(key: string, idx = 1): Tile {
  return keyToTile(key, idx);
}

describe('Wildcard Permutation Solver (src/kim/wildcard-solver.ts)', () => {
  describe('Tile inspection & helpers', () => {
    it('isKim identifies Kim tiles by type or flag', () => {
      expect(isKim(makeTile('KIM'))).toBe(true);
      expect(isKim({ id: 'custom-kim', type: 'kim', value: 0, isKim: true })).toBe(true);
      expect(isKim(makeTile('5T'))).toBe(false);
      expect(isKim(makeTile('WD'))).toBe(false);
    });

    it('tileKind formats natural tiles and Kim uniformly', () => {
      expect(tileKind(makeTile('1T'))).toBe('tong-1');
      expect(tileKind(makeTile('9S'))).toBe('sok-9');
      expect(tileKind(makeTile('5B'))).toBe('ban-5');
      expect(tileKind(makeTile('WD'))).toBe('wind-1');
      expect(tileKind(makeTile('DZ'))).toBe('dragon-1');
      expect(tileKind(makeTile('KIM'))).toBe('kim-0');
    });

    it('compareTiles establishes deterministic canonical ordering', () => {
      const t1 = makeTile('1T');
      const t2 = makeTile('2T');
      const s1 = makeTile('1S');
      const kim = makeTile('KIM');

      expect(compareTiles(t1, t2)).toBeLessThan(0);
      expect(compareTiles(t1, s1)).toBeLessThan(0); // Tong < Sok
      expect(compareTiles(t1, kim)).toBeLessThan(0); // Natural < Kim
      expect(compareTiles(kim, t1)).toBeGreaterThan(0);
      expect(compareTiles(kim, makeTile('KIM', 2))).toBe(0);
    });

    it('findAllSolutions aliases findWinningDecompositions', () => {
      const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 2T 3T 4T WX WX');
      const s1 = findWinningDecompositions({ hand });
      const s2 = findAllSolutions({ hand });
      expect(s1.length).toBe(s2.length);
      expect(s1[0]?.signature).toBe(s2[0]?.signature);
    });

    it('solveStandardHand directly resolves concealed standard hands', () => {
      const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 2T 3T 4T WX WX');
      const s = solveStandardHand(hand);
      expect(s.length).toBeGreaterThan(0);
      expect(s[0]?.shape).toBe('standard');
    });
  });

  describe('Group 1: Zero-Kim (NK) Baselines', () => {
    it('1.1 solves natural Ping Fu (4 sequences + pair)', () => {
      const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 2T 3T 4T WX WX');
      const solutions = findWinningDecompositions({ hand });

      expect(solutions.length).toBeGreaterThan(0);
      const sol = solutions[0]!;
      expect(sol.shape).toBe('standard');
      expect(sol.totalKims).toBe(0);
      expect(sol.mode).toBe('NK');
      expect(sol.melds.length).toBe(4);
      expect(sol.pair?.tiles.map((t) => `${t.type}-${t.value}`)).toEqual(['wind-3', 'wind-3']);
    });

    it('1.2 solves natural Tuei Tuei (4 triplets + pair)', () => {
      const hand = parseTileHand('1T 1T 1T 5S 5S 5S 9B 9B 9B WD WD WD DZ DZ');
      const solutions = findWinningDecompositions({ hand });

      expect(solutions.length).toBeGreaterThan(0);
      const sol = solutions[0]!;
      expect(sol.shape).toBe('standard');
      expect(sol.mode).toBe('NK');
      expect(sol.melds.every((m) => m.type === 'pung')).toBe(true);
      expect(sol.pair?.tiles.map((t) => `${t.type}-${t.value}`)).toEqual(['dragon-1', 'dragon-1']);
    });

    it('1.3 solves natural Tjit Tuei (7 pairs)', () => {
      const hand = parseTileHand('1T 1T 3T 3T 5S 5S 7S 7S 2B 2B WD WD DZ DZ');
      const solutions = solveSevenPairs(hand);

      expect(solutions.length).toBe(1);
      const sol = solutions[0]!;
      expect(sol.shape).toBe('seven_pairs');
      expect(sol.pairs?.length).toBe(7);
      expect(sol.totalKims).toBe(0);
      expect(sol.mode).toBe('NK');
    });

    it('1.4 solves natural Cap Sa Yau Kiu (13 orphans)', () => {
      const hand = parseTileHand('1T 9T 1S 9S 1B 9B WD WN WX WB DZ DF DP 1T');
      const solutions = solveThirteenOrphans(hand);

      expect(solutions.length).toBe(1);
      const sol = solutions[0]!;
      expect(sol.shape).toBe('thirteen_orphans');
      expect(sol.totalKims).toBe(0);
      expect(sol.mode).toBe('NK');
      expect(sol.orphanTiles?.length).toBe(14);
    });

    it('1.5 unwinnable natural hand returns empty array', () => {
      const hand = parseTileHand('1T 2T 4T 2S 3S 5S 7B 8B WD WN WX DZ DF DP');
      const solutions = findWinningDecompositions({ hand });
      expect(solutions).toHaveLength(0);
      expect(canFormWinningHandWithKim(hand)).toBe(false);
    });
  });

  describe('Group 2: Single Kim (k = 1) Permutations', () => {
    it('2.1 Lower edge sequence: KIM + 8S + 9S -> 7S-8S-9S', () => {
      const hand = parseTileHand('KIM 8S 9S 1T 2T 3T 4B 5B 6B 7T 8T 9T WX WX');
      const solutions = findWinningDecompositions({ hand });

      expect(solutions.length).toBeGreaterThan(0);
      const jia89 = solutions[0]!.melds.find(
        (m) => m.type === 'jia' && m.representedTiles.some((t) => t.type === 'sok' && t.value === 8)
      );
      expect(jia89).toBeDefined();
      expect(jia89!.representedTiles.map((t) => `${t.type}-${t.value}`)).toEqual([
        'sok-7',
        'sok-8',
        'sok-9',
      ]);
      expect(solutions[0]!.mode).toBe('K');
    });

    it('2.2 Middle edge sequence: 4T + KIM + 6T -> 4T-5T-6T', () => {
      const hand = parseTileHand('4T KIM 6T 1S 2S 3S 4B 5B 6B 7T 8T 9T WX WX');
      const solutions = findWinningDecompositions({ hand });

      expect(solutions.length).toBeGreaterThan(0);
      const jia46 = solutions[0]!.melds.find(
        (m) => m.type === 'jia' && m.representedTiles.some((t) => t.type === 'tong' && t.value === 4)
      );
      expect(jia46).toBeDefined();
      expect(jia46!.representedTiles.map((t) => `${t.type}-${t.value}`)).toEqual([
        'tong-4',
        'tong-5',
        'tong-6',
      ]);
      expect(solutions[0]!.mode).toBe('K');
    });

    it('2.3 Upper edge sequence: 7S + 8S + KIM -> 7S-8S-9S', () => {
      const hand = parseTileHand('7S 8S KIM 1T 2T 3T 4B 5B 6B 7T 8T 9T WX WX');
      const solutions = findWinningDecompositions({ hand });

      expect(solutions.length).toBeGreaterThan(0);
      const jia78 = solutions[0]!.melds.find(
        (m) => m.type === 'jia' && m.representedTiles.some((t) => t.type === 'sok' && t.value === 7)
      );
      expect(jia78).toBeDefined();
      expect(jia78!.representedTiles.map((t) => `${t.type}-${t.value}`)).toEqual([
        'sok-7',
        'sok-8',
        'sok-9',
      ]);
      expect(solutions[0]!.mode).toBe('K');
    });

    it('2.4 Concealed Triplet: 5T + 5T + KIM -> 5T-5T-5T', () => {
      const hand = parseTileHand('5T 5T KIM 1S 2S 3S 4B 5B 6B 7T 8T 9T WX WX');
      const solutions = findWinningDecompositions({ hand });

      expect(solutions.length).toBeGreaterThan(0);
      const pung5T = solutions
        .flatMap((s) => s.melds)
        .find(
          (m) =>
            m.type === 'pung' &&
            m.representedTiles.length === 3 &&
            m.representedTiles.every((t) => t.type === 'tong' && t.value === 5)
        );
      expect(pung5T).toBeDefined();
      expect(pung5T!.representedTiles.map((t) => `${t.type}-${t.value}`)).toEqual([
        'tong-5',
        'tong-5',
        'tong-5',
      ]);
      expect(solutions.some((s) => s.mode === 'K')).toBe(true);
    });

    it('2.5 Pair / Eye: 9S + KIM -> pair of 9S', () => {
      const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX WX 9S KIM');
      const solutions = findWinningDecompositions({ hand });

      expect(solutions.length).toBeGreaterThan(0);
      const pair = solutions[0]!.pair;
      expect(pair).toBeDefined();
      expect(pair!.representedTiles.map((t) => `${t.type}-${t.value}`)).toEqual([
        'sok-9',
        'sok-9',
      ]);
      expect(pair!.kimCount).toBe(1);
      expect(pair!.isKimCiok).toBe(false);
    });

    it('2.6 Tjit Tuei with 1 Kim pairing an odd singleton', () => {
      const hand = parseTileHand('1T 1T 3T 3T 5S 5S 7S 7S 2B 2B WX WX KIM DP');
      const solutions = solveSevenPairs(hand);

      expect(solutions.length).toBe(1);
      const sol = solutions[0]!;
      expect(sol.shape).toBe('seven_pairs');
      expect(sol.pairs?.length).toBe(7);
      expect(sol.wildcardAssignments.length).toBe(1);
      expect(sol.wildcardAssignments[0]?.representedTile.type).toBe('dragon');
      expect(sol.wildcardAssignments[0]?.representedTile.value).toBe(3); // DP
      expect(sol.mode).toBe('K');
    });

    it('2.7 Cap Sa Yau Kiu with 1 Kim substituting missing orphan', () => {
      const hand = parseTileHand('1T 9T 1S 9S 1B 9B WD WN WX WB DZ DF KIM 1T');
      const solutions = solveThirteenOrphans(hand);

      expect(solutions.length).toBe(1);
      const sol = solutions[0]!;
      expect(sol.shape).toBe('thirteen_orphans');
      expect(sol.wildcardAssignments.length).toBe(1);
      expect(sol.wildcardAssignments[0]?.representedTile.type).toBe('dragon');
      expect(sol.wildcardAssignments[0]?.representedTile.value).toBe(3); // DP
      expect(sol.mode).toBe('K');
    });

    it('2.8 Honor sequence rejected: WD + KIM + WX is not a sequence', () => {
      const hand = parseTileHand('WD KIM WX 1S 2S 3S 4B 5B 6B 7T 8T 9T 5T 6S');
      const solutions = findWinningDecompositions({ hand });
      expect(solutions).toHaveLength(0);
      expect(canFormWinningHandWithKim(hand)).toBe(false);
    });
  });

  describe('Group 3: Double Kim (k = 2) Permutations', () => {
    it('3.1 Kim Ciok: KIM + KIM as eye (Pattern #32)', () => {
      const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX WX KIM KIM');
      const solutions = findWinningDecompositions({ hand });

      expect(solutions.length).toBeGreaterThan(0);
      const kimCiokSol = solutions.find((s) => s.pair?.isKimCiok);
      expect(kimCiokSol).toBeDefined();
      expect(kimCiokSol!.pair?.kimCount).toBe(2);
      expect(kimCiokSol!.pair?.isKimCiok).toBe(true);
    });

    it('3.2 Double Kim lower edge: KIM + KIM + 9S -> 7S-8S-9S', () => {
      const hand = parseTileHand('KIM KIM 9S 1T 2T 3T 4B 5B 6B 7T 8T 9T WX WX');
      const solutions = findWinningDecompositions({ hand });

      expect(solutions.length).toBeGreaterThan(0);
      const seq = solutions
        .flatMap((s) => s.melds)
        .find(
          (m) =>
            m.type === 'jia' &&
            m.representedTiles.some((t) => t.type === 'sok' && t.value === 9)
        );
      expect(seq).toBeDefined();
      expect(seq!.representedTiles.map((t) => `${t.type}-${t.value}`)).toEqual([
        'sok-7',
        'sok-8',
        'sok-9',
      ]);
    });

    it('3.3 Double Kim upper edge: 3B + KIM + KIM -> 3B-4B-5B', () => {
      const hand = parseTileHand('3B KIM KIM 1T 2T 3T 4S 5S 6S 7T 8T 9T WX WX');
      const solutions = findWinningDecompositions({ hand });

      expect(solutions.length).toBeGreaterThan(0);
      const seq = solutions
        .flatMap((s) => s.melds)
        .find(
          (m) =>
            m.type === 'jia' &&
            m.representedTiles.some((t) => t.type === 'ban' && t.value === 3)
        );
      expect(seq).toBeDefined();
      expect(seq!.representedTiles.map((t) => `${t.type}-${t.value}`)).toEqual([
        'ban-3',
        'ban-4',
        'ban-5',
      ]);
    });

    it('3.4 Double Kim split-gap: KIM + 5T + KIM -> 4T-5T-6T', () => {
      const hand = parseTileHand('KIM 5T KIM 1S 2S 3S 4B 5B 6B 7T 8T 9T WX WX');
      const solutions = findWinningDecompositions({ hand });

      expect(solutions.length).toBeGreaterThan(0);
      const seq = solutions
        .flatMap((s) => s.melds)
        .find(
          (m) =>
            m.type === 'jia' &&
            m.representedTiles.some((t) => t.type === 'tong' && t.value === 4) &&
            m.representedTiles.some((t) => t.type === 'tong' && t.value === 5) &&
            m.representedTiles.some((t) => t.type === 'tong' && t.value === 6)
        );
      expect(seq).toBeDefined();
      expect(seq!.representedTiles.map((t) => `${t.type}-${t.value}`)).toEqual([
        'tong-4',
        'tong-5',
        'tong-6',
      ]);
    });

    it('3.5 Double Kim triplet: 5T + KIM + KIM -> 5T-5T-5T', () => {
      const hand = parseTileHand('5T KIM KIM 1S 2S 3S 4B 5B 6B 7T 8T 9T WX WX');
      const solutions = findWinningDecompositions({ hand });

      expect(solutions.length).toBeGreaterThan(0);
      const pung = solutions
        .flatMap((s) => s.melds)
        .find(
          (m) =>
            m.type === 'pung' &&
            m.representedTiles.every((t) => t.type === 'tong' && t.value === 5)
        );
      expect(pung).toBeDefined();
      expect(pung!.representedTiles.map((t) => `${t.type}-${t.value}`)).toEqual([
        'tong-5',
        'tong-5',
        'tong-5',
      ]);
    });

    it('3.6 Tjit Tuei with 2 singletons + 2 Kims', () => {
      const hand = parseTileHand('1T 1T 3T 3T 5S 5S 7S 7S 2B 2B 4B KIM 9S KIM');
      const solutions = solveSevenPairs(hand);

      expect(solutions.length).toBe(1);
      expect(solutions[0]!.pairs?.length).toBe(7);
      expect(solutions[0]!.wildcardAssignments.length).toBe(2);
    });

    it('3.7 Tjit Tuei with 6 natural pairs + KIM-KIM pair (Kim Ciok)', () => {
      const hand = parseTileHand('1T 1T 3T 3T 5S 5S 7S 7S 2B 2B WX WX KIM KIM');
      const solutions = solveSevenPairs(hand);

      expect(solutions.length).toBe(1);
      const kimPair = solutions[0]!.pairs?.find((p) => p.isKimCiok);
      expect(kimPair).toBeDefined();
      expect(kimPair!.kimCount).toBe(2);
    });
  });

  describe('Group 4: Triple Kim (k = 3) Permutations', () => {
    it('4.1 Kim Thi: KIM + KIM + KIM as standalone triplet (Pattern #30)', () => {
      const hand = parseTileHand('KIM KIM KIM 1T 2T 3T 4S 5S 6S 7B 8B 9B 2T 2T');
      const solutions = findWinningDecompositions({ hand });

      expect(solutions.length).toBeGreaterThan(0);
      const kimThi = solutions.find((s) =>
        s.melds.some((m) => m.type === 'kim_thi' || (m.type === 'pung' && m.kimCount === 3))
      );
      expect(kimThi).toBeDefined();
    });

    it('4.2 Kim Ciok (2 Kims) + 1 Kim completing a sequence', () => {
      const hand = parseTileHand('1T KIM 3T 4S 5S 6S 7B 8B 9B WX WX WX KIM KIM');
      const solutions = findWinningDecompositions({ hand });

      expect(solutions.length).toBeGreaterThan(0);
      const sol = solutions.find((s) => s.pair?.isKimCiok);
      expect(sol).toBeDefined();
      expect(sol!.totalKims).toBe(3);
    });
  });

  describe('Group 5: Quad Kim (k = 4) Permutations', () => {
    it('5.1 Shi Kim in completed hand (Pattern #9, 40 Tay K)', () => {
      // 14 tiles: 1T 2T KIM, 4S KIM 6S, 7B 8B 9B, KIM KIM (pair), WX WX (drawn tile WX completing WX-WX-WX)
      const hand = parseTileHand('1T 2T KIM 4S KIM 6S 7B 8B 9B KIM KIM WX WX WX');
      const solutions = findWinningDecompositions({ hand });

      expect(solutions.length).toBeGreaterThan(0);
      expect(solutions[0]!.totalKims).toBe(4);
    });

    it('5.2 Shi Kim instant Hu on broken hand (10 Tay)', () => {
      const hand = parseTileHand('1T 5T 9T 2S 6S WD WN DZ DF KIM KIM KIM 3B KIM');
      const solutions = findWinningDecompositions({ hand, isInstantHu: true });

      expect(solutions.length).toBe(1);
      expect(solutions[0]!.shape).toBe('shi_kim');
      expect(solutions[0]!.totalKims).toBe(4);
    });
  });

  describe('Group 6: Multi-Solution Arbitration & Deduplication', () => {
    it('6.1 Hand produces both sequence and triplet interpretations and deduplicates signatures', () => {
      // 2B 2B 2B 3B 4B KIM ... -> can be (2B-3B-4B) + pair(2B, KIM) OR (2B-2B-2B) + (3B-4B-KIM)
      const hand = parseTileHand('2B 2B 2B 3B 4B KIM 1T 2T 3T 4S 5S 6S WX WX');
      const solutions = findWinningDecompositions({ hand });

      expect(solutions.length).toBeGreaterThanOrEqual(2);

      const hasSequenceRep = solutions.some((s) =>
        s.melds.some((m) => m.type === 'jia' && m.representedTiles.some((t) => t.type === 'ban' && t.value === 2))
      );
      const hasTripletRep = solutions.some((s) =>
        s.melds.some((m) => m.type === 'pung' && m.representedTiles.some((t) => t.type === 'ban' && t.value === 2))
      );

      expect(hasSequenceRep).toBe(true);
      expect(hasTripletRep).toBe(true);

      // Verify no duplicate signatures
      const signatures = solutions.map((s) => s.signature);
      expect(new Set(signatures).size).toBe(signatures.length);
    });

    it('6.2 5th copy substitution: 4 natural 5T + KIM forms valid hand', () => {
      const hand = parseTileHand('5T 5T 5T 5T KIM 1S 2S 3S 4B 5B 6B WX WX WX');
      const solutions = findWinningDecompositions({ hand });

      expect(solutions.length).toBeGreaterThan(0);
      expect(canFormWinningHandWithKim(hand)).toBe(true);
    });
  });

  describe('Group 7: Open Melds Integration', () => {
    it('7.1 Solves concealed hand with 1 open meld (11 tiles)', () => {
      const concealed = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX');
      const openMeld: Meld = {
        type: 'pung',
        tiles: [makeTile('5T', 1), makeTile('5T', 2), makeTile('5T', 3)],
        claimedFrom: 'dong',
      };
      const solutions = findWinningDecompositions({ hand: concealed, melds: [openMeld] });

      expect(solutions.length).toBeGreaterThan(0);
      expect(solutions[0]!.melds.length).toBe(4);
      expect(solutions[0]!.melds.filter((m) => m.isOpen).length).toBe(1);
    });

    it('7.2 Solves concealed hand with 4 open melds (Tan Tiau single-tile wait)', () => {
      const concealed = parseTileHand('9S KIM');
      const openMelds: Meld[] = [
        { type: 'jia', tiles: [makeTile('1T', 1), makeTile('2T', 1), makeTile('3T', 1)], claimedFrom: 'bei' },
        { type: 'jia', tiles: [makeTile('4S', 1), makeTile('5S', 1), makeTile('6S', 1)], claimedFrom: 'dong' },
        { type: 'jia', tiles: [makeTile('7B', 1), makeTile('8B', 1), makeTile('9B', 1)], claimedFrom: 'nan' },
        { type: 'pung', tiles: [makeTile('WX', 1), makeTile('WX', 2), makeTile('WX', 3)], claimedFrom: 'dong' },
      ];

      const solutions = findWinningDecompositions({ hand: concealed, melds: openMelds });
      expect(solutions.length).toBeGreaterThan(0);
      expect(solutions[0]!.pair?.representedTiles[0]?.value).toBe(9);
    });
  });

  describe('Group 8: KIM_EDGE_CASES Conformance', () => {
    for (const c of KIM_EDGE_CASES) {
      it(`evaluates fixture edge case: ${c.label}`, () => {
        const mat = materializeHand(c.hand);
        const allConcealed = [...mat.concealed, mat.winningTile];

        if (c.hand.instantHu) {
          const solutions = findWinningDecompositions({
            hand: allConcealed,
            isInstantHu: true,
          });
          expect(solutions.length).toBe(1);
          expect(solutions[0]!.shape).toBe('shi_kim');
          return;
        }

        // Special shapes or unhu
        if (c.expectedOutcome === 'not-hu') {
          const solutions = findWinningDecompositions({
            hand: allConcealed,
            melds: mat.melds,
          });
          expect(solutions).toHaveLength(0);
        } else {
          const solutions = findWinningDecompositions({
            hand: mat.concealed,
            melds: mat.melds,
            winningTile: mat.winningTile,
            rules: c.hand.rules,
            isSelfDraw: mat.context.isSelfDraw,
          });
          expect(solutions.length).toBeGreaterThan(0);
        }
      });
    }
  });
});
