import type { ClaimDeclaration, GameRules, Meld, Tile } from '../core/types';
import {
  KimAssignment,
  KimEvaluation,
  KimLegalityReport,
  KimRules,
  resolveKimRules,
  ValidationResult,
} from './types';
import { isKim } from './wildcard-solver';

/**
 * May a Kim from hand fill a slot when claiming a discard as `action`?
 *
 * Toggle semantics (rulebook terms: "Pung" = claiming a discard into a triplet, "Tris" = any triplet):
 * - allowKimInMeldClaim: master gate for Kim in any claim (BMC06 tournament: false -> Lew Fit).
 * - allowKimInJia: Kim may stand in a sequence (claimed Jia or concealed run).
 * - allowKimInPung: Kim may stand in a claimed Pung/Kong.
 * - allowKimInTriplet: Kim may stand in any triplet (Tris), claimed or concealed.
 * So a claimed Jia needs master + Jia; a claimed Pung/Kong needs master + Pung + Tris.
 * Per-type flags omitted by core callers resolve to their defaults (true).
 */
export function isKimAllowedInClaim(
  action: 'jia' | 'pung' | 'kong',
  rules?: Partial<KimRules> | GameRules
): boolean {
  const r = resolveKimRules(rules);
  if (!r.kimEnabled || !r.allowKimInMeldClaim) return false;
  return action === 'jia' ? r.allowKimInJia : r.allowKimInPung && r.allowKimInTriplet;
}

/**
 * Validates whether exposed/claimed melds comply with the Kim rules.
 * Under BMC06 tournament rules, allowKimInMeldClaim=false: claiming a discard using
 * a Kim from hand triggers Lew Fit. Under Casual rules the per-type toggles still apply
 * (see isKimAllowedInClaim); a claimed meld breaking them is likewise Lew Fit.
 */
export function validateKimMeldLegality(
  melds: readonly Meld[],
  rules?: Partial<KimRules> | GameRules
): KimLegalityReport {
  const r = resolveKimRules(rules);

  for (const m of melds) {
    // Concealed Ankong is an internal declaration, not an open discard claim
    if (m.type === 'ankong') continue;

    if (!m.tiles.some(isKim)) continue;
    if (!r.allowKimInMeldClaim) {
      return {
        isLegal: false,
        isLewFit: true,
        rejectionReason: 'Tournament rule violation: Using Kim in Jia/Pung/Kong claims is prohibited (triggers Lew Fit).',
      };
    }
    const action = m.type === 'jia' ? 'jia' : 'pung';
    if (!isKimAllowedInClaim(action, r)) {
      return {
        isLegal: false,
        isLewFit: true,
        rejectionReason:
          action === 'jia'
            ? 'Rule violation: Kim in a claimed Jia is disabled (allowKimInJia=false).'
            : 'Rule violation: Kim in a claimed Pung/Kong is disabled (allowKimInPung/allowKimInTriplet=false).',
      };
    }
  }

  return { isLegal: true, isLewFit: false };
}

/**
 * Checks whether 4 Kims are present to trigger the Shi Kim instant Hu (#9).
 */
export function checkShiKimInstantHu(concealedTiles: readonly Tile[]): boolean {
  const kimCount = concealedTiles.filter(isKim).length;
  return kimCount === 4;
}

/**
 * KimValidator enforces rules governing Kim tile usage, discards, and claim declarations.
 */
export class KimValidator {
  private readonly rules: KimRules;

  constructor(rules?: Partial<KimRules> | GameRules) {
    this.rules = resolveKimRules(rules);
  }

  public getRules(): KimRules {
    return this.rules;
  }

  // --------------------------------------------------------------------------
  // Discard Validation
  // --------------------------------------------------------------------------

  public canDiscard(tile: Tile, rules?: Partial<KimRules> | GameRules): ValidationResult {
    const r = rules ? resolveKimRules(rules) : this.rules;
    if (isKim(tile)) {
      if (!r.kimEnabled) {
        return { valid: false, reason: 'Kim tiles are disabled under current rules' };
      }
      if (!r.kimDiscardAllowed) {
        return { valid: false, reason: 'Discarding Kim is prohibited under tournament rules' };
      }
    }
    return { valid: true };
  }

  public validateDiscard(tile: Tile, rules?: Partial<KimRules> | GameRules): void {
    const res = this.canDiscard(tile, rules);
    if (!res.valid) {
      throw new Error(res.reason);
    }
  }

  public getDiscardableTileIds(
    hand: readonly Tile[],
    rules?: Partial<KimRules> | GameRules
  ): string[] {
    const r = rules ? resolveKimRules(rules) : this.rules;
    return hand
      .filter((t) => r.kimDiscardAllowed || !isKim(t))
      .map((t) => t.id);
  }

  // --------------------------------------------------------------------------
  // Discard Claim Validation
  // --------------------------------------------------------------------------

