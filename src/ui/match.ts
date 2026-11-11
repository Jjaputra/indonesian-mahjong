/**
 * Continuous match ("game berlanjut"): a match is several hands (games) at one table, with the
 * dealer and seat winds rotating between hands. Pure TypeScript, no React.
 *
 * Seats (`dong`/`nan`/`xi`/`bei`) are the four physical chairs; the human always sits at the
 * same chair. Each hand's seat wind is derived from the dealer chair (`seatWindOf` in
 * win-context.ts), so the scorer always sees the rotated seat wind.
 *
 * Rulebook section 4: 8 games or 90 minutes; table winner = most valid Hu (>= minimum Tay),
 * tie broken by whoever reached that count first; a wall-out draw (Seri) still counts as a
 * game and does not rotate the seat winds. Dealer-win retention follows PlayLeh table practice; see
 * `nextSeating` (documented in RULES.md, "Match flow").
 */
import { SEAT_ORDER } from '../core/tiles';
import type { Seat, Wind } from '../core/types';
import { getStorage, type StorageLike } from '../storage';

/** Number of hands in a match (menu offers 4 / 8 / 16); `null` = endless practice. */
export type MatchLength = number | null;
export const MATCH_LENGTHS: readonly MatchLength[] = [4, 8, 16, null];
export const DEFAULT_MATCH_LENGTH: MatchLength = 8;
export type DealerWinRule = 'stay' | 'rotate';
export const DEFAULT_DEALER_WIN_RULE: DealerWinRule = 'stay';

/** What decides the next seating: a valid Hu by `winner`, or no valid winner (Seri / Lew Fit). */
export type HandResult = { kind: 'hu'; winner: Seat } | { kind: 'none' };

export interface Seating {
  dealer: Seat;
  prevailingWind: Wind;
  /** Dealer changes since the prevailing wind last advanced (0–3). */
  dealerPasses: number;
}

/**
 * PDF section 4: Seri keeps the seating. Lew Fit also keeps it (assumption).
 * PlayLeh practice: a dealer win retains the deal by default; optionally rotate anyway.
 * https://playleh.com/mahjongleh-rules.html (Game Setup).
 * The prevailing wind advances after four dealer changes (implementation convention).
 */
export function nextSeating(current: Seating, result: HandResult, dealerWinRule: DealerWinRule = DEFAULT_DEALER_WIN_RULE): Seating {
  if (result.kind !== 'hu' || (result.winner === current.dealer && dealerWinRule === 'stay')) return { ...current };
  const dealer = SEAT_ORDER[(SEAT_ORDER.indexOf(current.dealer) + 1) % 4]!;
  const passes = current.dealerPasses + 1;
  if (passes < 4) return { dealer, prevailingWind: current.prevailingWind, dealerPasses: passes };
  const prevailingWind = SEAT_ORDER[(SEAT_ORDER.indexOf(current.prevailingWind) + 1) % 4]! as Wind;
  return { dealer, prevailingWind, dealerPasses: 0 };
}

export interface MatchHandRecord {
  /** 1-based hand number */
  hand: number;
  dealer: Seat;
  prevailingWind: Wind;
  /** Valid Hu winner; null for Seri or Lew Fit */
  winner: Seat | null;
  /** Lew Fit (Hu declared below the minimum or malformed): no Hu credited */
  lewFit?: boolean;
  totalTay: number;
}

export interface MatchState {
  length: MatchLength;
  /** Practice minimum fixed for the match; tournament default is 5. */
  minHuTay: number;
  dealerWinRule: DealerWinRule;
  /** Seating of the current (or next, once the hand is finished) hand */
  seating: Seating;
  /** Hands already finished, oldest first */
  hands: MatchHandRecord[];
  huCount: Record<Seat, number>;
  tayTotal: Record<Seat, number>;
  /** Hand number at which each seat reached its current Hu count (tie-break) */
  reachedAt: Record<Seat, number>;
}

const zero = (): Record<Seat, number> => ({ dong: 0, nan: 0, xi: 0, bei: 0 });

