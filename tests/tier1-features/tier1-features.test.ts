/**
 * Tier 1 — feature coverage (PROJECT.md F28).
 * At least five happy-path cases for each of F01–F18 and F25–F26.
 */
import { describe, expect, it } from 'vitest';
import { GameEngine, getNextSeat } from '@/core/game-engine';
import { Wall } from '@/core/wall';
import {
  createCompleteTileSet,
  isBonus,
  isKim,
  keyToTile,
  parseTileHand,
  tileToKey,
} from '@/core/tiles';
import type { GameRules, Meld, Tile } from '@/core/types';
import {
  CASUAL_KIM_RULES,
  KimValidator,
  STRICT_NO_KIM_RULES,
  TOURNAMENT_KIM_RULES,
  evaluateBoKim,
  evaluateTileKim,
  canFormWinningHandWithKim,
  findWinningDecompositions,
} from '@/kim';
import { scoringEngine, type ScoringResult, type WinContext } from '@/scoring';
import {
  CASUAL_SETTINGS,
  HISTORY_STORAGE_KEY,
  MemoryStorage,
  SETTINGS_STORAGE_KEY,
  TOURNAMENT_SETTINGS,
  applyPreset,
  loadGameHistory,
  loadSettings,
  saveGameRecord,
  saveSettings,
  toGameRules,
  toKimRules,
  updateSettings,
  type NewMatchHistoryRecord,
} from '@/storage';
import {
  SOUND_EFFECT_NAMES,
  SOUND_RECIPES,
  SoundEngine,
  getRecipeDuration,
  isSoundEffectName,
  playFlowerReplacement,
  playHuFanfare,
  playLewFitBuzzer,
  playMeldCall,
  playSound,
  playTileDiscard,
  playTileDraw,
  type AudioContextLike,
} from '@/audio';

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

function quietTiles(): Tile[] {
  return createCompleteTileSet().filter((t) => t.type !== 'flower' && t.type !== 'season');
}

function quietEngine(rules?: Partial<GameRules>): GameEngine {
  return new GameEngine(rules, new Wall(quietTiles(), null));
}

