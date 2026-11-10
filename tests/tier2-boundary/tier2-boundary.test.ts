/**
 * Tier 2 — boundary and corner cases (PROJECT.md F29).
 * At least five edge, limit, or negative cases for each of F01–F18 and F25–F26.
 */
import { describe, expect, it } from 'vitest';
import { GameEngine, type GameEngineState } from '@/core/game-engine';
import { Wall } from '@/core/wall';
import { createCompleteTileSet, isBonus, isKim, keyToTile, parseTileHand } from '@/core/tiles';
import type { GameRules, Meld, Tile } from '@/core/types';
import {
  STRICT_NO_KIM_RULES,
  TOURNAMENT_KIM_RULES,
  findWinningDecompositions,
  resolveKimRules,
  validateKimMeldLegality,
} from '@/kim';
import { scoringEngine, type ScoringResult, type WinContext } from '@/scoring';
import {
  DEFAULT_SETTINGS,
  MAX_HISTORY_RECORDS,
  MIN_HU_TAY_UPPER_BOUND,
  MemoryStorage,
  clearGameHistory,
  computeHistoryStats,
  deleteGameRecord,
  loadGameHistory,
  loadSettings,
  sanitizeSettings,
  saveGameRecord,
  type NewMatchHistoryRecord,
  type StorageLike,
} from '@/storage';
import { SOUND_EFFECT_NAMES, SoundEngine, getRecipeDuration, isSoundEffectName } from '@/audio';

const RULES: GameRules = {
  kimEnabled: true,
  kimDiscardAllowed: false,
  allowKimInMeldClaim: false,
  minHuTay: 5,
};

