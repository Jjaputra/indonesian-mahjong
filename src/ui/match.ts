/**
 * Continuous match ("game berlanjut"): a match is several hands (games) at one table, with the
 * dealer and seat winds rotating between hands. Pure TypeScript, no React.
 *
 * Seats (`dong`/`nan`/`xi`/`bei`) are the four physical chairs; the human always sits at the
 * same chair. Each hand's seat wind is derived from the dealer chair (`seatWindOf` in
 * win-context.ts), so the scorer always sees the rotated seat wind.
 *
 * Player answers 2026-11-12: 16 games, ranking by total koin, then valid Hu,
 * then first to reach the final koin total. Seri and dealer wins each count once.
 */
import { SEAT_ORDER } from '../core/tiles';
import type { Seat, Wind } from '../core/types';
import { getStorage, type StorageLike } from '../storage';

/** Player answers 2026-11-12: every match has exactly 16 counted games. */
export const MATCH_GAMES = 16;
export type DealerWinRule = 'stay' | 'rotate';
export const DEFAULT_DEALER_WIN_RULE: DealerWinRule = 'rotate';

/** Distinguish wall-out Seri (`none`) from Lew Fit, for result reporting. */
export type HandResult = { kind: 'hu'; winner: Seat } | { kind: 'none' } | { kind: 'lew_fit' };
export type MatchTimeLimit = 90 | null;

export interface Seating {
  dealer: Seat;
  prevailingWind: Wind;
  /** Dealer changes since the prevailing wind last advanced (0–3). */
  dealerPasses: number;
}

/**
 * Player house rule 2026-11-12: every completed game rotates the dealer, including
 * Seri, dealer Hu, other Hu and Lew Fit. This supersedes PDF section 4 for Seri.
 * Legacy dealer-win preferences are ignored. Four games advance the prevailing wind.
 */
export function nextSeating(current: Seating, _result: HandResult, _dealerWinRule: DealerWinRule = DEFAULT_DEALER_WIN_RULE): Seating {
  const dealer = SEAT_ORDER[(SEAT_ORDER.indexOf(current.dealer) + 1) % 4]!;
  const passes = current.dealerPasses + 1;
  if (passes < 4) return { dealer, prevailingWind: current.prevailingWind, dealerPasses: passes };
  const prevailingWind = SEAT_ORDER[(SEAT_ORDER.indexOf(current.prevailingWind) + 1) % 4]! as Wind;
  return { dealer, prevailingWind, dealerPasses: 0 };
}

export { roundScore, type RoundScore, type RoundScoreKind, kongPayment, type KongPayment, type KongPaymentKind } from '../core/round-score';
import { roundScore, deriveRoundScore, type RoundScore, type KongPayment, gameDeltas, migrateKongPayments } from '../core/round-score';

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
  roundScore: RoundScore | null;
  kongPayments: KongPayment[];
  gameDeltas: Record<Seat, number>;
}

export interface MatchState {
  /** Developer sessions remain in-session only. */
  dev?: boolean;
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
  /** Cumulative raw Tay, before any koin payout. */
  tayTotal: Record<Seat, number>;
  koinTotal: Record<Seat, number>;
  /** Hand number at which each seat reached its current koin total (final tie-break) */
  reachedAt: Record<Seat, number>;
}

const zero = (): Record<Seat, number> => ({ dong: 0, nan: 0, xi: 0, bei: 0 });

