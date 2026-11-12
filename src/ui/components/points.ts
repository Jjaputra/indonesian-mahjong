import { SEAT_ORDER } from '../../core/tiles';
import type { Seat, Wind } from '../../core/types';
import type { RoundScore, RoundScoreKind } from '../../core/round-score';

/**
 * Round Score display (v0.5.5, group decision), unit koin. T = the winner's raw total Tay.
 * Ce Mo: winner +6T, each other player −2T. Buangan / Chiong Kong: payer −2T, the other two −T,
 * winner +4T. Seri and Lew Fit score 0; every game sums to 0 ("kit-kit"). The controller and match
 * carry the authoritative RoundScore (core/round-score.ts); these helpers only format it.
 */
export const ROUND_SCORE_LABEL: Record<RoundScoreKind, string> = { ce_mo: 'Ce Mo', buangan: 'Buangan', chiong_kong: 'Chiong Kong' };
/** Tag beside the paying player's row. */
export const PAYER_TAG: Record<RoundScoreKind, string> = { ce_mo: '', buangan: 'buang', chiong_kong: 'kong' };

const zero = (): Record<Seat, number> => ({ dong: 0, nan: 0, xi: 0, bei: 0 });

/** Koin each seat gained in a stored hand; all zero for Seri, Lew Fit or unknown. */
export function recordDeltas(record: { roundScore?: RoundScore | null }): Record<Seat, number> {
  return record.roundScore?.deltas ?? zero();
}

/** Σ of a match's koin totals; 0 when every game was kit-kit. */
export function koinSum(totals: Record<Seat, number>): number {
  return SEAT_ORDER.reduce((sum, s) => sum + totals[s], 0);
}

/** Signed koin with a true minus: "+20", "−25", "0". */
export function signedKoin(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';
}

export function koinTone(n: number): 'is-plus' | 'is-minus' | 'is-zero' {
  return n > 0 ? 'is-plus' : n < 0 ? 'is-minus' : 'is-zero';
}

/** "5 Tay · +20 koin" for a hand's winner, or just "5 Tay" when the koin is unknown. */
export function tayKoinText(record: { winner: Seat | null; totalTay: number; roundScore?: RoundScore | null; koin?: number }): string {
  const k = record.winner && record.roundScore ? record.roundScore.deltas[record.winner] : record.koin || null;
  return k ? `${record.totalTay} Tay · ${signedKoin(k)} koin` : `${record.totalTay} Tay`;
}

/** Formula hint, e.g. "Ce Mo: 6 × 5 tay" or "Buangan: 4 × 5 tay; yang buang 2×, lainnya 1×". */
export function roundScoreHint(rs: RoundScore): string {
  if (rs.kind === 'ce_mo') return `Ce Mo: 6 × ${rs.tay} tay; tiap lawan 2×`;
  return `${ROUND_SCORE_LABEL[rs.kind]}: 4 × ${rs.tay} tay; yang ${PAYER_TAG[rs.kind]} 2×, lainnya 1×`;
}

/** Seat wind of `seat` given another seat's wind this hand (winds follow chair order). */
export function windOf(seat: Seat, known: Seat, knownWind: Wind): Wind {
  return SEAT_ORDER[(SEAT_ORDER.indexOf(knownWind) + SEAT_ORDER.indexOf(seat) - SEAT_ORDER.indexOf(known) + 4) % 4]!;
}

/** Winner first, then the payer, then the rest in turn order after the winner. */
export function roundScoreOrder(winner: Seat, payer: Seat | null): Seat[] {
  const i = SEAT_ORDER.indexOf(winner);
  const rest = [1, 2, 3].map((k) => SEAT_ORDER[(i + k) % 4]!).filter((s) => s !== payer);
  return [winner, ...(payer && payer !== winner ? [payer] : []), ...rest];
}
