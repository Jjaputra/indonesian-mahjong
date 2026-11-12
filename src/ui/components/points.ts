import type { Meld } from '../../core/types';

/**
 * House rule (v0.5.4): a valid Hu scores total Tay x2 when it is Ce Mo (self-draw) or Mun
 * (concealed hand won on an opponent's tile), otherwise x1; never x4. The controller and match
 * carry the authoritative HandPoints; these readers only render it, falling back to the same rule
 * for records saved before points existed.
 */
export type PointsReason = 'ce_mo' | 'mun' | null;
export interface PointsView { tay: number; multiplier: 1 | 2; reason: PointsReason; points: number }

export const POINTS_REASON_LABEL: Record<Exclude<PointsReason, null>, string> = { ce_mo: 'Ce Mo', mun: 'Mun' };

function asPoints(value: unknown): PointsView | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<PointsView>;
  if (typeof v.points !== 'number' || typeof v.tay !== 'number') return null;
  return { tay: v.tay, multiplier: v.multiplier === 2 ? 2 : 1, reason: v.reason === 'ce_mo' || v.reason === 'mun' ? v.reason : null, points: v.points };
}

/** The first HandPoints-shaped value among an object's likely fields. */
function readPoints(source: object): PointsView | null {
  const s = source as Record<string, unknown>;
  return asPoints(s.handPoints) ?? asPoints(s.points) ?? asPoints(s.pointsDetail);
}

interface HuLike {
  winMethod: string;
  melds: Meld[];
  scoring: { isValidHu: boolean; totalTay: number };
}

/** Points for a Hu result; Lew Fit and below-minimum hands score 0. */
export function outcomePoints(outcome: HuLike): PointsView {
  const { isValidHu, totalTay } = outcome.scoring;
  if (!isValidHu) return { tay: totalTay, multiplier: 1, reason: null, points: 0 };
  const given = readPoints(outcome) ?? readPoints(outcome.scoring);
  if (given) return given;
  const selfDraw = outcome.winMethod === 'tsumo';
  const concealed = outcome.melds.every((m) => m.type === 'ankong');
  const reason: PointsReason = selfDraw ? 'ce_mo' : concealed ? 'mun' : null;
  const multiplier = reason ? 2 : 1;
  return { tay: totalTay, multiplier, reason, points: totalTay * multiplier };
}

/** Points on a stored hand (match hand or history record): its own field, else the Tay. */
export function recordPoints(record: { totalTay: number }): PointsView {
  const given = readPoints(record);
  if (given) return given;
  const { points, multiplier } = record as { points?: unknown; multiplier?: unknown };
  if (typeof points === 'number') return { tay: record.totalTay, multiplier: multiplier === 2 ? 2 : 1, reason: null, points };
  return { tay: record.totalTay, multiplier: 1, reason: null, points: record.totalTay };
}

/** "7 Tay", or "7 Tay · 14 Poin" when the hand was doubled. */
export function tayPointsText(p: PointsView): string {
  return p.points !== p.tay && p.points > 0 ? `${p.tay} Tay · ${p.points} Poin` : `${p.tay} Tay`;
}

/** A standings row's match total; `tay` holds accumulated points since v0.5.4 (legacy key name). */
export function standingPoints(row: { tay: number }): number {
  const p = (row as { points?: unknown }).points;
  return typeof p === 'number' ? p : row.tay;
}
