/**
 * Independent cross-model audit of src/scoring against
 * BANDUNG MAHJONG CUP RULEBOOK ver06 §5.1 DAFTAR TAY (pp. 8–10) and PROJECT.md F09–F18.
 *
 * Expected Tay values are restated from the rulebook here. They are not imported from the
 * in-repo fixture catalog. Three rulebook mismatches are pinned with it.fails.
 */
import { describe, expect, it } from 'vitest';
import { findWinningDecompositions } from '@/kim';
import {
  PATTERNS,
  ScoringEngine,
  baseTay,
  parseHandFeatures,
  scoreDecomposition,
  scoringEngine,
  type ScoringResult,
  type WinContext,
} from '@/scoring';
import { keyToTile, parseTileHand } from '@/core/tiles';
import type { GameRules, Meld, MeldType, Seat } from '@/core/types';

const RULES: GameRules = {
  kimEnabled: true,
  kimDiscardAllowed: false,
  allowKimInMeldClaim: false,
  minHuTay: 5,
};

/** Rulebook columns. null = the cell is blank (pattern does not exist in that mode). */
const COLUMNS: ReadonlyArray<readonly [number, number | null, number | null]> = [
  [1, 0, 0],
  [2, 1, 1],
  [3, 3, 3],
  [4, 10, 10],
  [5, 20, 20],
  [6, 30, 30],
  [7, 1, null],
  [8, null, 3],
  [9, 40, null],
  [10, 20, 30],
  [11, 40, 60],
  [12, 40, 60],
  [13, 0, 0],
  [14, 3, 3],
  [15, 5, 10],
  [16, 10, 20],
  [17, 5, 10],
  [18, 20, 30],
  [19, 30, 40],
  [20, 40, 60],
  [21, 10, 20],
  [22, 30, 40],
  [23, 30, 40],
  [24, 50, 60],
  [25, 1, 1],
  [26, 1, 1],
  [27, 2, 2],
  [28, 1, 1],
  [29, 1, 1],
  [30, 30, null],
  [31, 1, 1],
  [32, 20, null],
  [33, 5, 5],
  [34, 20, 30],
  [35, 5, 5],
  [36, 5, 5],
  [37, 5, 5],
  [38, 30, 30],
  // Keterangan: "tidak ada kim". The 40 belongs to Tidak ada KIM (PROJECT.md: NK 40 only).
  [39, null, 40],
  [40, 5, null],
  [41, 5, 5],
  [42, 1, 1],
  [43, 1, 1],
  [44, 5, 5],
];

function ctx(partial: Partial<WinContext> & { winningTile: WinContext['winningTile'] }): WinContext {
  const isSelfDraw = partial.isSelfDraw ?? false;
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
    ...partial,
  };
}

function meld(type: MeldType, tiles: string, claimedFrom?: Seat): Meld {
  return { type, tiles: parseTileHand(tiles), ...(claimedFrom ? { claimedFrom } : {}) };
}

function score(
  hand: string,
  win: string,
  options: {
    flowers?: string;
    melds?: Meld[];
    ctx?: Partial<WinContext>;
    rules?: Partial<GameRules>;
    engine?: ScoringEngine;
  } = {},
): ScoringResult {
  const winningTile = keyToTile(win, 9);
  const engine = options.engine ?? scoringEngine;
  return engine.evaluateHand(
    parseTileHand(hand),
    options.melds ?? [],
    options.flowers ? parseTileHand(options.flowers) : [],
    ctx({ ...options.ctx, winningTile }),
    { ...RULES, ...options.rules },
  );
}

function has(result: ScoringResult, id: number, tay?: number): void {
  const found = result.patterns.find((p) => p.id === id);
  expect(found, `#${id} missing from [${result.patterns.map((p) => p.id).join(',')}]`).toBeTruthy();
  if (tay !== undefined) expect(found!.tay).toBe(tay);
}

function lacks(result: ScoringResult, id: number): void {
  expect(result.patterns.some((p) => p.id === id), `#${id} should be absent`).toBe(false);
}