export function createMatch(dealer: Seat = 'dong', prevailingWind: Wind = 'dong', minHuTay = 5, _dealerWinRule: DealerWinRule = DEFAULT_DEALER_WIN_RULE, timeLimitMinutes: MatchTimeLimit = null, now = Date.now()): MatchState {
  return { openingRoll: null, deadWall: 'none', minHuTay, dealerWinRule: DEFAULT_DEALER_WIN_RULE, timeLimitMinutes, startedAt: now, finishedAt: null, endedBy: null, seating: { dealer, prevailingWind, dealerPasses: 0 }, hands: [], huCount: zero(), tayTotal: zero(), koinTotal: zero(), reachedAt: zero() };
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
 * Hu; `validHu` false means a Lew Fit: no Hu payment, but completed Kong payments remain.
 * The raw Tay minimum is checked before applying win facts. Legacy callers without win facts receive zero Hu koin.
 */
export function recordHand(match: MatchState, winner: Seat | null, validHu: boolean, totalTay: number, now = Date.now(), win?: { winMethod: 'tsumo' | 'ron' | 'chiong_kong'; discarder?: Seat }, kongPayments: KongPayment[] = []): MatchState {
  if (isMatchOver(match)) return match;
  if (!match.koinTotal) match = migrateMatchState(match);
  const hand = currentHandNumber(match);
  const credited = winner !== null && validHu && Number.isFinite(totalTay) && totalTay >= match.minHuTay ? winner : null;
  const score = credited && win ? roundScore(credited, totalTay, win) : null;
  const record: MatchHandRecord = {
    hand,
    dealer: match.seating.dealer,
    prevailingWind: match.seating.prevailingWind,
    winner: credited,
    ...(winner !== null && !credited ? { lewFit: true } : {}),
    totalTay: credited ? totalTay : 0,
    roundScore: score,
    kongPayments: [...kongPayments],
    gameDeltas: gameDeltas(score, kongPayments),
  };
  const huCount = { ...match.huCount };
  const tayTotal = { ...match.tayTotal };
  const koinTotal = { ...match.koinTotal };
  for (const seat of SEAT_ORDER) {
    koinTotal[seat] += record.gameDeltas[seat];
  }
  if (credited) {
    huCount[credited]++;
    tayTotal[credited] += totalTay;
  }
  return finishMatchAtBoundary({
    ...match,
    seating: nextSeating(match.seating, credited ? { kind: 'hu', winner: credited } : winner !== null ? { kind: 'lew_fit' } : { kind: 'none' }, match.dealerWinRule),
    hands: [...match.hands, record],
    huCount,
    tayTotal,
    koinTotal,
    reachedAt: firstReached([...match.hands, record], koinTotal),
  }, now);
}

export interface Standing {
  seat: Seat;
  rank: number;
  hu: number;
  tay: number;
  koin: number;
  /** First hand at which the current koin total was reached (0 = opening balance). */
  reachedAt: number;
}

/** Total koin first, then valid Hu count, then first to reach the final koin total. */
export function standings(match: MatchState): Standing[] {
  if (!match.koinTotal) match = migrateMatchState(match);
  const rows = SEAT_ORDER.map((seat) => ({ seat, hu: match.huCount[seat], tay: match.tayTotal[seat], koin: match.koinTotal[seat], reachedAt: match.reachedAt[seat] }));
  rows.sort((a, b) => b.koin - a.koin || b.hu - a.hu || a.reachedAt - b.reachedAt || SEAT_ORDER.indexOf(a.seat) - SEAT_ORDER.indexOf(b.seat));
  const out: Standing[] = [];
  rows.forEach((r, i) => {
    out.push({ ...r, rank: i + 1 });
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

/** Normalize a v0.5.4 in-progress snapshot; this app has no automatic match persistence. */
export function migrateMatchState(raw: MatchState): MatchState {
  const koinTotal = zero(), tayTotal = zero(), huCount = zero();
  const hands = (raw.hands ?? []).map((old): MatchHandRecord => {
    const score = old.winner && !old.lewFit ? deriveRoundScore(old.winner, old.totalTay, old) : null;
    if (old.winner && !old.lewFit) { tayTotal[old.winner] += old.totalTay; huCount[old.winner]++; }
    const kongPayments = migrateKongPayments(old.kongPayments);
    const deltas = gameDeltas(score, kongPayments);
    for (const seat of SEAT_ORDER) koinTotal[seat] += deltas[seat];
    return { hand: old.hand, dealer: old.dealer, prevailingWind: old.prevailingWind, winner: old.winner, ...(old.lewFit ? { lewFit: true } : {}), totalTay: old.totalTay, roundScore: score, kongPayments, gameDeltas: deltas };
  });
  return { ...raw, hands, koinTotal, tayTotal, huCount, reachedAt: firstReached(hands, koinTotal) };
}

/** Balances can fall and return: retain the first visit to the current total. */
function firstReached(hands: MatchHandRecord[], final: Record<Seat, number>): Record<Seat, number> {
  const balance = zero(), reached = zero();
  const found = new Set(SEAT_ORDER.filter(seat => final[seat] === 0));
  for (const hand of hands) for (const seat of SEAT_ORDER) {
    balance[seat] += hand.gameDeltas?.[seat] ?? hand.roundScore?.deltas[seat] ?? 0;
    if (!found.has(seat) && balance[seat] === final[seat]) { reached[seat] = hand.hand; found.add(seat); }
  }
  return reached;
}
