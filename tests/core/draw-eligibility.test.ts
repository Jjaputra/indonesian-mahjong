import { describe, it, expect } from 'vitest';
import { GameEngine, type GameEngineState } from '@/core/game-engine';
import { keyToTile, parseTileHand } from '@/core/tiles';
import type { Seat, Tile } from '@/core/types';
import { Wall } from '@/core/wall';
import { getPreset } from '@/storage';
import { GameController } from '@/ui/game-controller';
import { buildObservation, evaluateSelfDrawHu } from '@/ui/ai-controller';
import { scoreHu, toFullRules, type WinFlags } from '@/ui/win-context';

/** Regression tests: Ce Mo needs a fresh draw, Pao Chin closes on the first discard, Thien Fu follows the dealer. */

const RULES = { kimEnabled: false };

// 3 sets + pair 5S + pair 9T: complete after a Pung of either 5S or 9T leaves 11 tiles.
const SHANPON = '1T 2T 3T 4T 5T 6T 7B 8B 9B 5S 5S 9T 9T';
// 3 sets + pair 5S + 7T 8T: complete after a Jia of 6T or 9T.
const RYANMEN = '1T 2T 3T 4T 5T 6T 7B 8B 9B 5S 5S 7T 8T';

function mutable(engine: GameEngine): GameEngineState {
  return engine.getState() as GameEngineState;
}

function freshEngine(dealerSeat: Seat = 'dong'): GameEngine {
  const engine = new GameEngine(RULES, new Wall(undefined, 11), { dealerSeat });
  engine.startNewGame(true);
  return engine;
}

/** Puts `discarder` in ACTION_DECISION holding 13 junk tiles + `tile`, then discards `tile`. */
function forceDiscard(engine: GameEngine, discarder: Seat, tile: Tile): void {
  const s = mutable(engine);
  s.currentTurn = discarder;
  s.phase = 'ACTION_DECISION';
  s.players[discarder].hand = [...parseTileHand('1W 1W 2W 2W 3W 3W 4W 1D 1D 2D 2D 3D 3D'), tile];
  s.players[discarder].melds = [];
  engine.discard(discarder, tile.id);
}