/** Highest total the pattern table assigns across every winning decomposition. */
function maxDecompositionTay(hand: string, win: string, extra: Partial<WinContext>): number {
  const winningTile = keyToTile(win, 9);
  const concealed = [...parseTileHand(hand), winningTile];
  const context = ctx({ ...extra, winningTile });
  const candidates = findWinningDecompositions({
    hand: concealed,
    winningTile,
    rules: RULES,
    isSelfDraw: context.isSelfDraw,
  });
  let best = -1;
  for (const solved of candidates) {
    const features = parseHandFeatures(solved, concealed, []);
    const patterns = scoreDecomposition({ features, mode: solved.mode, flowers: [], context });
    const total = patterns.reduce((sum, p) => sum + p.tay, 0);
    if (total > best) best = total;
  }
  return best;
}

const PING = '1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S';
const SELF = { isSelfDraw: true } as const;

describe('Rulebook K / NK columns', () => {
  it.each(COLUMNS)('#%i is K=%s NK=%s', (id, k, nk) => {
    const def = PATTERNS.get(id);
    expect(def).toBeTruthy();
    expect(def!.K).toBe(k);
    expect(def!.NK).toBe(nk);
    expect(baseTay(id, 'K')).toBe(k);
    expect(baseTay(id, 'NK')).toBe(nk);
  });

  it('blank cells are real blanks: Bo Kim, Tile KIM, and Se Sam Pu Tat', () => {
    expect(baseTay(8, 'K')).toBeNull();
    expect(baseTay(7, 'NK')).toBeNull();
    expect(baseTay(39, 'K')).toBeNull();
    expect(baseTay(39, 'NK')).toBe(40);
    expect(PATTERNS.get(6)!.instantHu).toBe(10);
    expect(PATTERNS.get(9)!.instantHu).toBe(10);
    expect(PATTERNS.get(34)!.instantHu).toBe(10);
  });

  it('all-triplet NK hand uses the NK column (Tuei Tuei 10, Si Am Kang 30)', () => {
    const result = score('2T 2T 2T 5S 5S 5S 8B 8B 8B WN WN WN 4T', '4T', {
      ctx: { ...SELF, seatWind: 'xi' },
    });
    expect(result.mode).toBe('NK');
    expect(result.isWithKim).toBe(false);
    has(result, 15, 10);
    has(result, 34, 30);
    has(result, 8, 3);
    has(result, 44, 5);
    lacks(result, 7);
    expect(result.totalTay).toBe(48);
    expect(result.isValidHu).toBe(true);
  });

  it('the same shape with one Kim uses the K column (Tuei Tuei 5, Si Am Kang 20)', () => {
    const result = score('2T 2T KIM 5S 5S 5S 8B 8B 8B WN WN WN 4T', '4T', {
      ctx: { ...SELF, seatWind: 'xi' },
    });
    expect(result.mode).toBe('K');
    expect(result.isWithKim).toBe(true);
    has(result, 15, 5);
    has(result, 34, 20);
    has(result, 7, 1);
    lacks(result, 8);
    expect(result.isValidHu).toBe(true);
  });
});

describe('Bo Kim +3 Tay', () => {
  it('a hand with no Kim scores Bo Kim at exactly 3 Tay and mode NK', () => {
    const result = score(PING, '5S', { ctx: SELF });
    expect(result.mode).toBe('NK');
    has(result, 8, 3);
    lacks(result, 7);
  });

  it('one wildcard Kim removes Bo Kim and scores 1 Tay for Tile KIM', () => {
    const result = score('1T 2T KIM 4T 5T 6T 7T 8T 9T 2S 3S 4S 5B', '5B', { ctx: SELF });
    expect(result.mode).toBe('K');
    has(result, 7, 1);
    lacks(result, 8);
    has(result, 3, 3);
    has(result, 14, 3);
    has(result, 44, 5);
    expect(result.totalTay).toBe(12);
  });

  it('Bo Kim stays 3 Tay in NK whether or not the hand also has a dragon pung', () => {
    const result = score('DZ DZ DZ 2S 3S 4S 5B 6B 7B 8T 8T 8T 4S', '4S', { ctx: { seatWind: 'xi' } });
    has(result, 8, 3);
    has(result, 27, 2);
    expect(result.mode).toBe('NK');
  });
});