function startQuiet(rules?: Partial<GameRules>): GameEngine {
  const engine = quietEngine(rules);
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

const PING = '1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S';

describe('F01 148-tile set', () => {
  it('builds 148 tiles', () => {
    expect(createCompleteTileSet()).toHaveLength(148);
  });

  it('has 108 suited tiles, 36 in each suit', () => {
    const tiles = createCompleteTileSet();
    expect(tiles.filter((t) => t.type === 'tong' || t.type === 'sok' || t.type === 'ban')).toHaveLength(108);
    for (const suit of ['tong', 'sok', 'ban'] as const) {
      expect(tiles.filter((t) => t.type === suit)).toHaveLength(36);
    }
  });

  it('has 16 winds, 12 dragons, 8 bonus tiles, and 4 Kim', () => {
    const tiles = createCompleteTileSet();
    expect(tiles.filter((t) => t.type === 'wind')).toHaveLength(16);
    expect(tiles.filter((t) => t.type === 'dragon')).toHaveLength(12);
    expect(tiles.filter((t) => t.type === 'flower')).toHaveLength(4);
    expect(tiles.filter((t) => t.type === 'season')).toHaveLength(4);
    expect(tiles.filter(isKim)).toHaveLength(4);
  });

  it('gives every tile a unique id', () => {
    const ids = createCompleteTileSet().map((t) => t.id);
    expect(new Set(ids).size).toBe(148);
  });

  it('round-trips shorthand keys', () => {
    for (const key of ['1T', '9S', '5B', 'WD', 'DZ', 'F3', 'M2', 'KIM']) {
      expect(tileToKey(keyToTile(key))).toBe(key);
    }
  });

  it('parseTileHand keeps four copies distinct', () => {
    const tiles = parseTileHand('5T 5T 5T 5T');
    expect(tiles).toHaveLength(4);
    expect(new Set(tiles.map((t) => t.id)).size).toBe(4);
  });
});

describe('F02 wall and deal', () => {
  it('deals 14 to East and 13 to the other seats', () => {
    const wall = new Wall(createCompleteTileSet(), null);
    const deal = wall.dealInitialHands('dong');
    expect(deal.hands.dong).toHaveLength(14);
    expect(deal.hands.nan).toHaveLength(13);
    expect(deal.hands.xi).toHaveLength(13);
    expect(deal.hands.bei).toHaveLength(13);
    expect(deal.dealer).toBe('dong');
  });

  it('deals 53 tiles and leaves the rest in the live wall', () => {
    const wall = new Wall(createCompleteTileSet(), null);
    wall.dealInitialHands('nan');
    expect(wall.drawnCount).toBe(53);
    expect(wall.remainingCount).toBe(95);
    expect(wall.isEmpty).toBe(false);
  });

  it('has no dead wall: the last tile can be drawn', () => {
    const wall = new Wall(createCompleteTileSet(), null);
    while (wall.remainingCount > 1) wall.drawHead();
    expect(wall.drawHead()).not.toBeNull();
    expect(wall.isEmpty).toBe(true);
    expect(wall.drawHead()).toBeNull();
    expect(wall.drawTail()).toBeNull();
  });

  it('draws replacement tiles from the tail', () => {
    const wall = new Wall(createCompleteTileSet(), null);
    const tail = wall.peekTail();
    expect(tileToKey(wall.drawTail()!)).toBe('KIM');
    expect(tileToKey(tail!)).toBe('KIM');
    expect(wall.remainingCount).toBe(147);
  });

  it('replays the same wall from a seed', () => {
    const a = new Wall(undefined, 7);
    const b = new Wall(undefined, 7);
    expect(a.drawHead()!.id).toBe(b.drawHead()!.id);
  });
});

describe('F03 turn flow', () => {
  it('opens on the dealer in the action phase after flower replacement', () => {
    const engine = startQuiet();
    const state = engine.getState();
    expect(state.phase).toBe('ACTION_DECISION');
    expect(state.currentTurn).toBe('dong');
    expect(state.players.dong.hand).toHaveLength(14);
  });

  it('rotates East, South, West, North', () => {
    expect(getNextSeat('dong')).toBe('nan');
    expect(getNextSeat('nan')).toBe('xi');
    expect(getNextSeat('xi')).toBe('bei');
    expect(getNextSeat('bei')).toBe('dong');
  });

  it('a passed discard advances the turn and draws for the next seat', () => {
    const engine = startQuiet();
    const tile = engine.getState().players.dong.hand[0]!;
    engine.discard('dong', tile.id);
    const resolved = engine.resolveClaimWindow();
    expect(resolved.winningAction).toBe('pass');
    expect(engine.getState().currentTurn).toBe('nan');
    expect(engine.getState().players.nan.hand).toHaveLength(14);
    expect(engine.getState().players.dong.discards.map((t) => t.id)).toContain(tile.id);
  });

  it('declares Pao Chin on the opening turn', () => {
    const engine = startQuiet();
    expect(engine.declarePaoChin('dong')).toBe(true);
    expect(engine.getState().players.dong.isPaoChin).toBe(true);
    expect(engine.getState().players.dong.isCin).toBe(true);
  });

  it('ends the hand as a draw when the wall is empty at the pass', () => {
    const engine = startQuiet();
    while (!engine.getState().wall.isEmpty) engine.getState().wall.drawHead();
    const tile = engine.getState().players.dong.hand[0]!;
    engine.discard('dong', tile.id);
    expect(engine.resolveClaimWindow().nextPhase).toBe('DRAW_SERI');
    expect(engine.getState().phase).toBe('DRAW_SERI');
  });
});

describe('F04 claims and priority', () => {
  function rig(): GameEngine {
    const engine = startQuiet();
    const state = engine.getState();
    state.players.dong.hand = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 1B 2B 3B 4B 5S');
    state.players.nan.hand = parseTileHand('4S 6S 1T 2T 3T 4T 5T 6T 7T 8T 9T 1B 2B');
    state.players.xi.hand = parseTileHand('5S 5S 1T 2T 3T 4T 5T 6T 7T 8T 9T 1B 2B');
    state.players.bei.hand = parseTileHand('9B 9B 9B 1T 2T 3T 4T 5T 6T 7T 8T 9T 1B');
    return engine;
  }

  it('rejects Jia from anyone but the left-hand seat', () => {
    const engine = rig();
    const five = engine.getState().players.dong.hand.find((t) => t.type === 'sok' && t.value === 5)!;
    engine.discard('dong', five.id);
    expect(() => engine.submitClaim({ seat: 'xi', action: 'jia', meldTiles: [] })).toThrow(/left/i);
  });

  it('lets the left-hand seat Jia a real sequence', () => {
    const engine = rig();
    const five = engine.getState().players.dong.hand.find((t) => t.type === 'sok' && t.value === 5)!;
    engine.discard('dong', five.id);
    const south = engine.getState().players.nan.hand;
    const meldTiles = [south.find((t) => t.value === 4 && t.type === 'sok')!, south.find((t) => t.value === 6 && t.type === 'sok')!];
    engine.submitClaim({ seat: 'nan', action: 'jia', meldTiles });
    expect(engine.resolveClaimWindow().winningAction).toBe('jia');
    expect(engine.getState().players.nan.melds[0]!.type).toBe('jia');
  });

  it('Pung beats Jia', () => {
    const engine = rig();
    const five = engine.getState().players.dong.hand.find((t) => t.type === 'sok' && t.value === 5)!;
    engine.discard('dong', five.id);
    const south = engine.getState().players.nan.hand;
    engine.submitClaim({
      seat: 'nan',
      action: 'jia',
      meldTiles: [south.find((t) => t.value === 4 && t.type === 'sok')!, south.find((t) => t.value === 6 && t.type === 'sok')!],
    });
    engine.submitClaim({ seat: 'xi', action: 'pung' });
    const resolved = engine.resolveClaimWindow();
    expect(resolved.winningAction).toBe('pung');
    expect(resolved.nextTurn).toBe('xi');
  });

  it('Hu beats Pung', () => {
    const engine = new GameEngine(undefined, new Wall(quietTiles(), null), { huValidator: () => true });
    engine.startNewGame(true);
    const state = engine.getState();
    state.players.dong.hand = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 1B 2B 3B 4B 5S');
    state.players.nan.hand = parseTileHand('5S 5S 1T 2T 3T 4T 5T 6T 7T 8T 9T 1B 2B');
    state.players.xi.hand = parseTileHand('9B 9B 1T 2T 3T 4T 5T 6T 7T 8T 9T 1B 2B');
    const five = state.players.dong.hand.find((t) => t.type === 'sok' && t.value === 5)!;
    engine.discard('dong', five.id);
    engine.submitClaim({ seat: 'nan', action: 'pung' });
    engine.submitClaim({ seat: 'xi', action: 'hu' });
    const resolved = engine.resolveClaimWindow();
    expect(resolved.winningAction).toBe('hu');
    expect(resolved.winnerSeat).toBe('xi');
    expect(engine.getState().phase).toBe('RESOLVED_HU');
  });

  it('the nearer downstream Hu wins a double Hu', () => {
    const engine = new GameEngine(undefined, new Wall(quietTiles(), null), { huValidator: () => true });
    engine.startNewGame(true);
    const tile = engine.getState().players.dong.hand[0]!;
    engine.discard('dong', tile.id);
    engine.submitClaim({ seat: 'xi', action: 'hu' });
    engine.submitClaim({ seat: 'nan', action: 'hu' });
    expect(engine.resolveClaimWindow().winnerSeat).toBe('nan');
  });
});

describe('F05 flower and season replacement', () => {
  it('moves a dealt flower out of the hand and draws a tail replacement', () => {
    const all = createCompleteTileSet();
    const flower = all.find((t) => t.id === 'flower-1-1')!;
    const season = all.find((t) => t.id === 'season-1-1')!;
    const rest = all.filter((t) => t.id !== flower.id && t.id !== season.id);
    const engine = new GameEngine(undefined, new Wall([flower, ...rest, season], null));
    const records = engine.startNewGame(true);
    const east = engine.getState().players.dong;
    expect(east.flowers.map((t) => t.type).sort()).toEqual(['flower', 'season']);
    expect(east.hand.some(isBonus)).toBe(false);
    expect(east.hand).toHaveLength(14);
    expect(records[0]!.seat).toBe('dong');
    expect(records[0]!.flowers).toHaveLength(2);
  });

  it('leaves a flower-free deal with empty bonus racks', () => {
    const engine = startQuiet();
    for (const seat of ['dong', 'nan', 'xi', 'bei'] as const) {
      expect(engine.getState().players[seat].flowers).toHaveLength(0);
      expect(engine.getState().players[seat].hand.some(isBonus)).toBe(false);
    }
  });

  it('exposes a flower drawn on a later turn and replaces it from the tail', () => {
    const tiles = quietTiles();
    const flower = createCompleteTileSet().find((t) => t.id === 'flower-2-1')!;
    tiles.splice(53, 0, flower);
    const engine = new GameEngine(undefined, new Wall(tiles, null));
    engine.startNewGame(true);
    const tile = engine.getState().players.dong.hand[0]!;
    engine.discard('dong', tile.id);
    const drawn = engine.resolveClaimWindow();
    expect(drawn.winningAction).toBe('pass');
    const south = engine.getState().players.nan;
    expect(south.flowers.some((t) => t.id === 'flower-2-1')).toBe(true);
    expect(south.hand.some(isBonus)).toBe(false);
    expect(south.hand).toHaveLength(14);
  });

  it('scores an exposed seat flower at +1', () => {
    const result = score(PING, '5S', { flowers: 'F1', ctx: { seatWind: 'dong' } });
    expect(tay(result, 1)).toBe(1);
  });

  it('scores an exposed season at 1, plus 1 when it matches the seat', () => {
    const result = score(PING, '5S', { flowers: 'M3', ctx: { seatWind: 'xi' } });
    expect(tay(result, 2)).toBe(2);
  });
});

describe('F06 Kim wildcard solver', () => {
  it('solves a natural Ping Fu as NK', () => {
    const hand = [...parseTileHand(PING), keyToTile('5S', 9)];
    const solved = findWinningDecompositions({ hand, rules: TOURNAMENT_KIM_RULES });
    expect(solved.some((s) => s.shape === 'standard' && s.mode === 'NK')).toBe(true);
  });

  it('uses one Kim to complete a sequence and marks the hand K', () => {
    const hand = [...parseTileHand('1T 2T KIM 4T 5T 6T 7T 8T 9T 2S 3S 4S 5B'), keyToTile('5B', 9)];
    const solved = findWinningDecompositions({ hand, rules: TOURNAMENT_KIM_RULES });
    expect(solved.length).toBeGreaterThan(0);
    expect(solved.every((s) => s.mode === 'K')).toBe(true);
    expect(solved.some((s) => s.totalKims === 1)).toBe(true);
  });

  it('finds seven pairs', () => {
    const hand = parseTileHand('1T 1T 2T 2T 3T 3T 4T 4T 5T 5T 6T 6T 7T 7T');
    const solved = findWinningDecompositions({ hand, rules: TOURNAMENT_KIM_RULES });
    expect(solved.some((s) => s.shape === 'seven_pairs')).toBe(true);
  });

  it('finds thirteen orphans', () => {
    const hand = parseTileHand('1T 9T 1S 9S 1B 9B WD WN WX WB DZ DF DP 1T');
    const solved = findWinningDecompositions({ hand, rules: TOURNAMENT_KIM_RULES });
    expect(solved.some((s) => s.shape === 'thirteen_orphans')).toBe(true);
  });

  it('accepts four Kim as an instant winning condition', () => {
    const hand = [...parseTileHand('KIM KIM KIM 1T 2T 3T 4S 5S 6S 7B 8B 9B'), keyToTile('KIM', 9)];
    expect(canFormWinningHandWithKim(hand, [], TOURNAMENT_KIM_RULES)).toBe(true);
  });
});

describe('F07 Kim rule configuration', () => {
  it('tournament rules forbid discarding Kim', () => {
    const validator = new KimValidator(TOURNAMENT_KIM_RULES);
    expect(validator.canDiscard(keyToTile('KIM')).valid).toBe(false);
    expect(TOURNAMENT_KIM_RULES.kimDiscardAllowed).toBe(false);
    expect(TOURNAMENT_KIM_RULES.allowKimInMeldClaim).toBe(false);
  });

  it('tournament rules still allow Kim inside a concealed hand', () => {
    expect(TOURNAMENT_KIM_RULES.allowKimInJia).toBe(true);
    expect(TOURNAMENT_KIM_RULES.allowKimInPair).toBe(true);
    expect(TOURNAMENT_KIM_RULES.kimEnabled).toBe(true);
  });

  it('casual rules allow a Kim meld claim and still forbid a Kim discard', () => {
    expect(CASUAL_KIM_RULES.allowKimInMeldClaim).toBe(true);
    expect(new KimValidator(CASUAL_KIM_RULES).canDiscard(keyToTile('KIM')).valid).toBe(false);
  });

  it('strict rules disable Kim', () => {
    const result = new KimValidator(STRICT_NO_KIM_RULES).canDiscard(keyToTile('KIM'));
    expect(result.valid).toBe(false);
    expect(STRICT_NO_KIM_RULES.kimEnabled).toBe(false);
  });

  it('an explicit discard permit lets a Kim be thrown', () => {
    const validator = new KimValidator({ ...TOURNAMENT_KIM_RULES, kimDiscardAllowed: true });
    expect(validator.canDiscard(keyToTile('KIM')).valid).toBe(true);
    expect(validator.canDiscard(keyToTile('1T')).valid).toBe(true);
  });
});

describe('F08 K versus NK tracking', () => {
  it('scores Bo Kim at 3 Tay only in NK', () => {
    expect(evaluateBoKim('NK')!.tay).toBe(3);
    expect(evaluateBoKim('K')).toBeNull();
  });

  it('scores 1 Tay per Kim only in K', () => {
    expect(evaluateTileKim(3, 'K')!.tay).toBe(3);
    expect(evaluateTileKim(3, 'NK')).toBeNull();
  });

  it('a kim-less winning hand is NK', () => {
    expect(score(PING, '5S').mode).toBe('NK');
    expect(score(PING, '5S').isWithKim).toBe(false);
  });

  it('a hand that uses a Kim is K and not Bo Kim', () => {
    const result = score('1T 2T KIM 4T 5T 6T 7T 8T 9T 2S 3S 4S 5B', '5B');
    expect(result.mode).toBe('K');
    expect(result.isWithKim).toBe(true);
    expect(tay(result, 8)).toBeUndefined();
    expect(tay(result, 7)).toBe(1);
  });

  it('four Kim in a finished hand stay in K and score Shi Kim', () => {
    const result = score('1T 2T KIM 4S KIM 6S 7B 8B 9B KIM KIM WX WX', 'WX', { flowers: 'F1' });
    expect(result.mode).toBe('K');
    expect(tay(result, 9)).toBe(40);
  });
});

describe('F09 5-Tay gate', () => {
  const chicken = '1T 2T 3T 4S 5S 6S 7B 8B 9B WN WN WN 4T';

  it('rejects a 4 Tay Ron as Lew Fit', () => {
    const result = score(chicken, '4T', { ctx: { seatWind: 'dong', roundWind: 'dong' } });
    expect(result.totalTay).toBe(4);
    expect(result.lewFitReason).toBe('below-minimum');
  });

  it('accepts the same hand at exactly 5 Tay', () => {
    const result = score(chicken, '4T', { flowers: 'F1', ctx: { seatWind: 'dong', roundWind: 'dong' } });
    expect(result.totalTay).toBe(5);
    expect(result.isValidHu).toBe(true);
  });

  it('accepts a Ping Fu concealed self-draw well above the gate', () => {
    const result = score(PING, '5S', { ctx: { isSelfDraw: true } });
    expect(result.totalTay).toBeGreaterThanOrEqual(5);
    expect(result.isValidHu).toBe(true);
    expect(result.isLewFit).toBe(false);
  });

  it('rejects a shape that is not a Hu before the Tay gate', () => {
    const result = score('1T 3T 5T 7T 9T 2S 4S 6S 8S WD WN DZ DF', 'DP');
    expect(result.lewFitReason).toBe('structure');
  });

  it('records the active minimum on the result', () => {
    expect(score(PING, '5S').minHuTay).toBe(5);
  });
});

describe('F10 flowers and seasons', () => {
  it('scores all four flowers at 10', () => {
    expect(tay(score(PING, '5S', { flowers: 'F1 F2 F3 F4' }), 4)).toBe(10);
  });

  it('scores all four seasons at 20', () => {
    expect(tay(score(PING, '5S', { flowers: 'M1 M2 M3 M4' }), 5)).toBe(20);
  });

  it('scores seven bonus tiles at 30 inside a finished hand', () => {
    expect(tay(score(PING, '5S', { flowers: 'F1 F2 F3 F4 M1 M2 M3' }), 6)).toBe(30);
  });

  it('scores Bo Hua Zi at 3 when the hand has no bonus and no honor', () => {
    expect(tay(score(PING, '5S'), 3)).toBe(3);
  });

  it('a non-matching flower is worth 0 Tay', () => {
    expect(tay(score(PING, '5S', { flowers: 'F2', ctx: { seatWind: 'dong' } }), 1)).toBe(0);
  });
});

describe('F11 Kim patterns', () => {
  it('scores two Kim at 2 Tay', () => {
    const result = score('1T 2T KIM 4S KIM 6S 7B 8B 9B WX WX WX 5T', '5T', { flowers: 'F1' });
    expect(tay(result, 7)).toBe(2);
  });

  it('scores Bo Kim at 3 when the hand has none', () => {
    expect(tay(score(PING, '5S'), 8)).toBe(3);
  });

  it('scores Shi Kim at 40 in a finished hand', () => {
    expect(tay(score('1T 2T KIM 4S KIM 6S 7B 8B 9B KIM KIM WX WX', 'WX', { flowers: 'F1' }), 9)).toBe(40);
  });

  it('scores Kim Thi at 30', () => {
    expect(tay(score('KIM KIM KIM 1T 1T 1T 9T 9T 9T 1S 1S 1S 9S', '9S', { ctx: { isSelfDraw: true } }), 30)).toBe(30);
  });

  it('scores a Kim-Kim eye at 20', () => {
    expect(tay(score('1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX KIM KIM', 'WX', { flowers: 'F1' }), 32)).toBe(20);
  });
});

describe('F12 first-turn wins', () => {
  it('scores Pao Chin at 30 NK', () => {
    expect(tay(score(PING, '5S', { ctx: { isPaoChin: true } }), 10)).toBe(30);
  });

  it('scores Pao Chin at 20 K', () => {
    expect(tay(score('1T 2T KIM 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S', '5S', { ctx: { isPaoChin: true } }), 10)).toBe(20);
  });

  it('scores Thien Fu at 60 for East', () => {
    expect(tay(score(PING, '5S', { ctx: { isSelfDraw: true, isInitialDeal: true, seatWind: 'dong' } }), 11)).toBe(60);
  });

  it('scores Thi Fu at 60 after a declared Pao Chin', () => {
    expect(tay(score(PING, '5S', { ctx: { isInitialDeal: true, isPaoChin: true, seatWind: 'nan' } }), 12)).toBe(60);
  });

  it('does not give South Thien Fu', () => {
    expect(tay(score(PING, '5S', { ctx: { isSelfDraw: true, isInitialDeal: true, seatWind: 'nan' } }), 11)).toBeUndefined();
  });
});

describe('F13 hand shapes', () => {
  it('scores Ping Fu at 3', () => {
    expect(tay(score(PING, '5S'), 14)).toBe(3);
  });

  it('scores Tuei Tuei at 10 NK', () => {
    expect(tay(score('2T 2T 2T 5S 5S 5S 8B 8B 8B WN WN WN 4T', '4T', { ctx: { isSelfDraw: true, seatWind: 'xi' } }), 15)).toBe(10);
  });

  it('scores seven pairs at 20 NK', () => {
    expect(tay(score('1T 1T 2T 2T 3T 3T 4T 4T 5T 5T 6T 6T 7T', '7T', { ctx: { isSelfDraw: true } }), 16)).toBe(20);
  });

  it('scores a pure one-suit hand as It Set 30 NK', () => {
    expect(tay(score('1T 2T 3T 4T 5T 6T 7T 8T 9T 2T 3T 4T 5T', '5T', { ctx: { isSelfDraw: true } }), 18)).toBe(30);
  });

  it('scores a mixed sequence-and-pung hand as Chicken 0 when no other shape applies', () => {
    const result = score('1T 2T 3T 4S 5S 6S 7B 8B 9B WN WN WN 4T', '4T', { ctx: { seatWind: 'dong' } });
    expect(tay(result, 13)).toBe(0);
    expect(tay(result, 14)).toBeUndefined();
    expect(tay(result, 15)).toBeUndefined();
  });
});

describe('F14 honors and dragons', () => {
  it('scores a seat-wind pung at 1', () => {
    expect(tay(score('WD WD WD 2S 3S 4S 5B 6B 7B 8T 8T 8T 4S', '4S', { ctx: { seatWind: 'dong' } }), 25)).toBe(1);
  });

  it('scores a round-wind pung at 1', () => {
    expect(tay(score('WN WN WN 2S 3S 4S 5B 6B 7B 8T 8T 8T 4S', '4S', { ctx: { roundWind: 'nan', seatWind: 'xi' } }), 26)).toBe(1);
  });

  it('scores Zhong 2, Fat 1, and Pat 1', () => {
    const result = score('DZ DZ DZ DF DF DF DP DP 5T 5T 5T 9S 9S', 'DP', { ctx: { isSelfDraw: true } });
    expect(tay(result, 27)).toBe(2);
    expect(tay(result, 28)).toBe(1);
    expect(tay(result, 29)).toBe(1);
  });

  it('scores Ta San Yen at 40 NK', () => {
    expect(tay(score('DZ DZ DZ DF DF DF DP DP 5T 5T 5T 9S 9S', 'DP', { ctx: { isSelfDraw: true } }), 22)).toBe(40);
  });

  it('scores thirteen orphans at 60 NK', () => {
    expect(tay(score('1T 9T 1S 9S 1B 9B WD WN WX WB DZ DF DP', '1T', { ctx: { isSelfDraw: true } }), 20)).toBe(60);
  });
});

describe('F15 concealed sets and Kim melds', () => {
  it('scores three concealed pungs as Sam Am Kang 5', () => {
    expect(tay(score('2T 2T 2T 5S 5S 5S 8B 8B 8B 1B 2B 3B WX', 'WX', { flowers: 'F1' }), 33)).toBe(5);
  });

  it('scores four concealed pungs as Si Am Kang 30 NK', () => {
    expect(tay(score('2T 2T 2T 5S 5S 5S 8B 8B 8B DZ DZ DZ WX', 'WX', { flowers: 'F1', ctx: { isSelfDraw: true } }), 34)).toBe(30);
  });

  it('scores Ji Pa Ciok at 1 for an 8 pair', () => {
    expect(tay(score('1T 2T 3T 4S 5S 6S 7B 8B 9B WN WN WN 8T', '8T', { flowers: 'F1', ctx: { seatWind: 'dong' } }), 31)).toBe(1);
  });

  it('scores a claimed Kong as an open set, so four claimed melds are Tan Tiau', () => {
    const result = score('5S', '5S', {
      melds: [
        { type: 'jia', tiles: parseTileHand('1T 2T 3T'), claimedFrom: 'dong' },
        { type: 'jia', tiles: parseTileHand('4S 5S 6S'), claimedFrom: 'dong' },
        { type: 'pung', tiles: parseTileHand('WX WX WX'), claimedFrom: 'xi' },
        { type: 'pung', tiles: parseTileHand('9B 9B 9B'), claimedFrom: 'bei' },
      ],
      flowers: 'F1',
    });
    expect(tay(result, 41)).toBe(5);
  });

  it('does not treat a single Kim completing a pung as Kim Thi', () => {
    expect(tay(score('5T 5T KIM 1S 2S 3S 4B 5B 6B 7T 8T 9T WX', 'WX', { flowers: 'F1' }), 30)).toBeUndefined();
  });
});

describe('F16 Kong events', () => {
  it('scores Chiong Kong at 5', () => {
    expect(tay(score(PING, '5S', { ctx: { isRobbingKong: true } }), 35)).toBe(5);
  });

  it('scores Ce Chiong Kong at 5 on a self-draw', () => {
    expect(
      tay(
        score('4T 6T 4S 5S 6S 7B 8B 9B WX WX', '5T', {
          melds: [{ type: 'pung', tiles: parseTileHand('5T 5T 5T'), claimedFrom: 'dong' }],
          ctx: { isSelfDraw: true, isSelfRobbingKong: true },
        }),
        36,
      ),
    ).toBe(5);
  });

  it('scores Kong Song Hu/Mo at 5', () => {
    expect(
      tay(
        score('1T 2T 3T 4S 5S 6S 7B 8B WX WX', '9B', {
          melds: [{ type: 'kong', tiles: parseTileHand('9S 9S 9S 9S'), claimedFrom: 'dong' }],
          ctx: { isSelfDraw: true, isKongReplacement: true },
        }),
        37,
      ),
    ).toBe(5);
  });

  it('scores Kong Kong Hu at 30 and not Kong Song', () => {
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

  it('keeps Chiong Kong and Kong Kong as different patterns', () => {
    expect(tay(score(PING, '5S', { ctx: { isRobbingKong: true, isDoubleKongReplacement: false } }), 38)).toBeUndefined();
  });
});

describe('F17 special hands and finishes', () => {
  it('scores Se Sam Pu Tat at 40 NK', () => {
    const result = score('1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB', 'DZ', { ctx: { isSelfDraw: true } });
    expect(result.mode).toBe('NK');
    expect(tay(result, 39)).toBe(40);
  });

  it('scores a concealed self-draw as Ce Mo Pu Ciu Jen 5', () => {
    expect(tay(score(PING, '5S', { ctx: { isSelfDraw: true } }), 44)).toBe(5);
  });

  it('scores a concealed Ron as Mun 1', () => {
    expect(tay(score(PING, '5S'), 43)).toBe(1);
  });

  it('scores an open self-draw as Ce Mo 1', () => {
    expect(
      tay(
        score('1T 2T 3T 4S 5S 6S 7B 8B WX WX', '9B', {
          melds: [{ type: 'pung', tiles: parseTileHand('9S 9S 9S'), claimedFrom: 'dong' }],
          flowers: 'F1',
          ctx: { isSelfDraw: true },
        }),
        42,
      ),
    ).toBe(1);
  });

  it('scores Pyong Pi at 5 when the self-drawn tile pairs a Kim', () => {
    expect(
      tay(
        score('1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX WX KIM', '9S', { flowers: 'F1', ctx: { isSelfDraw: true } }),
        40,
      ),
    ).toBe(5);
  });
});

describe('F18 instant Hu', () => {
  it('pays 10 for seven flowers', () => {
    const result = score('1T 5T 9T 2S 6S 1B 4B WD WN DZ DF DP 3S', '8B', {
      flowers: 'F1 F2 F3 F4 M1 M2 M3',
      ctx: { isSelfDraw: true, isInstantHu: true },
    });
    expect(result.isValidHu).toBe(true);
    expect(result.totalTay).toBe(10);
    expect(tay(result, 6)).toBe(10);
  });

  it('pays 10 for four Kim', () => {
    const result = score('KIM KIM KIM 1T 2T 3T 4S 5S 6S 7B 8B', 'KIM', {
      ctx: { isSelfDraw: true, isInstantHu: true },
    });
    expect(tay(result, 9)).toBe(10);
    expect(result.isValidHu).toBe(true);
  });

  it('pays 10 for four concealed triplet kinds', () => {
    const result = score('2T 2T 2T 5S 5S 5S 8B 8B 8B DZ DZ DZ WX', '3S', {
      ctx: { isSelfDraw: true, isInstantHu: true },
    });
    expect(tay(result, 34)).toBe(10);
  });

  it('rejects an instant declaration that has no trigger', () => {
    const result = score(PING, '5S', { ctx: { isInstantHu: true } });
    expect(result.lewFitReason).toBe('instant-invalid');
  });

  it('stacks two instant triggers at 20', () => {
    const result = score('KIM KIM KIM 1T 2T 3T 4S 5S 6S 7B', 'KIM', {
      flowers: 'F1 F2 F3 F4 M1 M2 M3',
      ctx: { isSelfDraw: true, isInstantHu: true },
    });
    expect(result.totalTay).toBe(20);
  });
});

describe('F25 LocalStorage settings and history', () => {
  it('saves and loads the tournament preset', () => {
    const store = new MemoryStorage();
    expect(saveSettings(TOURNAMENT_SETTINGS, store)).toBe(true);
    expect(loadSettings(store).minHuTay).toBe(5);
    expect(loadSettings(store).kimDiscardAllowed).toBe(false);
    expect(store.getItem(SETTINGS_STORAGE_KEY)).toContain('minHuTay');
  });

  it('projects settings into game rules and Kim rules', () => {
    expect(toGameRules(TOURNAMENT_SETTINGS).minHuTay).toBe(5);
    expect(toKimRules(TOURNAMENT_SETTINGS).allowKimInMeldClaim).toBe(false);
    expect(toKimRules(CASUAL_SETTINGS).allowKimInMeldClaim).toBe(true);
  });

  it('stores a finished game and reads it back', () => {
    const store = new MemoryStorage();
    const record: NewMatchHistoryRecord = {
      winner: 'nan',
      winningHand: parseTileHand(PING),
      winningTile: keyToTile('5S', 9),
      scoringBreakdown: [{ id: 14, name: 'Ping Fu', tay: 3 }],
      totalTay: 10,
      isWithKim: false,
      winMethod: 'ron',
      durationSeconds: 90,
    };
    const saved = saveGameRecord(record, store);
    expect(saved?.winner).toBe('nan');
    expect(loadGameHistory(store)).toHaveLength(1);
    expect(loadGameHistory(store)[0]!.totalTay).toBe(10);
    expect(store.getItem(HISTORY_STORAGE_KEY)).toBeTruthy();
  });

  it('patches one setting without dropping the rest', () => {
    const store = new MemoryStorage();
    saveSettings(TOURNAMENT_SETTINGS, store);
    const next = updateSettings({ soundEnabled: false, aiDifficulty: 'hard' }, store);
    expect(next.soundEnabled).toBe(false);
    expect(next.aiDifficulty).toBe('hard');
    expect(next.minHuTay).toBe(5);
    expect(next.kimEnabled).toBe(true);
  });

  it('applies the casual preset', () => {
    const store = new MemoryStorage();
    const applied = applyPreset('casual', store, { keepPreferences: false });
    expect(applied.allowKimInMeldClaim).toBe(true);
    expect(applied.overlapPolicy).toBe('cumulative');
    expect(loadSettings(store).allowKimInMeldClaim).toBe(true);
  });
});

describe('F26 synthesized sound', () => {
  it('defines a recipe for draw, discard, calls, flower, Hu, and Lew Fit', () => {
    for (const name of ['draw', 'discard', 'jia', 'pung', 'kong', 'flower', 'hu', 'lewFit'] as const) {
      expect(SOUND_EFFECT_NAMES).toContain(name);
      expect(SOUND_RECIPES[name].length).toBeGreaterThan(0);
      expect(getRecipeDuration(name)).toBeGreaterThan(0);
    }
  });

  it('recognizes only the named effects', () => {
    expect(isSoundEffectName('hu')).toBe(true);
    expect(isSoundEffectName('nope')).toBe(false);
  });

  it('does not play when the saved setting has sound off', () => {
    const settings = { soundEnabled: false };
    expect(playSound('draw', settings)).toBe(false);
    expect(playTileDraw(settings)).toBe(false);
    expect(playTileDiscard(settings)).toBe(false);
    expect(playMeldCall('pung', settings)).toBe(false);
    expect(playFlowerReplacement(settings)).toBe(false);
    expect(playHuFanfare(settings)).toBe(false);
    expect(playLewFitBuzzer(settings)).toBe(false);
  });

  it('plays a draw, a call, and the Hu fanfare on a fake audio context', () => {
    const engine = new SoundEngine({ contextFactory: fakeAudio });
    expect(engine.playTileDraw()).toBe(true);
    expect(engine.playMeldCall('kong')).toBe(true);
    expect(engine.playHuFanfare()).toBe(true);
    expect(engine.playLewFitBuzzer()).toBe(true);
  });

  it('follows soundEnabled from settings onto a new engine', () => {
    const engine = new SoundEngine({ contextFactory: fakeAudio, enabled: true });
    engine.applySettings({ soundEnabled: false });
    expect(engine.isEnabled()).toBe(false);
    expect(engine.play('discard')).toBe(false);
  });
});