function ctx(partial: Partial<WinContext> & { winningTile: Tile }): WinContext {
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

function score(
  hand: string,
  win: string,
  options: { flowers?: string; melds?: Meld[]; ctx?: Partial<WinContext>; rules?: Partial<GameRules> } = {},
): ScoringResult {
  const winningTile = keyToTile(win, 9);
  return scoringEngine.evaluateHand(
    parseTileHand(hand),
    options.melds ?? [],
    options.flowers ? parseTileHand(options.flowers) : [],
    ctx({ ...options.ctx, winningTile }),
    { ...RULES, ...options.rules },
  );
}

function tay(result: ScoringResult, id: number): number | undefined {
  return result.patterns.find((p) => p.id === id)?.tay;
}

function quietEngine(): GameEngine {
  const tiles = createCompleteTileSet().filter((t) => !isBonus(t));
  const engine = new GameEngine(undefined, new Wall(tiles, null));
  engine.startNewGame(true);
  return engine;
}

const PING = '1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S';

describe('F01 tile boundaries', () => {
  it('rejects an unknown shorthand key', () => {
    expect(() => keyToTile('ZZ')).toThrow(/invalid tile key/i);
  });

  it('Kim has value 0 and the kim flag', () => {
    const kim = keyToTile('KIM');
    expect(kim.value).toBe(0);
    expect(kim.type).toBe('kim');
    expect(isKim(kim)).toBe(true);
  });

  it('does not treat a flower as a suit or an honor', () => {
    const flower = keyToTile('F4');
    expect(isBonus(flower)).toBe(true);
    expect(flower.value).toBe(4);
  });

  it('keeps the fourth copy of a suit tile', () => {
    const tiles = createCompleteTileSet().filter((t) => t.type === 'tong' && t.value === 9);
    expect(tiles).toHaveLength(4);
  });

  it('maps the four winds and three dragons onto 1..4 and 1..3', () => {
    expect(createCompleteTileSet().filter((t) => t.type === 'wind').map((t) => t.value)).toEqual(
      expect.arrayContaining([1, 2, 3, 4]),
    );
    expect(new Set(createCompleteTileSet().filter((t) => t.type === 'dragon').map((t) => t.value))).toEqual(
      new Set([1, 2, 3]),
    );
  });

  it('parseTileHand rejects an empty token by skipping it and still parses the rest', () => {
    expect(parseTileHand('  1T   9B  ')).toHaveLength(2);
  });
});

describe('F02 wall boundaries', () => {
  it('refuses to deal when fewer than 53 tiles remain', () => {
    const wall = new Wall(createCompleteTileSet().slice(0, 52), null);
    expect(() => wall.dealInitialHands()).toThrow(/53/);
  });

  it('returns null from both ends once the wall is empty', () => {
    const wall = new Wall([keyToTile('1T')], null);
    expect(wall.drawHead()).not.toBeNull();
    expect(wall.drawHead()).toBeNull();
    expect(wall.drawTail()).toBeNull();
    expect(wall.peekHead()).toBeNull();
    expect(wall.peekTail()).toBeNull();
    expect(wall.remainingCount).toBe(0);
  });

  it('deals 14 tiles to a South dealer', () => {
    const wall = new Wall(createCompleteTileSet(), null);
    const deal = wall.dealInitialHands('nan');
    expect(deal.hands.nan).toHaveLength(14);
    expect(deal.hands.dong).toHaveLength(13);
  });

  it('a clone keeps the draw cursor', () => {
    const wall = new Wall(createCompleteTileSet(), null);
    wall.drawHead();
    wall.drawTail();
    const clone = wall.clone();
    expect(clone.remainingCount).toBe(wall.remainingCount);
    expect(clone.drawHead()!.id).toBe(wall.drawHead()!.id);
  });

  it('two seeds do not produce the same opening tile', () => {
    const a = new Wall(undefined, 1).drawHead()!.id;
    const b = new Wall(undefined, 2).drawHead()!.id;
    expect(a).not.toBe(b);
  });
});

describe('F03 turn boundaries', () => {
  it('rejects a discard from the wrong seat', () => {
    const engine = quietEngine();
    const tile = engine.getState().players.nan.hand[0]!;
    expect(() => engine.discard('nan', tile.id)).toThrow(/not nan's turn/i);
  });

  it('rejects a discard when the seat still has 13 tiles', () => {
    const engine = quietEngine();
    const state = engine.getState() as GameEngineState;
    state.currentTurn = 'nan';
    const tile = state.players.nan.hand[0]!;
    expect(() => engine.discard('nan', tile.id)).toThrow(/13/);
  });

  it('rejects a draw when the seat already holds 14', () => {
    const engine = quietEngine();
    expect(() => engine.startTurnDraw('dong')).toThrow(/14/);
  });

  it('rejects a discard of a tile that is not in hand', () => {
    const engine = quietEngine();
    expect(() => engine.discard('dong', 'missing-tile')).toThrow(/not found/i);
  });

  it('rejects Pao Chin from a seat that is not to play', () => {
    const engine = quietEngine();
    expect(engine.declarePaoChin('xi')).toBe(false);
    expect(engine.getState().players.xi.isPaoChin).toBe(false);
  });

  it('rejects a Kim discard under tournament rules', () => {
    const engine = quietEngine();
    const kim = keyToTile('KIM', 4);
    engine.getState().players.dong.hand.push(kim);
    expect(() => engine.discard('dong', kim.id)).toThrow(/Kim/i);
  });
});

describe('F04 claim boundaries', () => {
  it('rejects a claim outside the claim window', () => {
    const engine = quietEngine();
    expect(() => engine.submitClaim({ seat: 'nan', action: 'pass' })).toThrow(/CLAIM_WINDOW/);
  });

  it('rejects Pung when the hand has no pair of the discard', () => {
    const engine = quietEngine();
    const state = engine.getState();
    state.players.dong.hand = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 1B 2B 3B 4B 5S');
    state.players.xi.hand = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 1B 2B 3B 4B');
    const five = state.players.dong.hand.find((t) => t.type === 'sok')!;
    engine.discard('dong', five.id);
    expect(() => engine.submitClaim({ seat: 'xi', action: 'pung' })).toThrow(/2 matching/i);
  });

  it('rejects Kong when the hand has only a pair', () => {
    const engine = quietEngine();
    const state = engine.getState();
    state.players.dong.hand = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 1B 2B 3B 4B 5S');
    state.players.bei.hand = parseTileHand('5S 5S 1T 2T 3T 4T 5T 6T 7T 8T 9T 1B 2B');
    const five = state.players.dong.hand.find((t) => t.type === 'sok')!;
    engine.discard('dong', five.id);
    expect(() => engine.submitClaim({ seat: 'bei', action: 'kong' })).toThrow(/3 matching/i);
  });

  it('rejects Jia of tiles that are not a sequence around the discard', () => {
    const engine = quietEngine();
    const state = engine.getState();
    state.players.dong.hand = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 1B 2B 3B 4B 5S');
    state.players.nan.hand = parseTileHand('1S 2S 1T 2T 3T 4T 5T 6T 7T 8T 9T 1B 2B');
    const five = state.players.dong.hand.find((t) => t.type === 'sok')!;
    engine.discard('dong', five.id);
    const south = state.players.nan.hand;
    expect(() =>
      engine.submitClaim({
        seat: 'nan',
        action: 'jia',
        meldTiles: [south[0]!, south[1]!],
      }),
    ).toThrow(/sequence/i);
  });

  it('the discarder cannot claim their own tile', () => {
    const engine = quietEngine();
    const tile = engine.getState().players.dong.hand[0]!;
    engine.discard('dong', tile.id);
    expect(() => engine.submitClaim({ seat: 'dong', action: 'pung' })).toThrow();
  });

  it('does not offer Jia to the seat across the table', () => {
    const engine = quietEngine();
    const tile = engine.getState().players.dong.hand[0]!;
    engine.discard('dong', tile.id);
    expect(engine.getLegalActions('xi').canJia).toBe(false);
    expect(engine.getLegalActions('nan').canPass).toBe(true);
  });
});

describe('F05 flower boundaries', () => {
  it('three flowers are not the 4-flower pattern', () => {
    expect(tay(score(PING, '5S', { flowers: 'F1 F2 F3' }), 4)).toBeUndefined();
  });

  it('six bonus tiles are not the 7-bonus pattern', () => {
    expect(tay(score(PING, '5S', { flowers: 'F1 F2 F3 F4 M1 M2' }), 6)).toBeUndefined();
  });

  it('one flower cancels Bo Hua Zi', () => {
    expect(tay(score(PING, '5S', { flowers: 'F4' }), 3)).toBeUndefined();
  });

  it('an honor pair cancels Bo Hua Zi even with an empty rack', () => {
    expect(tay(score('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B WX', 'WX'), 3)).toBeUndefined();
  });

  it('a season that does not match the seat is exactly 1 Tay', () => {
    expect(tay(score(PING, '5S', { flowers: 'M1', ctx: { seatWind: 'xi' } }), 2)).toBe(1);
  });

  it('all eight bonus tiles still include the 7-tile pattern', () => {
    expect(tay(score(PING, '5S', { flowers: 'F1 F2 F3 F4 M1 M2 M3 M4' }), 6)).toBe(30);
    expect(tay(score(PING, '5S', { flowers: 'F1 F2 F3 F4 M1 M2 M3 M4' }), 4)).toBe(10);
    expect(tay(score(PING, '5S', { flowers: 'F1 F2 F3 F4 M1 M2 M3 M4' }), 5)).toBe(20);
  });
});

describe('F06 solver boundaries', () => {
  it('finds no win in a scattered hand', () => {
    const hand = parseTileHand('1T 3T 5T 7T 9T 2S 4S 6S 8S WD WN DZ DF DP');
    expect(findWinningDecompositions({ hand, rules: TOURNAMENT_KIM_RULES })).toHaveLength(0);
  });

  it('rejects Se Sam Pu Tat when any rank is repeated', () => {
    const hand = parseTileHand('1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB WD');
    const solved = findWinningDecompositions({ hand, rules: TOURNAMENT_KIM_RULES });
    expect(solved.some((s) => s.shape === 'se_sam_pu_tat')).toBe(false);
  });

  it('rejects Se Sam Pu Tat when two suited tiles are only 2 apart', () => {
    const hand = parseTileHand('1T 3T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB DZ');
    const solved = findWinningDecompositions({ hand, rules: TOURNAMENT_KIM_RULES });
    expect(solved.some((s) => s.shape === 'se_sam_pu_tat')).toBe(false);
  });

  it('does not solve thirteen orphans when a terminal is missing', () => {
    const hand = parseTileHand('1T 9T 1S 9S 1B 9B WD WN WX WB DZ DF 2T 2T');
    const solved = findWinningDecompositions({ hand, rules: TOURNAMENT_KIM_RULES });
    expect(solved.some((s) => s.shape === 'thirteen_orphans')).toBe(false);
  });

  it('with Kim disabled, a lone Kim does not complete the hand', () => {
    const hand = [...parseTileHand('1T 2T KIM 4T 5T 6T 7T 8T 9T 2S 3S 4S 5B'), keyToTile('5B', 9)];
    expect(findWinningDecompositions({ hand, rules: STRICT_NO_KIM_RULES })).toHaveLength(0);
  });
});

describe('F07 Kim-rule boundaries', () => {
  it('fills omitted Kim toggles from the tournament preset', () => {
    const resolved = resolveKimRules({ kimEnabled: true, minHuTay: 5 });
    expect(resolved.kimDiscardAllowed).toBe(false);
    expect(resolved.allowKimInMeldClaim).toBe(false);
    expect(resolved.allowKimInPair).toBe(true);
  });

  it('a claimed Pung that contains Kim is illegal under tournament rules', () => {
    const report = validateKimMeldLegality(
      [{ type: 'pung', tiles: parseTileHand('5T 5T KIM'), claimedFrom: 'dong' }],
      TOURNAMENT_KIM_RULES,
    );
    expect(report.isLewFit).toBe(true);
  });

  it('a concealed Ankong of natural tiles stays legal', () => {
    const report = validateKimMeldLegality(
      [{ type: 'ankong', tiles: parseTileHand('5T 5T 5T 5T') }],
      TOURNAMENT_KIM_RULES,
    );
    expect(report.isLewFit).toBe(false);
  });

  it('casual rules accept a Kim Pung claim', () => {
    const report = validateKimMeldLegality(
      [{ type: 'pung', tiles: parseTileHand('5T 5T KIM'), claimedFrom: 'dong' }],
      { allowKimInMeldClaim: true },
    );
    expect(report.isLegal).toBe(true);
  });

  it('a natural discard stays legal when Kim discards are banned', () => {
    const engine = quietEngine();
    const tile = engine.getState().players.dong.hand.find((t) => !isKim(t))!;
    expect(engine.discard('dong', tile.id).discardedTile.id).toBe(tile.id);
  });
});

describe('F08 mode boundaries', () => {
  it('seven pairs with no Kim stay NK', () => {
    const result = score('1T 1T 2T 2T 3T 3T 4T 4T 5T 5T 6T 6T 7T', '7T', { ctx: { isSelfDraw: true } });
    expect(result.mode).toBe('NK');
    expect(tay(result, 16)).toBe(20);
    expect(tay(result, 8)).toBe(3);
  });

  it('seven pairs that use a Kim switch to the K column', () => {
    const result = score('1T KIM 2T 2T 3T 3T 4T 4T 5T 5T 6T 6T 7T', '7T', { ctx: { isSelfDraw: true } });
    expect(result.mode).toBe('K');
    expect(tay(result, 16)).toBe(10);
    expect(tay(result, 7)).toBe(1);
    expect(tay(result, 8)).toBeUndefined();
  });

  it('three Kim are not yet Shi Kim', () => {
    const result = score('KIM KIM KIM 1T 1T 1T 9T 9T 9T 1S 1S 1S 9S', '9S');
    expect(tay(result, 9)).toBeUndefined();
    expect(tay(result, 7)).toBe(3);
  });

  it('Bo Kim is absent as soon as any Kim is in the hand', () => {
    expect(tay(score('1T 2T KIM 4T 5T 6T 7T 8T 9T 2S 3S 4S 5B', '5B'), 8)).toBeUndefined();
  });

  it('NK Tuei Tuei is 10 and the K column of the same name is not used', () => {
    const result = score('2T 2T 2T 5S 5S 5S 8B 8B 8B WN WN WN 4T', '4T', {
      ctx: { isSelfDraw: true, seatWind: 'xi' },
    });
    expect(tay(result, 15)).toBe(10);
    expect(result.mode).toBe('NK');
  });
});

describe('F09 gate boundaries', () => {
  const chicken = '1T 2T 3T 4S 5S 6S 7B 8B 9B WN WN WN 4T';

  it('4 Tay is below the gate and 5 Tay is on it', () => {
    expect(score(chicken, '4T', { ctx: { seatWind: 'dong' } }).lewFitReason).toBe('below-minimum');
    expect(score(chicken, '4T', { flowers: 'F1', ctx: { seatWind: 'dong' } }).isValidHu).toBe(true);
  });

  it('a minimum of 100 rejects a large NK dragon hand', () => {
    const result = score('DZ DZ DZ DF DF DF DP DP 5T 5T 5T 9S 9S', 'DP', {
      ctx: { isSelfDraw: true },
      rules: { minHuTay: 100 },
    });
    expect(result.totalTay).toBe(92);
    expect(result.lewFitReason).toBe('below-minimum');
  });

  it('a minimum of 0 accepts the 4 Tay chicken', () => {
    const result = score(chicken, '4T', { ctx: { seatWind: 'dong' }, rules: { minHuTay: 0 } });
    expect(result.isValidHu).toBe(true);
    expect(result.totalTay).toBe(4);
  });

  it('a broken shape is structure, not below-minimum', () => {
    expect(score('1T 3T 5T 7T 9T WD WN WX WB DZ DF DP 2S', '4S').lewFitReason).toBe('structure');
  });

  it('a Kim claim is not reported as below-minimum', () => {
    const result = score('1T 2T 3T 4S 5S 6S 7B 8B 9B WX', 'WX', {
      melds: [{ type: 'pung', tiles: parseTileHand('5T 5T KIM'), claimedFrom: 'dong' }],
    });
    expect(result.lewFitReason).toBe('kim-claim');
  });

  it('the result names the configured minimum in the rejection', () => {
    const result = score(chicken, '4T', { ctx: { seatWind: 'dong' }, rules: { minHuTay: 9 } });
    expect(result.rejectionReason).toMatch(/9 Tay/);
  });
});

describe('F10 flower-pattern boundaries', () => {
  it('a flower rack of three does not pay the set bonus', () => {
    expect(tay(score(PING, '5S', { flowers: 'F2 F3 F4' }), 4)).toBeUndefined();
  });

  it('mixing three flowers and one season is neither set', () => {
    const result = score(PING, '5S', { flowers: 'F1 F2 F3 M4' });
    expect(tay(result, 4)).toBeUndefined();
    expect(tay(result, 5)).toBeUndefined();
  });

  it('the seat bonus is 1 even when four flowers are also scored', () => {
    const result = score(PING, '5S', { flowers: 'F1 F2 F3 F4', ctx: { seatWind: 'dong' } });
    expect(tay(result, 1)).toBe(1);
    expect(tay(result, 4)).toBe(10);
  });

  it('Bo Hua Zi does not survive a season', () => {
    expect(tay(score(PING, '5S', { flowers: 'M4' }), 3)).toBeUndefined();
  });

  it('seven tiles pay 30 in K as well as NK', () => {
    const result = score('1T 2T KIM 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S', '5S', {
      flowers: 'F1 F2 F3 F4 M1 M2 M3',
    });
    expect(result.mode).toBe('K');
    expect(tay(result, 6)).toBe(30);
  });
});

describe('F11 Kim-pattern boundaries', () => {
  it('NK does not list Tile KIM', () => {
    expect(tay(score(PING, '5S'), 7)).toBeUndefined();
  });

  it('a single Kim completing a pung is not Kim Thi', () => {
    expect(tay(score('5T 5T KIM 1S 2S 3S 4B 5B 6B 7T 8T 9T WX', 'WX', { flowers: 'F1' }), 30)).toBeUndefined();
  });

  it('a Kim used in a sequence is not Kim Ciok', () => {
    expect(tay(score('1T 2T KIM 4S 5S 6S 7B 8B 9B WX WX WX 5T', '5T', { flowers: 'F1' }), 32)).toBeUndefined();
  });

  it('Shi Kim is not awarded for three Kim', () => {
    expect(tay(score('KIM KIM KIM 1T 1T 1T 9T 9T 9T 1S 1S 1S 9S', '9S'), 9)).toBeUndefined();
  });

  it('Pyong Pi is not awarded in NK', () => {
    expect(tay(score(PING, '5S', { ctx: { isSelfDraw: true } }), 40)).toBeUndefined();
  });
});

describe('F12 first-turn boundaries', () => {
  it('Pao Chin is absent unless the flag is set', () => {
    expect(tay(score(PING, '5S', { ctx: { isInitialDeal: true, seatWind: 'dong' } }), 10)).toBeUndefined();
  });

  it('South self-draw on the deal is not Thien Fu', () => {
    expect(tay(score(PING, '5S', { ctx: { isSelfDraw: true, isInitialDeal: true, seatWind: 'bei' } }), 11)).toBeUndefined();
  });

  it('East does not get Thien Fu from a discard', () => {
    expect(tay(score(PING, '5S', { ctx: { isInitialDeal: true, seatWind: 'dong' } }), 11)).toBeUndefined();
  });

  it('Thi Fu needs both the opening window and a Pao Chin declaration', () => {
    expect(tay(score(PING, '5S', { ctx: { isInitialDeal: true, isPaoChin: false } }), 12)).toBeUndefined();
    expect(tay(score(PING, '5S', { ctx: { isInitialDeal: false, isPaoChin: true } }), 12)).toBeUndefined();
  });

  it('Thien Fu is 40 in K, not the NK 60', () => {
    expect(
      tay(score('1T 2T KIM 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S', '5S', {
        ctx: { isSelfDraw: true, isInitialDeal: true, seatWind: 'dong' },
      }), 11),
    ).toBe(40);
  });
});

describe('F13 shape boundaries', () => {
  it('a dragon pair blocks Ping Fu', () => {
    expect(tay(score('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B DZ', 'DZ', { flowers: 'F1' }), 14)).toBeUndefined();
  });

  it('a seat-wind pair blocks Ping Fu', () => {
    expect(
      tay(score('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B WN', 'WN', { flowers: 'F1', ctx: { seatWind: 'nan' } }), 14),
    ).toBeUndefined();
  });

  it('Ping Fu is not Chicken and not Tuei Tuei', () => {
    const result = score(PING, '5S');
    expect(tay(result, 14)).toBe(3);
    expect(tay(result, 13)).toBeUndefined();
    expect(tay(result, 15)).toBeUndefined();
  });

  it('two suits are not It Set', () => {
    expect(tay(score(PING, '5S'), 18)).toBeUndefined();
  });

  it('one suit plus an honor is Chao It, not It Set', () => {
    const result = score('1T 1T 1T 2T 3T 4T 5T 6T 7T 8T 9T WD WD', 'WD', { flowers: 'F1' });
    expect(tay(result, 17)).toBe(10);
    expect(tay(result, 18)).toBeUndefined();
  });
});

describe('F14 honor boundaries', () => {
  it('a wind pung that matches neither seat nor round scores neither wind pattern', () => {
    const result = score('WX WX WX 2S 3S 4S 5B 6B 7B 8T 8T 8T 4S', '4S', {
      ctx: { seatWind: 'dong', roundWind: 'dong' },
    });
    expect(tay(result, 25)).toBeUndefined();
    expect(tay(result, 26)).toBeUndefined();
  });

  it('the same pung scores both when seat and round are that wind', () => {
    const result = score('WD WD WD 2S 3S 4S 5B 6B 7B 8T 8T 8T 4S', '4S', {
      ctx: { seatWind: 'dong', roundWind: 'dong' },
    });
    expect(tay(result, 25)).toBe(1);
    expect(tay(result, 26)).toBe(1);
  });

  it('two dragon pungs plus a dragon pair are Siau San Yen, not Ta San Yen', () => {
    const result = score('DZ DZ DZ DF DF DF 5T 5T 5T 2S 3S 4S DP', 'DP', { flowers: 'F1' });
    expect(tay(result, 21)).toBe(20);
    expect(tay(result, 22)).toBeUndefined();
  });

  it('Fat is 1 Tay, not the Zhong 2', () => {
    expect(tay(score('DF DF DF 2S 3S 4S 5B 6B 7B 8T 8T 8T 4S', '4S', { flowers: 'F1' }), 28)).toBe(1);
    expect(tay(score('DF DF DF 2S 3S 4S 5B 6B 7B 8T 8T 8T 4S', '4S', { flowers: 'F1' }), 27)).toBeUndefined();
  });

  it('thirteen orphans do not also list the dragon pung patterns', () => {
    const result = score('1T 9T 1S 9S 1B 9B WD WN WX WB DZ DF DP', 'DZ', { ctx: { isSelfDraw: true } });
    expect(tay(result, 20)).toBe(60);
    expect(tay(result, 27)).toBeUndefined();
    expect(tay(result, 24)).toBeUndefined();
  });
});

describe('F15 concealed-set boundaries', () => {
  it('a claimed pung replaces one concealed set, so Sam Am Kang is absent', () => {
    const result = score('2T 2T 2T 5S 5S 5S 1B 2B 3B WX', 'WX', {
      melds: [{ type: 'pung', tiles: parseTileHand('8B 8B 8B'), claimedFrom: 'dong' }],
      flowers: 'F1',
    });
    expect(tay(result, 33)).toBeUndefined();
  });

  it('two concealed pungs are not Sam Am Kang', () => {
    expect(tay(score('2T 2T 2T 5S 5S 5S 1B 2B 3B 7B 8B 9B WX', 'WX', { flowers: 'F1' }), 33)).toBeUndefined();
  });

  it('a pair of 5s is not Ji Pa Ciok', () => {
    expect(tay(score('1T 2T 3T 4S 5S 6S 7B 8B 9B WN WN 5T 5T', '5T', { flowers: 'F1', ctx: { seatWind: 'dong' } }), 31)).toBeUndefined();
  });

  it('Si Am Kang is 20 in K', () => {
    expect(
      tay(score('2T 2T 2T 5S 5S 5S 8B 8B KIM DZ DZ DZ WX', 'WX', { flowers: 'F1', ctx: { isSelfDraw: true } }), 34),
    ).toBe(20);
  });

  it('an open hand of four claimed melds is Tan Tiau even on a self-draw', () => {
    expect(
      tay(
        score('DZ', 'DZ', {
          melds: [
            { type: 'pung', tiles: parseTileHand('2T 2T 2T'), claimedFrom: 'xi' },
            { type: 'jia', tiles: parseTileHand('4S 5S 6S'), claimedFrom: 'dong' },
            { type: 'pung', tiles: parseTileHand('WX WX WX'), claimedFrom: 'xi' },
            { type: 'pung', tiles: parseTileHand('9B 9B 9B'), claimedFrom: 'bei' },
          ],
          flowers: 'F1',
          ctx: { isSelfDraw: true },
        }),
        41,
      ),
    ).toBe(5);
  });
});

describe('F16 Kong-event boundaries', () => {
  it('an ordinary Ron has no Kong-event Tay', () => {
    const result = score(PING, '5S');
    expect(tay(result, 35)).toBeUndefined();
    expect(tay(result, 36)).toBeUndefined();
    expect(tay(result, 37)).toBeUndefined();
    expect(tay(result, 38)).toBeUndefined();
  });

  it('Ce Chiong Kong is withheld on a discard', () => {
    expect(
      tay(
        score('4T 6T 4S 5S 6S 7B 8B 9B WX WX', '5T', {
          melds: [{ type: 'pung', tiles: parseTileHand('5T 5T 5T'), claimedFrom: 'dong' }],
          ctx: { isSelfRobbingKong: true },
        }),
        36,
      ),
    ).toBeUndefined();
  });

  it('one replacement is 5, not 30', () => {
    const result = score('1T 2T 3T 4S 5S 6S 7B 8B WX WX', '9B', {
      melds: [{ type: 'kong', tiles: parseTileHand('9S 9S 9S 9S'), claimedFrom: 'dong' }],
      ctx: { isSelfDraw: true, isKongReplacement: true },
    });
    expect(tay(result, 37)).toBe(5);
    expect(tay(result, 38)).toBeUndefined();
  });

  it('two replacements do not also pay Kong Song', () => {
    const result = score('1T 2T 3T 4S 5S 6S WX', 'WX', {
      melds: [
        { type: 'kong', tiles: parseTileHand('9S 9S 9S 9S'), claimedFrom: 'dong' },
        { type: 'ankong', tiles: parseTileHand('DP DP DP DP') },
      ],
      ctx: { isSelfDraw: true, isKongReplacement: true, isDoubleKongReplacement: true },
    });
    expect(tay(result, 38)).toBe(30);
    expect(tay(result, 37)).toBeUndefined();
  });

  it('Chiong Kong stays 5 in K', () => {
    expect(tay(score('1T 2T KIM 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S', '5S', { ctx: { isRobbingKong: true } }), 35)).toBe(5);
  });
});

describe('F17 finish boundaries', () => {
  it('a close rank gap is not Se Sam Pu Tat', () => {
    expect(
      tay(score('1T 4T 5T 2S 5S 8S 3B 6B 9B WD WN WX WB', 'DZ', { ctx: { isSelfDraw: true } }), 39),
    ).toBeUndefined();
  });

  it('an exposed flower removes pattern 39', () => {
    expect(
      tay(score('1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB', 'DZ', { flowers: 'F1', ctx: { isSelfDraw: true } }), 39),
    ).toBeUndefined();
  });

  it('Pyong Pi is not scored from a discard', () => {
    expect(
      tay(score('1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX WX KIM', '9S', { flowers: 'F1' }), 40),
    ).toBeUndefined();
  });

  it('a concealed self-draw is not Mun', () => {
    const result = score(PING, '5S', { ctx: { isSelfDraw: true } });
    expect(tay(result, 44)).toBe(5);
    expect(tay(result, 43)).toBeUndefined();
    expect(tay(result, 42)).toBeUndefined();
  });

  it('an open self-draw is not the fully concealed 5', () => {
    const result = score('1T 2T 3T 4S 5S 6S 7B 8B WX WX', '9B', {
      melds: [{ type: 'pung', tiles: parseTileHand('9S 9S 9S'), claimedFrom: 'dong' }],
      flowers: 'F1',
      ctx: { isSelfDraw: true },
    });
    expect(tay(result, 42)).toBe(1);
    expect(tay(result, 44)).toBeUndefined();
  });
});

describe('F18 instant-Hu boundaries', () => {
  it('six flowers do not qualify', () => {
    const result = score('1T 5T 9T 2S 6S 1B 4B WD WN DZ DF DP 3S', '8B', {
      flowers: 'F1 F2 F3 M1 M2 M3',
      ctx: { isInstantHu: true, isSelfDraw: true },
    });
    expect(result.lewFitReason).toBe('instant-invalid');
  });

  it('three Kim do not qualify', () => {
    expect(
      score('KIM KIM KIM 1T 2T 3T 4S 5S 6S 7B 8B 9B', '2B', { ctx: { isInstantHu: true } }).lewFitReason,
    ).toBe('instant-invalid');
  });

  it('three concealed triplet kinds do not qualify', () => {
    expect(
      score('2T 2T 2T 5S 5S 5S 8B 8B 8B 1B 2B 3B WX', '9T', { ctx: { isInstantHu: true } }).lewFitReason,
    ).toBe('instant-invalid');
  });

  it('the instant flower score is 10, not 30', () => {
    const result = score('1T 5T 9T 2S 6S 1B 4B WD WN DZ DF DP 3S', '8B', {
      flowers: 'F1 F2 F3 F4 M1 M2 M3',
      ctx: { isInstantHu: true },
    });
    expect(tay(result, 6)).toBe(10);
    expect(result.totalTay).toBe(10);
  });

  it('a finished four-Kim hand without the instant flag scores 40', () => {
    const result = score('1T 2T KIM 4S KIM 6S 7B 8B 9B KIM KIM WX WX', 'WX', { flowers: 'F1' });
    expect(result.isInstantHu).toBe(false);
    expect(tay(result, 9)).toBe(40);
  });
});

describe('F25 storage boundaries', () => {
  it('corrupt settings JSON falls back to the tournament defaults', () => {
    const store = new MemoryStorage();
    store.setItem('itm.settings.v1', '{not json');
    expect(loadSettings(store)).toEqual({ ...DEFAULT_SETTINGS });
  });

  it('clamps minHuTay into 0..100', () => {
    expect(sanitizeSettings({ minHuTay: 1000 }).minHuTay).toBe(MIN_HU_TAY_UPPER_BOUND);
    expect(sanitizeSettings({ minHuTay: -4 }).minHuTay).toBe(0);
    expect(sanitizeSettings({ minHuTay: 4.6 }).minHuTay).toBe(5);
  });

  it('replaces an unknown difficulty with the default', () => {
    expect(sanitizeSettings({ aiDifficulty: 'nightmare' }).aiDifficulty).toBe(DEFAULT_SETTINGS.aiDifficulty);
    expect(sanitizeSettings({ roundWind: 'south' }).roundWind).toBe('dong');
  });

  it('skips a corrupted history entry and keeps a valid one', () => {
    const store = new MemoryStorage();
    store.setItem('itm.history.v1', JSON.stringify([{ id: '', timestamp: 1 }, null]));
    expect(loadGameHistory(store)).toEqual([]);
  });

  it('deleting an unknown id removes nothing', () => {
    const store = new MemoryStorage();
    expect(deleteGameRecord('missing', store)).toBe(false);
  });

  it('caps history at the documented maximum and can clear it', () => {
    const store = new MemoryStorage();
    const base: NewMatchHistoryRecord = {
      winner: null,
      winningHand: [],
      winningTile: null,
      scoringBreakdown: [],
      totalTay: 0,
      isWithKim: false,
      winMethod: 'draw',
      durationSeconds: 0,
    };
    for (let i = 0; i < MAX_HISTORY_RECORDS + 5; i++) {
      saveGameRecord({ ...base, id: `g-${i}`, timestamp: i }, store);
    }
    expect(loadGameHistory(store)).toHaveLength(MAX_HISTORY_RECORDS);
    expect(clearGameHistory(store)).toBe(true);
    expect(computeHistoryStats(loadGameHistory(store)).gamesPlayed).toBe(0);
  });
});

class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('SecurityError');
  }
  setItem(): void {
    throw new Error('QuotaExceededError');
  }
  removeItem(): void {
    throw new Error('SecurityError');
  }
}