describe('Multi-pattern combinations', () => {
  it('four flowers, own flower, own season, Ping Fu, and concealed self-draw sum', () => {
    // #1 own F1 = 1, #2 M1 = 1+1, #4 = 10, #8 = 3, #14 = 3, #44 = 5
    const result = score(PING, '5S', { flowers: 'F1 F2 F3 F4 M1', ctx: { ...SELF, seatWind: 'dong' } });
    has(result, 1, 1);
    has(result, 2, 2);
    has(result, 4, 10);
    lacks(result, 5);
    lacks(result, 6);
    has(result, 8, 3);
    has(result, 14, 3);
    has(result, 44, 5);
    expect(result.totalTay).toBe(24);
    expect(result.totalTay).toBe(result.patterns.reduce((sum, p) => sum + p.tay, 0));
  });

  it('seven bonus tiles inside a completed Hu add the 30 Tay on top of the flower set', () => {
    const result = score(PING, '5S', {
      flowers: 'F1 F2 F3 F4 M1 M2 M3',
      ctx: { ...SELF, seatWind: 'dong' },
    });
    has(result, 4, 10);
    has(result, 6, 30);
    has(result, 2, 4);
    expect(result.totalTay).toBe(56);
    expect(result.isInstantHu).toBe(false);
  });

  it('supersede drops 4 Flowers when 7 Flowers is present and keeps the 30', () => {
    const result = score(PING, '5S', {
      flowers: 'F1 F2 F3 F4 M1 M2 M3',
      ctx: { ...SELF, seatWind: 'dong' },
      engine: new ScoringEngine({ overlapPolicy: 'supersede' }),
    });
    has(result, 6, 30);
    lacks(result, 4);
    expect(result.totalTay).toBe(46);
  });

  it('Ta San Yen stacks with the per-dragon pungs, Tuei Tuei, Si Am Kang, and Bo Kim', () => {
    // NK: #8 3 + #15 10 + #22 40 + #27 2 + #28 1 + #29 1 + #34 30 + #44 5 = 92
    const result = score('DZ DZ DZ DF DF DF DP DP 5T 5T 5T 9S 9S', 'DP', { ctx: SELF });
    has(result, 8, 3);
    has(result, 15, 10);
    has(result, 22, 40);
    has(result, 27, 2);
    has(result, 28, 1);
    has(result, 29, 1);
    has(result, 34, 30);
    has(result, 44, 5);
    lacks(result, 21);
    expect(result.totalTay).toBe(92);
  });

  it('Pao Chin and Thi Fu stack under the additive policy', () => {
    const result = score(PING, '5S', { ctx: { isInitialDeal: true, isPaoChin: true, seatWind: 'nan' } });
    has(result, 10, 30);
    has(result, 12, 60);
    has(result, 14, 3);
    has(result, 43, 1);
    has(result, 8, 3);
    has(result, 3, 3);
    lacks(result, 11);
    expect(result.totalTay).toBe(100);
  });

  it('rulebook overlap drops Pao Chin once the hand is Thi Fu', () => {
    const result = score(PING, '5S', {
      ctx: { isInitialDeal: true, isPaoChin: true, seatWind: 'nan' },
      engine: new ScoringEngine({ overlapPolicy: 'supersede' }),
    });
    has(result, 12, 60);
    lacks(result, 10);
    expect(result.totalTay).toBe(70);
  });
});

describe('Kim Thi, Kim Ciok, and global Tay maximization', () => {
  const yau = 'KIM KIM KIM 1T 1T 1T 9T 9T 9T 1S 1S 1S 9S';
  const dragons = 'KIM KIM KIM DZ DZ DZ DF DF DF DP DP 5T 5T';

  it('picks Kim Thi (30) over Kim Ciok (20) when that decomposition totals more', () => {
    const result = score(yau, '9S', { ctx: SELF });
    expect(result.candidateCount).toBeGreaterThan(1);
    has(result, 30, 30);
    lacks(result, 32);
    has(result, 19, 30);
    has(result, 7, 3);
    expect(result.totalTay).toBe(96);
    expect(result.totalTay).toBe(maxDecompositionTay(yau, '9S', SELF));
  });

  it('picks Kim Ciok plus Ta San Yen when that total beats Kim Thi', () => {
    const result = score(dragons, '5T', { ctx: SELF });
    expect(result.candidateCount).toBeGreaterThan(1);
    has(result, 32, 20);
    has(result, 22, 30);
    lacks(result, 30);
    has(result, 17, 5);
    expect(result.totalTay).toBe(92);
    expect(result.totalTay).toBe(maxDecompositionTay(dragons, '5T', SELF));
  });

  it('never awards Kim Thi and Kim Ciok on the same chosen hand (only four Kim exist)', () => {
    for (const [hand, win] of [
      [yau, '9S'],
      [dragons, '5T'],
      ['1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX KIM KIM', 'WX'],
    ] as const) {
      const result = score(hand, win);
      const both = result.patterns.some((p) => p.id === 30) && result.patterns.some((p) => p.id === 32);
      expect(both).toBe(false);
    }
  });

  it('a Kim-Kim eye scores Kim Ciok 20 and not Kim Thi', () => {
    const result = score('1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX KIM KIM', 'WX', { flowers: 'F1' });
    has(result, 32, 20);
    lacks(result, 30);
    has(result, 7, 2);
    expect(result.mode).toBe('K');
  });

  it('arbitration still matches the max when the lower Kim Ciok line is also legal', () => {
    const result = score(yau, '9S', { ctx: SELF });
    expect(result.decomposition?.pair?.isKimCiok).not.toBe(true);
    expect(result.patterns.reduce((sum, p) => sum + p.tay, 0)).toBe(result.totalTay);
  });
});

