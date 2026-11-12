import { describe, it, expect } from 'vitest';
import { keyToTile, parseTileHand } from '@/core/tiles';
import { scoringEngine } from '@/scoring';
import type { HuOutcome } from '@/ui/game-controller';
import { getTileFace } from '@/ui/labels';
import {
  ALL_PATTERNS,
  PATTERN_GROUPS,
  buildCalculatorReceipt,
  buildHuReceipt,
  calculateTay,
  classifyHand,
  isSelectable,
  searchPatterns,
} from '@/ui/tay-calculator';
import { toScoringOverlap } from '@/ui/win-context';

// v0.1 brief table (null = "—"), used to cross-check the calculator data source.
const V01: [number, string, number | null, number | null][] = [
  [1, 'Tile Bunga', 0, 0], [2, 'Tile Musim', 1, 1], [3, 'Bo Hua Zi', 3, 3], [4, '4 Tiles Bunga', 10, 10],
  [5, '4 Tiles Musim', 20, 20], [6, '7 Tiles Bunga/Musim', 30, 30], [7, 'Tile KIM', 1, null], [8, 'Bo KIM', null, 3],
  [9, 'Shi Kim', 40, null], [10, 'Pao Chin', 20, 30], [11, 'Thien Fu', 40, 60], [12, 'Thi Fu', 40, 60],
  [13, 'Chicken Hand', 0, 0], [14, 'Ping Fu', 3, 3], [15, 'Tuei Tuei', 5, 10], [16, 'Tjit Tuei', 10, 20],
  [17, 'Chao It', 5, 10], [18, 'It Set', 20, 30], [19, 'Yau Kiu', 30, 40], [20, 'Cap Sa Yau Kiu', 40, 60],
  [21, 'Siau San Yen', 10, 20], [22, 'Ta San Yen', 30, 40], [23, 'Siau Se Si', 30, 40], [24, 'Ta Se Si', 50, 60],
  [25, 'Tris Angin Duduk', 1, 1], [26, 'Tris Angin Putaran', 1, 1], [27, 'Tris Zhong', 2, 2], [28, 'Tris Fat', 1, 1],
  [29, 'Tris Pat', 1, 1], [30, 'Kim Thi', 30, null], [31, 'Ji Pa Ciok', 1, 1], [32, 'Kim Ciok', 20, null],
  [33, 'Sam Am Kang', 5, 5], [34, 'Si Am Kang', 20, 30], [35, 'Chiong Kong', 5, 5], [36, 'Ce Chiong Kong', 5, 5],
  [37, 'Kong Song Hu/Mo', 5, 5], [38, 'Kong Kong Hu', 30, 30], [39, 'Se Sam Pu Tat', null, 40], [40, 'Pyong Pi', 5, null],
  [41, 'Tan Tiau', 5, 5], [42, 'Ce Mo', 1, 1], [43, 'Mun', 1, 1], [44, 'Ce Mo Pu Ciu Jen', 5, 5],
];

describe('Tay calculator data', () => {
  it('matches the v0.1 brief table for all 44 patterns', () => {
    expect(ALL_PATTERNS).toHaveLength(44);
    for (const [id, name, K, NK] of V01) {
      const p = ALL_PATTERNS.find((x) => x.id === id)!;
      expect([p.name, p.K, p.NK]).toEqual([name, K, NK]);
    }
  });

  it('groups cover each pattern exactly once', () => {
    const ids = PATTERN_GROUPS.flatMap((g) => g.ids).sort((a, b) => a - b);
    expect(ids).toEqual(ALL_PATTERNS.map((p) => p.id));
  });

  it('"—" patterns are not selectable in that mode', () => {
    // House rule, player feedback 2026-11-12: Bo KIM +3 is available in both columns.
    expect(isSelectable(8, true)).toBe(true);
    expect(isSelectable(8, false)).toBe(true);
    expect(isSelectable(9, false)).toBe(false);
    expect(isSelectable(39, true)).toBe(true);
  });
});

