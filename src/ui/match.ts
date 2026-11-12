/**
 * Continuous match ("game berlanjut"): a match is several hands (games) at one table, with the
 * dealer and seat winds rotating between hands. Pure TypeScript, no React.
 *
 * Seats (`dong`/`nan`/`xi`/`bei`) are the four physical chairs; the human always sits at the
 * same chair. Each hand's seat wind is derived from the dealer chair (`seatWindOf` in
 * win-context.ts), so the scorer always sees the rotated seat wind.
 *
 * Player answers 2026-11-12: 16 games, ranking by total Tay, then valid Hu,
 * then first to reach the final Tay total. Seri and dealer wins each count once.
 */
import { SEAT_ORDER } from '../core/tiles';
import type { Seat, Wind } from '../core/types';
import { getStorage, type StorageLike } from '../storage';

/** Player answers 2026-11-12: every match has exactly 16 counted games. */
export const MATCH_GAMES = 16;
export type DealerWinRule = 'stay' | 'rotate';
export const DEFAULT_DEALER_WIN_RULE: DealerWinRule = 'rotate';

/** Distinguish wall-out Seri (`none`) from Lew Fit, since only Seri keeps the seating. */
export type HandResult = { kind: 'hu'; winner: Seat } | { kind: 'none' } | { kind: 'lew_fit' };
export type MatchTimeLimit = 90 | null;

export interface Seating {
  dealer: Seat;
  prevailingWind: Wind;
  /** Dealer changes since the prevailing wind last advanced (0–3). */
  dealerPasses: number;
}

/**
 * PDF section 4: Seri keeps the seating. Lew Fit rotates (user-approved inference
 * from PlayLeh, where False Win is distinct from dealer Hu and stalemate).
 * Player decision 2026-11-12: plain 16 games rotates after every valid Hu, including dealer Hu.
 * This supersedes the earlier dealer-stays confirmation and MahjongLeh reference;
 * legacy dealer-win preference arguments are ignored.
 * The prevailing wind advances after four dealer changes (implementation convention).
 */
export function nextSeating(current: Seating, result: HandResult, _dealerWinRule: DealerWinRule = DEFAULT_DEALER_WIN_RULE): Seating {
  if (result.kind === 'none') return { ...current };
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
  openingRoll: OpeningRoll | null;
  deadWall: DeadWallOption;
  /** Practice minimum fixed for the match; tournament default is 5. */
  minHuTay: number;
  dealerWinRule: DealerWinRule;
  timeLimitMinutes: MatchTimeLimit;
  /** Runtime only: closing the app discards this match and its clock, as before. */
  startedAt: number;
  finishedAt: number | null;
  endedBy: 'hands' | 'time' | null;
  /** Seating of the current (or next, once the hand is finished) hand */
  seating: Seating;
  /** Hands already finished, oldest first */
  hands: MatchHandRecord[];
  huCount: Record<Seat, number>;
  tayTotal: Record<Seat, number>;
  /** Hand number at which each seat reached its current Tay total (final tie-break) */
  reachedAt: Record<Seat, number>;
}

const zero = (): Record<Seat, number> => ({ dong: 0, nan: 0, xi: 0, bei: 0 });

export function createMatch(dealer: Seat = 'dong', prevailingWind: Wind = 'dong', minHuTay = 5, _dealerWinRule: DealerWinRule = DEFAULT_DEALER_WIN_RULE, timeLimitMinutes: MatchTimeLimit = null, now = Date.now()): MatchState {
  return { openingRoll: null, deadWall: 'none', minHuTay, dealerWinRule: DEFAULT_DEALER_WIN_RULE, timeLimitMinutes, startedAt: now, finishedAt: null, endedBy: null, seating: { dealer, prevailingWind, dealerPasses: 0 }, hands: [], huCount: zero(), tayTotal: zero(), reachedAt: zero() };
}

/** 1-based number of the hand being played (or about to be dealt). */
export function currentHandNumber(match: MatchState): number {
  return match.hands.length + 1;
}

export function isMatchOver(match: MatchState): boolean {
  return match.endedBy !== null || countedGames(match) >= MATCH_GAMES;
}

/**
 * Record a finished hand and rotate the seating for the next one. `winner` is the declarer of a
 * Hu; `validHu` false means a Lew Fit, which scores nothing and rotates the dealer.
 */
export function recordHand(match: MatchState, winner: Seat | null, validHu: boolean, totalTay: number, now = Date.now()): MatchState {
  if (isMatchOver(match)) return match;
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
  return finishMatchAtBoundary({
    ...match,
    seating: nextSeating(match.seating, credited ? { kind: 'hu', winner: credited } : winner !== null ? { kind: 'lew_fit' } : { kind: 'none' }, match.dealerWinRule),
    hands: [...match.hands, record],
    huCount,
    tayTotal,
    reachedAt,
  }, now);
}

