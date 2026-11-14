import type { Seat, Tile, TileFace, Wind } from '../core/types';
import { roundScore, type RoundScore, kongPayment, type KongPayment, gameDeltas } from '../core/round-score';
import type { ScoringResult } from '../scoring';
import type { GameSettings } from '../storage';
import { scoreHu, toFullRules, toScoringOverlap } from '../ui/win-context';
import { validateDevHand, type DevHand } from './hand-code';
export function evaluateDevHand(hand: DevHand, settings: GameSettings): { scoring: ScoringResult; roundScore: RoundScore | null; kongPayments: KongPayment[]; gameDeltas: Record<Seat, number>; seats: Record<Seat, Wind> } {
  validateDevHand(hand);
  let id = 0;
  const tile = (f: TileFace): Tile => ({ ...f, id: `sandbox-${id++}`, isKim: settings.kimEnabled && (f.type === 'kim' || (settings.kimMode === 'natural' && !!hand.kimFace && f.type === hand.kimFace.type && f.value === hand.kimFace.value)) });
  const scoring = scoreHu({ hand: hand.concealed.map(tile), winningTile: tile(hand.winningTile), melds: hand.melds.map(m => ({ type: m.type === 'kakan' ? 'kong' : m.type, tiles: m.faces.map(tile), ...(m.type === 'kong' ? { fromConcealedTriplet: true as const } : {}) })), flowers: [...hand.bonus.bunga.map(value => tile({ type: 'flower', value })), ...hand.bonus.musim.map(value => tile({ type: 'season', value }))] }, hand.seatWind, hand.roundWind, { isSelfDraw: hand.win.method === 'tsumo', isRobbingKong: hand.win.method === 'chiong_kong', consecutiveKongs: hand.flags.consecutiveKongs ?? 0, isFirstGoAround: hand.flags.firstGoAround ?? false, isPaoChin: hand.flags.paoChin ?? false, isInitialDealtHand: hand.flags.initialDealtHand ?? false, discarderSeat: hand.win.discarder }, toFullRules(settings), toScoringOverlap(settings.overlapPolicy));
  const score = scoring.isValidHu ? roundScore(hand.seatWind, scoring.totalTay, { winMethod: hand.win.method, discarder: hand.win.discarder }) : null;
  const kongPayments = hand.melds.filter(m => m.type === 'kong' || m.type === 'kakan' || m.type === 'ankong').map(m => kongPayment(hand.seatWind, m.faces[0]!, m.type === 'ankong'));
  return { scoring, roundScore: score, kongPayments, gameDeltas: gameDeltas(score, kongPayments), seats: { dong: 'dong', nan: 'nan', xi: 'xi', bei: 'bei' } };
}
