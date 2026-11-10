import { describe, expect, it } from 'vitest';
import { keyToTile, parseTileHand, createCompleteTileSet } from '@/core/tiles';
import type { ClaimDeclaration, Meld, Tile } from '@/core/types';
import {
  CASUAL_KIM_RULES,
  STRICT_NO_KIM_RULES,
  TOURNAMENT_KIM_RULES,
  type KimAssignment,
} from '@/kim/types';
import {
  KimValidator,
  checkShiKimInstantHu,
  validateKimMeldLegality,
} from '@/kim/kim-validator';
import { isKim } from '@/kim/wildcard-solver';

function makeTile(key: string, idx = 1): Tile {
  return keyToTile(key, idx);
}

// PRNG for deterministic adversarial fuzzing
function createLcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('Tier 5 Adversarial Verification: Kim Joker System Rules & Validator', () => {
  const tournamentValidator = new KimValidator(TOURNAMENT_KIM_RULES);
  const casualValidator = new KimValidator(CASUAL_KIM_RULES);
  const strictValidator = new KimValidator(STRICT_NO_KIM_RULES);

  // ==========================================================================
  // Section 1: Tournament Rule "Tidak boleh membuang kim" vs Casual Preset
  // ==========================================================================
  describe('1. Tournament Rule: "Tidak boleh membuang kim" (kimDiscardAllowed: false)', () => {
    it('strictly forbids discarding any physical Kim tile under tournament rules', () => {
      for (let i = 1; i <= 4; i++) {
        const kim = makeTile('KIM', i);
        const check = tournamentValidator.canDiscard(kim);
        expect(check.valid).toBe(false);
        expect(check.reason).toMatch(/Discarding Kim is prohibited under tournament rules/i);
        expect(() => tournamentValidator.validateDiscard(kim)).toThrowError(
          /Discarding Kim is prohibited under tournament rules/i
        );
      }
    });

    it('permits discarding standard suited and honor tiles under tournament rules', () => {
      const naturalKeys = ['1T', '9T', '1S', '9S', '1B', '9B', 'WD', 'WN', 'WX', 'WB', 'DZ', 'DF', 'DP'];
      for (const k of naturalKeys) {
        const tile = makeTile(k, 1);
        expect(tournamentValidator.canDiscard(tile).valid).toBe(true);
        expect(() => tournamentValidator.validateDiscard(tile)).not.toThrow();
      }
    });

    it('prohibits discarding Kim tiles under casual preset by default, permits when kimDiscardAllowed is true', () => {
      for (let i = 1; i <= 4; i++) {
        const kim = makeTile('KIM', i);
        expect(casualValidator.canDiscard(kim).valid).toBe(false);
        const allowDiscardValidator = new KimValidator({ ...CASUAL_KIM_RULES, kimDiscardAllowed: true });
        const check = allowDiscardValidator.canDiscard(kim);
        expect(check.valid).toBe(true);
        expect(check.reason).toBeUndefined();
        expect(() => allowDiscardValidator.validateDiscard(kim)).not.toThrow();
      }
    });

    it('rejects discarding Kim tiles when kimEnabled is false', () => {
      const kim = makeTile('KIM', 1);
      const check = strictValidator.canDiscard(kim);
      expect(check.valid).toBe(false);
      expect(check.reason).toMatch(/Kim tiles are disabled/i);
      expect(() => strictValidator.validateDiscard(kim)).toThrowError(/Kim tiles are disabled/i);
    });

    it('honors per-call rule overrides in canDiscard and validateDiscard', () => {
      const kim = makeTile('KIM', 1);
      const allowDiscardRules = { ...CASUAL_KIM_RULES, kimDiscardAllowed: true };
      // Validator created as tournament, overridden with kimDiscardAllowed: true
      expect(tournamentValidator.canDiscard(kim, allowDiscardRules).valid).toBe(true);
      expect(() => tournamentValidator.validateDiscard(kim, allowDiscardRules)).not.toThrow();

      // Validator created as casual, overridden as tournament
      expect(casualValidator.canDiscard(kim, TOURNAMENT_KIM_RULES).valid).toBe(false);
      expect(() => casualValidator.validateDiscard(kim, TOURNAMENT_KIM_RULES)).toThrowError(
        /Discarding Kim is prohibited/i
      );
    });
  });

  // ==========================================================================
  // Section 2: Tournament Rule "Jia atau Pung menggunakan Kim -> Lew Fit"
  // ==========================================================================
  describe('2. Tournament Rule: "Jia atau Pung menggunakan Kim -> Lew Fit" (allowKimInMeldClaim: false)', () => {
    const discardSuited = makeTile('5T', 1);

    it('rejects Jia claim declaration using Kim under tournament rules with exact Lew Fit reason', () => {
      const decl: ClaimDeclaration = {
        seat: 'nan',
        action: 'jia',
        meldTiles: [makeTile('4T', 1), makeTile('KIM', 1)],
      };
      const check = tournamentValidator.canClaimDeclaration(decl, discardSuited);
      expect(check.valid).toBe(false);
      expect(check.reason).toMatch(/Using Kim in Jia\/Pung\/Kong claims is prohibited \(triggers Lew Fit\)/i);
      expect(() => tournamentValidator.validateClaimDeclaration(decl, discardSuited)).toThrowError(
        /Using Kim in Jia\/Pung\/Kong claims is prohibited \(triggers Lew Fit\)/i
      );
    });

    it('rejects Pung claim declaration using Kim under tournament rules', () => {
      const decl: ClaimDeclaration = {
        seat: 'xi',
        action: 'pung',
        meldTiles: [makeTile('5T', 2), makeTile('KIM', 1)],
      };
      const check = tournamentValidator.canClaimDeclaration(decl, discardSuited);
      expect(check.valid).toBe(false);
      expect(check.reason).toMatch(/triggers Lew Fit/i);
      expect(() => tournamentValidator.validateClaimDeclaration(decl, discardSuited)).toThrowError(
        /triggers Lew Fit/i
      );
    });

    it('rejects Kong claim declaration using Kim under tournament rules', () => {
      const decl: ClaimDeclaration = {
        seat: 'bei',
        action: 'kong',
        meldTiles: [makeTile('5T', 2), makeTile('5T', 3), makeTile('KIM', 1)],
      };
      const check = tournamentValidator.canClaimDeclaration(decl, discardSuited);
      expect(check.valid).toBe(false);
      expect(check.reason).toMatch(/triggers Lew Fit/i);
      expect(() => tournamentValidator.validateClaimDeclaration(decl, discardSuited)).toThrowError(
        /triggers Lew Fit/i
      );
    });

    it('permits natural Jia/Pung/Kong claims without Kim under tournament rules', () => {
      const jiaDecl: ClaimDeclaration = {
        seat: 'nan',
        action: 'jia',
        meldTiles: [makeTile('4T', 1), makeTile('6T', 1)],
      };
      const pungDecl: ClaimDeclaration = {
        seat: 'xi',
        action: 'pung',
        meldTiles: [makeTile('5T', 2), makeTile('5T', 3)],
      };
      const kongDecl: ClaimDeclaration = {
        seat: 'bei',
        action: 'kong',
        meldTiles: [makeTile('5T', 2), makeTile('5T', 3), makeTile('5T', 4)],
      };

      expect(tournamentValidator.canClaimDeclaration(jiaDecl, discardSuited).valid).toBe(true);
      expect(tournamentValidator.canClaimDeclaration(pungDecl, discardSuited).valid).toBe(true);
      expect(tournamentValidator.canClaimDeclaration(kongDecl, discardSuited).valid).toBe(true);

      expect(() => tournamentValidator.validateClaimDeclaration(jiaDecl, discardSuited)).not.toThrow();
      expect(() => tournamentValidator.validateClaimDeclaration(pungDecl, discardSuited)).not.toThrow();
      expect(() => tournamentValidator.validateClaimDeclaration(kongDecl, discardSuited)).not.toThrow();
    });

    it('permits Hu (Ron) and Pass declarations unconditionally through claim validator', () => {
      const huDecl: ClaimDeclaration = { seat: 'nan', action: 'hu' };
      const passDecl: ClaimDeclaration = { seat: 'nan', action: 'pass' };

      expect(tournamentValidator.canClaimDeclaration(huDecl, discardSuited).valid).toBe(true);
      expect(tournamentValidator.canClaimDeclaration(passDecl, discardSuited).valid).toBe(true);
      expect(() => tournamentValidator.validateClaimDeclaration(huDecl, discardSuited)).not.toThrow();
      expect(() => tournamentValidator.validateClaimDeclaration(passDecl, discardSuited)).not.toThrow();
    });

    it('validateKimMeldLegality flags open melds containing Kim as Lew Fit under tournament rules', () => {
      const openJia: Meld = {
        type: 'jia',
        tiles: [makeTile('4T', 1), makeTile('KIM', 1), makeTile('6T', 1)],
        claimedFrom: 'bei',
      };
      const openPung: Meld = {
        type: 'pung',
        tiles: [makeTile('5S', 1), makeTile('5S', 2), makeTile('KIM', 1)],
        claimedFrom: 'xi',
      };
      const openKong: Meld = {
        type: 'kong',
        tiles: [makeTile('9B', 1), makeTile('9B', 2), makeTile('9B', 3), makeTile('KIM', 1)],
        claimedFrom: 'nan',
      };

      for (const m of [openJia, openPung, openKong]) {
        const report = validateKimMeldLegality([m], TOURNAMENT_KIM_RULES);
        expect(report.isLegal).toBe(false);
        expect(report.isLewFit).toBe(true);
        expect(report.rejectionReason).toMatch(/triggers Lew Fit/i);
      }
    });

    it('validateKimMeldLegality permits concealed Ankong containing Kim without penalty', () => {
      const concealedAnkong: Meld = {
        type: 'ankong',
        tiles: [makeTile('5T', 1), makeTile('5T', 2), makeTile('5T', 3), makeTile('KIM', 1)],
      };
      const report = validateKimMeldLegality([concealedAnkong], TOURNAMENT_KIM_RULES);
      expect(report.isLegal).toBe(true);
      expect(report.isLewFit).toBe(false);
      expect(report.rejectionReason).toBeUndefined();
    });

    it('validateKimMeldLegality permits all open melds when allowKimInMeldClaim is true (casual)', () => {
      const openJiaWithKim: Meld = {
        type: 'jia',
        tiles: [makeTile('4T', 1), makeTile('KIM', 1), makeTile('6T', 1)],
        claimedFrom: 'bei',
      };
      const report = validateKimMeldLegality([openJiaWithKim], CASUAL_KIM_RULES);
      expect(report.isLegal).toBe(true);
      expect(report.isLewFit).toBe(false);
    });
  });

  // ==========================================================================
  // Section 3: Casual Preset Meld Claim Mechanics & Granular Toggles
  // ==========================================================================
  describe('3. Casual Preset Meld Claims & Granular Toggles', () => {
    it('permits Jia with Kim on suited discards in casual mode', () => {
      const decl: ClaimDeclaration = {
        seat: 'nan',
        action: 'jia',
        meldTiles: [makeTile('4T', 1), makeTile('KIM', 1)],
      };
      expect(casualValidator.canClaimDeclaration(decl, makeTile('5T', 1)).valid).toBe(true);
      expect(() => casualValidator.validateClaimDeclaration(decl, makeTile('5T', 1))).not.toThrow();
    });

    it('rejects Jia with Kim on honor tile discards (winds/dragons) even in casual mode', () => {
      const decl: ClaimDeclaration = {
        seat: 'nan',
        action: 'jia',
        meldTiles: [makeTile('WN', 1), makeTile('KIM', 1)],
      };
      const check = casualValidator.canClaimDeclaration(decl, makeTile('WD', 1));
      expect(check.valid).toBe(false);
      expect(check.reason).toMatch(/Jia sequence requires suited tiles/i);
      expect(() => casualValidator.validateClaimDeclaration(decl, makeTile('WD', 1))).toThrowError(
        /Jia sequence requires suited tiles/i
      );
    });

    it('respects allowKimInJia toggle independently in casual mode', () => {
      const customValidator = new KimValidator({
        ...CASUAL_KIM_RULES,
        allowKimInJia: false,
      });
      const decl: ClaimDeclaration = {
        seat: 'nan',
        action: 'jia',
        meldTiles: [makeTile('4T', 1), makeTile('KIM', 1)],
      };
      const check = customValidator.canClaimDeclaration(decl, makeTile('5T', 1));
      expect(check.valid).toBe(false);
      expect(check.reason).toMatch(/Using Kim in Jia sequences is disabled by rules/i);
    });

    it('respects allowKimInPung toggle independently in casual mode', () => {
      const customValidator = new KimValidator({
        ...CASUAL_KIM_RULES,
        allowKimInPung: false,
      });
      const decl: ClaimDeclaration = {
        seat: 'xi',
        action: 'pung',
        meldTiles: [makeTile('5S', 1), makeTile('KIM', 1)],
      };
      const check = customValidator.canClaimDeclaration(decl, makeTile('5S', 2));
      expect(check.valid).toBe(false);
      expect(check.reason).toMatch(/Using Kim in Pung triplets is disabled by rules/i);
    });
  });

  // ==========================================================================
  // Section 4: All-Kim Hands & Discardable Tile ID Boundary Cases
  // ==========================================================================
  describe('4. All-Kim Hands & Discardable Tile Boundary Behavior', () => {
    it('returns empty array [] for an all-Kim hand (14 Kims) under tournament rules', () => {
      const all14Kims = Array.from({ length: 14 }, (_, i) => makeTile('KIM', (i % 4) + 1));
      const discardable = tournamentValidator.getDiscardableTileIds(all14Kims);
      expect(discardable).toEqual([]);
      expect(discardable.length).toBe(0);

      // Verify that canDiscard returns false for every single tile in this hand
      for (const t of all14Kims) {
        expect(tournamentValidator.canDiscard(t).valid).toBe(false);
      }
    });

    it('returns empty array [] by default, or all 14 tile IDs when kimDiscardAllowed is enabled', () => {
      const all14Kims = Array.from({ length: 14 }, (_, i) => makeTile('KIM', (i % 4) + 1));
      const discardableDefault = casualValidator.getDiscardableTileIds(all14Kims);
      expect(discardableDefault.length).toBe(0);

      const allowDiscardValidator = new KimValidator({ ...CASUAL_KIM_RULES, kimDiscardAllowed: true });
      const discardable = allowDiscardValidator.getDiscardableTileIds(all14Kims);
      expect(discardable.length).toBe(14);
      expect(discardable).toEqual(all14Kims.map((t) => t.id));

      for (const t of all14Kims) {
        expect(allowDiscardValidator.canDiscard(t).valid).toBe(true);
      }
    });

    it('returns empty array [] for 2 Kims remaining after 4 open melds under tournament rules', () => {
      const twoKims = [makeTile('KIM', 1), makeTile('KIM', 2)];
      const discardable = tournamentValidator.getDiscardableTileIds(twoKims);
      expect(discardable).toEqual([]);
      expect(discardable.length).toBe(0);
    });

    it('returns empty array [] for single Kim wait (hand size 1) under tournament rules', () => {
      const loneKim = [makeTile('KIM', 1)];
      const discardable = tournamentValidator.getDiscardableTileIds(loneKim);
      expect(discardable).toEqual([]);
      expect(discardable.length).toBe(0);
    });

    it('correctly partitions a mixed hand with 4 Kims and 10 natural tiles under tournament rules', () => {
      const mixed = [
        makeTile('1T', 1), makeTile('2T', 1), makeTile('3T', 1),
        makeTile('4S', 1), makeTile('5S', 1), makeTile('6S', 1),
        makeTile('7B', 1), makeTile('8B', 1), makeTile('9B', 1),
        makeTile('WD', 1),
        makeTile('KIM', 1), makeTile('KIM', 2), makeTile('KIM', 3), makeTile('KIM', 4),
      ];
      const discardable = tournamentValidator.getDiscardableTileIds(mixed);
      expect(discardable.length).toBe(10);
      expect(discardable).not.toContain('kim-0-1');
      expect(discardable).not.toContain('kim-0-2');
      expect(discardable).not.toContain('kim-0-3');
      expect(discardable).not.toContain('kim-0-4');

      // Check exact natural tile IDs
      expect(discardable).toEqual([
        'tong-1-1', 'tong-2-1', 'tong-3-1',
        'sok-4-1', 'sok-5-1', 'sok-6-1',
        'ban-7-1', 'ban-8-1', 'ban-9-1',
        'wind-dong-1',
      ]);
    });

    it('returns all 14 IDs for a mixed hand with 4 Kims under casual rules when kimDiscardAllowed is true', () => {
      const mixed = [
        makeTile('1T', 1), makeTile('2T', 1), makeTile('3T', 1),
        makeTile('4S', 1), makeTile('5S', 1), makeTile('6S', 1),
        makeTile('7B', 1), makeTile('8B', 1), makeTile('9B', 1),
        makeTile('WD', 1),
        makeTile('KIM', 1), makeTile('KIM', 2), makeTile('KIM', 3), makeTile('KIM', 4),
      ];
      const allowDiscardValidator = new KimValidator({ ...CASUAL_KIM_RULES, kimDiscardAllowed: true });
      const discardable = allowDiscardValidator.getDiscardableTileIds(mixed);
      expect(discardable.length).toBe(14);
      expect(discardable).toContain('kim-0-1');
      expect(discardable).toContain('kim-0-4');
    });

    it('returns all IDs for a 14-natural hand with 0 Kims under both tournament and casual rules', () => {
      const naturals = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WD WN WX DP DP');
      const tourIds = tournamentValidator.getDiscardableTileIds(naturals);
      const casualIds = casualValidator.getDiscardableTileIds(naturals);
      expect(tourIds.length).toBe(14);
      expect(casualIds.length).toBe(14);
      expect(tourIds).toEqual(naturals.map((t) => t.id));
      expect(casualIds).toEqual(naturals.map((t) => t.id));
    });
  });

  // ==========================================================================
  // Section 5: Rule #8 Clause 2 Nominal Match vs Wildcard Kim
  // ==========================================================================
  describe('5. Rule #8 Clause 2: Nominal Match vs Wildcard Kim', () => {
    it('evaluates hand with 0 Kims as NK mode with Bo KIM (+3 Tay)', () => {
      const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WD WN WX DP DP');
      const res = tournamentValidator.evaluateHandKimMode(hand);
      expect(res.mode).toBe('NK');
      expect(res.isBoKim).toBe(true);
      expect(res.isBoKimEligible).toBe(true);
      expect(res.totalKimCount).toBe(0);
      expect(res.wildcardKimCount).toBe(0);
      expect(res.naturalNominalCount).toBe(0);
      expect(res.kimTay).toBe(3); // +3 Bo KIM
    });

    it('evaluates hand with 1 wildcard Kim as K mode, stripping Bo KIM', () => {
      const hand = parseTileHand('1T KIM 3T 4S 5S 6S 7B 8B 9B WD WN WX DP DP');
      const res = tournamentValidator.evaluateHandKimMode(hand);
      expect(res.mode).toBe('K');
      expect(res.isBoKim).toBe(false);
      expect(res.isBoKimEligible).toBe(false);
      expect(res.totalKimCount).toBe(1);
      expect(res.wildcardKimCount).toBe(1);
      expect(res.kimTay).toBe(1); // 1 Tay for Pattern #7 Tile KIM
    });

    it('evaluates nominal Kim matching printed face rank as NK mode under Rule #8 clause 2', () => {
      const kim = makeTile('KIM', 1);
      (kim as any).nominalTile = makeTile('5T', 1);
      const hand = [kim, ...parseTileHand('3T 4T 1S 2S 3S 4B 5B 6B WD WN WX DP DP')];

      const assignments: KimAssignment[] = [
        { kimTile: kim, role: 'natural_nominal', substitutedTile: makeTile('5T', 1) },
      ];
      const res = tournamentValidator.evaluateHandKimMode(hand, assignments);
      expect(res.mode).toBe('NK');
      expect(res.isBoKim).toBe(true);
      expect(res.isBoKimEligible).toBe(true);
      expect(res.naturalNominalCount).toBe(1);
      expect(res.wildcardKimCount).toBe(0);
      expect(res.kimTay).toBe(3); // Earns Bo KIM +3
    });

    it('strictly forces K mode if 1 Kim is nominal but another Kim is used as a wildcard', () => {
      const kim1 = makeTile('KIM', 1);
      (kim1 as any).nominalTile = makeTile('5T', 1);
      const kim2 = makeTile('KIM', 2);
      const hand = [kim1, kim2, ...parseTileHand('3T 4T 1S 2S 3S 4B 5B 6B WD WN WX DP')];

      const assignments: KimAssignment[] = [
        { kimTile: kim1, role: 'natural_nominal', substitutedTile: makeTile('5T', 1) },
        { kimTile: kim2, role: 'wildcard', substitutedTile: makeTile('DP', 1) },
      ];
      const res = tournamentValidator.evaluateHandKimMode(hand, assignments);
      expect(res.mode).toBe('K');
      expect(res.isBoKim).toBe(false);
      expect(res.isBoKimEligible).toBe(false);
      expect(res.totalKimCount).toBe(2);
      expect(res.naturalNominalCount).toBe(1);
      expect(res.wildcardKimCount).toBe(1);
      expect(res.kimTay).toBe(2); // 2 Tay for Tile KIM in K mode
    });

    it('qualifies for NK mode if ALL multiple Kims (e.g. 2 Kims) are nominal matches', () => {
      const kim1 = makeTile('KIM', 1);
      (kim1 as any).nominalTile = makeTile('5T', 1);
      const kim2 = makeTile('KIM', 2);
      (kim2 as any).nominalTile = makeTile('9S', 1);
      const hand = [kim1, kim2, ...parseTileHand('3T 4T 1S 2S 3S 4B 5B 6B WD WN WX DP')];

      const assignments: KimAssignment[] = [
        { kimTile: kim1, role: 'natural_nominal', substitutedTile: makeTile('5T', 1) },
        { kimTile: kim2, role: 'natural_nominal', substitutedTile: makeTile('9S', 1) },
      ];
      const res = tournamentValidator.evaluateHandKimMode(hand, assignments);
      expect(res.mode).toBe('NK');
      expect(res.isBoKim).toBe(true);
      expect(res.naturalNominalCount).toBe(2);
      expect(res.wildcardKimCount).toBe(0);
      expect(res.kimTay).toBe(3); // Bo KIM +3
    });

    it('treats incomplete nominal assignments (fewer assignments than Kims in hand) as K mode', () => {
      const kim1 = makeTile('KIM', 1);
      (kim1 as any).nominalTile = makeTile('5T', 1);
      const kim2 = makeTile('KIM', 2);
      const hand = [kim1, kim2, ...parseTileHand('3T 4T 1S 2S 3S 4B 5B 6B WD WN WX DP')];

      // Only kim1 is passed in assignments; kim2 is missing
      const assignments: KimAssignment[] = [
        { kimTile: kim1, role: 'natural_nominal', substitutedTile: makeTile('5T', 1) },
      ];
      const res = tournamentValidator.evaluateHandKimMode(hand, assignments);
      expect(res.mode).toBe('K');
      expect(res.isBoKim).toBe(false);
      expect(res.naturalNominalCount).toBe(1);
      expect(res.totalKimCount).toBe(2);
    });

    it('adversarially probes isWildcardKim and isNaturalKim with matching and non-matching tiles', () => {
      const kimWithNominal = makeTile('KIM', 1);
      (kimWithNominal as any).nominalTile = makeTile('5T', 1);

      const standardKim = makeTile('KIM', 2);
      const natural5T = makeTile('5T', 1);

      // 1. kimWithNominal substituting for 5T -> natural nominal
      expect(tournamentValidator.isWildcardKim(kimWithNominal, makeTile('5T', 1))).toBe(false);
      expect(tournamentValidator.isNaturalKim(kimWithNominal, makeTile('5T', 1))).toBe(true);

      // 2. kimWithNominal substituting for 6T (different value) -> wildcard
      expect(tournamentValidator.isWildcardKim(kimWithNominal, makeTile('6T', 1))).toBe(true);
      expect(tournamentValidator.isNaturalKim(kimWithNominal, makeTile('6T', 1))).toBe(false);

      // 3. kimWithNominal substituting for 5S (different suit) -> wildcard
      expect(tournamentValidator.isWildcardKim(kimWithNominal, makeTile('5S', 1))).toBe(true);
      expect(tournamentValidator.isNaturalKim(kimWithNominal, makeTile('5S', 1))).toBe(false);

      // 4. standardKim without nominalTile substituting for 5T -> wildcard
      expect(tournamentValidator.isWildcardKim(standardKim, makeTile('5T', 1))).toBe(true);
      expect(tournamentValidator.isNaturalKim(standardKim, makeTile('5T', 1))).toBe(false);

      // 5. Natural tile passed to isWildcardKim / isNaturalKim -> false (not a Kim)
      expect(tournamentValidator.isWildcardKim(natural5T, makeTile('5T', 1))).toBe(false);
      expect(tournamentValidator.isNaturalKim(natural5T, makeTile('5T', 1))).toBe(false);
    });
  });

  // ==========================================================================
  // Section 6: Shi Kim Instant Hu Helper Adversarial Verification
  // ==========================================================================
  describe('6. Shi Kim Instant Hu Helper (#9 Shi Kim)', () => {
    it('returns true if and only if exactly 4 Kims are present in concealed tiles', () => {
      const allTiles = createCompleteTileSet();
      const kims = allTiles.filter(isKim);
      const naturals = allTiles.filter((t) => !isKim(t));

      // Exactly 4 Kims
      expect(checkShiKimInstantHu([...naturals.slice(0, 10), ...kims])).toBe(true);

      // 3 Kims
      expect(checkShiKimInstantHu([...naturals.slice(0, 11), ...kims.slice(0, 3)])).toBe(false);

      // 2 Kims
      expect(checkShiKimInstantHu([...naturals.slice(0, 12), ...kims.slice(0, 2)])).toBe(false);

      // 1 Kim
      expect(checkShiKimInstantHu([...naturals.slice(0, 13), ...kims.slice(0, 1)])).toBe(false);

      // 0 Kims
      expect(checkShiKimInstantHu(naturals.slice(0, 14))).toBe(false);
    });
  });

  // ==========================================================================
  // Section 7: Invariant Fuzzer (500 Seeded Random Scenarios)
  // ==========================================================================
  describe('7. Fuzzing & Invariant Stress Harness (500 Permutations)', () => {
    const rng = createLcg(0xcafe_babe);
    const tileUniverse = createCompleteTileSet();
    const naturalPool = tileUniverse.filter((t) => !isKim(t) && t.type !== 'flower' && t.type !== 'season');
    const kimPool = tileUniverse.filter(isKim);

    it('Invariant 1 (Tournament Discardability): Kim tile IDs never appear in discardableTileIds', () => {
      for (let iteration = 0; iteration < 200; iteration++) {
        const handSize = Math.floor(rng() * 14) + 1; // 1 to 14
        const kimCount = Math.floor(rng() * 5); // 0 to 4 Kims
        const selectedKims = kimPool.slice(0, kimCount);

        const availableNaturals = [...naturalPool];
        const selectedNaturals: Tile[] = [];
        const naturalsNeeded = Math.max(0, handSize - kimCount);

        for (let j = 0; j < naturalsNeeded; j++) {
          const idx = Math.floor(rng() * availableNaturals.length);
          selectedNaturals.push(availableNaturals.splice(idx, 1)[0]!);
        }

        const hand = [...selectedNaturals, ...selectedKims];
        const discardableIds = tournamentValidator.getDiscardableTileIds(hand);

        // Invariant A: No Kim ID is ever discardable under tournament rules
        for (const k of selectedKims) {
          expect(discardableIds).not.toContain(k.id);
        }

        // Invariant B: Every non-Kim tile is discardable
        for (const n of selectedNaturals) {
          expect(discardableIds).toContain(n.id);
        }

        // Invariant C: Exactly naturalsNeeded IDs returned
        expect(discardableIds.length).toBe(selectedNaturals.length);
      }
    });

    it('Invariant 2 (Casual Discardability): All tiles are discardable regardless of Kim presence', () => {
      for (let iteration = 0; iteration < 100; iteration++) {
        const handSize = Math.floor(rng() * 14) + 1;
        const kimCount = Math.floor(rng() * 5);
        const selectedKims = kimPool.slice(0, kimCount);

        const availableNaturals = [...naturalPool];
        const selectedNaturals: Tile[] = [];
        const naturalsNeeded = Math.max(0, handSize - kimCount);

        for (let j = 0; j < naturalsNeeded; j++) {
          const idx = Math.floor(rng() * availableNaturals.length);
          selectedNaturals.push(availableNaturals.splice(idx, 1)[0]!);
        }

        const hand = [...selectedNaturals, ...selectedKims];
        const allowDiscardValidator = new KimValidator({ ...CASUAL_KIM_RULES, kimDiscardAllowed: true });
        const discardableIds = allowDiscardValidator.getDiscardableTileIds(hand);

        // Invariant: When kimDiscardAllowed is enabled, all tile IDs are discardable
        expect(discardableIds.length).toBe(hand.length);
        for (const t of hand) {
          expect(discardableIds).toContain(t.id);
        }

        // Invariant: Under default casual rules, Kims cannot be discarded (only naturals)
        const defaultDiscardable = casualValidator.getDiscardableTileIds(hand);
        expect(defaultDiscardable.length).toBe(selectedNaturals.length);
      }
    });

    it('Invariant 3 (Claim Prohibition Fuzzer): Tournament rules strictly reject any claim with Kim', () => {
      const actions: ('jia' | 'pung' | 'kong')[] = ['jia', 'pung', 'kong'];

      for (let iteration = 0; iteration < 100; iteration++) {
        const action = actions[Math.floor(rng() * actions.length)]!;
        const hasKim = rng() > 0.3; // 70% chance of containing Kim
        const discard = naturalPool[Math.floor(rng() * naturalPool.length)]!;

        const meldTiles: Tile[] = [];
        const meldSize = action === 'kong' ? 3 : 2;

        if (hasKim) {
          meldTiles.push(kimPool[Math.floor(rng() * kimPool.length)]!);
          while (meldTiles.length < meldSize) {
            meldTiles.push(naturalPool[Math.floor(rng() * naturalPool.length)]!);
          }
        } else {
          while (meldTiles.length < meldSize) {
            meldTiles.push(naturalPool[Math.floor(rng() * naturalPool.length)]!);
          }
        }

        const decl: ClaimDeclaration = {
          seat: 'nan',
          action,
          meldTiles,
        };

        const check = tournamentValidator.canClaimDeclaration(decl, discard);

        if (hasKim) {
          expect(check.valid).toBe(false);
          expect(check.reason).toMatch(/triggers Lew Fit/i);
          expect(() => tournamentValidator.validateClaimDeclaration(decl, discard)).toThrowError(
            /triggers Lew Fit/i
          );
        }
      }
    });

    it('Invariant 4 (Rule #8 Nominal vs Wildcard Consistency): NK mode if and only if 0 wildcards and all Kims nominal', () => {
      for (let iteration = 0; iteration < 100; iteration++) {
        const kimCount = Math.floor(rng() * 5); // 0 to 4
        const kims = kimPool.slice(0, kimCount);
        const naturalCount = 14 - kimCount;
        const naturals = naturalPool.slice(0, naturalCount);
        const hand = [...naturals, ...kims];

        // Randomly decide each Kim's role
        const assignments: KimAssignment[] = [];
        let naturalNominalCount = 0;
        let wildcardCount = 0;

        for (const k of kims) {
          const isNominal = rng() > 0.5;
          if (isNominal) {
            naturalNominalCount++;
            (k as any).nominalTile = makeTile('5T', 1);
            assignments.push({
              kimTile: k,
              role: 'natural_nominal',
              substitutedTile: makeTile('5T', 1),
            });
          } else {
            wildcardCount++;
            assignments.push({
              kimTile: k,
              role: 'wildcard',
            });
          }
        }

        const res = tournamentValidator.evaluateHandKimMode(hand, assignments);

        const expectedNK = kimCount === 0 || (wildcardCount === 0 && naturalNominalCount === kimCount);
        expect(res.mode).toBe(expectedNK ? 'NK' : 'K');
        expect(res.isBoKim).toBe(expectedNK);
        expect(res.wildcardKimCount).toBe(wildcardCount);
        expect(res.naturalNominalCount).toBe(naturalNominalCount);
        expect(res.kimTay).toBe(expectedNK ? 3 : kimCount);
      }
    });
  });

  // ==========================================================================
  // Section 8: Deep Edge Cases & Discrepancy Probes
  // ==========================================================================
  describe('8. Deep Edge Cases & Discrepancy Probes', () => {
    it('discrepancy probe: getDiscardableTileIds returns Kim when kimDiscardAllowed is true even if kimEnabled is false', () => {
      const oddRules = { kimEnabled: false, kimDiscardAllowed: true };
      const kim = makeTile('KIM', 1);
      // canDiscard checks kimEnabled first and correctly returns false
      expect(tournamentValidator.canDiscard(kim, oddRules).valid).toBe(false);
      // But getDiscardableTileIds checks `r.kimDiscardAllowed || !isKim(t)` so it returns kim.id
      const ids = tournamentValidator.getDiscardableTileIds([kim], oddRules);
      expect(ids).toContain('kim-0-1');
    });

    it('probes claim declaration behavior when discarded tile is a Kim', () => {
      const discardedKim = makeTile('KIM', 1);
      const declJia: ClaimDeclaration = {
        seat: 'nan',
        action: 'jia',
        meldTiles: [makeTile('4T', 1), makeTile('5T', 1)],
      };
      // In tournament rules, claims without Kim in meldTiles pass canClaimDeclaration:
      expect(tournamentValidator.canClaimDeclaration(declJia, discardedKim).valid).toBe(true);

      // But in tournament rules, discardedKim can never exist because discarding Kim is prohibited
      expect(tournamentValidator.canDiscard(discardedKim).valid).toBe(false);
    });
  });
});
