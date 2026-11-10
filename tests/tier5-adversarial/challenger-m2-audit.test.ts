/**
 * Empirical Challenger M2 Audit & Stress Test Suite
 *
 * Verifies:
 * 1. Se Sam Pu Tat (#39) shape recognition, uncorrelated tiles, permutations, invariance under shuffle.
 * 2. 4-Kim instant Hu: full 14-tile requirement and rejection of incomplete hands (4..12 tiles).
 * 3. Casual Kim rules: kimDiscardAllowed = false default, validator and engine rejection.
 * 4. Game Engine edge cases: empty wall tail flower replacement, turn draw phase guards,
 *    turn preservation, safe kakan declaration atomicity.
 */

import { describe, it, expect } from 'vitest';
import { keyToTile, parseTileHand, createCompleteTileSet, isBonus } from '@/core/tiles';
import { GameEngine } from '@/core/game-engine';
import { Wall } from '@/core/wall';
import type { Meld } from '@/core/types';
import { CASUAL_KIM_RULES, TOURNAMENT_KIM_RULES } from '@/kim/types';
import { KimValidator } from '@/kim/kim-validator';
import {
  findWinningDecompositions,
  canFormWinningHandWithKim,
  solveSeSamPuTat,
} from '@/kim/wildcard-solver';

function shuffleArray<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

