/**
 * Tier 3 — cross-feature pairs (PROJECT.md F01–F18 and F25–F26).
 * Each test exercises at least two features together. Expectations follow the
 * current engine, including the three scoring mismatches pinned in the audit.
 */
import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/core/game-engine';
import { Wall } from '@/core/wall';
import { createCompleteTileSet, isBonus, isKim, keyToTile, parseTileHand, tileToKey } from '@/core/tiles';
import type { GameRules, Meld, Tile } from '@/core/types';
import {
  STRICT_NO_KIM_RULES,
  TOURNAMENT_KIM_RULES,
  findWinningDecompositions,
} from '@/kim';
import { scoringEngine, type ScoringResult, type WinContext } from '@/scoring';
import {
  CASUAL_SETTINGS,
  MemoryStorage,
  TOURNAMENT_SETTINGS,
  loadSettings,
  saveSettings,
  toGameRules,
  updateSettings,
} from '@/storage';
import { SoundEngine, playSound, type AudioContextLike } from '@/audio';

const RULES: GameRules = {
  kimEnabled: true,
  kimDiscardAllowed: false,
  allowKimInMeldClaim: false,
  minHuTay: 5,
};

const PING = '1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S';
const CHICKEN = '1T 2T 3T 4S 5S 6S 7B 8B 9B WN WN WN 4T';

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

function quietTiles(): Tile[] {
  return createCompleteTileSet().filter((t) => !isBonus(t));
}

function startQuiet(rules?: Partial<GameRules>): GameEngine {
  const engine = new GameEngine(rules, new Wall(quietTiles(), null));
  engine.startNewGame(true);
  return engine;
}

function fakeAudio(): AudioContextLike {
  const param = () => ({
    value: 0,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  });
  return {
    currentTime: 0,
    sampleRate: 8000,
    state: 'running',
    destination: { connect: () => undefined },
    createGain: () => ({ gain: param(), connect: () => undefined }),
    createOscillator: () => ({
      type: 'sine',
      frequency: param(),
      connect: () => undefined,
      start: () => undefined,
      stop: () => undefined,
    }),
  };
}

describe('F01 × F02 tile set and wall', () => {
  it('deals 53 tiles from the ordered 148-tile set and leaves a Kim at the tail', () => {
    const set = createCompleteTileSet();
    expect(set).toHaveLength(148);
    expect(new Set(set.map((t) => t.id)).size).toBe(148);

    const engine = new GameEngine(undefined, new Wall(set, null));
    engine.startNewGame(false);
    const state = engine.getState();
    const dealt = (['dong', 'nan', 'xi', 'bei'] as const).flatMap((seat) => state.players[seat].hand);
    expect(dealt).toHaveLength(53);
    expect(state.players.dong.hand).toHaveLength(14);
    expect(state.players.nan.hand).toHaveLength(13);
    expect(state.wall.remainingCount).toBe(95);
    expect(dealt.every((t) => set.some((source) => source.id === t.id))).toBe(true);
    expect(tileToKey(state.wall.drawTail()!)).toBe('KIM');
  });
});

describe('F02 × F03 × F05 wall, turn, and flowers', () => {
  it('replaces a dealt flower from the tail and leaves East ready to discard', () => {
    const all = createCompleteTileSet();
    const flower = all.find((t) => t.id === 'flower-1-1')!;
    const rest = all.filter((t) => t.id !== flower.id);
    const engine = new GameEngine(undefined, new Wall([flower, ...rest], null));
    engine.startNewGame(true);
    const east = engine.getState().players.dong;
    expect(east.flowers.map((t) => t.id)).toEqual(['flower-1-1']);
    expect(east.hand.some(isBonus)).toBe(false);
    expect(east.hand.some(isKim)).toBe(true);
    expect(east.hand).toHaveLength(14);
    expect(engine.getState().wall.remainingCount).toBe(94);
    expect(engine.getState().phase).toBe('ACTION_DECISION');
    expect(engine.getState().currentTurn).toBe('dong');
  });

  it('a passed discard draws the next head tile, and an empty wall is a draw', () => {
    const engine = startQuiet();
    const before = engine.getState().wall.remainingCount;
    const tile = engine.getState().players.dong.hand[0]!;
    engine.discard('dong', tile.id);
    expect(engine.resolveClaimWindow().winningAction).toBe('pass');
    expect(engine.getState().currentTurn).toBe('nan');
    expect(engine.getState().players.nan.hand).toHaveLength(14);
    expect(engine.getState().wall.remainingCount).toBe(before - 1);

    while (!engine.getState().wall.isEmpty) engine.getState().wall.drawHead();
    const south = engine.getState().players.nan.hand[0]!;
    engine.discard('nan', south.id);
    expect(engine.resolveClaimWindow().nextPhase).toBe('DRAW_SERI');
    expect(engine.getState().phase).toBe('DRAW_SERI');
  });
});

