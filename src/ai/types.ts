import type { GameRules, Meld, Seat, Tile, Wind } from '../core/types';

/** Three opponent strengths. Decisions are deterministic for a given observation. */
export type AIDifficulty = 'easy' | 'normal' | 'hard';

/**
 * A discard choice or a response to someone else's discard.
 * `meldTiles` are tiles taken from the caller's own hand (never the discarded tile).
 */
export interface AIDecision {
  action: 'discard' | 'jia' | 'pung' | 'kong' | 'hu' | 'pass';
  targetTile?: Tile;
  meldTiles?: Tile[];
}

/**
 * Table information every player can already see.
 * Concealed hands and the live wall are intentionally absent.
 */
export interface AIPublicInfo {
  /** Exposed melds of the other three seats. */
  readonly opponentMelds?: readonly Meld[];
  /** Flower and season tiles already shown by the other seats. */
  readonly opponentFlowers?: readonly Tile[];
}

/**
 * Milestone 4 bot contract.
 * Optional trailing arguments carry only public rules and visible table state
 * so Kim legality can be applied without widening what the bot is allowed to see.
 */
export interface IAIEngine {
  chooseDiscard(
    player: PlayerStateView,
    publicDiscards: Tile[],
    roundWind: Wind,
    difficulty: AIDifficulty,
    rules?: GameRules,
    publicInfo?: AIPublicInfo,
  ): Tile;
  evaluateClaim(
    player: PlayerStateView,
    discardedTile: Tile,
    fromSeat: Seat,
    publicDiscards: Tile[],
    roundWind: Wind,
    difficulty: AIDifficulty,
    rules: GameRules,
    publicInfo?: AIPublicInfo,
  ): AIDecision;
}

/**
 * The only player fields an AI may read. Hidden wall tiles and other players'
 * concealed hands are not part of this view.
 */
export interface PlayerStateView {
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

/** Tournament defaults: Kim stays in hand, Kim claims are Lew Fit, Hu needs 5 Tay. */
export const DEFAULT_AI_RULES: GameRules = {
  kimEnabled: true,
  kimDiscardAllowed: false,
  allowKimInMeldClaim: false,
  minHuTay: 5,
};