describe('Challenger M2 Audit: Se Sam Pu Tat (#39) Shape Recognition', () => {
  // Canonical Se Sam Pu Tat: 14 uncorrelated tiles across Tong, Sok, Ban + honors
  // Tong: 1, 4, 7 (diffs: 3, 3)
  // Sok: 2, 5, 8 (diffs: 3, 3)
  // Ban: 3, 6, 9 (diffs: 3, 3)
  // Honors: WD, WN, WX, WB, DZ (5 distinct honors)
  // Total: 9 suited + 5 honors = 14 tiles
  const canonicalSpec = '1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB DZ';

  it('1.1 Recognizes canonical Se Sam Pu Tat with exact signature and NK mode', () => {
    const hand = parseTileHand(canonicalSpec);
    expect(hand).toHaveLength(14);

    const direct = solveSeSamPuTat(hand, []);
    expect(direct).toHaveLength(1);
    expect(direct[0]!.shape).toBe('se_sam_pu_tat');
    expect(direct[0]!.mode).toBe('NK');
    expect(direct[0]!.totalKims).toBe(0);
    expect(direct[0]!.signature).toBe('SE_SAM_PU_TAT');

    const decomp = findWinningDecompositions({ hand });
    expect(decomp).toHaveLength(1);
    expect(decomp[0]!.shape).toBe('se_sam_pu_tat');

    expect(canFormWinningHandWithKim(hand)).toBe(true);
  });

  it('1.2 Invariant under 50 random permutations / shuffles of the tile array', () => {
    const baseHand = parseTileHand(canonicalSpec);
    for (let i = 0; i < 50; i++) {
      const shuffled = shuffleArray(baseHand);
      const decomp = findWinningDecompositions({ hand: shuffled });
      expect(decomp).toHaveLength(1);
      expect(decomp[0]!.shape).toBe('se_sam_pu_tat');
      expect(decomp[0]!.signature).toBe('SE_SAM_PU_TAT');
      expect(canFormWinningHandWithKim(shuffled)).toBe(true);
    }
  });

  it('1.3 Validates varied legal suit partitions and honor counts', () => {
    // Variation A: 1-5-9T (gap 4), 2-6S (gap 4), 3-7B (gap 4) + 7 distinct honors (WD WN WX WB DZ DF DP)
    // Suited: 3 + 2 + 2 = 7; Honors: 7; Total: 14
    const varA = parseTileHand('1T 5T 9T 2S 6S 3B 7B WD WN WX WB DZ DF DP');
    expect(varA).toHaveLength(14);
    const solA = findWinningDecompositions({ hand: varA });
    expect(solA).toHaveLength(1);
    expect(solA[0]!.shape).toBe('se_sam_pu_tat');

    // Variation B: 1-4-8T (gap 3, 4), 2-5-9S (gap 3, 4), 3-6-9B (gap 3, 3) + 5 honors (WN WX WB DZ DF)
    const varB = parseTileHand('1T 4T 8T 2S 5S 9S 3B 6B 9B WN WX WB DZ DF');
    expect(varB).toHaveLength(14);
    const solB = findWinningDecompositions({ hand: varB });
    expect(solB).toHaveLength(1);
    expect(solB[0]!.shape).toBe('se_sam_pu_tat');

    // Variation C: 2-6-9T, 1-4-7S, 3-8B + 6 honors (WD WN WX DZ DF DP)
    const varC = parseTileHand('2T 6T 9T 1S 4S 7S 3B 8B WD WN WX DZ DF DP');
    expect(varC).toHaveLength(14);
    const solC = findWinningDecompositions({ hand: varC });
    expect(solC).toHaveLength(1);
    expect(solC[0]!.shape).toBe('se_sam_pu_tat');
  });

  it('1.4 Strictly rejects suited gap violations (gap < 3)', () => {
    // Gap of 2: 1T 3T (diff 2)
    const gap2 = parseTileHand('1T 3T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB DZ');
    expect(findWinningDecompositions({ hand: gap2 })).toHaveLength(0);
    expect(canFormWinningHandWithKim(gap2)).toBe(false);

    // Gap of 1: 4T 5T (diff 1)
    const gap1 = parseTileHand('1T 4T 5T 2S 5S 8S 3B 6B 9B WD WN WX WB DZ');
    expect(findWinningDecompositions({ hand: gap1 })).toHaveLength(0);
    expect(canFormWinningHandWithKim(gap1)).toBe(false);

    // Gap in Sok: 2S 4S
    const gapSok = parseTileHand('1T 4T 7T 2S 4S 8S 3B 6B 9B WD WN WX WB DZ');
    expect(findWinningDecompositions({ hand: gapSok })).toHaveLength(0);
  });

  it('1.5 Strictly rejects duplicate tiles and pairs', () => {
    // Duplicate suited tile (two 1T with distinct IDs)
    const t1a = keyToTile('1T', 1);
    const t1b = keyToTile('1T', 2);
    const dupSuited = [t1a, t1b, ...parseTileHand('4T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB')];
    expect(findWinningDecompositions({ hand: dupSuited })).toHaveLength(0);

    // Duplicate honor (two WD)
    const wda = keyToTile('WD', 1);
    const wdb = keyToTile('WD', 2);
    const dupHonor = [wda, wdb, ...parseTileHand('1T 4T 7T 2S 5S 8S 3B 6B 9B WN WX WB')];
    expect(findWinningDecompositions({ hand: dupHonor })).toHaveLength(0);
  });

  it('1.6 Strictly rejects hands containing any Kim (Pattern #39 is NK only)', () => {
    const handWithKim = parseTileHand('1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB KIM');
    expect(solveSeSamPuTat(handWithKim, [])).toHaveLength(0);
    expect(findWinningDecompositions({ hand: handWithKim })).toHaveLength(0);
    expect(canFormWinningHandWithKim(handWithKim)).toBe(false);
  });

  it('1.7 Strictly rejects bonus flower/season tiles and open melds', () => {
    // Flower tile in hand
    const flowerHand = parseTileHand('1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB F1');
    expect(solveSeSamPuTat(flowerHand, [])).toHaveLength(0);

    // Open meld present (11 concealed + 1 open meld)
    const hand11 = parseTileHand('1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN');
    const openMeld: Meld = { type: 'pung', tiles: parseTileHand('DZ DZ DZ'), claimedFrom: 'dong' };
    expect(solveSeSamPuTat(hand11, [openMeld])).toHaveLength(0);
    expect(findWinningDecompositions({ hand: hand11, melds: [openMeld] })).toHaveLength(0);
  });

  it('1.8 Strictly rejects invalid hand sizes (not 14 tiles)', () => {
    const hand13 = parseTileHand('1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB');
    expect(solveSeSamPuTat(hand13, [])).toHaveLength(0);

    const hand15 = parseTileHand('1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB DZ DF');
    expect(solveSeSamPuTat(hand15, [])).toHaveLength(0);
  });
});