describe('Ce Mo requires a fresh draw', () => {
  it('rejects Ce Mo straight after a Pung claim (legal actions and public declare)', () => {
    const engine = freshEngine();
    mutable(engine).players.xi.hand = parseTileHand(SHANPON);
    forceDiscard(engine, 'dong', keyToTile('9T', 4));
    engine.submitClaim({ seat: 'xi', action: 'pung' });
    engine.resolveClaimWindow();

    const s = engine.getState();
    expect(s.currentTurn).toBe('xi');
    expect(s.players.xi.hand).toHaveLength(11); // 3 sets + pair: structurally complete
    const legal = engine.getLegalActions('xi');
    expect(legal.canSelfDrawHu).toBe(false);
    expect(legal.canDiscard).toBe(true);
    expect(() => engine.declareSelfDrawHu('xi')).toThrow(/fresh draw/);
  });

  it('rejects Ce Mo straight after a Jia claim', () => {
    const engine = freshEngine();
    mutable(engine).players.nan.hand = parseTileHand(RYANMEN);
    forceDiscard(engine, 'dong', keyToTile('9T', 4));
    engine.submitClaim({ seat: 'nan', action: 'jia' });
    engine.resolveClaimWindow();

    expect(engine.getState().players.nan.hand).toHaveLength(11);
    expect(engine.getLegalActions('nan').canSelfDrawHu).toBe(false);
    expect(() => engine.declareSelfDrawHu('nan')).toThrow();
  });

  it("allows Ce Mo on the dealer's dealt 14th tile", () => {
    const engine = freshEngine();
    mutable(engine).players.dong.hand = parseTileHand(`${SHANPON} 9T`);
    expect(engine.getLegalActions('dong').canSelfDrawHu).toBe(true);
    expect(engine.declareSelfDrawHu('dong').winType).toBe('tsumo');
  });

  it('allows Ce Mo after a normal turn draw', () => {
    const engine = freshEngine();
    forceDiscard(engine, 'dong', keyToTile('9S', 4));
    engine.resolveClaimWindow(); // all pass → nan draws
    const s = mutable(engine);
    expect(s.currentTurn).toBe('nan');
    s.players.nan.hand = parseTileHand(`${SHANPON} 9T`);
    expect(engine.getLegalActions('nan').canSelfDrawHu).toBe(true);
    expect(() => engine.declareSelfDrawHu('nan')).not.toThrow();
  });

  it('allows Ce Mo on an Ankong replacement draw taken after a Pung claim', () => {
    const engine = freshEngine();
    mutable(engine).players.xi.hand = parseTileHand('9T 9T 2B 2B 2B 2B 1S 2S 3S 5S 6S 7S 8S');
    forceDiscard(engine, 'dong', keyToTile('9T', 4));
    engine.submitClaim({ seat: 'xi', action: 'pung' });
    engine.resolveClaimWindow();
    expect(engine.getLegalActions('xi').canSelfDrawHu).toBe(false);

    const group = engine.getLegalActions('xi').ankongOptions[0]!;
    const r = engine.declareAnkong('xi', group);
    expect(r.replacementTile).not.toBeNull();
    expect(engine.getState().selfDrawSeat).toBe('xi');
    // Pretend the replacement completed the hand (two melds + 8 concealed tiles).
    mutable(engine).players.xi.hand = parseTileHand('1S 2S 3S 5S 6S 7S 8S 8S');
    expect(engine.getLegalActions('xi').canSelfDrawHu).toBe(true);
    expect(() => engine.declareSelfDrawHu('xi')).not.toThrow();
  });

  it('allows Ce Mo after an exposed Kong claim and after an unrobbed Kakan', () => {
    const engine = freshEngine();
    mutable(engine).players.xi.hand = parseTileHand('9T 9T 9T 1S 2S 3S 4S 5S 6S 7S 8S 2B 2B');
    forceDiscard(engine, 'dong', keyToTile('9T', 4));
    engine.submitClaim({ seat: 'xi', action: 'kong' });
    engine.resolveClaimWindow();
    expect(engine.getState().selfDrawSeat).toBe('xi');

    // Kakan: xi owns a Pung of 2B and adds the 4th; nobody robs it.
    const s = mutable(engine);
    s.players.xi.melds.push({ type: 'pung', tiles: parseTileHand('2B 2B 2B'), claimedFrom: 'nan' });
    s.players.xi.hand = [...parseTileHand('1S 2S 3S 4S 5S 6S 7S'), keyToTile('2B', 4)];
    engine.declareKakan('xi', 'ban-2-4', s.players.xi.melds.length - 1);
    expect(engine.getState().selfDrawSeat).toBeNull();
    engine.resolveClaimWindow();
    expect(engine.getState().phase).toBe('ACTION_DECISION');
    expect(engine.getState().selfDrawSeat).toBe('xi');
  });

  it('GameController never offers the human Ce Mo after claiming a Pung', () => {
    const c = new GameController({ settings: { ...getPreset('tournament'), soundEnabled: false }, seed: 3, saveHistory: false });
    const engine = (c as unknown as { engine: GameEngine }).engine;
    const s = mutable(engine);
    s.players.dong.hand = parseTileHand(SHANPON);
    s.players.dong.discards = [keyToTile('1W', 4)];
    const nine = keyToTile('9T', 4);
    forceDiscard(engine, 'bei', nine);
    (c as unknown as { aiClaimsFor: string }).aiClaimsFor = `${s.turnCount}:bei:${nine.id}:d`;
    expect(c.getHumanActions().claim?.canPung).toBe(true);
    c.humanClaim('pung');
    c.step();
    const a = c.getHumanActions();
    expect(c.getState().currentTurn).toBe('dong');
    expect(a.canSelfDrawHu).toBe(false);
    expect(a.canDiscard).toBe(true);
    c.humanSelfDrawHu();
    expect(c.outcome).toBeNull();
  });
});

describe('Pao Chin window closes on the first discard', () => {
  it('a seat whose first discard was claimed cannot declare Pao Chin later', () => {
    const engine = freshEngine();
    expect(engine.getLegalActions('dong').canPaoChin).toBe(true);
    mutable(engine).players.nan.hand = parseTileHand('9T 9T 1S 5S 9S 1W 3W 8S 2B 5B 9B 6B 2D');
    forceDiscard(engine, 'dong', keyToTile('9T', 4));
    engine.submitClaim({ seat: 'nan', action: 'pung' });
    engine.resolveClaimWindow();
    expect(engine.getState().players.dong.discards).toHaveLength(0); // claimed: never reached the river

    // Back to dong for a later turn.
    const s = mutable(engine);
    s.currentTurn = 'dong';
    s.phase = 'ACTION_DECISION';
    expect(engine.getLegalActions('dong').canPaoChin).toBe(false);
    expect(engine.declarePaoChin('dong')).toBe(false);
    expect(engine.getState().players.dong.isPaoChin).toBe(false);
  });

  it('a non-dealer may still declare on its first turn', () => {
    const engine = freshEngine();
    forceDiscard(engine, 'dong', keyToTile('9S', 4));
    engine.resolveClaimWindow();
    expect(engine.getState().currentTurn).toBe('nan');
    expect(engine.getLegalActions('nan').canPaoChin).toBe(true);
    expect(engine.declarePaoChin('nan')).toBe(true);
  });

  it('a new game reopens the window', () => {
    const engine = freshEngine();
    forceDiscard(engine, 'dong', keyToTile('9S', 4));
    engine.startNewGame(true);
    expect(engine.getLegalActions('dong').canPaoChin).toBe(true);
  });
});

