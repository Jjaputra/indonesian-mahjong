import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/core/game-engine';
import { Wall } from '@/core/wall';
import { keyToTile, parseTileHand, createCompleteTileSet, isKim } from '@/core/tiles';
import type { ClaimDeclaration, Tile } from '@/core/types';
import {
  CASUAL_KIM_RULES,
  DEFAULT_KIM_RULES,
  STRICT_NO_KIM_RULES,
  TOURNAMENT_KIM_RULES,
  resolveKimRules,
} from '@/kim/types';
import {
  KimValidator,
} from '@/kim/kim-validator';
import {
  canFormWinningHandWithKim,
  findWinningDecompositions,
} from '@/kim/wildcard-solver';

function makeTile(key: string, idx = 1): Tile {
  return keyToTile(key, idx);
}

// PRNG for deterministic testing
function createLcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('Challenger 2 Empirical Verification: Rules Invariants & Property Fuzzing', () => {
  // ==========================================================================
  // Section 1: Rule Preset Invariants
  // ==========================================================================
  describe('1. Rule Preset Invariants (Tournament, Casual, Strict, Custom)', () => {
    it('verifies Tournament preset invariants strictly enforce non-discard and no-meld-claim', () => {
      expect(TOURNAMENT_KIM_RULES.kimEnabled).toBe(true);
      expect(TOURNAMENT_KIM_RULES.kimDiscardAllowed).toBe(false);
      expect(TOURNAMENT_KIM_RULES.allowKimInMeldClaim).toBe(false);
      expect(TOURNAMENT_KIM_RULES.allowKimInPair).toBe(true);
      expect(TOURNAMENT_KIM_RULES.allowKimInPung).toBe(true);
      expect(TOURNAMENT_KIM_RULES.allowKimInJia).toBe(true);
      expect(TOURNAMENT_KIM_RULES.allowKimInTriplet).toBe(true);
    });

    it('verifies Casual preset invariants: kimDiscardAllowed === false by default per R2', () => {
      expect(CASUAL_KIM_RULES.kimEnabled).toBe(true);
      expect(CASUAL_KIM_RULES.kimDiscardAllowed).toBe(false); // R2: non-discardable by default
      expect(CASUAL_KIM_RULES.allowKimInMeldClaim).toBe(true);
      expect(CASUAL_KIM_RULES.allowKimInPair).toBe(true);
      expect(CASUAL_KIM_RULES.allowKimInPung).toBe(true);
      expect(CASUAL_KIM_RULES.allowKimInJia).toBe(true);
      expect(CASUAL_KIM_RULES.allowKimInTriplet).toBe(true);
    });

    it('verifies DEFAULT_KIM_RULES points to TOURNAMENT_KIM_RULES', () => {
      expect(DEFAULT_KIM_RULES).toEqual(TOURNAMENT_KIM_RULES);
      expect(DEFAULT_KIM_RULES.kimDiscardAllowed).toBe(false);
      expect(DEFAULT_KIM_RULES.allowKimInMeldClaim).toBe(false);
    });

    it('verifies Strict No-Kim preset disables all Kim functionality', () => {
      expect(STRICT_NO_KIM_RULES.kimEnabled).toBe(false);
      expect(STRICT_NO_KIM_RULES.kimDiscardAllowed).toBe(false);
      expect(STRICT_NO_KIM_RULES.allowKimInMeldClaim).toBe(false);
      expect(STRICT_NO_KIM_RULES.allowKimInPair).toBe(false);
      expect(STRICT_NO_KIM_RULES.allowKimInPung).toBe(false);
      expect(STRICT_NO_KIM_RULES.allowKimInJia).toBe(false);
      expect(STRICT_NO_KIM_RULES.allowKimInTriplet).toBe(false);
    });

    it('verifies resolveKimRules fills defaults correctly from undefined and partial rules', () => {
      const fromEmpty = resolveKimRules({});
      expect(fromEmpty.kimEnabled).toBe(true);
      expect(fromEmpty.kimDiscardAllowed).toBe(false);
      expect(fromEmpty.allowKimInMeldClaim).toBe(false);

      const withDiscardAllowed = resolveKimRules({ kimDiscardAllowed: true });
      expect(withDiscardAllowed.kimDiscardAllowed).toBe(true);
      expect(withDiscardAllowed.allowKimInMeldClaim).toBe(false);

      const withCasual = resolveKimRules(CASUAL_KIM_RULES);
      expect(withCasual.kimDiscardAllowed).toBe(false);
      expect(withCasual.allowKimInMeldClaim).toBe(true);
    });
  });

  // ==========================================================================
  // Section 2: Kong Claim Checks with Kim Under Rule Toggles
  // ==========================================================================
  describe('2. Kong Claim Checks with Kim (allowKimInPung & allowKimInTriplet)', () => {
    const discardSuited = makeTile('5T', 1);

    it('rejects Kong claim with Kim under tournament rules (allowKimInMeldClaim === false)', () => {
      const v = new KimValidator(TOURNAMENT_KIM_RULES);
      const decl: ClaimDeclaration = {
        seat: 'nan',
        action: 'kong',
        meldTiles: [makeTile('5T', 2), makeTile('5T', 3), makeTile('KIM', 1)],
      };
      const check = v.canClaimDeclaration(decl, discardSuited);
      expect(check.valid).toBe(false);
      expect(check.reason).toMatch(/triggers Lew Fit/i);
      expect(() => v.validateClaimDeclaration(decl, discardSuited)).toThrowError(/triggers Lew Fit/i);
    });

    it('permits Kong claim with Kim under casual rules when both allowKimInPung and allowKimInTriplet are true', () => {
      const v = new KimValidator(CASUAL_KIM_RULES);
      const decl: ClaimDeclaration = {
        seat: 'xi',
        action: 'kong',
        meldTiles: [makeTile('5T', 2), makeTile('5T', 3), makeTile('KIM', 1)],
      };
      const check = v.canClaimDeclaration(decl, discardSuited);
      expect(check.valid).toBe(true);
      expect(() => v.validateClaimDeclaration(decl, discardSuited)).not.toThrow();
    });

    it('rejects Kong claim with Kim when allowKimInPung is false', () => {
      const v = new KimValidator({ ...CASUAL_KIM_RULES, allowKimInPung: false, allowKimInTriplet: true });
      const decl: ClaimDeclaration = {
        seat: 'xi',
        action: 'kong',
        meldTiles: [makeTile('5T', 2), makeTile('5T', 3), makeTile('KIM', 1)],
      };
      const check = v.canClaimDeclaration(decl, discardSuited);
      expect(check.valid).toBe(false);
      expect(check.reason).toMatch(/Using Kim in Kong quadruplets is disabled by rules/i);
      expect(() => v.validateClaimDeclaration(decl, discardSuited)).toThrowError(
        /Using Kim in Kong quadruplets is disabled by rules/i
      );
    });

    it('rejects Kong claim with Kim when allowKimInTriplet is false', () => {
      const v = new KimValidator({ ...CASUAL_KIM_RULES, allowKimInPung: true, allowKimInTriplet: false });
      const decl: ClaimDeclaration = {
        seat: 'xi',
        action: 'kong',
        meldTiles: [makeTile('5T', 2), makeTile('5T', 3), makeTile('KIM', 1)],
      };
      const check = v.canClaimDeclaration(decl, discardSuited);
      expect(check.valid).toBe(false);
      expect(check.reason).toMatch(/Using Kim in Kong quadruplets is disabled by rules/i);
    });

    it('rejects Kong claim with Kim when both allowKimInPung and allowKimInTriplet are false', () => {
      const v = new KimValidator({ ...CASUAL_KIM_RULES, allowKimInPung: false, allowKimInTriplet: false });
      const decl: ClaimDeclaration = {
        seat: 'xi',
        action: 'kong',
        meldTiles: [makeTile('5T', 2), makeTile('5T', 3), makeTile('KIM', 1)],
      };
      const check = v.canClaimDeclaration(decl, discardSuited);
      expect(check.valid).toBe(false);
      expect(check.reason).toMatch(/Using Kim in Kong quadruplets is disabled by rules/i);
    });

    it('permits natural Kong claim (no Kim) even if allowKimInPung and allowKimInTriplet are false', () => {
      const v = new KimValidator({ ...CASUAL_KIM_RULES, allowKimInPung: false, allowKimInTriplet: false });
      const decl: ClaimDeclaration = {
        seat: 'xi',
        action: 'kong',
        meldTiles: [makeTile('5T', 2), makeTile('5T', 3), makeTile('5T', 4)],
      };
      const check = v.canClaimDeclaration(decl, discardSuited);
      expect(check.valid).toBe(true);
      expect(() => v.validateClaimDeclaration(decl, discardSuited)).not.toThrow();
    });

    it('verifies Pung claim reasons distinguish triplets from kong quadruplets', () => {
      const v = new KimValidator({ ...CASUAL_KIM_RULES, allowKimInPung: false });
      const pungDecl: ClaimDeclaration = {
        seat: 'xi',
        action: 'pung',
        meldTiles: [makeTile('5T', 2), makeTile('KIM', 1)],
      };
      const pungCheck = v.canClaimDeclaration(pungDecl, discardSuited);
      expect(pungCheck.valid).toBe(false);
      expect(pungCheck.reason).toMatch(/Using Kim in Pung triplets is disabled by rules/i);

      const kongDecl: ClaimDeclaration = {
        seat: 'xi',
        action: 'kong',
        meldTiles: [makeTile('5T', 2), makeTile('5T', 3), makeTile('KIM', 1)],
      };
      const kongCheck = v.canClaimDeclaration(kongDecl, discardSuited);
      expect(kongCheck.valid).toBe(false);
      expect(kongCheck.reason).toMatch(/Using Kim in Kong quadruplets is disabled by rules/i);
    });
  });

  // ==========================================================================
  // Section 3: All-Kim Hand Discardability
  // ==========================================================================
  describe('3. All-Kim Hand Discardability (canDiscard: false & discardableTileIds: [])', () => {
    it('KimValidator: holding 14 non-discardable Kims returns discardableTileIds = []', () => {
      const v = new KimValidator(TOURNAMENT_KIM_RULES);
      const all14Kims = Array.from({ length: 14 }, (_, i) => makeTile('KIM', (i % 4) + 1));
      const ids = v.getDiscardableTileIds(all14Kims);
      expect(ids).toEqual([]);
      expect(ids.length).toBe(0);

      // Every tile individually returns canDiscard.valid = false
      for (const t of all14Kims) {
        expect(v.canDiscard(t).valid).toBe(false);
      }
    });

    it('KimValidator: casual rules default holding 14 Kims returns discardableTileIds = []', () => {
      const v = new KimValidator(CASUAL_KIM_RULES);
      const all14Kims = Array.from({ length: 14 }, (_, i) => makeTile('KIM', (i % 4) + 1));
      const ids = v.getDiscardableTileIds(all14Kims);
      expect(ids).toEqual([]);
      expect(ids.length).toBe(0);
    });

    it('KimValidator: casual rules with kimDiscardAllowed: true returns all 14 IDs', () => {
      const v = new KimValidator({ ...CASUAL_KIM_RULES, kimDiscardAllowed: true });
      const all14Kims = Array.from({ length: 14 }, (_, i) => makeTile('KIM', (i % 4) + 1));
      const ids = v.getDiscardableTileIds(all14Kims);
      expect(ids.length).toBe(14);
      expect(ids).toEqual(all14Kims.map((t) => t.id));
    });

    it('GameEngine: player holding 14 non-discardable Kims has canDiscard: false and empty discardableTileIds', () => {
      const engine = new GameEngine();
      engine.startNewGame(false);

      const east = engine.getState().players.dong;
      east.hand = Array.from({ length: 14 }, (_, i) => makeTile('KIM', (i % 4) + 1));

      (engine.getState() as any).currentTurn = 'dong';
      (engine.getState() as any).phase = 'ACTION_DECISION';

      const actions = engine.getLegalActions('dong');
      expect(actions.canDiscard).toBe(false);
      expect(actions.discardableTileIds).toEqual([]);
      expect(actions.discardableTileIds.length).toBe(0);

      // Attempting to discard a Kim throws an error
      expect(() => {
        engine.discard('dong', east.hand[0]!.id);
      }).toThrow(/Discarding Kim is prohibited/i);
    });

    it('GameEngine: player with 4 melds (12 tiles) + 2 Kims has canDiscard: false and empty discardableTileIds', () => {
      const engine = new GameEngine();
      engine.startNewGame(false);

      const east = engine.getState().players.dong;
      east.hand = [makeTile('KIM', 1), makeTile('KIM', 2)];
      east.melds = [
        { type: 'pung', tiles: [makeTile('1T', 1), makeTile('1T', 2), makeTile('1T', 3)], claimedFrom: 'nan' },
        { type: 'pung', tiles: [makeTile('2T', 1), makeTile('2T', 2), makeTile('2T', 3)], claimedFrom: 'nan' },
        { type: 'pung', tiles: [makeTile('3T', 1), makeTile('3T', 2), makeTile('3T', 3)], claimedFrom: 'xi' },
        { type: 'pung', tiles: [makeTile('4T', 1), makeTile('4T', 2), makeTile('4T', 3)], claimedFrom: 'bei' },
      ];

      (engine.getState() as any).currentTurn = 'dong';
      (engine.getState() as any).phase = 'ACTION_DECISION';

      const actions = engine.getLegalActions('dong');
      expect(actions.canDiscard).toBe(false);
      expect(actions.discardableTileIds).toEqual([]);
    });

    it('GameEngine: player with 13 non-discardable Kims + 1 natural tile has canDiscard: true and exactly 1 discardable ID', () => {
      const engine = new GameEngine();
      engine.startNewGame(false);

      const east = engine.getState().players.dong;
      const natural = makeTile('5T', 1);
      east.hand = [...Array.from({ length: 13 }, (_, i) => makeTile('KIM', (i % 4) + 1)), natural];

      (engine.getState() as any).currentTurn = 'dong';
      (engine.getState() as any).phase = 'ACTION_DECISION';

      const actions = engine.getLegalActions('dong');
      expect(actions.canDiscard).toBe(true);
      expect(actions.discardableTileIds).toEqual([natural.id]);
    });

    it('GameEngine: player holding 14 Kims under kimDiscardAllowed: true has canDiscard: true and 14 discardable IDs', () => {
      const engine = new GameEngine({ ...CASUAL_KIM_RULES, kimDiscardAllowed: true });
      engine.startNewGame(false);

      const east = engine.getState().players.dong;
      const kims = Array.from({ length: 14 }, (_, i) => makeTile('KIM', (i % 4) + 1));
      east.hand = kims;

      (engine.getState() as any).currentTurn = 'dong';
      (engine.getState() as any).phase = 'ACTION_DECISION';

      const actions = engine.getLegalActions('dong');
      expect(actions.canDiscard).toBe(true);
      expect(actions.discardableTileIds.length).toBe(14);
      expect(actions.discardableTileIds).toEqual(kims.map((k) => k.id));
    });
  });

  // ==========================================================================
  // Section 4: 500-Permutation Fuzzer & State Invariants Fuzzer Stress Test
  // ==========================================================================
  describe('4. Property Fuzzer: 500 Permutations of Kim Rules & Hand Invariants', () => {
    const rng = createLcg(0x1337_c0de);
    const tileUniverse = createCompleteTileSet();
    const naturalPool = tileUniverse.filter((t) => !isKim(t) && t.type !== 'flower' && t.type !== 'season');
    const kimPool = tileUniverse.filter(isKim);

    it('runs 500 permutations fuzzing discardability, claim legality, and tile partition invariants', () => {
      const tourValidator = new KimValidator(TOURNAMENT_KIM_RULES);
      const casualValidator = new KimValidator(CASUAL_KIM_RULES);
      const allowDiscardValidator = new KimValidator({ ...CASUAL_KIM_RULES, kimDiscardAllowed: true });

      for (let i = 0; i < 500; i++) {
        const handSize = Math.floor(rng() * 14) + 1; // 1 to 14
        const kimCount = Math.floor(rng() * 5); // 0 to 4
        const selectedKims = kimPool.slice(0, kimCount);

        const availableNaturals = [...naturalPool];
        const selectedNaturals: Tile[] = [];
        const naturalsNeeded = Math.max(0, handSize - kimCount);

        for (let j = 0; j < naturalsNeeded; j++) {
          const idx = Math.floor(rng() * availableNaturals.length);
          selectedNaturals.push(availableNaturals.splice(idx, 1)[0]!);
        }

        const hand = [...selectedNaturals, ...selectedKims];

        // 1. Tournament check: zero Kims are ever discardable
        const tourIds = tourValidator.getDiscardableTileIds(hand);
        expect(tourIds.length).toBe(selectedNaturals.length);
        for (const k of selectedKims) {
          expect(tourIds).not.toContain(k.id);
        }
        for (const n of selectedNaturals) {
          expect(tourIds).toContain(n.id);
        }

        // 2. Default Casual check: zero Kims are discardable
        const casualIds = casualValidator.getDiscardableTileIds(hand);
        expect(casualIds.length).toBe(selectedNaturals.length);
        for (const k of selectedKims) {
          expect(casualIds).not.toContain(k.id);
        }

        // 3. Casual with kimDiscardAllowed: true: all tiles are discardable
        const allIds = allowDiscardValidator.getDiscardableTileIds(hand);
        expect(allIds.length).toBe(hand.length);
        for (const t of hand) {
          expect(allIds).toContain(t.id);
        }

        // 4. Claim declaration fuzz: if claim has Kim and rules forbid it, must fail
        const actions: ('jia' | 'pung' | 'kong')[] = ['jia', 'pung', 'kong'];
        const action = actions[Math.floor(rng() * actions.length)]!;
        const claimContainsKim = rng() > 0.4;
        const claimMeldTiles: Tile[] = [];
        const meldLen = action === 'kong' ? 3 : 2;

        if (claimContainsKim) {
          claimMeldTiles.push(kimPool[Math.floor(rng() * kimPool.length)]!);
          while (claimMeldTiles.length < meldLen) {
            claimMeldTiles.push(naturalPool[Math.floor(rng() * naturalPool.length)]!);
          }
        } else {
          while (claimMeldTiles.length < meldLen) {
            claimMeldTiles.push(naturalPool[Math.floor(rng() * naturalPool.length)]!);
          }
        }

        const discard = naturalPool[Math.floor(rng() * naturalPool.length)]!;
        const decl: ClaimDeclaration = {
          seat: 'nan',
          action,
          meldTiles: claimMeldTiles,
        };

        const tourClaim = tourValidator.canClaimDeclaration(decl, discard);
        if (claimContainsKim) {
          expect(tourClaim.valid).toBe(false);
          expect(tourClaim.reason).toMatch(/triggers Lew Fit/i);
        }
      }
    });

    it('stress runs 10 full automated game simulations verifying 148-tile conservation and hand size invariants', () => {
      for (let sim = 1; sim <= 10; sim++) {
        const wall = new Wall(undefined, sim * 777 + 13);
        const engine = new GameEngine(undefined, wall);
        engine.startNewGame(true);

        let turns = 0;
        const maxTurns = 150;

        while (
          engine.getState().phase !== 'RESOLVED_HU' &&
          engine.getState().phase !== 'DRAW_SERI' &&
          turns < maxTurns
        ) {
          turns++;
          const state = engine.getState();

          if (state.phase === 'ACTION_DECISION') {
            const activeSeat = state.currentTurn;
            const player = state.players[activeSeat];
            const effectiveSize = player.hand.length + player.melds.length * 3;
            expect(effectiveSize).toBe(14);

            // Inactive player hands must be 13
            for (const s of ['dong', 'nan', 'xi', 'bei'] as const) {
              if (s !== activeSeat) {
                const p = state.players[s];
                expect(p.hand.length + p.melds.length * 3).toBe(13);
              }
            }

            const actions = engine.getLegalActions(activeSeat);
            if (actions.canSelfDrawHu) {
              engine.declareSelfDrawHu(activeSeat);
              break;
            }

            if (actions.canDiscard && actions.discardableTileIds.length > 0) {
              const tileToDiscard = actions.discardableTileIds[0]!;
              engine.discard(activeSeat, tileToDiscard);
            } else {
              break;
            }
          } else if (state.phase === 'CLAIM_WINDOW') {
            // All pass
            const pending = state.discardPending!;
            for (const s of ['dong', 'nan', 'xi', 'bei'] as const) {
              if (s !== pending.discarder) {
                engine.submitClaim({ seat: s, action: 'pass' });
              }
            }
            engine.resolveClaimWindow();
          } else {
            break;
          }
        }

        // Universe tile count invariant: exactly 148 tiles conserved
        const state = engine.getState();
        let totalTiles = 0;
        for (const s of ['dong', 'nan', 'xi', 'bei'] as const) {
          const p = state.players[s];
          totalTiles += p.hand.length;
          p.melds.forEach((m) => (totalTiles += m.tiles.length));
          totalTiles += p.flowers.length;
          totalTiles += p.discards.length;
        }
        totalTiles += state.wall.remainingCount;
        if (state.discardPending) totalTiles++;
        expect(totalTiles).toBe(148);
      }
    });
  });

  // ==========================================================================
  // Section 5: Incomplete Hand Instant Hu & Se Sam Pu Tat Shape Verification
  // ==========================================================================
  describe('5. Incomplete Hand Instant Hu & Se Sam Pu Tat Invariants', () => {
    it('verifies KIM-BUG-03: 4 Kims in an incomplete hand (e.g. 6 tiles) does NOT trigger instant Hu', () => {
      const incomplete6Hand = [
        makeTile('KIM', 1), makeTile('KIM', 2), makeTile('KIM', 3), makeTile('KIM', 4),
        makeTile('1T', 1), makeTile('2T', 1),
      ];
      expect(canFormWinningHandWithKim(incomplete6Hand, [], TOURNAMENT_KIM_RULES)).toBe(false);

      const decomps = findWinningDecompositions({
        hand: incomplete6Hand,
        melds: [],
        rules: TOURNAMENT_KIM_RULES,
      });
      expect(decomps.length).toBe(0);
    });

    it('verifies KIM-BUG-03: 4 Kims in a full 14-tile hand triggers instant Hu when isInstantHu is true', () => {
      const full14Hand = [
        makeTile('KIM', 1), makeTile('KIM', 2), makeTile('KIM', 3), makeTile('KIM', 4),
        ...parseTileHand('1T 2T 4T 1S 3S 5S 7B 9B WD WN'),
      ];
      expect(full14Hand.length).toBe(14);
      expect(canFormWinningHandWithKim(full14Hand, [], TOURNAMENT_KIM_RULES)).toBe(true);

      const decomps = findWinningDecompositions({
        hand: full14Hand,
        melds: [],
        rules: TOURNAMENT_KIM_RULES,
        isInstantHu: true,
      });
      expect(decomps.length).toBeGreaterThan(0);
      expect(decomps.some((d) => d.shape === 'shi_kim')).toBe(true);

      // Without isInstantHu flag on a broken hand, it does not emit shi_kim decomposition
      const nonInstantDecomps = findWinningDecompositions({
        hand: full14Hand,
        melds: [],
        rules: TOURNAMENT_KIM_RULES,
        isInstantHu: false,
      });
      expect(nonInstantDecomps.length).toBe(0);
    });

    it('verifies KIM-BUG-03: 4 Kims in an incomplete hand (6 tiles) does NOT trigger instant Hu even if isInstantHu is true', () => {
      const incomplete6Hand = [
        makeTile('KIM', 1), makeTile('KIM', 2), makeTile('KIM', 3), makeTile('KIM', 4),
        makeTile('1T', 1), makeTile('2T', 1),
      ];
      expect(canFormWinningHandWithKim(incomplete6Hand, [], TOURNAMENT_KIM_RULES)).toBe(false);

      const decomps = findWinningDecompositions({
        hand: incomplete6Hand,
        melds: [],
        rules: TOURNAMENT_KIM_RULES,
        isInstantHu: true,
      });
      expect(decomps.length).toBe(0);
    });

    it('verifies KIM-BUG-04: Pattern #39 Se Sam Pu Tat completes as winning hand under NK mode', () => {
      // 14 uncorrelated tiles: index difference >= 3 in each suit, no pairs, no flowers, 0 Kims
      const seSamTiles = parseTileHand('1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX DZ DF');
      expect(seSamTiles.length).toBe(14);

      expect(canFormWinningHandWithKim(seSamTiles, [], TOURNAMENT_KIM_RULES)).toBe(true);

      const decomps = findWinningDecompositions({
        hand: seSamTiles,
        melds: [],
        rules: TOURNAMENT_KIM_RULES,
      });
      expect(decomps.length).toBe(1);
      const decomp = decomps[0]!;
      expect(decomp.shape).toBe('se_sam_pu_tat');
      expect(decomp.mode).toBe('NK');
      expect(decomp.totalKims).toBe(0);
    });
  });
});