describe('Challenger M2 Audit: 4-Kim Instant Hu Hand Size & Wait Invariants', () => {
  it('2.1 Holding 4 Kims in a full 14-tile hand triggers instant Hu when requested', () => {
    // 4 Kims + 10 arbitrary tiles that do NOT form any standard shape
    const full14 = parseTileHand('KIM KIM KIM KIM 1T 4T 7T 2S 5S 8S 3B 6B 9B WD');
    expect(full14).toHaveLength(14);

    expect(canFormWinningHandWithKim(full14)).toBe(true);

    const instantDecomp = findWinningDecompositions({ hand: full14, isInstantHu: true });
    expect(instantDecomp).toHaveLength(1);
    expect(instantDecomp[0]!.shape).toBe('shi_kim');
    expect(instantDecomp[0]!.totalKims).toBe(4);
    expect(instantDecomp[0]!.mode).toBe('K');

    // Without isInstantHu and with broken shape, returns []
    const regularDecomp = findWinningDecompositions({ hand: full14, isInstantHu: false });
    expect(regularDecomp).toHaveLength(0);
  });

  it('2.2 Incomplete hands (4 through 12 tiles) with 4 Kims MUST NOT trigger instant Hu', () => {
    const kims = [keyToTile('KIM', 1), keyToTile('KIM', 2), keyToTile('KIM', 3), keyToTile('KIM', 4)];

    for (let extra = 0; extra <= 8; extra++) {
      // Hand sizes from 4 to 12
      const junkTiles = Array.from({ length: extra }, (_, i) => keyToTile('1T', (i % 4) + 1));
      const incomplete = [...kims, ...junkTiles];
      expect(incomplete.length).toBeLessThan(13);

      expect(canFormWinningHandWithKim(incomplete)).toBe(false);
      expect(findWinningDecompositions({ hand: incomplete, isInstantHu: true })).toHaveLength(0);
    }
  });

  it('2.3 13-tile hand with 4 Kims allows wait detection (tenpai)', () => {
    // In tenpai/wait checking, effective hand count is 13
    const waitHand = parseTileHand('KIM KIM KIM KIM 1T 4T 7T 2S 5S 8S 3B 6B 9B');
    expect(waitHand).toHaveLength(13);

    expect(canFormWinningHandWithKim(waitHand)).toBe(true);
  });

  it('2.4 kimEnabled = false rejects 4-Kim instant Hu even with 14 tiles', () => {
    const full14 = parseTileHand('KIM KIM KIM KIM 1T 4T 7T 2S 5S 8S 3B 6B 9B WD');
    expect(canFormWinningHandWithKim(full14, [], { kimEnabled: false })).toBe(false);
    expect(
      findWinningDecompositions({
        hand: full14,
        isInstantHu: true,
        rules: { kimEnabled: false },
      })
    ).toHaveLength(0);
  });
});