describe('Kong Song Hu/Mo versus Kong Kong Hu', () => {
  it('one replacement draw scores Kong Song 5 and not Kong Kong', () => {
    const result = score('1T 2T 3T 4S 5S 6S 7B 8B WX WX', '9B', {
      melds: [meld('kong', '9S 9S 9S 9S', 'dong')],
      ctx: { ...SELF, isKongReplacement: true },
    });
    has(result, 37, 5);
    lacks(result, 38);
    has(result, 42, 1);
    expect(result.totalTay).toBe(9);
    expect(result.isValidHu).toBe(true);
  });

  it('two replacement draws score Kong Kong 30 and not Kong Song, even if both flags are set', () => {
    const result = score('1T 2T 3T 4S 5S 6S WX', 'WX', {
      melds: [meld('kong', '9S 9S 9S 9S', 'dong'), meld('ankong', 'DP DP DP DP')],
      ctx: { ...SELF, isKongReplacement: true, isDoubleKongReplacement: true },
    });
    has(result, 38, 30);
    lacks(result, 37);
    has(result, 29, 1);
    has(result, 42, 1);
    expect(result.totalTay).toBe(35);
  });

  it('Kong Kong is 30 Tay in K as well as NK', () => {
    const nk = score('1T 2T 3T 4S 5S 6S WX', 'WX', {
      melds: [meld('kong', '9S 9S 9S 9S', 'dong'), meld('ankong', 'DP DP DP DP')],
      ctx: { ...SELF, isDoubleKongReplacement: true },
    });
    const k = score('1T 2T KIM 4S 5S 6S WX', 'WX', {
      melds: [meld('kong', '9S 9S 9S 9S', 'dong'), meld('ankong', 'DP DP DP DP')],
      ctx: { ...SELF, isDoubleKongReplacement: true },
    });
    has(nk, 38, 30);
    has(k, 38, 30);
    expect(nk.mode).toBe('NK');
    expect(k.mode).toBe('K');
  });
});

describe('Chiong Kong and Ce Chiong Kong', () => {
  it('robbing a promoted Kong adds Chiong Kong 5 on a discard win', () => {
    const result = score(PING, '5S', { ctx: { isRobbingKong: true } });
    has(result, 35, 5);
    lacks(result, 36);
    has(result, 43, 1);
    expect(result.totalTay).toBe(15);
  });

  it('an ordinary Ron does not score Chiong Kong', () => {
    const result = score(PING, '5S');
    lacks(result, 35);
    lacks(result, 36);
    expect(result.totalTay).toBe(10);
  });

  it('Ce Chiong Kong is 5 only when the 4th tile is self-drawn', () => {
    const hand = '4T 6T 4S 5S 6S 7B 8B 9B WX WX';
    const open = [meld('pung', '5T 5T 5T', 'dong')];
    const drawn = score(hand, '5T', { melds: open, ctx: { ...SELF, isSelfRobbingKong: true } });
    has(drawn, 36, 5);
    has(drawn, 42, 1);
    expect(drawn.totalTay).toBe(9);
    expect(drawn.isValidHu).toBe(true);
  });

  it('Ce Chiong Kong does not score when the same flag is set on a discard win', () => {
    const result = score('4T 6T 4S 5S 6S 7B 8B 9B WX WX', '5T', {
      melds: [meld('pung', '5T 5T 5T', 'dong')],
      ctx: { isSelfRobbingKong: true, isSelfDraw: false },
    });
    lacks(result, 36);
  });

  it('robbing another player is not Ce Chiong Kong', () => {
    const result = score(PING, '5S', { ctx: { isRobbingKong: true, isSelfRobbingKong: false } });
    has(result, 35, 5);
    lacks(result, 36);
  });
});