describe('calculateTay', () => {
  it('sums the active column and applies the minimum Hu check', () => {
    const nk = calculateTay([14, 8, 43], false, 5);
    expect(nk.total).toBe(7);
    expect(nk.meetsMinimum).toBe(true);
    expect(nk.statusText).toBe('Cukup Tay · 7 ≥ 5. Bukan vonis Hu — susunan kartu dan aturan meja tetap menentukan.');
    expect(nk.statusText).not.toContain('MEMENUHI SYARAT HU');

    const k = calculateTay([14, 8, 43], true, 5);
    expect(k.mode).toBe('K');
    // House rule, player feedback 2026-11-12: include Bo KIM +3 in Ada KIM too.
    expect(k.ignoredIds).toEqual([]);
    expect(k.total).toBe(7);
    expect(k.meetsMinimum).toBe(true);
    expect(k.statusText).toBe('Cukup Tay · 7 ≥ 5. Bukan vonis Hu — susunan kartu dan aturan meja tetap menentukan.');
  });

  it('drops superseded patterns under the rulebook policy and keeps them when cumulative', () => {
    const exclusive = calculateTay([12, 10], false, 5);
    expect(exclusive.total).toBe(60);
    expect(exclusive.removedIds).toEqual([10]);
    expect(exclusive.lines.map((line) => line.id)).toEqual([12]);
    expect(exclusive.statusText).toContain('Pola digantikan: #10');
    expect(exclusive.statusText).toContain('Bukan vonis Hu');

    const cumulative = calculateTay([12, 10], false, 5, { overlapPolicy: 'cumulative' });
    expect(cumulative.total).toBe(90);
    expect(cumulative.removedIds).toEqual([]);
  });

  it('uses the instant value for pattern 6 and the completed value otherwise', () => {
    const instant = calculateTay([6], false, 15, { instant: true });
    expect(instant.total).toBe(10);
    expect(instant.meetsMinimum).toBe(false);
    expect(instant.instant).toBe(true);

    const completed = calculateTay([6], false, 15);
    expect(completed.total).toBe(30);
    expect(completed.meetsMinimum).toBe(true);

    const mixed = calculateTay([6, 14], false, 5, { instant: true });
    expect(mixed.total).toBe(10);
    expect(mixed.ignoredIds).toEqual([14]);
  });

  it('scores explicit flower and season counts with seat matches', () => {
    const exact = calculateTay([1, 2], false, 5, {
      bonus: { flowers: 2, flowerSeatMatches: 1, seasons: 3, seasonSeatMatches: 1 },
    });
    expect(exact.lines).toEqual([
      { id: 1, name: 'Tile Bunga', tay: 1 },
      { id: 2, name: 'Tile Musim', tay: 4 },
    ]);
    expect(exact.total).toBe(5);

    expect(calculateTay([2], false, 5).lines[0]?.tay).toBe(1);
    expect(calculateTay([1], false, 0, { bonus: { flowers: 4, flowerSeatMatches: 9 } }).lines[0]?.tay).toBe(4);
  });

  it('ignores duplicates and unknown ids', () => {
    expect(calculateTay([18, 18, 99], false, 5).total).toBe(30);
  });

  it('receipt lists lines, total and status', () => {
    const text = buildCalculatorReceipt(calculateTay([16, 31], true, 5));
    expect(text).toContain('Ada Kim');
    expect(text).toContain('#16 Tjit Tuei: 10 Tay');
    expect(text).toContain('Total: 11 Tay');
  });

  it('search matches name, number and Keterangan', () => {
    expect(searchPatterns('ping').map((p) => p.id)).toEqual([14]);
    expect(searchPatterns('#20').map((p) => p.id)).toEqual([20]);
    expect(searchPatterns('naga').map((p) => p.id)).toEqual(expect.arrayContaining([21, 22, 27]));
    expect(searchPatterns('')).toHaveLength(44);
  });
});

describe('Hu receipt', () => {
  it('includes winner, method, mode, every pattern and the 5-Tay check', () => {
    const hand = parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S');
    const winningTile = keyToTile('5S', 2);
    const flowers = [keyToTile('F2')];
    const scoring = scoringEngine.evaluateHand(
      hand,
      [],
      flowers,
      {
        winningTile,
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
      },
      { kimEnabled: true, kimDiscardAllowed: false, allowKimInMeldClaim: false, minHuTay: 5 }
    );
    const outcome: HuOutcome = {
      kind: 'hu',
      winner: 'nan',
      winningTile,
      winMethod: 'ron',
      discarder: 'dong',
      hand: [...hand, winningTile],
      melds: [],
      flowers,
      scoring,
      durationSeconds: 90,
    };
    const text = buildHuReceipt(outcome);
    expect(text).toContain('Bot Kanan');
    expect(text).toContain('Buangan');
    expect(text).toContain('Tanpa Kim');
    for (const p of scoring.patterns) expect(text).toContain(`#${p.id} ${p.name}: ${p.tay} Tay`);
    expect(text).toContain(`HU SAH ✓ (${scoring.totalTay} ≥ 5 Tay)`);
    expect(classifyHand(scoring)).toContain('standar');
  });
});

describe('labels', () => {
  it('tile faces for every family incl. Bunga/Musim and the gold KIM', () => {
    expect(getTileFace(keyToTile('5T')).tone).toBe('tong');
    expect(getTileFace(keyToTile('DZ')).main).toBe('中');
    expect(getTileFace(keyToTile('WB')).sub).toBe('Bei');
    expect(getTileFace(keyToTile('F3')).sub).toBe('Bunga 3');
    expect(getTileFace(keyToTile('M4')).sub).toBe('Musim 4');
    expect(getTileFace(keyToTile('KIM'))).toMatchObject({ tone: 'kim', sub: 'KIM' });
  });

  it('overlap policy maps storage → scoring', () => {
    expect(toScoringOverlap('rulebook_exclusive')).toBe('supersede');
    expect(toScoringOverlap('cumulative')).toBe('additive');
  });
});
