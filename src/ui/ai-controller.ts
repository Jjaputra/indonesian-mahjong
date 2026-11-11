/**
 * AI opponents for the web table (Easy / Normal / Hard).
 *
 * Privacy model: an AI never receives the engine state. The game controller hands it an
 * `AIObservation` built by `buildObservation`, which copies only the AI's own concealed tiles plus
 * information every player at a real table can see (discards, exposed melds, flowers, tile counts).
 * Every decision below is a pure function of that observation and a seeded RNG.
 */
import { tileText } from './labels';
import type { GameEngineState } from '../core/game-engine';
import { SEAT_ORDER, isHonor, isSameKind, isSuited, isTerminal } from '../core/tiles';
import type { ClaimDeclaration, LegalActions, Meld, Seat, Suit, Tile, Wind } from '../core/types';
import { isKim } from '../kim/wildcard-solver';
import type { OverlapPolicy as ScoringOverlapPolicy, ScoringResult } from '../scoring';
import type { AIDifficulty } from '../storage';
import { isFirstGoAround, isInitialDealtHand, scoreHu, seatWindOf, type FullRules, type WinFlags } from './win-context';

export interface PublicSeatInfo {
  seat: Seat;
  melds: Meld[];
  flowers: Tile[];
  discards: Tile[];
  /** Number of concealed tiles (the tiles themselves are hidden) */
  concealedCount: number;
}

export interface AIObservation {
  seat: Seat;
  difficulty: AIDifficulty;
  rules: FullRules;
  overlapPolicy: ScoringOverlapPolicy;
  roundWind: Wind;
  /** Own seat wind this hand (rotates with the dealer in a match); omitted = `seat` */
  seatWind?: Wind;
  /** Own concealed tiles, in engine order (last tile = most recent draw) */
  hand: Tile[];
  melds: Meld[];
  flowers: Tile[];
  discards: Tile[];
  isPaoChin: boolean;
  opponents: PublicSeatInfo[];
  wallRemaining: number;
  consecutiveKongs: number;
  isFirstGoAround: boolean;
  /** Own hand is still exactly as dealt to the dealer (Thien Fu window); omitted = isFirstGoAround */
  isInitialDealtHand?: boolean;
  pendingDiscard: { discarder: Seat; tile: Tile; isPromotedKong: boolean } | null;
  legal: LegalActions;
}

export type AITurnAction =
  | { type: 'hu' }
  | { type: 'ankong'; tiles: Tile[] }
  | { type: 'kakan'; tileId: string; meldIndex: number }
  | { type: 'discard'; tileId: string };

const copyTiles = (tiles: readonly Tile[]): Tile[] => tiles.map((t) => ({ ...t }));
const copyMelds = (melds: readonly Meld[]): Meld[] => melds.map((m) => ({ ...m, tiles: copyTiles(m.tiles) }));

export { isFirstGoAround };

/** The privacy boundary: the only path from engine state to an AI. */
export function buildObservation(
  state: Readonly<GameEngineState>,
  seat: Seat,
  legal: LegalActions,
  difficulty: AIDifficulty,
  rules: FullRules,
  overlapPolicy: ScoringOverlapPolicy
): AIObservation {
  const me = state.players[seat];
  const pending = state.discardPending;
  return {
    seat,
    difficulty,
    rules,
    overlapPolicy,
    roundWind: state.roundWind,
    seatWind: seatWindOf(state, seat),
    hand: copyTiles(me.hand),
    melds: copyMelds(me.melds),
    flowers: copyTiles(me.flowers),
    discards: copyTiles(me.discards),
    isPaoChin: me.isPaoChin,
    opponents: SEAT_ORDER.filter((s) => s !== seat).map((s) => {
      const p = state.players[s];
      return {
        seat: s,
        melds: copyMelds(p.melds),
        flowers: copyTiles(p.flowers),
        discards: copyTiles(p.discards),
        concealedCount: p.hand.length,
      };
    }),
    wallRemaining: state.wall.remainingCount,
    consecutiveKongs: state.consecutiveKongs,
    isFirstGoAround: isFirstGoAround(state),
    isInitialDealtHand: isInitialDealtHand(state, seat),
    pendingDiscard: pending ? { discarder: pending.discarder, tile: { ...pending.tile }, isPromotedKong: !!pending.isPromotedKong } : null,
    legal,
  };
}

