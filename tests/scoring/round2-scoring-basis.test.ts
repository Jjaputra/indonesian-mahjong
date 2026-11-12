/**
 * Round 2: table column basis (hand Kim usage vs match table) and the individual flower/season rule.
 * Low-level scorer calls without the new options must keep the PDF / legacy semantics.
 */
import { describe, expect, it } from 'vitest';
import { keyToTile, parseTileHand } from '@/core/tiles';
import type { BonusTileRule, GameRules, ScoringBasis, Seat, Tile } from '@/core/types';
import { PRINTED_PLACEMENT, scoringEngine, tableTay, type ScoringResult } from '@/scoring';
import { handReadingLine } from '@/ui/hand-reading';
import { buildWinContext } from '@/ui/win-context';
import { calculateTay, isSelectable } from '@/ui/tay-calculator';

const LEGACY: GameRules = { kimEnabled: true, kimDiscardAllowed: false, allowKimInMeldClaim: false, minHuTay: 5 };

function rules(kimEnabled: boolean, scoringBasis?: ScoringBasis, bonusTileRule?: BonusTileRule): GameRules {
  return { ...LEGACY, kimEnabled, ...(scoringBasis ? { scoringBasis } : {}), ...(bonusTileRule ? { bonusTileRule } : {}) };
}

function score(hand: string, win: Tile, r: GameRules, opts: { flowers?: Tile[]; seat?: Seat; selfDraw?: boolean } = {}): ScoringResult {
  const ctx = buildWinContext(opts.seat ?? 'nan', 'dong', win, {
    isSelfDraw: opts.selfDraw ?? false,
    isRobbingKong: false,
    consecutiveKongs: 0,
    isFirstGoAround: false,
    isPaoChin: false,
  });
  return scoringEngine.evaluateHand(parseTileHand(hand), [], opts.flowers ?? [], ctx, r);
}

const tay = (r: ScoringResult, id: number) => r.patterns.find((p) => p.id === id)?.tay;
const ids = (r: ScoringResult) => r.patterns.map((p) => p.id);

// Tuei Tuei (all triplets), concealed, won on a discard: #15 is 5 (K) / 10 (NK).
const TUEI = '1T 1T 1T 5S 5S 5S 9B 9B 9B 3T 3T 3T 7S';
const TUEI_WIN = keyToTile('7S', 2);
// Same shape with one Kim standing in for a 9B.
const TUEI_KIM = '1T 1T 1T 5S 5S 5S 9B 9B KIM 3T 3T 3T 7S';
// Se Sam Pu Tat: no pair, suited tiles at least 3 apart, all different honours.
const SSPT = '1T 4T 7T 1S 4S 7S 1B 4B 7B WD WN WX WB';
const SSPT_WIN = keyToTile('DZ');

describe('Round 2 · match with Kim, hand holds zero Kim', () => {
  it('legacy hand usage (no option) reads Tanpa Kim: Tuei Tuei 10 and Bo KIM 3', () => {
    const r = score(TUEI, TUEI_WIN, LEGACY);
    expect(r.scoringBasis).toBe('hand_kim_usage');
    expect(r.mode).toBe('NK');
    expect(r.handKimCount).toBe(0);
    expect(r.isWithKim).toBe(false);
    expect(tay(r, 15)).toBe(10);
    expect(tay(r, 8)).toBe(3);
    expect(r.notes).toEqual([]);
  });

  it('match table reads Ada Kim for the whole match: Tuei Tuei 5, no #7 and Bo KIM 3', () => {
    const r = score(TUEI, TUEI_WIN, rules(true, 'match_table'));
    expect(r.scoringBasis).toBe('match_table');
    expect(r.mode).toBe('K');
    expect(r.handKimCount).toBe(0);
    expect(r.isWithKim).toBe(false);
    expect(tay(r, 15)).toBe(5);
    expect(ids(r)).not.toContain(7); // no zero-Kim "Tile KIM" line just because the K column is active
    expect(tay(r, 8)).toBe(3); // Player-confirmed override of the blank PDF cell
    expect(r.notes.join(' ')).toContain('+3 Tay');
    // Four concealed triplets also read #34 Si Am Kang from Ada KIM (20 instead of 30).
    const legacy = score(TUEI, TUEI_WIN, LEGACY);
    expect(tay(legacy, 34)).toBe(30);
    expect(tay(r, 34)).toBe(20);
    expect(r.totalTay).toBe(legacy.totalTay - 5 - 10);
  });
});