export function createMatch(length: MatchLength, dealer: Seat = 'dong', prevailingWind: Wind = 'dong', minHuTay = 5, dealerWinRule: DealerWinRule = DEFAULT_DEALER_WIN_RULE): MatchState {
  return { length, minHuTay, dealerWinRule, seating: { dealer, prevailingWind, dealerPasses: 0 }, hands: [], huCount: zero(), tayTotal: zero(), reachedAt: zero() };
}

/** 1-based number of the hand being played (or about to be dealt). */
export function currentHandNumber(match: MatchState): number {
  return match.hands.length + 1;
}

export function isMatchOver(match: MatchState): boolean {
  return match.length !== null && match.hands.length >= match.length;
}

/**
 * Record a finished hand and rotate the seating for the next one. `winner` is the declarer of a
 * Hu; `validHu` false means a Lew Fit, which scores nothing and keeps the seating.
 */
export function recordHand(match: MatchState, winner: Seat | null, validHu: boolean, totalTay: number): MatchState {
  const hand = currentHandNumber(match);
  const credited = winner !== null && validHu && Number.isFinite(totalTay) && totalTay >= match.minHuTay ? winner : null;
  const record: MatchHandRecord = {
    hand,
    dealer: match.seating.dealer,
    prevailingWind: match.seating.prevailingWind,
    winner: credited,
    ...(winner !== null && !credited ? { lewFit: true } : {}),
    totalTay: credited ? totalTay : 0,
  };
  const huCount = { ...match.huCount };
  const tayTotal = { ...match.tayTotal };
  const reachedAt = { ...match.reachedAt };
  if (credited) {
    huCount[credited]++;
    tayTotal[credited] += totalTay;
    reachedAt[credited] = hand;
  }
  return {
    ...match,
    seating: nextSeating(match.seating, credited ? { kind: 'hu', winner: credited } : { kind: 'none' }, match.dealerWinRule),
    hands: [...match.hands, record],
    huCount,
    tayTotal,
    reachedAt,
  };
}

export interface Standing {
  seat: Seat;
  rank: number;
  hu: number;
  tay: number;
  /** Hand at which the Hu count was reached (0 = no Hu) */
  reachedAt: number;
}

/**
 * Table ranking: most valid Hu; equal Hu counts go to whoever reached that count first
 * (rulebook section 4). Players without a Hu share the same rank. Total Tay is shown only.
 */
export function standings(match: MatchState): Standing[] {
  const rows = SEAT_ORDER.map((seat) => ({ seat, hu: match.huCount[seat], tay: match.tayTotal[seat], reachedAt: match.reachedAt[seat] }));
  rows.sort((a, b) => b.hu - a.hu || (a.hu === 0 ? 0 : a.reachedAt - b.reachedAt) || SEAT_ORDER.indexOf(a.seat) - SEAT_ORDER.indexOf(b.seat));
  const out: Standing[] = [];
  rows.forEach((r, i) => {
    const prev = out[i - 1];
    const tied = prev && prev.hu === r.hu && (r.hu === 0 || prev.reachedAt === r.reachedAt);
    out.push({ ...r, rank: tied ? prev.rank : i + 1 });
  });
  return out;
}

const LENGTH_KEY = 'itm.match-length.v1';

export function loadMatchLength(): MatchLength {
  try {
    const saved = getStorage().getItem(LENGTH_KEY);
    if (saved === 'endless') return null;
    const n = Number(saved);
    if (MATCH_LENGTHS.includes(n as MatchLength)) return n as MatchLength;
  } catch { /* Storage may be unavailable. */ }
  return DEFAULT_MATCH_LENGTH;
}

export function saveMatchLength(length: MatchLength): void {
  try { getStorage().setItem(LENGTH_KEY, length === null ? 'endless' : String(length)); } catch { /* Keep the live choice. */ }
}


const DEALER_WIN_KEY = 'itm.match-dealer-win.v1';

export function loadDealerWinRule(storage?: StorageLike): DealerWinRule {
  try { return (storage ?? getStorage()).getItem(DEALER_WIN_KEY) === 'rotate' ? 'rotate' : DEFAULT_DEALER_WIN_RULE; }
  catch { return DEFAULT_DEALER_WIN_RULE; }
}

export function saveDealerWinRule(rule: DealerWinRule, storage?: StorageLike): void {
  try { (storage ?? getStorage()).setItem(DEALER_WIN_KEY, rule); } catch { /* Keep the live choice. */ }
}