// ============================================================================
// Hu evaluation (own hand only)
// ============================================================================

function winFlags(obs: AIObservation, isSelfDraw: boolean): WinFlags {
  return {
    isSelfDraw,
    isRobbingKong: !isSelfDraw && !!obs.pendingDiscard?.isPromotedKong,
    consecutiveKongs: obs.consecutiveKongs,
    isFirstGoAround: obs.isFirstGoAround,
    isPaoChin: obs.isPaoChin,
    discarderSeat: isSelfDraw ? undefined : obs.pendingDiscard?.discarder,
    isInitialDealtHand: obs.isInitialDealtHand,
  };
}

/** Scores the AI's own self-drawn Hu (last hand tile is the winning tile). */
export function evaluateSelfDrawHu(obs: AIObservation): ScoringResult | null {
  const winningTile = obs.hand[obs.hand.length - 1];
  if (!winningTile) return null;
  return scoreHu(
    { hand: obs.hand.slice(0, -1), melds: obs.melds, flowers: obs.flowers, winningTile },
    obs.seatWind ?? obs.seat,
    obs.roundWind,
    winFlags(obs, true),
    obs.rules,
    obs.overlapPolicy
  );
}

/** Scores a Hu on the pending discard (or promoted Kong tile). */
export function evaluateDiscardHu(obs: AIObservation): ScoringResult | null {
  if (!obs.pendingDiscard) return null;
  return scoreHu(
    { hand: obs.hand, melds: obs.melds, flowers: obs.flowers, winningTile: obs.pendingDiscard.tile },
    obs.seatWind ?? obs.seat,
    obs.roundWind,
    winFlags(obs, false),
    obs.rules,
    obs.overlapPolicy
  );
}

// ============================================================================
// Hand heuristics
// ============================================================================

const kindKey = (t: Tile) => `${t.type}-${t.value}`;

/** Copies of each kind visible to this seat: own tiles plus all public tiles. */
export function visibleKindCounts(obs: AIObservation): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (t: Tile) => {
    if (isKim(t)) return;
    counts.set(kindKey(t), (counts.get(kindKey(t)) ?? 0) + 1);
  };
  obs.hand.forEach(add);
  obs.melds.forEach((m) => m.tiles.forEach(add));
  obs.discards.forEach(add);
  for (const o of obs.opponents) {
    o.melds.forEach((m) => m.tiles.forEach(add));
    o.discards.forEach(add);
  }
  if (obs.pendingDiscard) add(obs.pendingDiscard.tile);
  return counts;
}

/** Suit holding the most own tiles (concealed + melds); drives the Chao It / It Set strategy. */
export function dominantSuit(obs: AIObservation): { suit: Suit | null; share: number } {
  const counts: Record<Suit, number> = { tong: 0, sok: 0, ban: 0 };
  let suited = 0;
  for (const t of [...obs.hand, ...obs.melds.flatMap((m) => m.tiles)]) {
    if (isSuited(t)) {
      counts[t.type as Suit]++;
      suited++;
    }
  }
  let best: Suit | null = null;
  for (const s of ['tong', 'sok', 'ban'] as const) {
    if (counts[s] > 0 && (best === null || counts[s] > counts[best])) best = s;
  }
  return { suit: best, share: best && suited > 0 ? counts[best] / suited : 0 };
}

const WIND_VALUE: Record<Wind, number> = { dong: 1, nan: 2, xi: 3, bei: 4 };

/** Dragons, seat wind and round wind are worth Tay as triplets. */
export function isValuableHonor(tile: Tile, obs: Pick<AIObservation, 'seat' | 'roundWind' | 'seatWind'>): boolean {
  if (tile.type === 'dragon') return true;
  if (tile.type === 'wind') return tile.value === WIND_VALUE[obs.seatWind ?? obs.seat] || tile.value === WIND_VALUE[obs.roundWind];
  return false;
}

const FLUSH_PENALTY: Record<AIDifficulty, number> = { easy: 0, normal: 6, hard: 16 };

