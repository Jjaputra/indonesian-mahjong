import { SEAT_ORDER } from './tiles';
import type { Seat } from './types';

export type RoundScoreKind = 'ce_mo' | 'buangan' | 'chiong_kong';
export interface RoundScore { kind: RoundScoreKind; tay: number; deltas: Record<Seat, number>; payer: Seat | null }

/** Group decision 2026-11-12: zero-sum Round Score, measured in koin. */
export function roundScore(winner: Seat, totalTay: number, win: { winMethod: 'tsumo' | 'ron' | 'chiong_kong'; discarder?: Seat }): RoundScore {
  if (!SEAT_ORDER.includes(winner) || !Number.isFinite(totalTay) || totalTay < 0) throw new Error('Invalid Round Score winner or Tay');
  const selfDraw = win.winMethod === 'tsumo';
  const payer = selfDraw ? null : win.discarder;
  if (!selfDraw && (!payer || !SEAT_ORDER.includes(payer) || payer === winner)) throw new Error('Round Score requires an opponent payer');
  const deltas = { dong: 0, nan: 0, xi: 0, bei: 0 };
  for (const seat of SEAT_ORDER) deltas[seat] = totalTay * (seat === winner ? (selfDraw ? 6 : 4) : selfDraw || seat === payer ? -2 : -1);
  if (Object.values(deltas).reduce((sum, n) => sum + n, 0) !== 0) throw new Error('Round Score must sum to zero (kit-kit)');
  return { kind: selfDraw ? 'ce_mo' : win.winMethod === 'chiong_kong' ? 'chiong_kong' : 'buangan', tay: totalTay, deltas, payer: payer ?? null };
}

/** Reconstruct from trusted win facts, never from legacy multiplied points. */
export function deriveRoundScore(winner: Seat | null, tay: number, raw: { winMethod?: unknown; discarder?: unknown; roundScore?: unknown }): RoundScore | null {
  if (!winner || !Number.isFinite(tay) || tay < 0) return null;
  const stored = raw.roundScore && typeof raw.roundScore === 'object' ? raw.roundScore as Partial<RoundScore> : null;
  const winMethod = raw.winMethod ?? (stored?.kind === 'ce_mo' ? 'tsumo' : stored?.kind === 'buangan' ? 'ron' : stored?.kind === 'chiong_kong' ? 'chiong_kong' : undefined);
  const discarder = raw.discarder ?? stored?.payer;
  if (winMethod !== 'tsumo' && winMethod !== 'ron' && winMethod !== 'chiong_kong') return null;
  try { return roundScore(winner, tay, { winMethod, discarder: discarder as Seat }); } catch { return null; }
}