describe('Round 2 · hand that uses Kim', () => {
  it('both bases agree when the hand holds Kim in a Kim match', () => {
    const legacy = score(TUEI_KIM, TUEI_WIN, LEGACY);
    const table = score(TUEI_KIM, TUEI_WIN, rules(true, 'match_table'));
    for (const r of [legacy, table]) {
      expect(r.isValidHu || r.lewFitReason === 'below-minimum').toBe(true);
      expect(r.mode).toBe('K');
      expect(r.handKimCount).toBe(1);
      expect(tay(r, 7)).toBe(1);
      expect(tay(r, 15)).toBe(5);
      expect(ids(r)).not.toContain(8);
    }
    expect(table.totalTay).toBe(legacy.totalTay);
    expect(table.notes).toEqual([]);
  });
});

describe('Round 2 · match without Kim', () => {
  it('match table in a Kim-off match reads Tanpa Kim, same values as legacy for a Kim-free hand', () => {
    const legacy = score(TUEI, TUEI_WIN, rules(false));
    const table = score(TUEI, TUEI_WIN, rules(false, 'match_table'));
    expect(table.mode).toBe('NK');
    expect(tay(table, 15)).toBe(10);
    expect(tay(table, 8)).toBe(3);
    expect(table.patterns).toEqual(legacy.patterns);
    expect(table.notes).toEqual([]);
  });
});

describe('Round 2 · #39 Se Sam Pu Tat printed placement', () => {
  it('printed cell is K 40 / NK blank; the hand-usage table keeps the documented NK 40', () => {
    expect(PRINTED_PLACEMENT.get(39)).toEqual({ K: 40, NK: null });
    expect(tableTay(39, 'K', 'match_table')).toBe(40);
    expect(tableTay(39, 'NK', 'match_table')).toBeNull();
    expect(tableTay(39, 'NK')).toBe(40);
    expect(tableTay(39, 'K')).toBeNull();
    // Every other row is identical under both bases.
    for (let id = 1; id <= 44; id++) {
      if (id === 39) continue;
      for (const col of ['K', 'NK'] as const) expect(tableTay(id, col, 'match_table')).toBe(tableTay(id, col));
    }
  });

  it('legacy: a Se Sam Pu Tat hand scores 40 from the NK column', () => {
    const r = score(SSPT, SSPT_WIN, LEGACY);
    expect(r.decomposition?.shape).toBe('se_sam_pu_tat');
    expect(r.mode).toBe('NK');
    expect(tay(r, 39)).toBe(40);
  });

  it('match table, Kim match: the printed Ada KIM 40 applies to the Kim-free hand', () => {
    const r = score(SSPT, SSPT_WIN, rules(true, 'match_table'));
    expect(r.mode).toBe('K');
    expect(r.handKimCount).toBe(0);
    expect(tay(r, 39)).toBe(40);
    expect(r.isValidHu).toBe(true);
  });

  it('match table, Kim-off match: the printed Tanpa KIM cell is blank, so #39 scores nothing and the note says so', () => {
    const r = score(SSPT, SSPT_WIN, rules(false, 'match_table'));
    expect(r.mode).toBe('NK');
    expect(ids(r)).not.toContain(39);
    expect(r.notes.join(' ')).toContain('Se Sam Pu Tat');
    expect(r.isValidHu).toBe(false);
    expect(r.lewFitReason).toBe('below-minimum');
  });
});

describe('Round 2 · individual flower/season rule', () => {
  const CHICKEN = '1T 2T 3T 4S 5S 6S 7B 8B 9B WN WN WN 4T';
  const CHICKEN_WIN = keyToTile('4T', 2);
  const bonus = [keyToTile('F2'), keyToTile('M1'), keyToTile('M2'), keyToTile('M3')];

  it('without the option the PDF per-tile values apply: Bunga 0 + own 1; Musim 1 each + own 1', () => {
    const r = score(CHICKEN, CHICKEN_WIN, LEGACY, { flowers: bonus, seat: 'nan' });
    expect(r.bonusTileRule).toBe('rulebook_per_tile');
    expect(tay(r, 1)).toBe(1);
    expect(tay(r, 2)).toBe(4);
  });

  it('own-seat-only: each own-seat tile +1, every off-seat tile 0', () => {
    const r = score(CHICKEN, CHICKEN_WIN, rules(true, undefined, 'own_seat_only'), { flowers: bonus, seat: 'nan' });
    expect(r.bonusTileRule).toBe('own_seat_only');
    expect(tay(r, 1)).toBe(1);
    expect(tay(r, 2)).toBe(1);
    expect(r.patterns.find((p) => p.id === 2)?.description).toContain('2 posisi lain (0)');
  });

  it('own-seat-only: off-seat tiles alone score 0 but stay listed', () => {
    const r = score(CHICKEN, CHICKEN_WIN, rules(true, undefined, 'own_seat_only'), {
      flowers: [keyToTile('F1'), keyToTile('M3')],
      seat: 'nan',
    });
    expect(tay(r, 1)).toBe(0);
    expect(tay(r, 2)).toBe(0);
  });

  it('collection awards (#5 four seasons) are kept under both rules', () => {
    const seasons = [keyToTile('M1'), keyToTile('M2'), keyToTile('M3'), keyToTile('M4')];
    const pdf = score(CHICKEN, CHICKEN_WIN, LEGACY, { flowers: seasons, seat: 'xi' });
    const house = score(CHICKEN, CHICKEN_WIN, rules(true, undefined, 'own_seat_only'), { flowers: seasons, seat: 'xi' });
    expect(tay(pdf, 5)).toBe(20);
    expect(tay(house, 5)).toBe(20);
    expect(tay(pdf, 2)).toBe(5);
    expect(tay(house, 2)).toBe(1);
  });

  it('the bonus rule is independent of the table basis', () => {
    for (const basis of ['hand_kim_usage', 'match_table'] as const) {
      const r = score(CHICKEN, CHICKEN_WIN, rules(true, basis, 'own_seat_only'), { flowers: bonus, seat: 'nan' });
      expect(tay(r, 1)).toBe(1);
      expect(tay(r, 2)).toBe(1);
    }
  });
});