describe('Challenger M2 Audit: Casual Kim Rules Discardability & Claim Guarding', () => {
  it('3.1 CASUAL_KIM_RULES defaults kimDiscardAllowed to false per R2 specification', () => {
    expect(CASUAL_KIM_RULES.kimDiscardAllowed).toBe(false);
    expect(CASUAL_KIM_RULES.kimEnabled).toBe(true);
    expect(CASUAL_KIM_RULES.allowKimInMeldClaim).toBe(true);
  });

  it('3.2 KimValidator rejects Kim discard under default casual and tournament rules', () => {
    const casualVal = new KimValidator(CASUAL_KIM_RULES);
    const kim = keyToTile('KIM');
    expect(casualVal.canDiscard(kim).valid).toBe(false);
    expect(() => casualVal.validateDiscard(kim)).toThrow();

    const tourneyVal = new KimValidator(TOURNAMENT_KIM_RULES);
    expect(tourneyVal.canDiscard(kim).valid).toBe(false);
    expect(() => tourneyVal.validateDiscard(kim)).toThrow();

    // Custom override explicitly allowing discard
    const allowedVal = new KimValidator({ ...CASUAL_KIM_RULES, kimDiscardAllowed: true });
    expect(allowedVal.canDiscard(kim).valid).toBe(true);
    expect(() => allowedVal.validateDiscard(kim)).not.toThrow();
  });

  it('3.3 GameEngine getLegalActions excludes Kims from discardableTileIds by default', () => {
    const engine = new GameEngine(CASUAL_KIM_RULES);
    const wall = new Wall(createCompleteTileSet(), null);
    engine.startNewGame(true, wall);

    const activeSeat = engine.getState().currentTurn;
    const player = engine.getState().players[activeSeat];
    const kim1 = keyToTile('KIM', 1);
    const kim2 = keyToTile('KIM', 2);
    // Give player 12 natural tiles + 2 Kims = 14 tiles
    player.hand = [kim1, kim2, ...parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WD WN WX')];

    const legal = engine.getLegalActions(activeSeat);
    expect(legal.canDiscard).toBe(true);
    expect(legal.discardableTileIds).not.toContain(kim1.id);
    expect(legal.discardableTileIds).not.toContain(kim2.id);
    expect(legal.discardableTileIds).toHaveLength(12);

    // Discarding Kim must throw
    expect(() => engine.discard(activeSeat, kim1.id)).toThrow(/prohibited/i);
  });

  it('3.4 All-Kim hand sets canDiscard = false', () => {
    const engine = new GameEngine(CASUAL_KIM_RULES);
    engine.startNewGame(true, new Wall(createCompleteTileSet(), null));

    const activeSeat = engine.getState().currentTurn;
    const player = engine.getState().players[activeSeat];
    // 14 tiles, all Kims
    player.hand = [
      keyToTile('KIM', 1),
      keyToTile('KIM', 2),
    ];
    player.melds = [
      { type: 'pung', tiles: parseTileHand('1T 1T 1T'), claimedFrom: 'nan' },
      { type: 'pung', tiles: parseTileHand('2T 2T 2T'), claimedFrom: 'xi' },
      { type: 'pung', tiles: parseTileHand('3T 3T 3T'), claimedFrom: 'bei' },
      { type: 'pung', tiles: parseTileHand('4T 4T 4T'), claimedFrom: 'nan' },
    ];

    const legal = engine.getLegalActions(activeSeat);
    expect(legal.discardableTileIds).toEqual([]);
    expect(legal.canDiscard).toBe(false);
  });

  it('3.5 Kim claim in Kong is rejected when allowKimInPung or allowKimInTriplet is false', () => {
    const valPungFalse = new KimValidator({
      ...CASUAL_KIM_RULES,
      allowKimInPung: false,
    });
    const resPung = valPungFalse.canClaimDeclaration(
      { seat: 'xi', action: 'kong', meldTiles: [keyToTile('5T', 1), keyToTile('5T', 2), keyToTile('KIM')] },
      keyToTile('5T', 3)
    );
    expect(resPung.valid).toBe(false);

    const valTripFalse = new KimValidator({
      ...CASUAL_KIM_RULES,
      allowKimInTriplet: false,
    });
    const resTrip = valTripFalse.canClaimDeclaration(
      { seat: 'xi', action: 'kong', meldTiles: [keyToTile('5T', 1), keyToTile('5T', 2), keyToTile('KIM')] },
      keyToTile('5T', 3)
    );
    expect(resTrip.valid).toBe(false);
  });
});

describe('Challenger M2 Audit: Game Engine Edge Cases & Invariant Robustness', () => {
  it('4.1 Flower replacement with empty or depleted wall tail preserves all bonus tiles', () => {
    // Construct hand with 3 bonus flowers
    const f1 = keyToTile('F1');
    const f2 = keyToTile('F2');
    const f3 = keyToTile('F3');
    const dongHand = [f1, f2, f3, ...parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WD WN')];
    const nanHand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WD WN WX WB');
    const xiHand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WD WN WX WB');
    const beiHand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WD WN WX WB');

    // Wall with only 1 tail replacement tile, then wall is empty
    const singleTailTile = keyToTile('DZ');
    const wallTiles = [...dongHand, ...nanHand, ...xiHand, ...beiHand, singleTailTile];
    const wall = new Wall(wallTiles, null);

    const engine = new GameEngine();
    const records = engine.startNewGame(true, wall);

    // Must transition to DRAW_SERI because wall is exhausted
    expect(engine.getState().phase).toBe('DRAW_SERI');

    // All bonus flowers must be removed from Dong's hand and exposed in flowers rack
    const dong = engine.getState().players.dong;
    expect(dong.hand.some((t) => isBonus(t))).toBe(false);
    expect(dong.flowers.map((t) => t.id).sort()).toEqual([f1.id, f2.id, f3.id].sort());

    // Record must account for all 3 flowers
    const recordFlowers = records.flatMap((r) => r.flowers).map((t) => t.id);
    expect(recordFlowers).toContain(f1.id);
    expect(recordFlowers).toContain(f2.id);
    expect(recordFlowers).toContain(f3.id);
  });

  it('4.2 startTurnDraw enforces strict phase guards and currentTurn identity', () => {
    const engine = new GameEngine();
    const wall = new Wall(createCompleteTileSet(), null);

    // Test during FLOWER_REPLACEMENT
    engine.startNewGame(false, wall);
    expect(engine.getState().phase).toBe('FLOWER_REPLACEMENT');
    expect(() => engine.startTurnDraw('dong')).toThrow(/Cannot draw during FLOWER_REPLACEMENT/i);
    expect(() => engine.startTurnDraw('nan')).toThrow(/Cannot draw during FLOWER_REPLACEMENT/i);

    // Advance to ACTION_DECISION
    engine.performInitialFlowerReplacements();
    expect(engine.getState().phase).toBe('ACTION_DECISION');

    // Trying to draw out of turn during ACTION_DECISION
    expect(() => engine.startTurnDraw('nan')).toThrow();

    // Trying to draw when Dong already has 14 tiles
    expect(engine.getState().players.dong.hand).toHaveLength(14);
    expect(() => engine.startTurnDraw('dong')).toThrow(/already has 14 effective tiles/i);
  });

  it('4.3 performInitialFlowerReplacements does NOT rewind currentTurn after game is underway', () => {
    const engine = new GameEngine();
    engine.startNewGame(true, new Wall(createCompleteTileSet(), null));

    expect(engine.getState().currentTurn).toBe('dong');
    const discardable = engine.getLegalActions('dong').discardableTileIds[0]!;
    engine.discard('dong', discardable);
    engine.resolveClaimWindow(); // all pass

    // Now turn is nan
    expect(engine.getState().currentTurn).toBe('nan');

    // Calling performInitialFlowerReplacements must not rewind to dealer dong
    engine.performInitialFlowerReplacements();
    expect(engine.getState().currentTurn).toBe('nan');
  });

  it('4.4 declareKakan is atomic and safe: does not corrupt hand on invalid target meld', () => {
    const engine = new GameEngine();
    engine.startNewGame(true, new Wall(createCompleteTileSet(), null));

    const east = engine.getState().players.dong;
    const promoted = keyToTile('5T', 4);
    east.hand = [...parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WD WN WX WB'), promoted];
    const initialHandIds = east.hand.map((t) => t.id);

    // Case A: meldIndex out of bounds
    expect(() => engine.declareKakan('dong', promoted.id, 99)).toThrow(/Target meld at index 99 is not an exposed Pung/i);
    expect(east.hand.map((t) => t.id)).toEqual(initialHandIds); // Hand untouched!

    // Case B: meld at meldIndex is a Jia sequence, not a Pung
    east.melds = [{ type: 'jia', tiles: parseTileHand('1T 2T 3T'), claimedFrom: 'nan' }];
    expect(() => engine.declareKakan('dong', promoted.id, 0)).toThrow(/Target meld at index 0 is not an exposed Pung/i);
    expect(east.hand.map((t) => t.id)).toEqual(initialHandIds); // Hand untouched!

    // Case C: meld is a Pung of 9S, tile is 5T (mismatch)
    east.melds = [{ type: 'pung', tiles: parseTileHand('9S 9S 9S'), claimedFrom: 'nan' }];
    expect(() => engine.declareKakan('dong', promoted.id, 0)).toThrow(/does not match Pung/i);
    expect(east.hand.map((t) => t.id)).toEqual(initialHandIds); // Hand untouched!

    // Case D: Legal Kakan with Chiong Kong intercept
    east.melds = [
      {
        type: 'pung',
        tiles: [keyToTile('5T', 1), keyToTile('5T', 2), keyToTile('5T', 3)],
        claimedFrom: 'nan',
      },
    ];
    engine.declareKakan('dong', promoted.id, 0);
    expect(engine.getState().phase).toBe('CLAIM_WINDOW');
    expect(engine.getState().discardPending?.isPromotedKong).toBe(true);

    // North robs the Kong
    const north = engine.getState().players.bei;
    north.hand = parseTileHand('1B 1B 2B 3B 4B 5B 6B 7B 2S 3S 4S 4T 6T'); // waiting on 5T
    engine.submitClaim({ seat: 'bei', action: 'hu' });
    const claimRes = engine.resolveClaimWindow();

    expect(claimRes.winningAction).toBe('hu');
    expect(claimRes.winnerSeat).toBe('bei');
    expect(engine.getState().winType).toBe('chiong_kong');
    expect(north.hand.map((t) => t.id)).toContain(promoted.id);
    // East's meld remains an un-promoted Pung of 3 tiles
    expect(east.melds[0]!.type).toBe('pung');
    expect(east.melds[0]!.tiles).toHaveLength(3);
  });
});