export interface Standing {
  seat: Seat;
  rank: number;
  hu: number;
  tay: number;
  /** Hand at which the Tay total was reached (0 = no Hu) */
  reachedAt: number;
}

/** Total Tay first, then valid Hu count, then first to reach the final Tay total. */
export function standings(match: MatchState): Standing[] {
  const rows = SEAT_ORDER.map((seat) => ({ seat, hu: match.huCount[seat], tay: match.tayTotal[seat], reachedAt: match.reachedAt[seat] }));
  rows.sort((a, b) => b.tay - a.tay || b.hu - a.hu || a.reachedAt - b.reachedAt || SEAT_ORDER.indexOf(a.seat) - SEAT_ORDER.indexOf(b.seat));
  const out: Standing[] = [];
  rows.forEach((r, i) => {
    const prev = out[i - 1];
    const tied = prev && prev.tay === r.tay && prev.hu === r.hu && prev.reachedAt === r.reachedAt;
    out.push({ ...r, rank: tied ? prev.rank : i + 1 });
  });
  return out;
}

/** Silently discard the removed match-length preference. */
export function migrateMatchLengthPreference(storage?: StorageLike): void {
  try { (storage ?? getStorage()).removeItem('itm.match-length.v1'); } catch { /* Storage unavailable. */ }
}

const DEALER_WIN_KEY = 'itm.match-dealer-win.v1';

/** Legacy compatibility: discard the removed dealer-rotation preference. */
export function loadDealerWinRule(storage?: StorageLike): DealerWinRule {
  try { (storage ?? getStorage()).removeItem(DEALER_WIN_KEY); } catch { /* Storage unavailable. */ }
  return DEFAULT_DEALER_WIN_RULE;
}
export function saveDealerWinRule(_rule: DealerWinRule, storage?: StorageLike): void {
  loadDealerWinRule(storage);
}

/** Elapsed real time includes hidden tabs, bot pauses, dialogs and between-hand results. */
export function remainingMatchMs(match: MatchState, now = Date.now()): number | null {
  return match.timeLimitMinutes === null ? null : Math.max(0, match.timeLimitMinutes * 60_000 - Math.max(0, (match.finishedAt ?? now) - match.startedAt));
}

/** Call only once a hand is finished; expiry never interrupts live play. */
export function finishMatchAtBoundary(match: MatchState, now = Date.now()): MatchState {
  if (match.endedBy !== null) return match;
  const byTime = remainingMatchMs(match, now) === 0;
  const byHands = countedGames(match) >= MATCH_GAMES;
  return byTime || byHands ? { ...match, endedBy: byTime ? 'time' : 'hands', finishedAt: now } : match;
}

const TIME_LIMIT_KEY = 'itm.match-time-limit.v1';
export function loadMatchTimeLimit(storage?: StorageLike): MatchTimeLimit {
  try { return (storage ?? getStorage()).getItem(TIME_LIMIT_KEY) === '90' ? 90 : null; }
  catch { return null; }
}
export function saveMatchTimeLimit(limit: MatchTimeLimit, storage?: StorageLike): void {
  try { (storage ?? getStorage()).setItem(TIME_LIMIT_KEY, limit === null ? 'unlimited' : String(limit)); } catch { /* Keep the live choice. */ }
}

/** No visibility/modal/pause gate: tournament time continues while the app is open. */
export function watchMatchClock(target: { tickMatchClock(): void }): () => void {
  const timer = setInterval(() => target.tickMatchClock(), 1000);
  return () => clearInterval(timer);
}

/** Every completed hand counts, including Seri, dealer Hu and Lew Fit. */
export function countedGames(match: MatchState): number {
  return match.hands.length;
}
export interface OpeningRoll {
  rounds: Array<Array<{ seat: Seat; dice: [number, number] }>>;
  dealer: Seat;
}
export function rollOpeningDealer(rng: () => number = Math.random): OpeningRoll {
  const rounds: OpeningRoll['rounds'] = [];
  let tied: Seat[] = [...SEAT_ORDER];
  while (true) {
    const round = tied.map(seat => ({ seat, dice: [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)] as [number, number] }));
    rounds.push(round);
    const high = Math.max(...round.map(r => r.dice[0] + r.dice[1]));
    tied = round.filter(r => r.dice[0] + r.dice[1] === high).map(r => r.seat);
    if (tied.length === 1) return { rounds, dealer: tied[0]! };
  }
}
export type DeadWallOption = 'none' | '14';
const DEAD_WALL_KEY = 'itm.dead-wall.v1';
export function loadDeadWall(storage?: StorageLike): DeadWallOption {
  try { return (storage ?? getStorage()).getItem(DEAD_WALL_KEY) === '14' ? '14' : 'none'; }
  catch { return 'none'; }
}
export function saveDeadWall(option: DeadWallOption, storage?: StorageLike): void {
  try { (storage ?? getStorage()).setItem(DEAD_WALL_KEY, option); } catch { /* Keep live choice. */ }
}
