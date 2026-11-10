import { describe, expect, it } from 'vitest';
import { keyToTile } from '@/core/tiles';
import type { Tile } from '@/core/types';
import {
  arbitrateKimDecompositions,
  evaluateBoKim,
  evaluateDecomposition,
  evaluateInstantHu,
  evaluateKimCiok,
  evaluateKimMode,
  evaluateKimThi,
  evaluatePyongPi,
  evaluateShiKim,
  evaluateTileKim,
} from '@/kim/kim-mode-evaluator';
import type { KimWinContext, SolvedHandDecomposition } from '@/kim/types';

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

describe('Kim Mode Evaluator & Dedicated Patterns (src/kim/kim-mode-evaluator.ts)', () => {
  describe('1. Bifurcated Mode Determination', () => {
    it('classifies hand with 0 Kims as NK mode and awards Bo KIM (+3 Tay)', () => {
      const decomp: SolvedHandDecomposition = {
        melds: [
          { type: 'jia', tiles: [makeTile('1T'), makeTile('2T'), makeTile('3T')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('4S'), makeTile('5S'), makeTile('6S')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('7B'), makeTile('8B'), makeTile('9B')], isConcealed: true, kimCount: 0 },
          { type: 'pung', tiles: [makeTile('WX'), makeTile('WX'), makeTile('WX')], isConcealed: true, kimCount: 0 },
        ],
        pair: { tiles: [makeTile('5T'), makeTile('5T')], isKimPair: false, isPyongPiPair: false, kimCount: 0 },
        kimUsages: [],
        totalKimCount: 0,
        wildcardKimCount: 0,
      };

      const result = evaluateDecomposition(decomp, makeContext('5T', false));
      expect(result.mode).toBe('NK');
      expect(result.isBoKimEligible).toBe(true);
      expect(result.patterns.map((p) => p.id)).toContain(8);
      expect(result.patterns.map((p) => p.id)).not.toContain(7);
      expect(result.kimTay).toBe(3);
    });

    it('classifies hand with 1 Kim wildcard as K mode and awards Tile KIM (+1 Tay)', () => {
      const decomp: SolvedHandDecomposition = {
        melds: [
          { type: 'jia', tiles: [makeTile('1T'), makeTile('KIM'), makeTile('3T')], isConcealed: true, kimCount: 1 },
          { type: 'jia', tiles: [makeTile('4S'), makeTile('5S'), makeTile('6S')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('7B'), makeTile('8B'), makeTile('9B')], isConcealed: true, kimCount: 0 },
          { type: 'pung', tiles: [makeTile('WX'), makeTile('WX'), makeTile('WX')], isConcealed: true, kimCount: 0 },
        ],
        pair: { tiles: [makeTile('5T'), makeTile('5T')], isKimPair: false, isPyongPiPair: false, kimCount: 0 },
        kimUsages: [{ tileId: 'kim-0-1', role: 'wildcard_meld' }],
        totalKimCount: 1,
        wildcardKimCount: 1,
      };

      const result = evaluateKimMode(decomp, makeContext('5T', false));
      expect(result.mode).toBe('K');
      expect(result.isBoKimEligible).toBe(false);
      expect(result.patterns.map((p) => p.id)).toContain(7);
      expect(result.patterns.map((p) => p.id)).not.toContain(8);
      expect(result.kimTay).toBe(1);
    });
  });

  describe('2. Pattern #7: Tile KIM', () => {
    it('awards 1 Tay per Kim tile present in K mode', () => {
      expect(evaluateTileKim(1, 'K')?.tay).toBe(1);
      expect(evaluateTileKim(2, 'K')?.tay).toBe(2);
      expect(evaluateTileKim(3, 'K')?.tay).toBe(3);
      expect(evaluateTileKim(4, 'K')?.tay).toBe(4);
    });

    it('returns null in NK mode or when Kim count is 0', () => {
      expect(evaluateTileKim(1, 'NK')).toBeNull();
      expect(evaluateTileKim(0, 'K')).toBeNull();
    });
  });

  describe('3. Pattern #8: Bo KIM', () => {
    it('awards 3 Tay in NK mode', () => {
      const boKim = evaluateBoKim('NK');
      expect(boKim).not.toBeNull();
      expect(boKim?.id).toBe(8);
      expect(boKim?.tay).toBe(3);
    });

    it('returns null in K mode', () => {
      expect(evaluateBoKim('K')).toBeNull();
    });
  });

  describe('4. Pattern #9: Shi Kim', () => {
    it('awards 40 Tay for 4 Kims in a completed hand', () => {
      const p = evaluateShiKim(4, false, 'K');
      expect(p).not.toBeNull();
      expect(p?.tay).toBe(40);
    });

    it('awards 10 Tay for 4 Kims declared as Instant Hu', () => {
      const p = evaluateShiKim(4, true, 'K');
      expect(p).not.toBeNull();
      expect(p?.tay).toBe(10);
    });

    it('returns null if Kim count is less than 4 or in NK mode', () => {
      expect(evaluateShiKim(3, false, 'K')).toBeNull();
      expect(evaluateShiKim(4, false, 'NK')).toBeNull();
    });

    it('evaluateInstantHu correctly evaluates 4 Kims instant Hu', () => {
      const tiles = [
        makeTile('1T'), makeTile('5T'), makeTile('9T'), makeTile('2S'),
        makeTile('6S'), makeTile('WD'), makeTile('WN'), makeTile('DZ'),
        makeTile('DF'), makeTile('KIM', 1), makeTile('KIM', 2), makeTile('KIM', 3),
        makeTile('3B'), makeTile('KIM', 4),
      ];
      const res = evaluateInstantHu(tiles, makeContext('KIM', true, true));
      expect(res.mode).toBe('K');
      expect(res.kimTay).toBe(10);
      expect(res.patterns[0]?.id).toBe(9);
    });

    it('evaluateInstantHu throws if not exactly 4 Kims or not instantHu', () => {
      const tiles = [makeTile('1T'), makeTile('KIM', 1)];
      expect(() => evaluateInstantHu(tiles, makeContext('1T', true, true))).toThrow();
    });
  });

  describe('5. Pattern #30: Kim Thi', () => {
    it('awards 30 Tay when 3 Kims form a pure triplet (KIM-KIM-KIM)', () => {
      const decomp: SolvedHandDecomposition = {
        melds: [
          { type: 'kim_thi', tiles: [makeTile('KIM', 1), makeTile('KIM', 2), makeTile('KIM', 3)], isConcealed: true, kimCount: 3 },
          { type: 'jia', tiles: [makeTile('1T'), makeTile('2T'), makeTile('3T')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('4S'), makeTile('5S'), makeTile('6S')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('7B'), makeTile('8B'), makeTile('9B')], isConcealed: true, kimCount: 0 },
        ],
        pair: { tiles: [makeTile('2T'), makeTile('2T')], isKimPair: false, isPyongPiPair: false, kimCount: 0 },
        kimUsages: [],
        totalKimCount: 3,
        wildcardKimCount: 3,
      };

      const p = evaluateKimThi(decomp, 'K');
      expect(p).not.toBeNull();
      expect(p?.tay).toBe(30);
    });

    it('rejects single Kim completing a natural Pung (5T 5T KIM)', () => {
      const decomp: SolvedHandDecomposition = {
        melds: [
          { type: 'pung', tiles: [makeTile('5T'), makeTile('5T'), makeTile('KIM', 1)], isConcealed: true, kimCount: 1 },
          { type: 'jia', tiles: [makeTile('1S'), makeTile('2S'), makeTile('3S')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('4B'), makeTile('5B'), makeTile('6B')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('7T'), makeTile('8T'), makeTile('9T')], isConcealed: true, kimCount: 0 },
        ],
        pair: { tiles: [makeTile('WX'), makeTile('WX')], isKimPair: false, isPyongPiPair: false, kimCount: 0 },
        kimUsages: [],
        totalKimCount: 1,
        wildcardKimCount: 1,
      };

      expect(evaluateKimThi(decomp, 'K')).toBeNull();
    });

    it('rejects 3 Kims scattered across different melds', () => {
      const decomp: SolvedHandDecomposition = {
        melds: [
          { type: 'jia', tiles: [makeTile('1T'), makeTile('KIM', 1), makeTile('3T')], isConcealed: true, kimCount: 1 },
          { type: 'jia', tiles: [makeTile('4S'), makeTile('KIM', 2), makeTile('6S')], isConcealed: true, kimCount: 1 },
          { type: 'jia', tiles: [makeTile('7B'), makeTile('8B'), makeTile('KIM', 3)], isConcealed: true, kimCount: 1 },
          { type: 'pung', tiles: [makeTile('WX'), makeTile('WX'), makeTile('WX')], isConcealed: true, kimCount: 0 },
        ],
        pair: { tiles: [makeTile('5T'), makeTile('5T')], isKimPair: false, isPyongPiPair: false, kimCount: 0 },
        kimUsages: [],
        totalKimCount: 3,
        wildcardKimCount: 3,
      };

      expect(evaluateKimThi(decomp, 'K')).toBeNull();
    });

    it('rejects in NK mode', () => {
      const decomp: SolvedHandDecomposition = {
        melds: [
          { type: 'kim_thi', tiles: [makeTile('KIM', 1), makeTile('KIM', 2), makeTile('KIM', 3)], isConcealed: true, kimCount: 3 },
        ],
        pair: { tiles: [makeTile('2T'), makeTile('2T')], kimCount: 0 },
        totalKimCount: 3,
        wildcardKimCount: 3,
      };
      expect(evaluateKimThi(decomp, 'NK')).toBeNull();
    });
  });

  describe('6. Pattern #32: Kim Ciok', () => {
    it('awards 20 Tay when 2 Kims form the pair (KIM-KIM eye)', () => {
      const decomp: SolvedHandDecomposition = {
        melds: [
          { type: 'jia', tiles: [makeTile('1T'), makeTile('2T'), makeTile('3T')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('4S'), makeTile('5S'), makeTile('6S')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('7B'), makeTile('8B'), makeTile('9B')], isConcealed: true, kimCount: 0 },
          { type: 'pung', tiles: [makeTile('WX'), makeTile('WX'), makeTile('WX')], isConcealed: true, kimCount: 0 },
        ],
        pair: { tiles: [makeTile('KIM', 1), makeTile('KIM', 2)], isKimPair: true, isPyongPiPair: false, kimCount: 2 },
        kimUsages: [],
        totalKimCount: 2,
        wildcardKimCount: 2,
      };

      const p = evaluateKimCiok(decomp, 'K');
      expect(p).not.toBeNull();
      expect(p?.tay).toBe(20);
    });

    it('rejects single Kim paired with natural tile (9S-KIM)', () => {
      const decomp: SolvedHandDecomposition = {
        melds: [
          { type: 'jia', tiles: [makeTile('1T'), makeTile('2T'), makeTile('3T')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('4S'), makeTile('5S'), makeTile('6S')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('7B'), makeTile('8B'), makeTile('9B')], isConcealed: true, kimCount: 0 },
          { type: 'pung', tiles: [makeTile('WX'), makeTile('WX'), makeTile('WX')], isConcealed: true, kimCount: 0 },
        ],
        pair: { tiles: [makeTile('9S'), makeTile('KIM', 1)], isKimPair: false, isPyongPiPair: false, kimCount: 1 },
        kimUsages: [],
        totalKimCount: 1,
        wildcardKimCount: 1,
      };

      expect(evaluateKimCiok(decomp, 'K')).toBeNull();
    });

    it('rejects in NK mode', () => {
      const decomp: SolvedHandDecomposition = {
        melds: [],
        pair: { tiles: [makeTile('KIM', 1), makeTile('KIM', 2)], kimCount: 2 },
        totalKimCount: 2,
        wildcardKimCount: 2,
      };
      expect(evaluateKimCiok(decomp, 'NK')).toBeNull();
    });
  });

  describe('7. Pattern #40: Pyong Pi', () => {
    it('awards 5 Tay when self-drawn winning tile pairs with lone Kim in hand', () => {
      const decomp: SolvedHandDecomposition = {
        melds: [
          { type: 'jia', tiles: [makeTile('1T'), makeTile('2T'), makeTile('3T')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('4S'), makeTile('5S'), makeTile('6S')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('7B'), makeTile('8B'), makeTile('9B')], isConcealed: true, kimCount: 0 },
          { type: 'pung', tiles: [makeTile('WX'), makeTile('WX'), makeTile('WX')], isConcealed: true, kimCount: 0 },
        ],
        pair: { tiles: [makeTile('9S'), makeTile('KIM', 1)], isKimPair: false, isPyongPiPair: true, kimCount: 1 },
        kimUsages: [],
        totalKimCount: 1,
        wildcardKimCount: 1,
      };

      const ctx = makeContext('9S', true);
      const p = evaluatePyongPi(decomp, ctx, 'K');
      expect(p).not.toBeNull();
      expect(p?.tay).toBe(5);
    });

    it('rejects discard win (Ron) even if tile pairs with Kim', () => {
      const decomp: SolvedHandDecomposition = {
        melds: [
          { type: 'jia', tiles: [makeTile('1T'), makeTile('2T'), makeTile('3T')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('4S'), makeTile('5S'), makeTile('6S')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('7B'), makeTile('8B'), makeTile('9B')], isConcealed: true, kimCount: 0 },
          { type: 'pung', tiles: [makeTile('WX'), makeTile('WX'), makeTile('WX')], isConcealed: true, kimCount: 0 },
        ],
        pair: { tiles: [makeTile('9S'), makeTile('KIM', 1)], isKimPair: false, isPyongPiPair: false, kimCount: 1 },
        kimUsages: [],
        totalKimCount: 1,
        wildcardKimCount: 1,
      };

      const ctx = makeContext('9S', false); // Ron discard
      expect(evaluatePyongPi(decomp, ctx, 'K')).toBeNull();
    });

    it('rejects self-drawn tile completing sequence while Kim pair already held', () => {
      const decomp: SolvedHandDecomposition = {
        melds: [
          { type: 'jia', tiles: [makeTile('1T'), makeTile('2T'), makeTile('3T')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('4S'), makeTile('5S'), makeTile('6S')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('7B'), makeTile('8B'), makeTile('9B')], isConcealed: true, kimCount: 0 },
          { type: 'pung', tiles: [makeTile('WX'), makeTile('WX'), makeTile('WX')], isConcealed: true, kimCount: 0 },
        ],
        pair: { tiles: [makeTile('9S'), makeTile('KIM', 1)], isKimPair: false, isPyongPiPair: false, kimCount: 1 },
        kimUsages: [],
        totalKimCount: 1,
        wildcardKimCount: 1,
      };

      const ctx = makeContext('3T', true); // Winning tile was 3T in sequence, not 9S
      expect(evaluatePyongPi(decomp, ctx, 'K')).toBeNull();
    });
  });

  describe('8. Multi-Solution Arbitration & Stacking', () => {
    it('arbitrates to Kim Ciok (20 Tay) over sequence wildcard (0 extra Tay)', () => {
      const decompA: SolvedHandDecomposition = {
        melds: [
          { type: 'jia', tiles: [makeTile('1T'), makeTile('KIM', 1), makeTile('3T')], isConcealed: true, kimCount: 1 },
          { type: 'jia', tiles: [makeTile('4S'), makeTile('KIM', 2), makeTile('6S')], isConcealed: true, kimCount: 1 },
          { type: 'jia', tiles: [makeTile('7B'), makeTile('8B'), makeTile('9B')], isConcealed: true, kimCount: 0 },
          { type: 'pung', tiles: [makeTile('WX'), makeTile('WX'), makeTile('WX')], isConcealed: true, kimCount: 0 },
        ],
        pair: { tiles: [makeTile('5T'), makeTile('5T')], isKimPair: false, isPyongPiPair: false, kimCount: 0 },
        kimUsages: [],
        totalKimCount: 2,
        wildcardKimCount: 2,
      };

      const decompB: SolvedHandDecomposition = {
        melds: [
          { type: 'jia', tiles: [makeTile('1T'), makeTile('2T'), makeTile('3T')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('4S'), makeTile('5S'), makeTile('6S')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('7B'), makeTile('8B'), makeTile('9B')], isConcealed: true, kimCount: 0 },
          { type: 'pung', tiles: [makeTile('WX'), makeTile('WX'), makeTile('WX')], isConcealed: true, kimCount: 0 },
        ],
        pair: { tiles: [makeTile('KIM', 1), makeTile('KIM', 2)], isKimPair: true, isPyongPiPair: false, kimCount: 2 },
        kimUsages: [],
        totalKimCount: 2,
        wildcardKimCount: 2,
      };

      const best = arbitrateKimDecompositions([decompA, decompB], makeContext('WX', false));
      expect(best.patterns.map((p) => p.id)).toContain(32);
      expect(best.patterns.map((p) => p.id)).toContain(7);
      expect(best.kimTay).toBe(22); // 20 (Kim Ciok) + 2 (Tile KIM)
    });

    it('arbitrates to Kim Thi (30 Tay) over 3 sequence wildcards', () => {
      const decompA: SolvedHandDecomposition = {
        melds: [
          { type: 'jia', tiles: [makeTile('1T'), makeTile('KIM', 1), makeTile('3T')], isConcealed: true, kimCount: 1 },
          { type: 'jia', tiles: [makeTile('4S'), makeTile('KIM', 2), makeTile('6S')], isConcealed: true, kimCount: 1 },
          { type: 'jia', tiles: [makeTile('7B'), makeTile('8B'), makeTile('KIM', 3)], isConcealed: true, kimCount: 1 },
          { type: 'pung', tiles: [makeTile('WX'), makeTile('WX'), makeTile('WX')], isConcealed: true, kimCount: 0 },
        ],
        pair: { tiles: [makeTile('2T'), makeTile('2T')], kimCount: 0 },
        totalKimCount: 3,
        wildcardKimCount: 3,
      };

      const decompB: SolvedHandDecomposition = {
        melds: [
          { type: 'kim_thi', tiles: [makeTile('KIM', 1), makeTile('KIM', 2), makeTile('KIM', 3)], isConcealed: true, kimCount: 3 },
          { type: 'jia', tiles: [makeTile('1T'), makeTile('2T'), makeTile('3T')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('4S'), makeTile('5S'), makeTile('6S')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('7B'), makeTile('8B'), makeTile('9B')], isConcealed: true, kimCount: 0 },
        ],
        pair: { tiles: [makeTile('2T'), makeTile('2T')], kimCount: 0 },
        totalKimCount: 3,
        wildcardKimCount: 3,
      };

      const best = arbitrateKimDecompositions([decompA, decompB], makeContext('2T', false));
      expect(best.patterns.map((p) => p.id)).toContain(30);
      expect(best.patterns.map((p) => p.id)).toContain(7);
      expect(best.kimTay).toBe(33); // 30 (Kim Thi) + 3 (Tile KIM)
    });

    it('arbitrates Pyong Pi correctly: 5 Tay (#40) + 1 Tay (#7) = 6 Tay', () => {
      const decomp: SolvedHandDecomposition = {
        melds: [
          { type: 'jia', tiles: [makeTile('1T'), makeTile('2T'), makeTile('3T')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('4S'), makeTile('5S'), makeTile('6S')], isConcealed: true, kimCount: 0 },
          { type: 'jia', tiles: [makeTile('7B'), makeTile('8B'), makeTile('9B')], isConcealed: true, kimCount: 0 },
          { type: 'pung', tiles: [makeTile('WX'), makeTile('WX'), makeTile('WX')], isConcealed: true, kimCount: 0 },
        ],
        pair: { tiles: [makeTile('9S'), makeTile('KIM', 1)], kimCount: 1 },
        totalKimCount: 1,
        wildcardKimCount: 1,
      };

      const best = arbitrateKimDecompositions([decomp], makeContext('9S', true));
      expect(best.patterns.map((p) => p.id)).toContain(40);
      expect(best.patterns.map((p) => p.id)).toContain(7);
      expect(best.kimTay).toBe(6); // 5 (Pyong Pi) + 1 (Tile KIM)
    });

    it('arbitrateKimDecompositions throws on empty array', () => {
      expect(() => arbitrateKimDecompositions([], makeContext('1T', false))).toThrow();
    });
  });
});
