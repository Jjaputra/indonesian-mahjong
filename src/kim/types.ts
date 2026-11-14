import type { GameRules, Meld, MeldType, Seat, Tile, TileType, Wind } from '../core/types';

// ============================================================================
// Configurable Kim Rules
// ============================================================================

export interface KimRules {
  readonly kimMode?: import('../core/types').KimMode;
  /** Master toggle: enable Kim joker tiles in the game (default: true) */
  readonly kimEnabled: boolean;
  /** Allow discarding Kim tiles (default: false per tournament BMC06) */
  readonly kimDiscardAllowed: boolean;
  /** Allow using Kim from hand to call Jia or Pung on discards (default: false, triggers Lew Fit) */
  readonly allowKimInMeldClaim: boolean;
  /** Allow Kim to complete the winning pair (eye/kaki) (default: true) */
  readonly allowKimInPair: boolean;
  /** Allow Kim in a claimed Pung/Kong; also needs allowKimInMeldClaim and allowKimInTriplet (default: true) */
  readonly allowKimInPung: boolean;
  /** Allow Kim to complete Jia sequences, claimed (with allowKimInMeldClaim) or concealed (default: true) */
  readonly allowKimInJia: boolean;
  /** Allow Kim in any triplet / Tris, concealed or claimed (default: true) */
  readonly allowKimInTriplet: boolean;
}

export const TOURNAMENT_KIM_RULES: Readonly<KimRules> = {
  kimEnabled: true,
  kimDiscardAllowed: false, // "Tidak boleh membuang kim"
  allowKimInMeldClaim: false, // "Jia atau Pung menggunakan Kim -> Lew Fit"
  allowKimInPair: true,
  allowKimInPung: true,
  allowKimInJia: true,
  allowKimInTriplet: true,
};

export const CASUAL_KIM_RULES: Readonly<KimRules> = {
  kimEnabled: true,
  kimDiscardAllowed: false, // Default casual: enabled, non-discardable, usable as joker (R2)
  allowKimInMeldClaim: true, // Meld claims permitted in casual
  allowKimInPair: true,
  allowKimInPung: true,
  allowKimInJia: true,
  allowKimInTriplet: true,
};

export const STRICT_NO_KIM_RULES: Readonly<KimRules> = {
  kimEnabled: false,
  kimDiscardAllowed: false,
  allowKimInMeldClaim: false,
  allowKimInPair: false,
  allowKimInPung: false,
  allowKimInJia: false,
  allowKimInTriplet: false,
};

export const DEFAULT_KIM_RULES: Readonly<KimRules> = TOURNAMENT_KIM_RULES;

export function resolveKimRules(rules?: Partial<KimRules> | GameRules): KimRules {
  return {
    ...(rules?.kimMode ? { kimMode: rules.kimMode } : {}),
    kimEnabled: rules?.kimEnabled ?? DEFAULT_KIM_RULES.kimEnabled,
    kimDiscardAllowed: rules?.kimMode === 'natural' ? false : rules?.kimDiscardAllowed ?? DEFAULT_KIM_RULES.kimDiscardAllowed,
    allowKimInMeldClaim: rules?.kimMode === 'natural' ? false : rules?.allowKimInMeldClaim ?? DEFAULT_KIM_RULES.allowKimInMeldClaim,
    allowKimInPair: (rules as any)?.allowKimInPair ?? DEFAULT_KIM_RULES.allowKimInPair,
    allowKimInPung: (rules as any)?.allowKimInPung ?? DEFAULT_KIM_RULES.allowKimInPung,
    allowKimInJia: (rules as any)?.allowKimInJia ?? DEFAULT_KIM_RULES.allowKimInJia,
    allowKimInTriplet: (rules as any)?.allowKimInTriplet ?? DEFAULT_KIM_RULES.allowKimInTriplet,
  };
}

// ============================================================================
// Scoring Mode & Structural Shape Types
// ============================================================================

