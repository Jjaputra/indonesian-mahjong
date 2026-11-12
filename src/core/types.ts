// ============================================================================
// Core Tile and Seat Primitive Types
// ============================================================================

export type Suit = 'tong' | 'sok' | 'ban';
export type Wind = 'dong' | 'nan' | 'xi' | 'bei';
export type Dragon = 'zhong' | 'fat' | 'pat';
export type BonusType = 'flower' | 'season';
export type TileType = Suit | 'wind' | 'dragon' | BonusType | 'kim';
export type Seat = 'dong' | 'nan' | 'xi' | 'bei';

export type KimMode = 'off' | 'dedicated' | 'natural';
export type TileFace = Readonly<Pick<Tile, 'type' | 'value'>>;

export interface Tile {
  /** Unique physical instance identifier, e.g. "tong-1-1", "wind-dong-2", "kim-0-3" */
  readonly id: string;
  /** Tile family/category */
  readonly type: TileType;
  /** Numeric value: 1-9 for suits; 1-4 for winds & bonus; 1-3 for dragons; 0 for kim */
  readonly value: number;
  /** Flag indicating whether the tile is Kim or acting as Kim wildcard */
  readonly isKim?: boolean;
}

// ============================================================================
// Melds and Player Hand State Types
// ============================================================================

export type MeldType = 'jia' | 'pung' | 'kong' | 'ankong';

export interface Meld {
  readonly type: MeldType;
  readonly tiles: Tile[];
  readonly claimedFrom?: Seat;
}

export interface PlayerState {
  seat: Seat;
  name: string;
  isHuman: boolean;
  hand: Tile[];
  melds: Meld[];
  flowers: Tile[];
  discards: Tile[];
  isCin: boolean;
  isPaoChin: boolean;
}

// ============================================================================
// Game Rules Configuration
// ============================================================================

/**
 * Which DAFTAR TAY column ("Ada KIM" / "Tidak ada KIM") a Hu is scored from.
 * - `hand_kim_usage` (legacy default): the column follows whether the winning hand holds any Kim.
 * - `match_table`: the column follows the match choice (`kimEnabled`), for every hand of the match.
 * Either way the actual Kim count in the hand is still what Kim patterns (#7, #8, #9, #30, #32, #40) look at.
 */
export type ScoringBasis = 'hand_kim_usage' | 'match_table';

/**
 * Individual flower/season Tay (#1, #2). Collection patterns (#4, #5, #6) are the same under both.
 * - `rulebook_per_tile` (PDF default): Bunga 0 per tile, Musim 1 per tile, +1 per tile matching the seat.
 * - `own_seat_only` is retained only to read legacy history; live scoring always uses the PDF rule.
 */
export type BonusTileRule = 'rulebook_per_tile' | 'own_seat_only';

export interface GameRules {
  /** Enable Kim joker tiles in the game (default: true) */
  kimEnabled: boolean;
  kimMode?: KimMode;
  /** Allow discarding Kim tiles (default: false per tournament BMC06) */
  kimDiscardAllowed: boolean;
  /** Allow using Kim from hand to call Jia or Pung (default: false, triggers Lew Fit) */
  allowKimInMeldClaim: boolean;
  /** Minimum Tay required to declare a legal Hu (default: 5) */
  minHuTay: number;
  /** Table column basis; omitted = `hand_kim_usage` */
  scoringBasis?: ScoringBasis;
  /** Individual flower/season rule; omitted = `rulebook_per_tile` */
  bonusTileRule?: BonusTileRule;
}

// ============================================================================
// Turn State Machine & Claims Types
// ============================================================================

export type TurnPhase =
  | 'INIT'
  | 'DEAL'
  | 'FLOWER_REPLACEMENT'
  | 'TURN_DRAW'
  | 'ACTION_DECISION'
  | 'DISCARD_PENDING'
  | 'CLAIM_WINDOW'
  | 'RESOLVED_HU'
  | 'DRAW_SERI';

export type ClaimActionType = 'hu' | 'kong' | 'pung' | 'jia' | 'pass';

export interface ClaimDeclaration {
  seat: Seat;
  action: ClaimActionType;
  meldTiles?: Tile[]; // The 2 or 3 tiles from player's hand used for meld
}

export interface DiscardPendingState {
  discarder: Seat;
  tile: Tile;
  isPromotedKong?: boolean; // True if this is a Kakan subject to Chiong Kong
}

export interface ClaimResolutionResult {
  winnerSeat?: Seat;
  winningAction: ClaimActionType;
  displacedClaims: ClaimDeclaration[];
  nextTurn: Seat;
  nextPhase: TurnPhase;
}

export interface LegalActions {
  canDiscard: boolean;
  discardableTileIds: string[];
  canAnkong: boolean;
  ankongOptions: Tile[][];
  canKakan: boolean;
  kakanOptions: { meldIndex: number; tile: Tile }[];
  canSelfDrawHu: boolean;
  canPaoChin: boolean;
  canPass: boolean;
  canJia: boolean;
  jiaOptions: Tile[][];
  canPung: boolean;
  pungTiles?: Tile[];
  canKong: boolean;
  kongTiles?: Tile[];
  canDiscardWinHu: boolean;
}

export interface FlowerReplacementRecord {
  seat: Seat;
  flowers: Tile[];
  replacements: Tile[];
}

export interface TurnDrawResult {
  drawnTile: Tile | null;
  exposedFlowers: Tile[];
  isSeri: boolean;
}

export interface DiscardResult {
  discardedTile: Tile;
  seat: Seat;
  nextPhase: TurnPhase;
}

export interface KongResult {
  seat: Seat;
  kongType: 'ankong' | 'kakan' | 'kong';
  replacementTile: Tile | null;
  exposedFlowers: Tile[];
}

export interface HuResult {
  winnerSeat: Seat;
  winType: 'tsumo' | 'ron' | 'chiong_kong';
  winningTile: Tile;
}
