export * from '../session/match';
import * as model from '../session/match';
import { DEFAULT_DEALER_WIN_RULE, type DealerWinRule, type MatchState, type MatchTimeLimit, type KongPayment } from '../session/match';
import type { Seat, Wind } from '../core/types';
import { getStorage, type StorageLike } from '../storage';
const DEALER_WIN_KEY = 'itm.match-dealer-win.v1';
const TIME_LIMIT_KEY = 'itm.match-time-limit.v1';
const DEAD_WALL_KEY = 'itm.dead-wall.v1';
import type { DeadWallOption } from '../session/match';
export function migrateMatchLengthPreference(storage?: StorageLike): void {
  try { (storage ?? getStorage()).removeItem('itm.match-length.v1'); } catch { /* Storage unavailable. */ }
}

export function loadDealerWinRule(storage?: StorageLike): DealerWinRule {
  try { (storage ?? getStorage()).removeItem(DEALER_WIN_KEY); } catch { /* Storage unavailable. */ }
  return DEFAULT_DEALER_WIN_RULE;
}

export function saveDealerWinRule(_rule: DealerWinRule, storage?: StorageLike): void {
  loadDealerWinRule(storage);
}

export function loadMatchTimeLimit(storage?: StorageLike): MatchTimeLimit {
  try { return (storage ?? getStorage()).getItem(TIME_LIMIT_KEY) === '90' ? 90 : null; }
  catch { return null; }
}

export function saveMatchTimeLimit(limit: MatchTimeLimit, storage?: StorageLike): void {
  try { (storage ?? getStorage()).setItem(TIME_LIMIT_KEY, limit === null ? 'unlimited' : String(limit)); } catch { /* Keep the live choice. */ }
}

export function watchMatchClock(target: { tickMatchClock(): void }): () => void {
  const timer = setInterval(() => target.tickMatchClock(), 1000);
  return () => clearInterval(timer);
}

export function loadDeadWall(storage?: StorageLike): DeadWallOption {
  try { return (storage ?? getStorage()).getItem(DEAD_WALL_KEY) === '14' ? '14' : 'none'; }
  catch { return 'none'; }
}

export function saveDeadWall(option: DeadWallOption, storage?: StorageLike): void {
  try { (storage ?? getStorage()).setItem(DEAD_WALL_KEY, option); } catch { /* Keep live choice. */ }
}

export function createMatch(dealer: Seat = 'dong', prevailingWind: Wind = 'dong', minHuTay = 5, _dealerWinRule: DealerWinRule = DEFAULT_DEALER_WIN_RULE, timeLimitMinutes: MatchTimeLimit = null, now = Date.now()): MatchState { return model.createMatch(dealer, prevailingWind, minHuTay, _dealerWinRule, timeLimitMinutes, now); }

export function recordHand(match: MatchState, winner: Seat | null, validHu: boolean, totalTay: number, now = Date.now(), win?: { winMethod: 'tsumo' | 'ron' | 'chiong_kong'; discarder?: Seat }, kongPayments: KongPayment[] = []): MatchState { return model.recordHand(match, winner, validHu, totalTay, now, win, kongPayments); }

export function remainingMatchMs(match: MatchState, now = Date.now()): number | null { return model.remainingMatchMs(match, now); }

export function finishMatchAtBoundary(match: MatchState, now = Date.now()): MatchState { return model.finishMatchAtBoundary(match, now); }