describe('Pao Chin, Thien Fu, and Thi Fu', () => {
  it('Pao Chin is 30 NK and 20 K', () => {
    const nk = score(PING, '5S', { ctx: { isPaoChin: true } });
    const k = score('1T 2T KIM 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S', '5S', { ctx: { isPaoChin: true } });
    has(nk, 10, 30);
    expect(nk.mode).toBe('NK');
    has(k, 10, 20);
    expect(k.mode).toBe('K');
    lacks(k, 8);
    lacks(nk, 11);
    lacks(nk, 12);
  });

  it('Thien Fu is East self-draw on the opening deal: 60 NK, and it is not Thi Fu', () => {
    const result = score(PING, '5S', {
      ctx: { ...SELF, isInitialDeal: true, isPaoChin: true, seatWind: 'dong' },
    });
    has(result, 11, 60);
    lacks(result, 12);
    expect(result.totalTay).toBe(104);
  });

  it('Thien Fu is 40 in K for the same East opening self-draw', () => {
    const result = score('1T 2T KIM 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S', '5S', {
      ctx: { ...SELF, isInitialDeal: true, seatWind: 'dong' },
    });
    has(result, 11, 40);
    lacks(result, 10);
    lacks(result, 12);
  });

  it('South does not get Thien Fu by self-drawing on the opening deal', () => {
    const result = score(PING, '5S', { ctx: { ...SELF, isInitialDeal: true, seatWind: 'nan' } });
    lacks(result, 11);
    lacks(result, 12);
    lacks(result, 10);
  });

  it('East does not get Thien Fu by winning on a discard', () => {
    const result = score(PING, '5S', { ctx: { isInitialDeal: true, seatWind: 'dong' } });
    lacks(result, 11);
  });

  it('Thi Fu is the first discard after a declared Pao Chin (60 NK)', () => {
    const result = score(PING, '5S', { ctx: { isInitialDeal: true, isPaoChin: true, seatWind: 'xi' } });
    has(result, 12, 60);
    has(result, 10, 30);
    lacks(result, 11);
  });

  it('Thi Fu is 40 K on that same first discard', () => {
    const result = score('1T 2T KIM 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S', '5S', {
      ctx: { isInitialDeal: true, isPaoChin: true, seatWind: 'bei' },
    });
    has(result, 12, 40);
    has(result, 10, 20);
  });

  it('without a Pao Chin declaration the first discard is not Thi Fu', () => {
    const result = score(PING, '5S', { ctx: { isInitialDeal: true, isPaoChin: false, seatWind: 'nan' } });
    lacks(result, 12);
    lacks(result, 10);
  });

  it('a later discard after Pao Chin is not Thi Fu', () => {
    const result = score(PING, '5S', { ctx: { isInitialDeal: false, isPaoChin: true } });
    has(result, 10, 30);
    lacks(result, 12);
  });

  it('East winning the first discard after Pao Chin is Thi Fu, not Thien Fu', () => {
    const result = score(PING, '5S', {
      ctx: { isInitialDeal: true, isPaoChin: true, seatWind: 'dong' },
    });
    has(result, 12, 60);
    lacks(result, 11);
  });
});

