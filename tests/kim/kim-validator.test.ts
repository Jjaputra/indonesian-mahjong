import { describe, expect, it } from 'vitest';
import { keyToTile, parseTileHand } from '@/core/tiles';
import type { Meld, Tile } from '@/core/types';
import {
  CASUAL_KIM_RULES,
  DEFAULT_KIM_RULES,
  STRICT_NO_KIM_RULES,
  TOURNAMENT_KIM_RULES,
  resolveKimRules,
} from '@/kim/types';
import {
  KimValidator,
  checkShiKimInstantHu,
  validateKimMeldLegality,
} from '@/kim/kim-validator';

function makeTile(key: string, idx = 1): Tile {
  return keyToTile(key, idx);
}

describe('KimValidator & Configurable Kim Rules (src/kim/kim-validator.ts)', () => {
  // Domain 1: Default Rules & Presets
  describe('1. Default Rules & Presets', () => {
    it('defaults to Tournament rules (BMC06 authoritative)', () => {
      expect(DEFAULT_KIM_RULES.kimEnabled).toBe(true);
      expect(DEFAULT_KIM_RULES.kimDiscardAllowed).toBe(false);
      expect(DEFAULT_KIM_RULES.allowKimInMeldClaim).toBe(false);
      expect(DEFAULT_KIM_RULES.allowKimInPair).toBe(true);
      expect(DEFAULT_KIM_RULES.allowKimInPung).toBe(true);
      expect(DEFAULT_KIM_RULES.allowKimInJia).toBe(true);
      expect(DEFAULT_KIM_RULES.allowKimInTriplet).toBe(true);
    });

    it('casual preset permits meld claims with Kim non-discardable by default', () => {
      expect(CASUAL_KIM_RULES.kimDiscardAllowed).toBe(false);
      expect(CASUAL_KIM_RULES.allowKimInMeldClaim).toBe(true);
      expect(CASUAL_KIM_RULES.kimEnabled).toBe(true);
    });

    it('strict no-kim preset disables all kim usage', () => {
      expect(STRICT_NO_KIM_RULES.kimEnabled).toBe(false);
      expect(STRICT_NO_KIM_RULES.kimDiscardAllowed).toBe(false);
      expect(STRICT_NO_KIM_RULES.allowKimInMeldClaim).toBe(false);
      expect(STRICT_NO_KIM_RULES.allowKimInPair).toBe(false);
      expect(STRICT_NO_KIM_RULES.allowKimInPung).toBe(false);
      expect(STRICT_NO_KIM_RULES.allowKimInJia).toBe(false);
      expect(STRICT_NO_KIM_RULES.allowKimInTriplet).toBe(false);
    });

    it('resolveKimRules fills undefined flags with defaults', () => {
      const resolved = resolveKimRules({ kimDiscardAllowed: true });
      expect(resolved.kimDiscardAllowed).toBe(true);
      expect(resolved.allowKimInMeldClaim).toBe(false);
      expect(resolved.allowKimInPair).toBe(true);
      expect(resolved.allowKimInPung).toBe(true);
      expect(resolved.allowKimInJia).toBe(true);
      expect(resolved.allowKimInTriplet).toBe(true);
    });
  });

  // Domain 2: Discard Validation
  describe('2. Discard Validation', () => {
    const validator = new KimValidator(TOURNAMENT_KIM_RULES);
    const casualValidator = new KimValidator(CASUAL_KIM_RULES);
    const noKimValidator = new KimValidator(STRICT_NO_KIM_RULES);

    it('allows discarding standard suited and honor tiles', () => {
      const tile5T = makeTile('5T');
      const tileWD = makeTile('WD');
      expect(validator.canDiscard(tile5T).valid).toBe(true);
      expect(validator.canDiscard(tileWD).valid).toBe(true);
      expect(() => validator.validateDiscard(tile5T)).not.toThrow();
    });

    it('prohibits discarding Kim under tournament rules', () => {
      const kim = makeTile('KIM');
      const res = validator.canDiscard(kim);
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/Discarding Kim is prohibited/i);
      expect(() => validator.validateDiscard(kim)).toThrowError(/Discarding Kim is prohibited/i);
    });

    it('prohibits discarding Kim under casual rules by default, allows with explicit override', () => {
      const kim = makeTile('KIM');
      expect(casualValidator.canDiscard(kim).valid).toBe(false);
      const allowDiscardValidator = new KimValidator({ ...CASUAL_KIM_RULES, kimDiscardAllowed: true });
      expect(allowDiscardValidator.canDiscard(kim).valid).toBe(true);
      expect(() => allowDiscardValidator.validateDiscard(kim)).not.toThrow();
    });

    it('prohibits discarding Kim when Kim is disabled', () => {
      const kim = makeTile('KIM');
      const res = noKimValidator.canDiscard(kim);
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/Kim tiles are disabled/i);
      expect(() => noKimValidator.validateDiscard(kim)).toThrowError(/Kim tiles are disabled/i);
    });

    it('getDiscardableTileIds filters Kim tiles when kimDiscardAllowed is false', () => {
      const hand = [makeTile('1T', 1), makeTile('2T', 1), makeTile('KIM', 1)];
      const ids = validator.getDiscardableTileIds(hand);
      expect(ids).toEqual(['tong-1-1', 'tong-2-1']);
      expect(ids).not.toContain('kim-0-1');
    });

    it('getDiscardableTileIds includes Kim tiles when kimDiscardAllowed is true', () => {
      const hand = [makeTile('1T', 1), makeTile('2T', 1), makeTile('KIM', 1)];
      const allowDiscardValidator = new KimValidator({ ...CASUAL_KIM_RULES, kimDiscardAllowed: true });
      const ids = allowDiscardValidator.getDiscardableTileIds(hand);
      expect(ids).toEqual(['tong-1-1', 'tong-2-1', 'kim-0-1']);
    });
  });

  // Domain 3: Claim Validation (Jia, Pung, Kong)
  describe('3. Claim Validation', () => {
    const tournamentValidator = new KimValidator(TOURNAMENT_KIM_RULES);
    const casualValidator = new KimValidator(CASUAL_KIM_RULES);

    it('permits natural Jia claim under tournament rules', () => {
      const discard = makeTile('5T');
      const meldTiles = [makeTile('4T'), makeTile('6T')];
      expect(() => {
        tournamentValidator.validateClaimDeclaration(
          { seat: 'nan', action: 'jia', meldTiles },
          discard
        );
      }).not.toThrow();
    });

    it('rejects Jia claim using Kim under tournament rules (Lew Fit)', () => {
      const discard = makeTile('5T');
      const meldTiles = [makeTile('4T'), makeTile('KIM')];
      expect(() => {
        tournamentValidator.validateClaimDeclaration(
          { seat: 'nan', action: 'jia', meldTiles },
          discard
        );
      }).toThrowError(/Using Kim in Jia\/Pung\/Kong claims is prohibited/i);
    });

    it('permits Jia claim using Kim under casual rules', () => {
      const discard = makeTile('5T');
      const meldTiles = [makeTile('4T'), makeTile('KIM')];
      expect(() => {
        casualValidator.validateClaimDeclaration(
          { seat: 'nan', action: 'jia', meldTiles },
          discard
        );
      }).not.toThrow();
    });

    it('rejects Jia claim with Kim if allowKimInJia is false even in casual mode', () => {
      const customValidator = new KimValidator({
        ...CASUAL_KIM_RULES,
        allowKimInJia: false,
      });
      const discard = makeTile('5T');
      const meldTiles = [makeTile('4T'), makeTile('KIM')];
      expect(() => {
        customValidator.validateClaimDeclaration(
          { seat: 'nan', action: 'jia', meldTiles },
          discard
        );
      }).toThrowError(/Using Kim in Jia sequences is disabled/i);
    });

    it('rejects Jia claim with Kim if discard is not suited (honors)', () => {
      const discard = makeTile('WD');
      const meldTiles = [makeTile('WN'), makeTile('KIM')];
      expect(() => {
        casualValidator.validateClaimDeclaration(
          { seat: 'nan', action: 'jia', meldTiles },
          discard
        );
      }).toThrowError(/Jia sequence requires suited tiles/i);
    });

    it('rejects Pung claim using Kim under tournament rules', () => {
      const discard = makeTile('5S', 1);
      const meldTiles = [makeTile('5S', 2), makeTile('KIM', 1)];
      expect(() => {
        tournamentValidator.validateClaimDeclaration(
          { seat: 'xi', action: 'pung', meldTiles },
          discard
        );
      }).toThrowError(/Using Kim in Jia\/Pung\/Kong claims is prohibited/i);
    });

    it('permits Pung claim using Kim under casual rules', () => {
      const discard = makeTile('5S', 1);
      const meldTiles = [makeTile('5S', 2), makeTile('KIM', 1)];
      expect(() => {
        casualValidator.validateClaimDeclaration(
          { seat: 'xi', action: 'pung', meldTiles },
          discard
        );
      }).not.toThrow();
    });

    it('rejects Pung claim with Kim if allowKimInPung is false', () => {
      const customValidator = new KimValidator({
        ...CASUAL_KIM_RULES,
        allowKimInPung: false,
      });
      const discard = makeTile('5S', 1);
      const meldTiles = [makeTile('5S', 2), makeTile('KIM', 1)];
      expect(() => {
        customValidator.validateClaimDeclaration(
          { seat: 'xi', action: 'pung', meldTiles },
          discard
        );
      }).toThrowError(/Using Kim in Pung triplets is disabled/i);
    });

    it('rejects Kong claim using Kim under tournament rules', () => {
      const discard = makeTile('9B', 1);
      const meldTiles = [makeTile('9B', 2), makeTile('9B', 3), makeTile('KIM', 1)];
      expect(() => {
        tournamentValidator.validateClaimDeclaration(
          { seat: 'bei', action: 'kong', meldTiles },
          discard
        );
      }).toThrowError(/Using Kim in Jia\/Pung\/Kong claims is prohibited/i);
    });

    it('pass and hu declarations always pass claim validation', () => {
      expect(() => {
        tournamentValidator.validateClaimDeclaration({ seat: 'nan', action: 'pass' }, makeTile('5T'));
        tournamentValidator.validateClaimDeclaration({ seat: 'nan', action: 'hu' }, makeTile('5T'));
      }).not.toThrow();
    });
  });

  // Domain 4: Natural Kim vs Wildcard Kim Evaluation
  describe('4. Natural Kim vs Wildcard Kim Evaluation', () => {
    const validator = new KimValidator();

    it('evaluates hand with 0 Kims as NK mode with Bo KIM', () => {
      const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX WX DP DP');
      const evalResult = validator.evaluateHandKimMode(hand);
      expect(evalResult.totalKimCount).toBe(0);
      expect(evalResult.mode).toBe('NK');
      expect(evalResult.isBoKim).toBe(true);
      expect(evalResult.isBoKimEligible).toBe(true);
    });

    it('evaluates hand with wildcard Kim as K mode without Bo KIM', () => {
      const hand = parseTileHand('1T KIM 3T 4S 5S 6S 7B 8B 9B WX WX WX DP DP');
      const evalResult = validator.evaluateHandKimMode(hand);
      expect(evalResult.totalKimCount).toBe(1);
      expect(evalResult.wildcardKimCount).toBe(1);
      expect(evalResult.mode).toBe('K');
      expect(evalResult.isBoKim).toBe(false);
    });

    it('evaluates Kim Thi (3 Kims) as K mode with hasKimThi flag', () => {
      const hand = parseTileHand('KIM KIM KIM 1T 2T 3T 4S 5S 6S 7B 8B 9B DP DP');
      const evalResult = validator.evaluateHandKimMode(hand, [
        { kimTile: hand[0]!, role: 'kim_triplet' },
        { kimTile: hand[1]!, role: 'kim_triplet' },
        { kimTile: hand[2]!, role: 'kim_triplet' },
      ]);
      expect(evalResult.totalKimCount).toBe(3);
      expect(evalResult.hasKimThi).toBe(true);
      expect(evalResult.mode).toBe('K');
    });

    it('evaluates Kim Ciok (2 Kims) as K mode with hasKimCiok flag', () => {
      const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX WX KIM KIM');
      const evalResult = validator.evaluateHandKimMode(hand, [
        { kimTile: hand[12]!, role: 'kim_pair' },
        { kimTile: hand[13]!, role: 'kim_pair' },
      ]);
      expect(evalResult.totalKimCount).toBe(2);
      expect(evalResult.hasKimCiok).toBe(true);
      expect(evalResult.mode).toBe('K');
    });

    it('recognizes nominal Kim match under Rule #8 clause 2 as NK mode', () => {
      const kim = makeTile('KIM', 1);
      (kim as any).nominalTile = makeTile('5T', 1);
      const allTiles = [kim, ...parseTileHand('3T 4T 1S 2S 3S 4B 5B 6B WX WX WX DP DP')];

      const evalResult = validator.evaluateHandKimMode(allTiles, [
        { kimTile: kim, role: 'natural_nominal', substitutedTile: makeTile('5T', 1) },
      ]);
      expect(evalResult.mode).toBe('NK');
      expect(evalResult.isBoKim).toBe(true);
      expect(evalResult.naturalNominalCount).toBe(1);
    });
  });

  // Domain 5: Meld Legality & Shi Kim Instant Hu Helper
  describe('5. Meld Legality & Shi Kim Instant Hu Helper', () => {
    it('validateKimMeldLegality rejects open Kim melds under tournament rules', () => {
      const openMelds: Meld[] = [
        { type: 'jia', tiles: [makeTile('4T'), makeTile('KIM'), makeTile('6T')], claimedFrom: 'bei' },
      ];
      const report = validateKimMeldLegality(openMelds, TOURNAMENT_KIM_RULES);
      expect(report.isLegal).toBe(false);
      expect(report.isLewFit).toBe(true);
      expect(report.rejectionReason).toMatch(/triggers Lew Fit/i);
    });

    it('validateKimMeldLegality permits open Kim melds under casual rules', () => {
      const openMelds: Meld[] = [
        { type: 'jia', tiles: [makeTile('4T'), makeTile('KIM'), makeTile('6T')], claimedFrom: 'bei' },
      ];
      const report = validateKimMeldLegality(openMelds, CASUAL_KIM_RULES);
      expect(report.isLegal).toBe(true);
      expect(report.isLewFit).toBe(false);
    });

    it('validateKimMeldLegality does not penalize concealed Ankong with Kim', () => {
      const melds: Meld[] = [
        { type: 'ankong', tiles: [makeTile('5T', 1), makeTile('5T', 2), makeTile('5T', 3), makeTile('KIM', 1)] },
      ];
      const report = validateKimMeldLegality(melds, TOURNAMENT_KIM_RULES);
      expect(report.isLegal).toBe(true);
      expect(report.isLewFit).toBe(false);
    });

    it('checkShiKimInstantHu correctly identifies 4 Kims', () => {
      const fourKims = [
        makeTile('1T'), makeTile('2T'), makeTile('3T'),
        makeTile('KIM', 1), makeTile('KIM', 2), makeTile('KIM', 3), makeTile('KIM', 4),
      ];
      expect(checkShiKimInstantHu(fourKims)).toBe(true);

      const threeKims = [
        makeTile('1T'), makeTile('2T'), makeTile('3T'),
        makeTile('KIM', 1), makeTile('KIM', 2), makeTile('KIM', 3),
      ];
      expect(checkShiKimInstantHu(threeKims)).toBe(false);
    });
  });
});