  public canClaimDeclaration(
    declaration: ClaimDeclaration,
    discardTile: Tile,
    rules?: Partial<KimRules> | GameRules
  ): ValidationResult {
    const r = rules ? resolveKimRules(rules) : this.rules;

    if (declaration.action === 'pass' || declaration.action === 'hu') {
      return { valid: true };
    }

    const meldTiles = declaration.meldTiles ?? [];
    const containsKim = meldTiles.some(isKim);

    if (containsKim && !r.allowKimInMeldClaim) {
      return {
        valid: false,
        reason: 'Using Kim in Jia/Pung/Kong claims is prohibited (triggers Lew Fit)',
      };
    }

    if (declaration.action === 'jia') {
      if (containsKim && !r.allowKimInJia) {
        return { valid: false, reason: 'Using Kim in Jia sequences is disabled by rules' };
      }
      if (containsKim && r.allowKimInMeldClaim && r.allowKimInJia) {
        const isSuited =
          discardTile.type === 'tong' || discardTile.type === 'sok' || discardTile.type === 'ban';
        if (!isSuited) {
          return {
            valid: false,
            reason: 'Jia sequence requires suited tiles (Tong, Sok, or Ban)',
          };
        }
      }
    }

    if (declaration.action === 'pung') {
      if (containsKim && (!r.allowKimInPung || !r.allowKimInTriplet)) {
        return { valid: false, reason: 'Using Kim in Pung triplets is disabled by rules' };
      }
    }

    if (declaration.action === 'kong') {
      if (containsKim && (!r.allowKimInPung || !r.allowKimInTriplet)) {
        return { valid: false, reason: 'Using Kim in Kong quadruplets is disabled by rules' };
      }
    }

    return { valid: true };
  }

  public validateClaimDeclaration(
    declaration: ClaimDeclaration,
    discardTile: Tile,
    rules?: Partial<KimRules> | GameRules
  ): void {
    const res = this.canClaimDeclaration(declaration, discardTile, rules);
    if (!res.valid) {
      throw new Error(res.reason);
    }
  }

  // --------------------------------------------------------------------------
  // Natural vs Wildcard Evaluation
  // --------------------------------------------------------------------------

  public isWildcardKim(tile: Tile, substitutedTile?: Tile): boolean {
    if (!isKim(tile)) return false;
    if (!substitutedTile) return true; // Standard unfaced Kim substituting is a wildcard
    // If nominal face matches substitutedTile, it's natural nominal
    const nominalFace = (tile as any).nominalTile as Tile | undefined;
    if (nominalFace && nominalFace.type === substitutedTile.type && nominalFace.value === substitutedTile.value) {
      return false;
    }
    return true;
  }

  public isNaturalKim(tile: Tile, substitutedTile?: Tile): boolean {
    if (!isKim(tile)) return false;
    return !this.isWildcardKim(tile, substitutedTile);
  }

  public evaluateHandKimMode(
    allTiles: readonly Tile[],
    assignments?: readonly KimAssignment[]
  ): KimEvaluation {
    const kims = allTiles.filter(isKim);
    const kimCount = kims.length;

    if (kimCount === 0) {
      return {
        mode: 'NK',
        totalKimCount: 0,
        wildcardKimCount: 0,
        naturalNominalCount: 0,
        isBoKimEligible: true,
        patterns: [],
        kimTay: 3, // Bo KIM contributes 3 Tay in NK mode
        isBoKim: true,
        hasKimThi: false,
        hasKimCiok: false,
        hasShiKim: false,
        hasPyongPi: false,
        assignments: [],
      };
    }

    const assigned: KimAssignment[] =
      assignments && assignments.length > 0
        ? [...assignments]
        : kims.map((k) => ({
            kimTile: k,
            role: 'wildcard' as const,
          }));

    let wildcardCount = 0;
    let naturalNominalCount = 0;
    let hasKimThi = false;
    let hasKimCiok = false;
    let hasPyongPi = false;

    for (const a of assigned) {
      if (a.role === 'wildcard' || a.role === 'wildcard_meld' || a.role === 'wildcard_pair') {
        wildcardCount++;
      } else if (a.role === 'natural_nominal') {
        naturalNominalCount++;
      } else if (a.role === 'kim_triplet') {
        hasKimThi = true;
        wildcardCount++;
      } else if (a.role === 'kim_pair') {
        hasKimCiok = true;
        wildcardCount++;
      } else if (a.role === 'pyong_pi_pair') {
        hasPyongPi = true;
        wildcardCount++;
      }
    }

    const hasShiKim = kimCount === 4;

    // Mode is NK only if zero wildcards and every Kim qualifies as nominal match
    const isBoKim = kimCount === 0 || (wildcardCount === 0 && naturalNominalCount === kimCount);
    const mode = isBoKim ? 'NK' : 'K';

    return {
      mode,
      totalKimCount: kimCount,
      wildcardKimCount: wildcardCount,
      naturalNominalCount,
      isBoKimEligible: isBoKim,
      patterns: [],
      kimTay: isBoKim ? 3 : kimCount,
      isBoKim,
      hasKimThi,
      hasKimCiok,
      hasShiKim,
      hasPyongPi,
      assignments: assigned,
    };
  }
}