describe('Round 2 · instant Hu reports the column in use', () => {
  it('match table sets the column even for an instant Hu', () => {
    const seven = ['F1', 'F2', 'F3', 'F4', 'M1', 'M2', 'M3'].map((k) => keyToTile(k));
    const ctx = { ...buildWinContext('dong', 'dong', keyToTile('1T'), { isSelfDraw: true, isRobbingKong: false, consecutiveKongs: 0, isFirstGoAround: false, isPaoChin: false }), isInstantHu: true };
    const r = scoringEngine.evaluateHand(parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WN WN WN 4T'), [], seven, ctx, rules(true, 'match_table'));
    expect(r.isValidHu).toBe(true);
    expect(r.mode).toBe('K');
    expect(r.handKimCount).toBe(0);
  });
});

describe('Round 2 · hand preview and calculator agree with live scoring', () => {
  it('hand-reading line uses the active basis', () => {
    const base = {
      hand: parseTileHand(TUEI),
      winningTile: TUEI_WIN,
      melds: [],
      flowers: [],
      seat: 'nan' as const,
      roundWind: 'dong' as const,
      flags: { isSelfDraw: false },
      minHuTay: 5,
    };
    const legacy = score(TUEI, TUEI_WIN, LEGACY).totalTay;
    const table = score(TUEI, TUEI_WIN, rules(true, 'match_table')).totalTay;
    expect(handReadingLine({ ...base, rules: { ...LEGACY, allowKimInPair: true, allowKimInPung: true, allowKimInJia: true, allowKimInTriplet: true } })).toBe(`Hu dengan tile ini: ${legacy} Tay.`);
    expect(handReadingLine({ ...base, rules: { ...rules(true, 'match_table'), allowKimInPair: true, allowKimInPung: true, allowKimInJia: true, allowKimInTriplet: true } })).toBe(`Hu dengan tile ini: ${table} Tay.`);
    expect(table).not.toBe(legacy);
  });

  it('calculator #39 follows the basis: NK under hand usage, printed K under the match table', () => {
    expect(isSelectable(39, false)).toBe(true);
    expect(isSelectable(39, true)).toBe(false);
    expect(isSelectable(39, true, false, 'match_table')).toBe(true);
    expect(isSelectable(39, false, false, 'match_table')).toBe(false);
    expect(calculateTay([39], true, 5, { scoringBasis: 'match_table' }).total).toBe(40);
  });

  it('calculator flower lines match the engine under both rules', () => {
    const counts = { flowers: 1, flowerSeatMatches: 1, seasons: 3, seasonSeatMatches: 1 };
    const pdf = calculateTay([1, 2], true, 0, { bonus: counts });
    const house = calculateTay([1, 2], true, 0, { bonus: counts, bonusTileRule: 'own_seat_only' });
    expect(pdf.lines.map((l) => l.tay)).toEqual([1, 4]);
    expect(house.lines.map((l) => l.tay)).toEqual([1, 1]);
    expect(house.bonusTileRule).toBe('own_seat_only');
    // Without counts the house rule knows of no seat match, so the individual line is 0.
    expect(calculateTay([2], true, 0, { bonusTileRule: 'own_seat_only' }).total).toBe(0);
    expect(calculateTay([2], true, 0).total).toBe(1);
  });
});