describe('Thien Fu: posisi Dong winning on the hand from the first deal', () => {
  // Rulebook #11: "Hand pembagian pertama langsung Hu (hanya untuk posisi Dong)".
  const rules = toFullRules({ ...getPreset('tournament'), kimEnabled: false });
  const hand = parseTileHand(SHANPON);
  const winningTile = keyToTile('9T', 3);
  const flags = (patch: Partial<WinFlags> = {}): WinFlags => ({
    isSelfDraw: true,
    isRobbingKong: false,
    consecutiveKongs: 0,
    isFirstGoAround: true,
    isPaoChin: false,
    ...patch,
  });
  const ids = (seat: Seat, patch?: Partial<WinFlags>) =>
    scoreHu({ hand, melds: [], flowers: [], winningTile }, seat, 'dong', flags(patch), rules, 'additive').patterns.map((p) => p.id);
  const controller = (dealer: Seat) =>
    new GameController({
      settings: { ...getPreset('tournament'), kimEnabled: false, startingSeatWind: dealer, soundEnabled: false },
      seed: 5,
      saveHistory: false,
    });
  const engineOf = (c: GameController) => (c as unknown as { engine: GameEngine }).engine;

  it('direct scoring callers without the flag keep the East first-go-around fallback', () => {
    expect(ids('dong')).toContain(11);
    expect(ids('nan')).not.toContain(11);
  });

  it('an explicit non-dealt-hand flag withholds Thien Fu inside the first go-around', () => {
    expect(ids('dong', { isInitialDealtHand: false })).not.toContain(11);
    expect(ids('dong', { isInitialDealtHand: true })).toContain(11);
  });

  it('East starting dealer: Ce Mo on the opening hand is Thien Fu', () => {
    const c = controller('dong');
    const s = mutable(engineOf(c));
    s.players.dong.hand = parseTileHand(`${SHANPON} 9T`);
    expect(c.getHumanActions().selfHuScore!.patterns.map((p) => p.id)).toContain(11);
  });

  it('Nan starting dealer: no Thien Fu for Nan, nor for East on a normal first-round draw', () => {
    const c = controller('nan');
    const engine = engineOf(c);
    const s = mutable(engine);
    expect(s.dealerSeat).toBe('nan');

    // Nan (dealer) wins on its dealt hand: not posisi Dong, so no Thien Fu.
    s.players.nan.hand = parseTileHand(`${SHANPON} 9T`);
    const obs = buildObservation(s, 'nan', engine.getLegalActions('nan'), 'hard', rules, 'additive');
    expect(obs.isInitialDealtHand).toBe(true);
    expect(evaluateSelfDrawHu(obs)!.patterns.map((p) => p.id)).not.toContain(11);

    // Nan, Xi and Bei discard; East then wins on its first normal draw.
    forceDiscard(engine, 'nan', keyToTile('9S', 4));
    engine.resolveClaimWindow();
    forceDiscard(engine, 'xi', keyToTile('8S', 4));
    engine.resolveClaimWindow();
    forceDiscard(engine, 'bei', keyToTile('7S', 4));
    engine.resolveClaimWindow();
    expect(s.currentTurn).toBe('dong');
    s.players.dong.hand = parseTileHand(`${SHANPON} 9T`);
    const human = c.getHumanActions().selfHuScore!;
    expect(human.patterns.map((p) => p.id)).not.toContain(11);

    // The broader first-go-around window still drives Thi Fu after a Pao Chin declaration.
    s.players.dong.isPaoChin = true;
    expect(c.getHumanActions().selfHuScore!.patterns.map((p) => p.id)).toContain(12);
  });
});
