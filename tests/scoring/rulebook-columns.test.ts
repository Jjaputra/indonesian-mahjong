/**
 * Pins the DAFTAR TAY column placements read from BANDUNG MAHJONG CUP RULEBOOK ver06, pp. 8–10.
 * Text positions in the PDF: the "Ada KIM" column sits at x ≈ 491 pt and "Tidak ada KIM" at x ≈ 521 pt.
 * Rows with a single value are listed here with the column the value actually sits in.
 * The one deliberate deviation (#39) is asserted separately and documented in RULES.md.
 */
import { describe, it, expect } from 'vitest';
import { keyToTile, parseTileHand } from '@/core/tiles';
import { PATTERNS, baseTay, scoringEngine, type WinContext } from '@/scoring';

/** [id, Ada KIM, Tidak ada KIM] exactly as printed; null = blank cell. */
const PDF_TABLE: readonly [number, number | null, number | null][] = [
  [1, 0, 0], [2, 1, 1], [3, 3, 3], [4, 10, 10], [5, 20, 20], [6, 30, 30],
  [7, 1, null], [8, null, 3], [9, 40, null], [10, 20, 30], [11, 40, 60], [12, 40, 60],
  [13, 0, 0], [14, 3, 3], [15, 5, 10], [16, 10, 20], [17, 5, 10], [18, 20, 30],
  [19, 30, 40], [20, 40, 60], [21, 10, 20], [22, 30, 40], [23, 30, 40], [24, 50, 60],
  [25, 1, 1], [26, 1, 1], [27, 2, 2], [28, 1, 1], [29, 1, 1], [30, 30, null],
  [31, 1, 1], [32, 20, null], [33, 5, 5], [34, 20, 30], [35, 5, 5], [36, 5, 5],
  [37, 5, 5], [38, 30, 30],
  // #39: the printed 40 sits in the Ada KIM column (x ≈ 491) although the row text demands "tidak ada kim".
  [39, 40, null],
  [40, 5, null], [41, 5, 5], [42, 1, 1], [43, 1, 1], [44, 5, 5],
];

describe('DAFTAR TAY values match the PDF columns (pp. 8–10)', () => {
  it('covers all 44 rows', () => {
    expect(PDF_TABLE.map(([id]) => id)).toEqual([...PATTERNS.keys()].sort((a, b) => a - b));
  });

  for (const [id, k, nk] of PDF_TABLE) {
    if (id === 39) continue;
    it(`#${id} ${PATTERNS.get(id)!.name}: K=${k ?? '—'} NK=${nk ?? '—'}`, () => {
      expect(baseTay(id, 'K')).toBe(k);
      expect(baseTay(id, 'NK')).toBe(nk);
    });
  }

  it('#43 Mun is 1 Tay in both columns', () => {
    expect(baseTay(43, 'K')).toBe(1);
    expect(baseTay(43, 'NK')).toBe(1);
  });

  it('#39 Se Sam Pu Tat deviates on purpose: the engine scores the printed 40 for a Kim-free hand (NK)', () => {
    // The engine's K/NK mode is decided by Kim in the hand. A Se Sam Pu Tat hand cannot hold Kim, so the
    // printed column (Ada KIM) would make the pattern unreachable. See RULES.md "Se Sam Pu Tat column conflict".
    expect(baseTay(39, 'NK')).toBe(40);
    expect(baseTay(39, 'K')).toBeNull();
  });
});

describe('#43 Mun behaviour', () => {
  const hand = parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S');
  const ctx = (patch: Partial<WinContext>): WinContext => ({
    winningTile: keyToTile('5S', 2),
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
    ...patch,
  });

  it('a concealed hand winning on a discard scores Mun = 1, not Ce Mo or Ce Mo Pu Ciu Jen', () => {
    const r = scoringEngine.evaluateHand(hand, [], [], ctx({ discarderSeat: 'xi' }));
    const ids = r.patterns.map((p) => p.id);
    expect(r.patterns.find((p) => p.id === 43)?.tay).toBe(1);
    expect(ids).not.toContain(42);
    expect(ids).not.toContain(44);
  });

  it('a concealed self-draw is Ce Mo Pu Ciu Jen, not Mun', () => {
    const r = scoringEngine.evaluateHand(hand, [], [], ctx({ isSelfDraw: true, isDiscardWin: false }));
    const ids = r.patterns.map((p) => p.id);
    expect(ids).toContain(44);
    expect(ids).not.toContain(43);
  });
});