/** ITM Scoring Mode: K = Ada Kim, NK = Tidak Ada Kim / Bo Kim */
export type KimMode = 'K' | 'NK';

/** Structural macro-shape category for a completed hand decomposition */
export type HandPatternShape = 'standard' | 'seven_pairs' | 'thirteen_orphans' | 'shi_kim' | 'se_sam_pu_tat';

/** Explicit assignment mapping for a physical Kim tile acting as a wildcard */
export interface WildcardAssignment {
  /** The physical Kim tile from the player's hand */
  readonly kimTile: Tile;
  /** The virtual concrete tile it substitutes for in this decomposition */
  readonly representedTile: Tile;
  /** The structural role where this Kim is utilized */
  readonly role: 'pair' | 'jia' | 'pung' | 'kong' | 'orphan';
}

/** Decomposition of a single meld (3 or 4 tiles) */
export interface MeldComposition {
  /** Meld type: sequence ('jia'), triplet ('pung'), quad ('kong' / 'ankong'), or pure Kim triplet ('kim_thi') */
  readonly type: MeldType | 'kim_thi';
  /** Physical tiles in the meld (including any Kim tiles) */
  readonly tiles: readonly Tile[];
  /** Concrete virtual tiles represented by this meld (natural tiles unchanged; Kims mapped) */
  readonly representedTiles: readonly Tile[];
  /** Seat from which this meld was claimed, or undefined if concealed */
  readonly claimedFrom?: Seat;
  readonly fromConcealedTriplet?: true;
  /** True if this meld was exposed before Hu declaration (open claim) */
  readonly isOpen: boolean;
  /** Count of Kim wildcards inside this meld (0, 1, 2, 3, or 4) */
  readonly kimCount: number;
}

/** Decomposition of the eye (pair of 2 tiles) */
export interface PairComposition {
  /** Physical tiles in the pair */
  readonly tiles: readonly [Tile, Tile];
  /** Virtual concrete tiles represented by the pair */
  readonly representedTiles: readonly [Tile, Tile];
  /** Number of Kim wildcards in this pair (0, 1, or 2) */
  readonly kimCount: number;
  /** True if both tiles are Kims (qualifying for Pattern #32 Kim Ciok) */
  readonly isKimCiok: boolean;
  /** True if self-drawn winning tile pairs with lone Kim (#40 Pyong Pi) */
  readonly isPyongPi?: boolean;
}

/** Fully resolved winning hand decomposition */
export interface SolvedHand {
  /** Structural shape of the hand */
  readonly shape: HandPatternShape;
  /** All 4 melds (open melds + completed concealed melds) for standard shape; empty for special shapes */
  readonly melds: readonly MeldComposition[];
  /** The pair/eye for 'standard', 'thirteen_orphans', and 'shi_kim' */
  readonly pair?: PairComposition;
  /** All 7 pairs for 'seven_pairs' shape */
  readonly pairs?: readonly PairComposition[];
  /** The 14 orphan tiles for 'thirteen_orphans' shape (13 unique + 1 duplicate) */
  readonly orphanTiles?: readonly Tile[];
  /** Detailed mapping of every Kim tile in this decomposition */
  readonly wildcardAssignments: readonly WildcardAssignment[];
  /** Total count of Kim tiles in this hand */
  readonly totalKims: number;
  /** Total count of Kim tiles in this hand (alias for totalKims) */
  readonly totalKimCount?: number;
  /** Count of Kims acting as wildcards (excluding nominal matches or pure Kim sets if tracked) */
  readonly wildcardKimCount?: number;
  /** Mode: 'K' if totalKims > 0, 'NK' if totalKims === 0 */
  readonly mode: KimMode;
  /** Canonical sorting signature used to deduplicate identical structural interpretations */
  readonly signature: string;
}