/** How much the AI wants to keep `tile` (higher = keep). */
export function tileKeepValue(tile: Tile, obs: AIObservation, visible: Map<string, number>): number {
  if (isKim(tile)) return 1000;
  const same = obs.hand.filter((t) => !isKim(t) && isSameKind(t, tile)).length;
  let value = same >= 3 ? 60 : same === 2 ? 30 : 0;

  if (isSuited(tile)) {
    const has = (dv: number) => obs.hand.some((t) => t.type === tile.type && t.value === tile.value + dv);
    if (has(-1)) value += 12;
    if (has(1)) value += 12;
    if (has(-2)) value += 6;
    if (has(2)) value += 6;
    if (isTerminal(tile)) value -= 2;
    const { suit, share } = dominantSuit(obs);
    if (suit && tile.type !== suit && share >= 0.5) value -= FLUSH_PENALTY[obs.difficulty];
  } else if (isHonor(tile)) {
    value += isValuableHonor(tile, obs) ? 8 : 2;
    if (obs.difficulty === 'hard' && dominantSuit(obs).share >= 0.6) value += 4; // honors fit Chao It
  }

  if (obs.difficulty === 'hard') {
    const live = 4 - (visible.get(kindKey(tile)) ?? 0);
    if (same < 3 && live <= 0) value -= same === 2 ? 10 : 8; // dead pair / dead single
  }
  return value;
}

/** Deterministic tie-break on tile id keeps choices reproducible under a seeded RNG. */
export function chooseDiscard(obs: AIObservation, rng: () => number): string | null {
  const allowed = new Set(obs.legal.discardableTileIds);
  const candidates = obs.hand.filter((t) => allowed.has(t.id) && ((obs.rules.kimMode !== 'natural' && obs.rules.kimDiscardAllowed) || !isKim(t)));
  if (candidates.length === 0) return null;
  const visible = visibleKindCounts(obs);
  const noise = obs.difficulty === 'easy' ? 25 : obs.difficulty === 'normal' ? 4 : 0;
  let best: { id: string; v: number } | null = null;
  for (const t of candidates) {
    const v = tileKeepValue(t, obs, visible) + rng() * noise;
    if (!best || v < best.v || (v === best.v && t.id < best.id)) best = { id: t.id, v };
  }
  return best?.id ?? null;
}

// ============================================================================
// Decisions
// ============================================================================

/** Decide what to do on the AI's own ACTION_DECISION turn. */
export function decideTurnAction(obs: AIObservation, rng: () => number): AITurnAction {
  const { legal } = obs;
  if (legal.canSelfDrawHu) {
    const result = evaluateSelfDrawHu(obs);
    if (result?.isValidHu) return { type: 'hu' };
  }
  if (legal.canAnkong && obs.difficulty !== 'easy') {
    const group = legal.ankongOptions.find((g) => g.every((t) => !isKim(t)));
    if (group) return { type: 'ankong', tiles: group };
  }
  if (legal.canKakan && obs.difficulty === 'hard') {
    const opt = legal.kakanOptions.find((o) => !isKim(o.tile));
    if (opt) return { type: 'kakan', tileId: opt.tile.id, meldIndex: opt.meldIndex };
  }
  const tileId = chooseDiscard(obs, rng);
  if (tileId) return { type: 'discard', tileId };
  // Only reachable with a hand of nothing but undiscardable Kim; fall back to any legal tile.
  return { type: 'discard', tileId: legal.discardableTileIds[0] ?? obs.hand[0]!.id };
}

const CLAIM_CHANCE: Record<AIDifficulty, { kong: number; pung: number; jia: number }> = {
  easy: { kong: 0.5, pung: 0.4, jia: 0.3 },
  normal: { kong: 1, pung: 0.7, jia: 0.5 },
  hard: { kong: 1, pung: 1, jia: 1 },
};