describe('Instant Hu #6, #9, and #34', () => {
  it('#6 seven flowers is an immediate 10 Tay Hu, not the completed-hand 30', () => {
    const result = score('1T 5T 9T 2S 6S 1B 4B WD WN DZ DF DP 3S', '8B', {
      flowers: 'F1 F2 F3 F4 M1 M2 M3',
      ctx: { ...SELF, isInstantHu: true },
    });
    expect(result.isInstantHu).toBe(true);
    expect(result.isValidHu).toBe(true);
    expect(result.isLewFit).toBe(false);
    has(result, 6, 10);
    expect(result.totalTay).toBe(10);
    expect(result.patterns).toHaveLength(1);
  });

  it('#9 four Kim is an immediate 10 Tay Hu, not the completed-hand 40', () => {
    const result = score('KIM KIM KIM 1T 2T 3T 4S 5S 6S 7B 8B 9B', 'KIM', {
      ctx: { ...SELF, isInstantHu: true },
    });
    expect(result.mode).toBe('K');
    has(result, 9, 10);
    expect(result.totalTay).toBe(10);
    lacks(result, 7);
  });

  it('#34 four concealed triplet kinds is an immediate 10 Tay Hu', () => {
    const result = score('2T 2T 2T 5S 5S 5S 8B 8B 8B DZ DZ DZ WX', '3S', {
      ctx: { ...SELF, isInstantHu: true },
    });
    has(result, 34, 10);
    expect(result.totalTay).toBe(10);
    expect(result.isValidHu).toBe(true);
  });

  it('declaring instant Hu with no trigger is Lew Fit instant-invalid', () => {
    const result = score('1T 5T 9T 2S 6S 1B 4B WD WN DZ DF DP 3S', '8B', {
      ctx: { ...SELF, isInstantHu: true },
    });
    expect(result.lewFitReason).toBe('instant-invalid');
    expect(result.isValidHu).toBe(false);
    expect(result.patterns).toHaveLength(0);
    expect(result.rejectionReason).toMatch(/tanpa syarat/);
  });

  it('six bonus tiles do not trigger instant #6', () => {
    const result = score('1T 5T 9T 2S 6S 1B 4B WD WN DZ DF DP 3S', '8B', {
      flowers: 'F1 F2 F3 F4 M1 M2',
      ctx: { ...SELF, isInstantHu: true },
    });
    expect(result.lewFitReason).toBe('instant-invalid');
  });

  it('three Kim do not trigger instant #9', () => {
    const result = score('KIM KIM KIM 1T 2T 3T 4S 5S 6S 7B 8B 9B', '2B', {
      ctx: { ...SELF, isInstantHu: true },
    });
    expect(result.lewFitReason).toBe('instant-invalid');
    lacks(result, 9);
  });

  it('three concealed triplet kinds do not trigger instant #34', () => {
    const result = score('2T 2T 2T 5S 5S 5S 8B 8B 8B 1B 2B 3B WX', '9T', {
      ctx: { ...SELF, isInstantHu: true },
    });
    expect(result.lewFitReason).toBe('instant-invalid');
  });

  it('two instant triggers stack: 7 flowers and 4 Kim are 20 Tay', () => {
    const result = score('KIM KIM KIM 1T 2T 3T 4S 5S 6S 7B', 'KIM', {
      flowers: 'F1 F2 F3 F4 M1 M2 M3',
      ctx: { ...SELF, isInstantHu: true },
    });
    has(result, 6, 10);
    has(result, 9, 10);
    expect(result.totalTay).toBe(20);
    expect(result.isValidHu).toBe(true);
  });

  it('four Kim inside a completed hand score Shi Kim 40, not the instant 10', () => {
    const result = score('1T 2T KIM 4S KIM 6S 7B 8B 9B KIM KIM WX WX', 'WX', { flowers: 'F1' });
    has(result, 9, 40);
    has(result, 7, 4);
    expect(result.isInstantHu).toBe(false);
    expect(result.totalTay).toBeGreaterThanOrEqual(44);
  });
});