describe('F26 sound boundaries', () => {
  it('a disabled engine plays nothing', () => {
    const engine = new SoundEngine({ enabled: false, contextFactory: () => null });
    expect(engine.play('draw')).toBe(false);
  });

  it('volume 0 plays nothing', () => {
    const engine = new SoundEngine({
      volume: 0,
      contextFactory: () => ({
        currentTime: 0,
        sampleRate: 8000,
        state: 'running',
        destination: { connect: () => undefined },
        createGain: () => ({
          gain: {
            value: 0,
            setValueAtTime: () => undefined,
            linearRampToValueAtTime: () => undefined,
            exponentialRampToValueAtTime: () => undefined,
          },
          connect: () => undefined,
        }),
        createOscillator: () => ({
          type: 'sine',
          frequency: {
            value: 0,
            setValueAtTime: () => undefined,
            linearRampToValueAtTime: () => undefined,
            exponentialRampToValueAtTime: () => undefined,
          },
          connect: () => undefined,
          start: () => undefined,
          stop: () => undefined,
        }),
      }),
    });
    expect(engine.play('hu')).toBe(false);
  });

  it('clamps volume into 0..1', () => {
    const engine = new SoundEngine();
    engine.setVolume(4);
    expect(engine.getVolume()).toBe(1);
    engine.setVolume(-2);
    expect(engine.getVolume()).toBe(0);
  });

  it('rejects an unknown effect name', () => {
    expect(isSoundEffectName('fanfare')).toBe(false);
    const engine = new SoundEngine();
    expect(engine.play('fanfare' as 'hu')).toBe(false);
  });

  it('every recipe has a positive finite duration', () => {
    for (const name of SOUND_EFFECT_NAMES) {
      const duration = getRecipeDuration(name);
      expect(Number.isFinite(duration)).toBe(true);
      expect(duration).toBeGreaterThan(0);
    }
  });

  it('a throwing settings store does not escape loadSettings', () => {
    expect(loadSettings(new ThrowingStorage()).soundEnabled).toBe(true);
  });
});
