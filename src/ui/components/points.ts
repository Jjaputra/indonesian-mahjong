import { SEAT_ORDER } from '../../core/tiles';
import type { Seat, Wind } from '../../core/types';
import { PLAYER_NAME, tileText } from '../labels';
import type { KongPayment, KongPaymentKind, RoundScore, RoundScoreKind } from '../../core/round-score';

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

/** Koin each seat gained in a stored hand (Hu + Kong); all zero for a kong-less Seri, Lew Fit or unknown. */
export function recordDeltas(record: { roundScore?: RoundScore | null }): Record<Seat, number> {
  return gameDeltasOf(record);
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
  const k = record.winner && record.roundScore ? gameDeltasOf(record)[record.winner] : record.koin || null;
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

/**
 * Kong koin (v0.5.7, player rule): a Kong scores 0 Tay, but when it completes each other player pays
 * the owner at once — Kong di dalam 2, makan dari orang (incl. Kong tambahan) 1, Kong Zhong di dalam
 * 4, Kong Zhong makan dari orang 2. A robbed Kong tambahan pays nothing; payments stay through Seri
 * and Lew Fit. Game koin = Hu Round Score + Kong. The controller owns the payments; these read them
 * defensively (older records may lack them) and only format.
 */
export type KongPaymentView = KongPayment;

export const KONG_KIND_LABEL: Record<KongPaymentKind, string> = {
  ankong: 'Kong di dalam', kong: 'Kong makan dari orang', ankong_zhong: 'Kong Zhong di dalam', kong_zhong: 'Kong Zhong makan dari orang',
};

const isPayment = (p: unknown): p is KongPaymentView =>
  !!p && typeof p === 'object' && SEAT_ORDER.includes((p as KongPaymentView).owner) && typeof (p as KongPaymentView).perPlayer === 'number' && !!(p as KongPaymentView).deltas;

/** `kongPayments` of an outcome, hand record or controller; [] when absent (older records). */
export function kongPaymentsOf(source: unknown): KongPaymentView[] {
  const list = source && typeof source === 'object' ? (source as { kongPayments?: unknown }).kongPayments : undefined;
  return Array.isArray(list) ? list.filter(isPayment) : [];
}

/** Net koin per seat from a set of Kong payments. */
export function kongDeltas(payments: readonly KongPaymentView[]): Record<Seat, number> {
  const out = zero();
  for (const p of payments) for (const s of SEAT_ORDER) out[s] += p.deltas[s] ?? 0;
  return out;
}

/** Game koin per seat: stored `gameDeltas`, else Hu Round Score + Kong payments. */
export function gameDeltasOf(record: { roundScore?: RoundScore | null; kongPayments?: unknown; gameDeltas?: unknown }): Record<Seat, number> {
  const stored = record.gameDeltas as Record<Seat, number> | undefined;
  if (stored && typeof stored === 'object' && SEAT_ORDER.every((s) => typeof stored[s] === 'number')) return stored;
  const hu = record.roundScore?.deltas ?? zero();
  const kong = kongDeltas(kongPaymentsOf(record));
  return { dong: hu.dong + kong.dong, nan: hu.nan + kong.nan, xi: hu.xi + kong.xi, bei: hu.bei + kong.bei };
}

/** Face name for Kong lines: 中 for Zhong, else the tile name ("5 Tong"). */
export function kongFaceText(p: Pick<KongPaymentView, 'kind' | 'face'>): string {
  return p.kind === 'ankong_zhong' || p.kind === 'kong_zhong' ? '中' : tileText({ ...p.face, id: 'kong-face', isKim: false });
}

/** Live toast: "Kong 中! tiap pemain bayar 4 koin ke Bot Kanan". */
export function kongToastText(p: KongPaymentView): string {
  return `Kong ${kongFaceText(p)}! tiap pemain bayar ${p.perPlayer} koin ke ${PLAYER_NAME[p.owner]}`;
}

/** History note, e.g. "Kong Bot Kanan +6", per owner; empty without kongs. */
export function kongNote(payments: readonly KongPaymentView[]): string {
  const net = kongDeltas(payments);
  const owners = SEAT_ORDER.filter((s) => payments.some((p) => p.owner === s));
  return owners.length ? 'Kong ' + owners.map((s) => `${PLAYER_NAME[s]} ${signedKoin(net[s])}`).join(', ') : '';
}
