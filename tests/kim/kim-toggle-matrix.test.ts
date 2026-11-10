import { describe, it, expect } from 'vitest';
import { GameEngine, type GameEngineState } from '@/core/game-engine';
import { keyToTile, parseTileHand } from '@/core/tiles';
import type { ClaimDeclaration, GameRules, Meld, Seat, Tile } from '@/core/types';
import { Wall } from '@/core/wall';
import { isKimAllowedInClaim, validateKimMeldLegality } from '@/kim/kim-validator';
import { CASUAL_KIM_RULES, TOURNAMENT_KIM_RULES, type KimRules } from '@/kim/types';
import { findWinningDecompositions } from '@/kim/wildcard-solver';

/**
 * Per-type Kim toggles must bind every path: advertised legal actions, direct submitClaim,
 * open-meld legality (Lew Fit) and concealed decompositions.
 * Semantics: claimed Jia = allowKimInMeldClaim + allowKimInJia; claimed Pung/Kong =
 * allowKimInMeldClaim + allowKimInPung + allowKimInTriplet; concealed Tris = allowKimInTriplet.
 */

type Rules = KimRules & { minHuTay: number };
const JUNK = '1W 2W 3W 4W 1D 2D 3D 7B 9B 1S 9S';

const CONFIGS: { name: string; rules: Rules; jia: boolean; pung: boolean; tris: boolean }[] = [
  { name: 'casual (all on)', rules: { ...CASUAL_KIM_RULES, minHuTay: 5 }, jia: true, pung: true, tris: true },
  { name: 'allowKimInJia off', rules: { ...CASUAL_KIM_RULES, allowKimInJia: false, minHuTay: 5 }, jia: false, pung: true, tris: true },
  { name: 'allowKimInPung off', rules: { ...CASUAL_KIM_RULES, allowKimInPung: false, minHuTay: 5 }, jia: true, pung: false, tris: true },
  { name: 'allowKimInTriplet off', rules: { ...CASUAL_KIM_RULES, allowKimInTriplet: false, minHuTay: 5 }, jia: true, pung: false, tris: false },
  { name: 'allowKimInMeldClaim off (tournament)', rules: { ...TOURNAMENT_KIM_RULES, minHuTay: 5 }, jia: false, pung: false, tris: true },
];

/** Dong discards 5T; `seat` holds `hand` (13 tiles) in the claim window. */
function claimWindow(rules: Partial<GameRules>, seat: Seat, hand: string): GameEngine {
  const engine = new GameEngine(rules, new Wall(undefined, 11));
  engine.startNewGame(true);
  const s = engine.getState() as GameEngineState;
  s.players[seat].hand = parseTileHand(hand);
  s.currentTurn = 'dong';
  s.phase = 'ACTION_DECISION';
  const tile = keyToTile('5T', 4);
  s.players.dong.hand = [...parseTileHand('1W 1W 2W 2W 3W 3W 4W 1D 1D 2D 2D 3D 3D'), tile];
  engine.discard('dong', tile.id);
  return engine;
}

function submits(engine: GameEngine, decl: ClaimDeclaration): boolean {
  try {
    engine.submitClaim(decl);
    return true;
  } catch {
    return false;
  }
}

const t = (key: string, copy = 1): Tile => keyToTile(key, copy);
const meld = (type: Meld['type'], tiles: string): Meld => ({ type, tiles: parseTileHand(tiles), claimedFrom: 'dong' });