/** Decide a claim (Hu > Kong > Pung > Jia, or pass) during a claim window. */
export function decideClaim(obs: AIObservation, rng: () => number): ClaimDeclaration {
  const pass: ClaimDeclaration = { seat: obs.seat, action: 'pass' };
  const pending = obs.pendingDiscard;
  if (!pending || pending.discarder === obs.seat) return pass;
  const { legal } = obs;

  // Hu only when the hand is structurally complete AND reaches the minimum Tay (no Lew Fit).
  if (legal.canDiscardWinHu) {
    const result = evaluateDiscardHu(obs);
    if (result?.isValidHu) return { seat: obs.seat, action: 'hu' };
  }
  if (pending.isPromotedKong) return pass;

  const tile = pending.tile;
  const chance = CLAIM_CHANCE[obs.difficulty];
  const { suit, share } = dominantSuit(obs);
  const onPlan = isValuableHonor(tile, obs) || (suit !== null && tile.type === suit && share >= 0.5) || isHonor(tile);
  const noKim = (tiles?: Tile[]) => !!tiles && tiles.every((t) => !isKim(t));

  if (legal.canKong && noKim(legal.kongTiles) && rng() < chance.kong) {
    return { seat: obs.seat, action: 'kong', meldTiles: legal.kongTiles };
  }
  if (legal.canPung && noKim(legal.pungTiles)) {
    const wanted =
      isValuableHonor(tile, obs) || (obs.difficulty === 'hard' ? onPlan : rng() < chance.pung);
    if (wanted) return { seat: obs.seat, action: 'pung', meldTiles: legal.pungTiles };
  }
  if (legal.canJia) {
    const option = legal.jiaOptions.find((o) => o.every((t) => !isKim(t)));
    // Do not break a pair to make a sequence.
    const breaksPair = option?.some((t) => obs.hand.filter((h) => isSameKind(h, t)).length >= 2);
    const wanted = obs.difficulty === 'hard' ? onPlan && share >= 0.6 : rng() < chance.jia && onPlan;
    if (option && !breaksPair && wanted) return { seat: obs.seat, action: 'jia', meldTiles: option };
  }
  return pass;
}

/**
 * Optional hook: if a richer AI module is registered (e.g. from src/ai/), the controller
 * delegates to it; otherwise the built-in heuristics above are used.
 */
export interface AIStrategy {
  decideTurnAction(obs: AIObservation, rng: () => number): AITurnAction;
  decideClaim(obs: AIObservation, rng: () => number): ClaimDeclaration;
}

export const builtInStrategy: AIStrategy = { decideTurnAction, decideClaim };

/** Public explanation after a built-in discard; never enumerates concealed tiles or candidates.
 * Reads the same heuristic inputs without drawing RNG, so seeded decisions stay unchanged.
 */
export function explainDiscardChoice(obs: AIObservation, tileId: string): string | null {
  const tile = obs.hand.find(t => t.id === tileId);
  if (!tile || !obs.legal.discardableTileIds.includes(tileId)) return null;
  const visible = visibleKindCounts(obs);
  const allowed = new Set(obs.legal.discardableTileIds);
  const candidates = obs.hand.filter(t => allowed.has(t.id) && ((obs.rules.kimMode !== 'natural' && obs.rules.kimDiscardAllowed) || !isKim(t)));
  if (!candidates.some(t => t.id === tileId)) return null;
  const value = tileKeepValue(tile, obs, visible);
  const lowest = candidates.every(t => value <= tileKeepValue(t, obs, visible));
  const choice = lowest ? 'termasuk nilai retensi terendah' : 'terpilih setelah variasi acak pada nilai retensi';
  const random = obs.difficulty === 'easy' ? ' Mode Mudah menambahkan variasi acak besar; pilihan ini bukan jaminan terbaik.'
    : obs.difficulty === 'normal' ? ' Mode Normal memakai variasi acak kecil.' : ' Mode Sulit tidak menambahkan variasi acak.';
  // Only the now-public discarded tile is named. No scores or hand composition are exposed.
  const publicFactor = isTerminal(tile) ? ' Tile ujung mendapat pengurang nilai retensi dalam strategi ini.'
    : isHonor(tile) && isValuableHonor(tile, obs) ? ' Honor ini memiliki potensi Tay jika menjadi Tris; faktor itu ikut dihitung.' : '';
  return `${tileText(tile)} ${choice}.${publicFactor} Penilaian mempertimbangkan kecocokan kelompok, potensi Tay, dan tile yang terlihat.${random}`;
}