/** Hand input to the solver */
export interface SolverHandInput {
  /** Concealed tiles in hand (excludes winningTile if passed separately) */
  readonly hand: readonly Tile[];
  /** Exposed / declared melds already on the table (0 to 4 melds) */
  readonly melds?: readonly Meld[];
  /** Winning tile (either drawn from wall or discarded by opponent) */
  readonly winningTile?: Tile;
  /** Game rules configuration */
  readonly rules?: Partial<KimRules> | GameRules;
  /** True if the winning tile was drawn by the player from the wall */
  readonly isSelfDraw?: boolean;
  /** True if declaring immediate instant Hu (e.g. #9 Shi Kim 10 Tay) */
  readonly isInstantHu?: boolean;
}

// ============================================================================
// Natural vs Wildcard Roles & Evaluations
// ============================================================================

export type KimRole =
  | 'wildcard'
  | 'wildcard_meld'
  | 'wildcard_pair'
  | 'kim_triplet'
  | 'kim_pair'
  | 'pyong_pi_pair'
  | 'natural_nominal'
  | 'instant_hu';

export interface KimAssignment {
  readonly kimTile: Tile;
  readonly role: KimRole;
  readonly substitutedTile?: Tile;
  readonly targetMeldType?: 'sequence' | 'triplet' | 'pair' | 'orphan' | 'kim_special';
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
}

export interface KimLegalityReport {
  readonly isLegal: boolean;
  readonly isLewFit: boolean;
  readonly rejectionReason?: string;
}

// ============================================================================
// Dedicated Kim Patterns & Win Context
// ============================================================================

export interface DetectedKimPattern {
  readonly id: 7 | 8 | 9 | 30 | 32 | 40;
  readonly name: string;
  readonly tay: number;
  readonly description: string;
  readonly mode: KimMode;
}

export interface KimWinContext {
  readonly winningTile: Tile;
  readonly isSelfDraw: boolean;
  readonly isInstantHu?: boolean;
  readonly seatWind?: Seat;
  readonly roundWind?: Wind;
  readonly discarderSeat?: Seat;
}

// ============================================================================
// Compatible Decomposition Structures for Evaluator
// ============================================================================

export interface SolvedMeldGroup {
  readonly type: MeldType | 'kim_thi';
  readonly tiles: Tile[];
  readonly isConcealed: boolean;
  readonly kimCount: number;
}

export interface SolvedPairGroup {
  readonly tiles: [Tile, Tile];
  readonly isKimPair?: boolean;
  readonly isPyongPiPair?: boolean;
  readonly kimCount: number;
}

export interface KimTileUsage {
  readonly tileId: string;
  readonly role: KimRole;
  readonly substitutedFor?: {
    readonly type: TileType;
    readonly value: number;
  };
}

export interface SolvedHandDecomposition {
  readonly melds: SolvedMeldGroup[] | readonly MeldComposition[];
  readonly pair: SolvedPairGroup | PairComposition;
  readonly kimUsages?: readonly KimTileUsage[];
  readonly totalKimCount: number;
  readonly wildcardKimCount: number;
}

// ============================================================================
// Evaluation Result
// ============================================================================

export interface KimEvaluationResult {
  readonly mode: KimMode;
  readonly totalKimCount: number;
  readonly wildcardKimCount: number;
  readonly naturalNominalCount: number;
  readonly isBoKimEligible: boolean;
  readonly patterns: readonly DetectedKimPattern[];
  readonly kimTay: number;
  readonly chosenHand?: SolvedHand;
  readonly chosenDecomposition?: SolvedHandDecomposition | SolvedHand;
  readonly isBoKim: boolean;
  readonly hasKimThi: boolean;
  readonly hasKimCiok: boolean;
  readonly hasShiKim: boolean;
  readonly hasPyongPi: boolean;
  readonly assignments?: readonly KimAssignment[];
}

/** Alias for KimEvaluationResult to satisfy both naming conventions */
export type KimEvaluation = KimEvaluationResult;
export type KimModeEvaluationResult = KimEvaluationResult;
