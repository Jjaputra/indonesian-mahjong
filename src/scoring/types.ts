import type { BonusTileRule, GameRules, Meld, ScoringBasis, Seat, Tile, Wind } from '../core/types';
import type { KimMode, SolvedHand } from '../kim/types';

// ============================================================================
// Win Context (PROJECT.md contract + instant-Hu extension)
// ============================================================================

export interface WinContext {
  winningTile: Tile;
  /** Ce Mo: winning tile drawn from the wall */
  isSelfDraw: boolean;
  /** Ron / Mun: winning tile taken from an opponent's discard */
  isDiscardWin: boolean;
  /** Turn 0 / Turn 1 (first-round win) */
  isInitialDeal: boolean;
  isPaoChin: boolean;
  /** Chiong Kong: robbing another player's promoted Kong */
  isRobbingKong: boolean;
  /** Ce Chiong Kong */
  isSelfRobbingKong: boolean;
  /** Kong Song Hu/Mo */
  isKongReplacement: boolean;
  /** Kong Kong Hu */
  isDoubleKongReplacement: boolean;
  seatWind: Seat;
  roundWind: Wind;
  /**
   * Ce Mo on the untouched hand from the first deal (no draw, discard or meld has happened yet).
   * Thien Fu needs this AND posisi Dong; when omitted, `isInitialDeal` is used instead.
   */
  isInitialDealtHand?: boolean;
  discarderSeat?: Seat;
  /** Declared immediate Hu without a completed hand (#6, #9, #34 at 10 Tay) */
  isInstantHu?: boolean;
}

// ============================================================================
// Results
// ============================================================================

export interface DetectedPattern {
  id: number;
  name: string;
  tay: number;
  /** Bahasa Indonesia explanation of why the pattern applies and how its Tay was computed */
  description: string;
}

/** Why a declared Hu was rejected as Lew Fit (foul hand). */
export type LewFitReason =
  /** Tiles do not form any legal winning shape */
  | 'structure'
  /** Kim used in a claimed Jia/Pung/Kong under tournament rules (Penalti #3) */
  | 'kim-claim'
  /** Legal shape but below the minimum Tay (Penalti #4) */
  | 'below-minimum'
  /** Instant Hu declared without any instant trigger */
  | 'instant-invalid';

export interface ScoringResult {
  isValidHu: boolean;
  totalTay: number;
  isWithKim: boolean;
  patterns: DetectedPattern[];
  isLewFit: boolean;
  rejectionReason?: string;
  /** Extensions beyond the PROJECT.md contract */
  /** Table column the Tay were read from (not necessarily Kim usage; see `scoringBasis`) */
  mode: KimMode;
  /** How `mode` was chosen: from Kim in the hand, or from the match choice */
  scoringBasis: ScoringBasis;
  /** Individual flower/season rule applied to #1/#2 */
  bonusTileRule: BonusTileRule;
  /** Physical Kim tiles in the winning hand (concealed + melds); `isWithKim` is `handKimCount > 0` */
  handKimCount: number;
  /** Plain-language notes on column choices that award nothing (e.g. Bo KIM in the Ada KIM column) */
  notes: string[];
  lewFitReason?: LewFitReason;
  isInstantHu: boolean;
  minHuTay: number;
  /** The Kim wildcard decomposition that maximised total Tay (absent for instant Hu / invalid shapes) */
  decomposition?: SolvedHand;
  /** Number of candidate decompositions considered during arbitration */
  candidateCount: number;
}

// ============================================================================
// Engine configuration
// ============================================================================

/**
 * additive (default): every detected pattern contributes its Tay.
 * supersede: higher patterns remove the lower patterns they contain (see SUPERSEDES in patterns.ts).
 */
export type OverlapPolicy = 'additive' | 'supersede';

export interface ScoringOptions {
  overlapPolicy?: OverlapPolicy;
}

export interface IScoringEngine {
  evaluateHand(hand: Tile[], melds: Meld[], flowers: Tile[], context: WinContext, rules: GameRules): ScoringResult;
}