describe('F03 × F04 × F07 × F25 claims and Kim rules', () => {
  it('a Pung claim gives the turn to the claimant and does not draw', () => {
    const engine = startQuiet();
    const state = engine.getState();
    const before = state.wall.remainingCount;
    state.players.dong.hand = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 1B 2B 3B 4B 5S');
    state.players.xi.hand = parseTileHand('5S 5S 1T 2T 3T 4T 5T 6T 7T 8T 9T 1B 2B');
    const five = state.players.dong.hand.find((t) => t.type === 'sok' && t.value === 5)!;
    engine.discard('dong', five.id);
    engine.submitClaim({ seat: 'xi', action: 'pung' });
    const resolved = engine.resolveClaimWindow();
    expect(resolved.winningAction).toBe('pung');
    expect(resolved.nextTurn).toBe('xi');
    expect(engine.getState().phase).toBe('ACTION_DECISION');
    expect(engine.getState().currentTurn).toBe('xi');
    expect(engine.getState().players.xi.melds[0]!.type).toBe('pung');
    expect(engine.getState().wall.remainingCount).toBe(before);
  });

  it('tournament settings foul a Kim inside a Pung claim; casual settings accept the Kim-assisted Pung', () => {
    function rig(rules: GameRules): { engine: GameEngine; kim: Tile; five: Tile } {
      const engine = startQuiet(rules);
      const state = engine.getState();
      state.players.dong.hand = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 1B 2B 3B 4B 5S');
      const kim = keyToTile('KIM', 4);
      const five = keyToTile('5S', 3);
      state.players.xi.hand = [five, kim, ...parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 1B 2B')];
      const discarded = state.players.dong.hand.find((t) => t.type === 'sok' && t.value === 5)!;
      engine.discard('dong', discarded.id);
      return { engine, kim, five };
    }

    const store = new MemoryStorage();
    saveSettings(TOURNAMENT_SETTINGS, store);
    const tournament = rig(toGameRules(loadSettings(store)));
    expect(() =>
      tournament.engine.submitClaim({
        seat: 'xi',
        action: 'pung',
        meldTiles: [tournament.five, tournament.kim],
      }),
    ).toThrow(/Kim/i);

    saveSettings(CASUAL_SETTINGS, store);
    // Casual allowKimInMeldClaim: the Kim fills the missing copy, and the claim resolves into a Pung.
    const casual = rig(toGameRules(loadSettings(store)));
    casual.engine.submitClaim({
      seat: 'xi',
      action: 'pung',
      meldTiles: [casual.five, casual.kim],
    });
    expect(casual.engine.resolveClaimWindow().winningAction).toBe('pung');
    expect(casual.engine.getState().players.xi.melds[0]!.tiles.map((t) => t.id)).toEqual(
      expect.arrayContaining([casual.five.id, casual.kim.id]),
    );
  });

  it('rules loaded from tournament settings reject a Kim discard from a 14-tile hand', () => {
    const store = new MemoryStorage();
    saveSettings(TOURNAMENT_SETTINGS, store);
    const engine = startQuiet(toGameRules(loadSettings(store)));
    const hand = engine.getState().players.dong.hand;
    const kim = keyToTile('KIM', 4);
    hand[hand.length - 1] = kim;
    expect(hand).toHaveLength(14);
    expect(() => engine.discard('dong', kim.id)).toThrow(/Kim/i);
    expect(engine.getState().phase).toBe('ACTION_DECISION');
  });
});

describe('F05 × F06 × F07 × F08 × F10 × F11 × F15 scoring pairs', () => {
  it('an exposed seat flower adds 1 on top of the four-flower set', () => {
    const result = score(PING, '5S', { flowers: 'F1 F2 F3 F4', ctx: { seatWind: 'dong' } });
    expect(tay(result, 1)).toBe(1);
    expect(tay(result, 4)).toBe(10);
    expect(result.isValidHu).toBe(true);
  });

  it('seven bonus tiles pay 30 on a finished hand and 10 on the instant path', () => {
    const flowers = 'F1 F2 F3 F4 M1 M2 M3';
    const finished = score(PING, '5S', { flowers, ctx: { isSelfDraw: true } });
    expect(tay(finished, 6)).toBe(30);
    expect(finished.isInstantHu).toBe(false);
    expect(finished.totalTay).toBeGreaterThanOrEqual(30);

    const instant = score('1T 5T 9T 2S 6S 1B 4B WD WN DZ DF DP 3S', '8B', {
      flowers,
      ctx: { isSelfDraw: true, isInstantHu: true },
    });
    expect(instant.isInstantHu).toBe(true);
    expect(instant.totalTay).toBe(10);
    expect(tay(instant, 6)).toBe(10);
    expect(instant.isValidHu).toBe(true);
  });

  it('a Kim chow solves in tournament mode and does not solve when Kim is disabled', () => {
    const hand = [...parseTileHand('1T 2T KIM 4T 5T 6T 7T 8T 9T 2S 3S 4S 5B'), keyToTile('5B', 9)];
    const tournament = findWinningDecompositions({ hand, rules: TOURNAMENT_KIM_RULES });
    expect(tournament.length).toBeGreaterThan(0);
    expect(tournament.every((s) => s.mode === 'K')).toBe(true);
    expect(findWinningDecompositions({ hand, rules: STRICT_NO_KIM_RULES })).toHaveLength(0);
  });

  it('one Kim forces K mode, scores Tile KIM, and drops Bo Kim', () => {
    const result = score('1T 2T KIM 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S', '5S');
    expect(result.mode).toBe('K');
    expect(tay(result, 7)).toBe(1);
    expect(tay(result, 8)).toBeUndefined();
    expect(tay(result, 14)).toBe(3);
    expect(result.isValidHu).toBe(true);
  });

  it('three Kim as their own pung score Kim Thi 30 and not Kim Ciok', () => {
    const result = score('KIM KIM KIM 1T 1T 1T 9T 9T 9T 1S 1S 1S 9S', '9S', {
      ctx: { isSelfDraw: true },
    });
    expect(result.mode).toBe('K');
    expect(tay(result, 30)).toBe(30);
    expect(tay(result, 32)).toBeUndefined();
    expect(result.isValidHu).toBe(true);
    expect(result.totalTay).toBeGreaterThan(30);
  });
});

describe('F08 × F09 × F12 × F13 × F14 × F15 × F17 columns and the gate', () => {
  it('Pao Chin is 30 without Kim and 20 with Kim', () => {
    const nk = score(PING, '5S', { ctx: { isPaoChin: true } });
    const k = score('1T 2T KIM 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S', '5S', { ctx: { isPaoChin: true } });
    expect(nk.mode).toBe('NK');
    expect(tay(nk, 10)).toBe(30);
    expect(k.mode).toBe('K');
    expect(tay(k, 10)).toBe(20);
    expect(tay(k, 8)).toBeUndefined();
  });

  it('four concealed pungs use the NK Tuei and Si Am Kang columns, then the K columns', () => {
    const nk = score('2T 2T 2T 5S 5S 5S 8B 8B 8B WN WN WN 4T', '4T', {
      ctx: { isSelfDraw: true, seatWind: 'xi' },
    });
    expect(nk.mode).toBe('NK');
    expect(tay(nk, 15)).toBe(10);
    expect(tay(nk, 34)).toBe(30);

    const k = score('KIM 2T 2T 5S 5S 5S 8B 8B 8B WN WN WN 4T', '4T', {
      ctx: { isSelfDraw: true, seatWind: 'xi' },
    });
    expect(k.mode).toBe('K');
    expect(tay(k, 7)).toBe(1);
    expect(tay(k, 15)).toBe(5);
    expect(tay(k, 34)).toBe(20);
    expect(tay(k, 8)).toBeUndefined();
  });

  it('Bo Kim plus Mun is 4 Tay and Lew Fit; the seat flower makes the same hand legal', () => {
    const short = score(CHICKEN, '4T', { ctx: { seatWind: 'dong' } });
    expect(short.mode).toBe('NK');
    expect(tay(short, 8)).toBe(3);
    expect(tay(short, 43)).toBe(1);
    expect(short.totalTay).toBe(4);
    expect(short.isValidHu).toBe(false);
    expect(short.lewFitReason).toBe('below-minimum');

    const cleared = score(CHICKEN, '4T', { flowers: 'F1', ctx: { seatWind: 'dong' } });
    expect(tay(cleared, 1)).toBe(1);
    expect(cleared.totalTay).toBe(5);
    expect(cleared.isValidHu).toBe(true);
  });

  it('an instant 10 clears the default 5 Tay gate that still rejects a 4 Tay Ron', () => {
    const instant = score('1T 5T 9T 2S 6S 1B 4B WD WN DZ DF DP 3S', '8B', {
      flowers: 'F1 F2 F3 F4 M1 M2 M3',
      ctx: { isSelfDraw: true, isInstantHu: true },
    });
    expect(instant.totalTay).toBe(10);
    expect(instant.minHuTay).toBe(5);
    expect(instant.isValidHu).toBe(true);

    const chicken = score(CHICKEN, '4T', { ctx: { seatWind: 'dong' } });
    expect(chicken.totalTay).toBe(4);
    expect(chicken.minHuTay).toBe(5);
    expect(chicken.isValidHu).toBe(false);
  });

  it("East's opening self-draw is Thien Fu together with a concealed self-draw", () => {
    const result = score(PING, '5S', {
      ctx: { isSelfDraw: true, isInitialDeal: true, seatWind: 'dong' },
    });
    expect(result.mode).toBe('NK');
    expect(tay(result, 11)).toBe(60);
    expect(tay(result, 44)).toBe(5);
    expect(tay(result, 12)).toBeUndefined();
    expect(tay(result, 43)).toBeUndefined();
    expect(result.isValidHu).toBe(true);
  });

  it('Tris Zhong stays 2 Tay after a Kim switches the hand to K', () => {
    const nk = score('DZ DZ DZ 2S 3S 4S 5B 6B 7B 8T 8T 8T 4S', '4S', { ctx: { seatWind: 'xi' } });
    expect(nk.mode).toBe('NK');
    expect(tay(nk, 27)).toBe(2);

    const k = score('DZ DZ DZ 2S 3S KIM 5B 6B 7B 8T 8T 8T 4S', '4S', {
      flowers: 'F1',
      ctx: { seatWind: 'dong' },
    });
    expect(k.mode).toBe('K');
    expect(tay(k, 27)).toBe(2);
    expect(tay(k, 7)).toBe(1);
    expect(tay(k, 8)).toBeUndefined();
  });

  it('Ta San Yen stacks with the three dragon pungs and Tuei Tuei', () => {
    const result = score('DZ DZ DZ DF DF DF DP DP 5T 5T 5T 9S 9S', 'DP', {
      ctx: { isSelfDraw: true },
    });
    expect(result.mode).toBe('NK');
    expect(tay(result, 22)).toBe(40);
    expect(tay(result, 27)).toBe(2);
    expect(tay(result, 28)).toBe(1);
    expect(tay(result, 29)).toBe(1);
    expect(tay(result, 15)).toBe(10);
    expect(result.isValidHu).toBe(true);
  });
});

describe('F09 × F16 × F17 × F18 × F25 × F26 gate, kongs, and settings', () => {
  it('a stored minimum of 6 rejects the exact-5 flower hand that the default accepts', () => {
    const store = new MemoryStorage();
    saveSettings({ ...TOURNAMENT_SETTINGS, minHuTay: 6 }, store);
    const raised = score(CHICKEN, '4T', {
      flowers: 'F1',
      ctx: { seatWind: 'dong' },
      rules: toGameRules(loadSettings(store)),
    });
    expect(raised.totalTay).toBe(5);
    expect(raised.minHuTay).toBe(6);
    expect(raised.isValidHu).toBe(false);
    expect(raised.lewFitReason).toBe('below-minimum');

    saveSettings(TOURNAMENT_SETTINGS, store);
    const standard = score(CHICKEN, '4T', {
      flowers: 'F1',
      ctx: { seatWind: 'dong' },
      rules: toGameRules(loadSettings(store)),
    });
    expect(standard.minHuTay).toBe(5);
    expect(standard.isValidHu).toBe(true);
  });

  it('one Kong replacement is Kong Song plus an open self-draw', () => {
    const result = score('1T 2T 3T 4S 5S 6S 7B 8B WX WX', '9B', {
      melds: [{ type: 'kong', tiles: parseTileHand('9S 9S 9S 9S'), claimedFrom: 'dong' }],
      ctx: { isSelfDraw: true, isKongReplacement: true },
    });
    expect(tay(result, 37)).toBe(5);
    expect(tay(result, 42)).toBe(1);
    expect(tay(result, 38)).toBeUndefined();
    expect(tay(result, 44)).toBeUndefined();
    expect(result.isValidHu).toBe(true);
  });

  it('robbing a Kong scores Chiong Kong on a concealed discard win', () => {
    const result = score(PING, '5S', { ctx: { isRobbingKong: true } });
    expect(tay(result, 35)).toBe(5);
    expect(tay(result, 43)).toBe(1);
    expect(tay(result, 36)).toBeUndefined();
    expect(tay(result, 42)).toBeUndefined();
    expect(tay(result, 44)).toBeUndefined();
    expect(result.isValidHu).toBe(true);
  });

  it('sound switched off in storage silences playSound and a live engine', () => {
    const store = new MemoryStorage();
    saveSettings(TOURNAMENT_SETTINGS, store);
    const silenced = updateSettings({ soundEnabled: false }, store);
    expect(loadSettings(store).soundEnabled).toBe(false);
    expect(playSound('hu', silenced)).toBe(false);
    expect(playSound('discard', loadSettings(store))).toBe(false);

    const engine = new SoundEngine({ contextFactory: fakeAudio, enabled: true });
    expect(engine.play('hu')).toBe(true);
    engine.applySettings(loadSettings(store));
    expect(engine.isEnabled()).toBe(false);
    expect(engine.play('discard')).toBe(false);
  });
});