describe.each(CONFIGS)('Kim toggle matrix: $name', ({ rules, jia, pung, tris }) => {
  it('Jia with Kim: advertised and direct claim agree with allowKimInJia', () => {
    const engine = claimWindow(rules, 'nan', `4T KIM ${JUNK}`);
    const legal = engine.getLegalActions('nan');
    expect(legal.canJia).toBe(jia);
    expect(legal.jiaOptions.some((o) => o.some((x) => x.type === 'kim'))).toBe(jia);
    expect(submits(engine, { seat: 'nan', action: 'jia', meldTiles: [t('4T'), t('KIM')] })).toBe(jia);
    expect(isKimAllowedInClaim('jia', rules)).toBe(jia);
  });

  it('Pung with Kim: advertised and direct claim agree with allowKimInPung + allowKimInTriplet', () => {
    const engine = claimWindow(rules, 'xi', `5T KIM ${JUNK}`);
    const legal = engine.getLegalActions('xi');
    expect(legal.canPung).toBe(pung);
    expect(submits(engine, { seat: 'xi', action: 'pung', meldTiles: [t('5T'), t('KIM')] })).toBe(pung);
    expect(isKimAllowedInClaim('pung', rules)).toBe(pung);
  });

  it('Kong with Kim: advertised and direct claim follow the Pung rule', () => {
    const engine = claimWindow(rules, 'xi', `5T 5T KIM ${JUNK.split(' ').slice(1).join(' ')}`);
    const legal = engine.getLegalActions('xi');
    expect(legal.canKong).toBe(pung);
    expect(legal.canPung).toBe(true); // two natural 5T always allow a Pung
    expect(legal.pungTiles!.every((x) => x.type !== 'kim')).toBe(true);
    expect(submits(engine, { seat: 'xi', action: 'kong', meldTiles: [t('5T'), t('5T', 2), t('KIM')] })).toBe(pung);
  });

  it('natural claims stay legal regardless of Kim toggles', () => {
    const jiaEngine = claimWindow(rules, 'nan', `4T 6T ${JUNK}`);
    expect(jiaEngine.getLegalActions('nan').canJia).toBe(true);
    expect(submits(jiaEngine, { seat: 'nan', action: 'jia', meldTiles: [t('4T'), t('6T')] })).toBe(true);
    const pungEngine = claimWindow(rules, 'xi', `5T 5T ${JUNK}`);
    expect(pungEngine.getLegalActions('xi').canPung).toBe(true);
    expect(submits(pungEngine, { seat: 'xi', action: 'pung', meldTiles: [t('5T'), t('5T', 2)] })).toBe(true);
  });

  it('open meld legality (Lew Fit) mirrors the claim rules; natural melds and Ankong are always legal', () => {
    expect(validateKimMeldLegality([meld('jia', '4T KIM 6T')], rules).isLegal).toBe(jia);
    expect(validateKimMeldLegality([meld('pung', '5T 5T KIM')], rules).isLegal).toBe(pung);
    expect(validateKimMeldLegality([meld('kong', '5T 5T 5T KIM')], rules).isLewFit).toBe(!pung);
    expect(validateKimMeldLegality([meld('jia', '4T 5T 6T'), meld('pung', '5S 5S 5S')], rules).isLegal).toBe(true);
    expect(validateKimMeldLegality([{ type: 'ankong', tiles: parseTileHand('5T 5T 5T KIM') }], rules).isLegal).toBe(true);
  });

  it('concealed Kim triplet (Tris) follows allowKimInTriplet only', () => {
    // Only decomposition: 5T 5T KIM as a Tris + 123S 456S 789B + 9T pair.
    const decomps = findWinningDecompositions({
      hand: parseTileHand('5T 5T KIM 1S 2S 3S 4S 5S 6S 7B 8B 9B 9T'),
      melds: [],
      winningTile: t('9T', 2),
      rules,
      isSelfDraw: true,
    });
    expect(decomps.length > 0).toBe(tris);
  });
});

describe('Kim claim defaults for core callers', () => {
  it('rules without per-type flags keep Kim claims enabled when allowKimInMeldClaim is on', () => {
    const rules = { kimEnabled: true, allowKimInMeldClaim: true };
    expect(claimWindow(rules, 'nan', `4T KIM ${JUNK}`).getLegalActions('nan').canJia).toBe(true);
    expect(claimWindow(rules, 'xi', `5T KIM ${JUNK}`).getLegalActions('xi').canPung).toBe(true);
  });

  it('the default engine (tournament) still refuses Kim claims with a Lew Fit message', () => {
    const engine = claimWindow({}, 'xi', `5T KIM ${JUNK}`);
    expect(engine.getLegalActions('xi').canPung).toBe(false);
    expect(() => engine.submitClaim({ seat: 'xi', action: 'pung', meldTiles: [t('5T'), t('KIM')] })).toThrow(/Lew Fit/);
  });
});
