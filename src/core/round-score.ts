import { SEAT_ORDER } from './tiles';
import type { Seat, TileFace } from './types';

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

export type KongPaymentKind = 'ankong' | 'kong' | 'ankong_zhong' | 'kong_zhong';
export interface KongPayment { owner: Seat; kind: KongPaymentKind; face: TileFace; perPlayer: number; deltas: Record<Seat, number> }

/** Completed Kongs only: a robbed added Kong never reaches this payment step. */
export function kongPayment(owner: Seat, face: TileFace, concealed: boolean): KongPayment {
  if (!SEAT_ORDER.includes(owner)) throw new Error('Invalid Kong owner');
  const zhong = face.type === 'dragon' && face.value === 1;
  const perPlayer = (concealed ? 2 : 1) * (zhong ? 2 : 1);
  const kind: KongPaymentKind = concealed ? (zhong ? 'ankong_zhong' : 'ankong') : (zhong ? 'kong_zhong' : 'kong');
  const deltas = { dong: 0, nan: 0, xi: 0, bei: 0 };
  for (const seat of SEAT_ORDER) deltas[seat] = seat === owner ? 3 * perPlayer : -perPlayer;
  return { owner, kind, face: { type: face.type, value: face.value }, perPlayer, deltas };
}

/** Full game balance: Hu plus every completed Kong, including on Seri/Lew Fit. */
export function gameDeltas(score: RoundScore | null, payments: readonly KongPayment[]): Record<Seat, number> {
  const deltas = { dong: 0, nan: 0, xi: 0, bei: 0 };
  for (const seat of SEAT_ORDER) deltas[seat] = (score?.deltas[seat] ?? 0) + payments.reduce((sum, p) => sum + p.deltas[seat], 0);
  return deltas;
}

/** Rebuild stored payments from facts, ignoring untrusted stored amounts. */
export function migrateKongPayments(raw: unknown): KongPayment[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(p => {
    if (!p || !SEAT_ORDER.includes(p.owner) || !p.face || !['ankong', 'kong', 'ankong_zhong', 'kong_zhong'].includes(p.kind)) return [];
    const f = p.face;
    if (!Number.isInteger(f.value) || !((['tong', 'sok', 'ban'].includes(f.type) && f.value >= 1 && f.value <= 9) || (f.type === 'wind' && f.value >= 1 && f.value <= 4) || (f.type === 'dragon' && f.value >= 1 && f.value <= 3) || (f.type === 'kim' && f.value === 0))) return [];
    return [kongPayment(p.owner, f, p.kind.startsWith('ankong'))];
  });
}