describe('Lew Fit under 5 Tay', () => {
  const chicken = '1T 2T 3T 4S 5S 6S 7B 8B 9B WN WN WN 4T';

  it('a mixed concealed Ron with a non-value wind is 4 Tay and Lew Fit', () => {
    // #8 3 + #13 0 + #43 1. The WN pung is neither seat nor round (both East).
    const result = score(chicken, '4T', { ctx: { seatWind: 'dong', roundWind: 'dong' } });
    expect(result.totalTay).toBe(4);
    expect(result.isValidHu).toBe(false);
    expect(result.isLewFit).toBe(true);
    expect(result.lewFitReason).toBe('below-minimum');
    has(result, 8, 3);
    has(result, 13, 0);
    has(result, 43, 1);
    expect(result.rejectionReason).toMatch(/kurang dari 5 Tay/);
  });

  it('the same hand with the seat flower is exactly 5 Tay and a legal Hu', () => {
    const result = score(chicken, '4T', {
      flowers: 'F1',
      ctx: { seatWind: 'dong', roundWind: 'dong' },
    });
    has(result, 1, 1);
    expect(result.totalTay).toBe(5);
    expect(result.isValidHu).toBe(true);
    expect(result.isLewFit).toBe(false);
  });

  it('a house minimum of 6 rejects that exact-5 hand', () => {
    const result = score(chicken, '4T', {
      flowers: 'F1',
      ctx: { seatWind: 'dong', roundWind: 'dong' },
      rules: { minHuTay: 6 },
    });
    expect(result.totalTay).toBe(5);
    expect(result.lewFitReason).toBe('below-minimum');
    expect(result.minHuTay).toBe(6);
  });

  it('a non-shape is Lew Fit structure and contributes no Tay', () => {
    const result = score('1T 3T 5T 7T 9T 1S 3S 5S 7S 9S WD WN WX', 'DZ');
    expect(result.lewFitReason).toBe('structure');
    expect(result.patterns).toHaveLength(0);
    expect(result.totalTay).toBe(0);
    expect(result.isValidHu).toBe(false);
  });

  it('a claimed Pung that uses Kim is Lew Fit under tournament rules', () => {
    const result = score('1T 2T 3T 4S 5S 6S 7B 8B 9B WX', 'WX', {
      melds: [meld('pung', '5T 5T KIM', 'dong')],
    });
    expect(result.lewFitReason).toBe('kim-claim');
    expect(result.patterns).toHaveLength(0);
    expect(result.totalTay).toBe(0);
  });

  it('the same Kim Pung scores in K mode when meld claims are allowed', () => {
    const result = score('1T 2T 3T 4S 5S 6S 7B 8B 9B WX', 'WX', {
      melds: [meld('pung', '5T 5T KIM', 'dong')],
      rules: { allowKimInMeldClaim: true, minHuTay: 1 },
    });
    expect(result.lewFitReason).toBeUndefined();
    expect(result.mode).toBe('K');
    has(result, 7, 1);
    expect(result.isValidHu).toBe(true);
  });
});

describe('Pinned scoring bugs', () => {
  it('Se Sam Pu Tat with a flower or season is not a legal Hu', () => {
    // The 14 tiles are not 4 melds + pair. #39 requires no flower, season, or Kim.
    // A bonus tile must void the special hand the same way a Kim does (structure Lew Fit).
    for (const bonus of ['F1', 'M2']) {
      const result = score('1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB', 'DZ', {
        flowers: bonus,
        ctx: SELF,
      });
      expect(result.isValidHu).toBe(false);
      expect(result.lewFitReason).toBe('structure');
      lacks(result, 39);
    }
  });

  it('Thi Fu strictly requires prior Pao Chin declaration', () => {
    // §5.1 #12: "Hu dari hasil lew atau discard pertama (diawali dengan declare Pao Chin)".
    // Without Pao Chin, a first-turn win cannot score #12 Thi Fu.
    const result = score(PING, '5S', {
      ctx: { ...SELF, isInitialDeal: true, isPaoChin: false, seatWind: 'nan' },
    });
    lacks(result, 12);
    lacks(result, 11);
    lacks(result, 10);
    expect(result.isValidHu).toBe(true);

    // With Pao Chin, non-dealer self-draw keeps Pao Chin and does not score Thi Fu
    const withPaoChin = score(PING, '5S', {
      ctx: { ...SELF, isInitialDeal: true, isPaoChin: true, seatWind: 'nan' },
    });
    has(withPaoChin, 10, 30);
    lacks(withPaoChin, 12);
    lacks(withPaoChin, 11);
    expect(withPaoChin.totalTay).toBe(44);
    expect(withPaoChin.isValidHu).toBe(true);

    // On discard win, non-dealer scores Thi Fu
    const discardWin = score(PING, '5S', {
      ctx: { isInitialDeal: true, isPaoChin: true, isDiscardWin: true, isSelfDraw: false, seatWind: 'nan' },
    });
    has(discardWin, 12, 60);
    has(discardWin, 10, 30);
    expect(discardWin.totalTay).toBe(100);
    expect(discardWin.isValidHu).toBe(true);
  });

  it('instant Hu still has to clear rules.minHuTay', () => {
    // A 10 Tay instant declaration is legal at the rulebook minimum of 5.
    // The configured gate must still reject it when minHuTay is higher than 10.
    const result = score('1T 5T 9T 2S 6S 1B 4B WD WN DZ DF DP 3S', '8B', {
      flowers: 'F1 F2 F3 F4 M1 M2 M3',
      ctx: { ...SELF, isInstantHu: true },
      rules: { minHuTay: 15 },
    });
    expect(result.totalTay).toBe(10);
    expect(result.isValidHu).toBe(false);
    expect(result.isLewFit).toBe(true);
    expect(result.lewFitReason).toBe('below-minimum');
  });
});
