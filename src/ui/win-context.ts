import type { GameEngineState } from '../core/game-engine';
import { SEAT_ORDER } from '../core/tiles';
import type { GameRules, Meld, Seat, Tile, Wind } from '../core/types';
import type { KimRules } from '../kim/types';
import { ScoringEngine, type OverlapPolicy as ScoringOverlapPolicy, type ScoringResult, type WinContext } from '../scoring';
import { toGameRules, toKimRules, type GameSettings, type OverlapPolicy as StorageOverlapPolicy } from '../storage';

/** Engine + Kim rules in one object; the scoring engine and Kim solver read whichever fields they need. */
export type FullRules = GameRules & KimRules;

export function toFullRules(settings: GameSettings): FullRules {
  return { ...toKimRules(settings), ...toGameRules(settings), ...(settings.kimMode === 'natural' ? { kimDiscardAllowed: false, allowKimInMeldClaim: false } : {}) };
}

/** storage 'rulebook_exclusive' ↔ scoring 'supersede'; storage 'cumulative' ↔ scoring 'additive'. */
export function toScoringOverlap(policy: StorageOverlapPolicy): ScoringOverlapPolicy {
  return policy === 'rulebook_exclusive' ? 'supersede' : 'additive';
}

const engines: Record<ScoringOverlapPolicy, ScoringEngine> = {
  additive: new ScoringEngine({ overlapPolicy: 'additive' }),
  supersede: new ScoringEngine({ overlapPolicy: 'supersede' }),
};

export function getScoringEngine(policy: ScoringOverlapPolicy): ScoringEngine {
  return engines[policy];
}

/**
 * Seat wind of a chair this hand. Chairs keep their `dong`/`nan`/`xi`/`bei` ids for the whole
 * match; the dealer's chair is Timur (Dong) and the winds follow turn order from there. With the
 * dealer on `dong` (a single game) every chair's wind equals its id.
 */
export function seatWindOf(state: Pick<GameEngineState, 'dealerSeat'>, seat: Seat): Wind {
  return SEAT_ORDER[(SEAT_ORDER.indexOf(seat) - SEAT_ORDER.indexOf(state.dealerSeat) + 4) % 4]!;
}

/**
 * True during the first go-around (Thien Fu / Thi Fu window): no meld has been declared or claimed
 * and fewer than four discards have been committed, i.e. not every seat has finished its first turn.
 * The dealer's first discard, the next seats' first draws and a Ron on any first-round discard all
 * still count; the window closes once the fourth seat's discard is committed or anyone melds.
 */
export function isFirstGoAround(state: Readonly<GameEngineState>): boolean {
  let committed = 0;
  for (const seat of SEAT_ORDER) {
    const p = state.players[seat];
    if (p.melds.length > 0 || p.discards.length > 1) return false;
    committed += p.discards.length;
  }
  return committed < SEAT_ORDER.length;
}

/**
 * True while `seat` (the dealer) still holds the hand exactly as dealt: no draw, discard or meld has
 * happened at the table yet. A Ce Mo now is Hu "dari pembagian pertama" (Thien Fu when posisi Dong).
 */
export function isInitialDealtHand(state: Readonly<GameEngineState>, seat: Seat): boolean {
  if (seat !== state.dealerSeat || state.turnCount !== 1) return false;
  return SEAT_ORDER.every((s) => state.players[s].discards.length === 0 && state.players[s].melds.length === 0);
}

/** Table facts (all public) that determine the special-win Tay patterns. */
export interface WinFlags {
  isSelfDraw: boolean;
  /** Winning on a promoted Kong (Chiong Kong) */
  isRobbingKong: boolean;
  /** Kongs declared in a row before this draw (Kong Song Hu / Kong Kong Hu) */
  consecutiveKongs: number;
  /** First go-around of all four seats with no meld yet (see isFirstGoAround) */
  isFirstGoAround: boolean;
  isPaoChin: boolean;
  discarderSeat?: Seat;
  /** Self-draw Hu on the dealer's untouched opening hand (see isInitialDealtHand); omitted = isFirstGoAround */
  isInitialDealtHand?: boolean;
}

export function buildWinContext(seat: Seat, roundWind: Wind, winningTile: Tile, flags: WinFlags): WinContext {
  const kongDraw = flags.isSelfDraw ? flags.consecutiveKongs : 0;
  return {
    winningTile,
    isSelfDraw: flags.isSelfDraw,
    isDiscardWin: !flags.isSelfDraw,
    isInitialDeal: flags.isFirstGoAround,
    isPaoChin: flags.isPaoChin,
    isRobbingKong: flags.isRobbingKong,
    isSelfRobbingKong: false,
    isKongReplacement: kongDraw >= 1,
    isDoubleKongReplacement: kongDraw >= 2,
    seatWind: seat,
    roundWind,
    isInitialDealtHand: flags.isInitialDealtHand === undefined ? undefined : flags.isSelfDraw && flags.isInitialDealtHand,
    discarderSeat: flags.discarderSeat,
  };
}

export interface HuCandidate {
  /** Concealed tiles, winning tile excluded */
  hand: readonly Tile[];
  melds: readonly Meld[];
  flowers: readonly Tile[];
  winningTile: Tile;
}

/** Full 44-Tay evaluation of a potential Hu, including the minimum-Tay gate. */
export function scoreHu(
  candidate: HuCandidate,
  seat: Seat,
  roundWind: Wind,
  flags: WinFlags,
  rules: FullRules,
  policy: ScoringOverlapPolicy
): ScoringResult {
  return getScoringEngine(policy).evaluateHand(
    [...candidate.hand],
    [...candidate.melds],
    [...candidate.flowers],
    buildWinContext(seat, roundWind, candidate.winningTile, flags),
    rules
  );
}
