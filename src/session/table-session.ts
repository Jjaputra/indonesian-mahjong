import { GameEngine, canFormWinningHand, type GameEngineState } from '../core/game-engine';
import { SEAT_ORDER, sortTiles, createCompleteTileSet } from '../core/tiles';
import type { ClaimActionType, LegalActions, Meld, Seat, Tile } from '../core/types';
import { Wall, createGameWall, shuffleTiles, type SerializedWall } from '../core/wall';
import { kongPayment, type KongPayment } from '../core/round-score';
import { canFormWinningHandWithKim, isKim } from '../kim/wildcard-solver';
import type { AIDifficulty, GameSettings } from '../storage';
import { buildObservation, builtInStrategy, evaluateSelfDrawHu, evaluateDiscardHu } from './ai-controller';
import { toFullRules, toScoringOverlap } from './win-context';
import { createMatch, recordHand, isMatchOver, type MatchState } from './match';

export type SessionAction = (
  | { type: 'draw' | 'selfHu' | 'paoChin' | 'pass' | 'nextHand' }
  | { type: 'discard'; tileId: string }
  | { type: 'ankong'; tileIds: string[] }
  | { type: 'kakan'; tileId: string; meldIndex: number }
  | { type: 'claim'; kind: Exclude<ClaimActionType, 'pass'>; tileIds?: string[] }
) & { version: number };
export type Result = { ok: true; version: number } | { ok: false; code: 'stale_version' | 'illegal_action' | 'not_due'; message: string };
/** A numeric replay seed, or independent random words for every shuffle decision. */
export type HandSeed = number | number[];
export interface SessionOptions {
  settings: GameSettings;
  seats: Record<Seat, 'human' | 'bot'>;
  seed: number;
  now: () => number;
  handSeed?: () => HandSeed;
  botLevel?: AIDifficulty;
  hostSeat?: Seat;
  turnTimeMs?: number;
}
export interface PendingDecision { seat: Seat; kind: 'turn' | 'claim'; deadline: number }
export interface SeatActions extends LegalActions {
  canDraw: boolean;
  selfHuScore: ReturnType<typeof evaluateSelfDrawHu>;
  discardHuScore: ReturnType<typeof evaluateDiscardHu>;
}
export interface PublicSessionPlayer {
  seat: Seat;
  melds: Meld[];
  flowers: Tile[];
  discards: Tile[];
  concealedCount: number;
  isPaoChin: boolean;
  connected: boolean;
  afk: boolean;
}
export interface LastHand {
  winner: Seat | null;
  winMethod: 'tsumo' | 'ron' | 'chiong_kong' | 'draw';
  discarder: Seat | null;
  hand: Tile[];
  melds: Meld[];
  breakdown: { pattern: string; tay: number }[];
  payments: MatchState['hands'][number];
}
export interface SerializedSession {
  lastHand?: LastHand | null;
  handSeed?: HandSeed;
  schema: 1;
  options: Omit<SessionOptions, 'now' | 'handSeed'>;
  state: Omit<GameEngineState, 'wall'> & { wall: SerializedWall };
  match: MatchState;
  payments: KongPayment[];
  version: number;
  rngState: number;
  handIndex: number;
  decisions: PendingDecision[];
  claimDeadline: number | null;
  presence: Record<Seat, { connected: boolean; afk: boolean }>;
}
const copy = <T>(value: T): T => structuredClone(value);

/** Authoritative, transport-free table. Only viewFor is suitable for clients. */
export class TableSession {
  private engine!: GameEngine;
  private readonly options: Omit<SessionOptions, 'now' | 'handSeed'>;
  private readonly now: () => number;
  private match: MatchState;
  private payments: KongPayment[] = [];
  private lastHand: LastHand | null = null;
  private decisions: PendingDecision[] = [];
  private claimDeadline: number | null = null;
  private rngState: number;
  private handIndex = 0;
  private handSeed?: HandSeed;
  private handSeedSource?: () => HandSeed;
  private presence = Object.fromEntries(SEAT_ORDER.map(seat => [seat, { connected: true, afk: false }])) as SerializedSession['presence'];
  version = 0;

  constructor({ now, handSeed, ...options }: SessionOptions) {
    if (!Number.isFinite(options.seed) || !Number.isFinite(options.turnTimeMs ?? 15000) || (options.turnTimeMs ?? 15000) <= 0) throw new Error('Invalid session configuration');
    this.now = now;
    this.handSeedSource = handSeed;
    this.options = copy(options);
    this.rngState = options.seed;
    this.match = createMatch(options.settings.startingSeatWind, options.settings.roundWind, options.settings.minHuTay, 'rotate', null, now());
    this.deal();
    this.normalize();
  }

  private get state() { return this.engine.getState(); }
  private random = (): number => {
    // Mulberry32, with its state persisted between decisions and evictions.
    this.rngState = (this.rngState + 0x6D2B79F5) | 0;
    let t = this.rngState;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t = (t + Math.imul(t ^ t >>> 7, t | 61)) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  private deal(): void {
    this.lastHand = null;
    const rules = toFullRules(this.options.settings);
    this.handSeed = copy(this.handSeedSource?.() ?? this.options.seed + this.handIndex);
    const seed = this.handSeed;
    if (Array.isArray(seed) ? seed.length < 148 || seed.some(word => !Number.isInteger(word) || word < 0 || word > 0xffffffff) : !Number.isFinite(seed)) throw new Error('Invalid hand seed');
    this.handIndex++;
    let wall = createGameWall(rules.kimMode ?? (rules.kimEnabled ? 'dedicated' : 'off'), Array.isArray(seed) ? seed[0]! : seed).wall;
    if (Array.isArray(seed)) {
      // The indicator is already public. Shuffle the private wall with independent CSPRNG
      // words, rather than compressing server entropy into Mulberry32's 32-bit state.
      const data = wall.serialize();
      let index = 1;
      wall = Wall.deserialize({ ...data, tiles: shuffleTiles(data.tiles, () => seed[index++]! / 0x100000000) });
    }
    this.engine = new GameEngine(rules, wall, {
      dealerSeat: this.match.seating.dealer, roundWind: this.match.seating.prevailingWind,
      huValidator: (hand, melds, tile) => canFormWinningHand([...hand, tile], rules.kimEnabled) || canFormWinningHandWithKim([...hand, tile], melds, rules),
    });
    this.engine.startNewGame(true, wall);
    this.payments = [];
    for (const seat of SEAT_ORDER) this.state.players[seat].isHuman = this.options.seats[seat] === 'human';
  }

  private observation(seat: Seat) {
    return buildObservation(this.state, seat, this.engine.getLegalActions(seat), this.options.botLevel ?? this.options.settings.aiDifficulty, toFullRules(this.options.settings), toScoringOverlap(this.options.settings.overlapPolicy));
  }

  private actions(seat: Seat): SeatActions {
    const obs = this.observation(seat), legal = obs.legal;
    if (this.state.phase === 'CLAIM_WINDOW' && this.state.pendingClaims[seat]) Object.assign(legal, {
      canPass: false, canDiscardWinHu: false, canPung: false, canKong: false, canJia: false,
      pungTiles: undefined, kongTiles: undefined, jiaOptions: [],
    });
    const selfHuScore = legal.canSelfDrawHu ? evaluateSelfDrawHu(obs) : null;
    const discardHuScore = legal.canDiscardWinHu ? evaluateDiscardHu(obs) : null;
    const canPaoChin = legal.canPaoChin && obs.hand.some(tile => legal.discardableTileIds.includes(tile.id)
      && createCompleteTileSet().some(probe => canFormWinningHand(obs.hand.filter(t => t.id !== tile.id).concat(probe), obs.rules.kimEnabled)));
    return { ...legal, canSelfDrawHu: !!selfHuScore?.isValidHu, canDiscardWinHu: !!discardHuScore?.isValidHu,
      canPaoChin, canDraw: this.state.currentTurn === seat && this.state.phase === 'TURN_DRAW', selfHuScore, discardHuScore };
  }

  private claimable(seat: Seat): boolean {
    const a = this.actions(seat);
    return a.canDiscardWinHu || a.canPung || a.canKong || a.canJia;
  }

  /** Auto-pass seats without prompts; resolve only after all eligible seats answer. */
  private normalize(): void {
    if (this.state.phase === 'CLAIM_WINDOW') {
      // Public window timing is fixed before checking any concealed hand.
      this.claimDeadline ??= this.now() + (this.options.turnTimeMs ?? 15000);
      for (const seat of SEAT_ORDER) {
        if (seat !== this.state.discardPending!.discarder && !this.state.pendingClaims[seat] && !this.claimable(seat)) this.engine.submitClaim({ seat, action: 'pass' });
      }
      const pending = this.state.discardPending!;
      if (SEAT_ORDER.every(seat => seat === pending.discarder || this.state.pendingClaims[seat])) {
        const scores = new Map(SEAT_ORDER.map(seat => [seat, this.state.pendingClaims[seat]?.action === 'hu' ? evaluateDiscardHu(this.observation(seat)) : null]));
        const result = this.engine.resolveClaimWindow();
        if (result.winningAction === 'hu') {
          this.settle(result.winnerSeat!, scores.get(result.winnerSeat!)!.totalTay, pending.isPromotedKong ? 'chiong_kong' : 'ron', pending.discarder, scores.get(result.winnerSeat!)?.patterns);
        } else if (result.winningAction === 'kong' || pending.isPromotedKong) {
          this.payments.push(kongPayment(result.winningAction === 'kong' ? result.nextTurn : pending.discarder, pending.tile, false));
        }
      }
    }
    if (this.state.phase !== 'CLAIM_WINDOW') this.claimDeadline = null;
    if (this.state.phase === 'DRAW_SERI' && this.match.hands.length < this.handIndex) this.settle(null, 0);
    const deadline = this.now() + (this.options.turnTimeMs ?? 15000);
    const waiting: PendingDecision[] = [];
    if (this.state.phase === 'ACTION_DECISION' || this.state.phase === 'TURN_DRAW') waiting.push({ seat: this.state.currentTurn, kind: 'turn', deadline });
    if (this.state.phase === 'CLAIM_WINDOW') for (const seat of SEAT_ORDER) {
      if (seat !== this.state.discardPending!.discarder && !this.state.pendingClaims[seat]) waiting.push({ seat, kind: 'claim', deadline });
    }
    // An answer from another seat must not extend the original claim deadline.
    this.decisions = waiting.map(d => ({ ...d, deadline: d.kind === 'claim' ? this.claimDeadline! : this.decisions.find(old => old.seat === d.seat && old.kind === d.kind)?.deadline ?? deadline }));
  }

  private settle(winner: Seat | null, tay: number, winMethod?: 'tsumo' | 'ron' | 'chiong_kong', discarder?: Seat, patterns: { name: string; tay: number }[] = []): void {
    this.match = recordHand(this.match, winner, winner !== null, tay, this.now(), winMethod ? { winMethod, discarder } : undefined, this.payments);
    const player = winner ? this.state.players[winner] : null;
    this.lastHand = { winner, winMethod: winMethod ?? 'draw', discarder: discarder ?? null,
      hand: copy(player?.hand ?? []), melds: copy(player?.melds ?? []),
      breakdown: patterns.map(p => ({ pattern: p.name, tay: p.tay })), payments: copy(this.match.hands.at(-1)!) };

  }

  apply(seat: Seat, action: SessionAction): Result {
    if (action.version !== this.version) return { ok: false, code: 'stale_version', message: 'Versi meja sudah berubah.' };
    // Transactional rollback also protects against partial engine mutations on a failed action.
    const before = this.serialize();
    try {
      if (!SEAT_ORDER.includes(seat)) throw new Error('Posisi tidak valid.');
      const legal = this.actions(seat);
      const tiles = (ids: string[]) => {
        if (new Set(ids).size !== ids.length) throw new Error('Tile duplikat.');
        return ids.map(id => { const t = this.state.players[seat].hand.find(t => t.id === id); if (!t) throw new Error('Tile tidak ada.'); return t; });
      };
      switch (action.type) {
        case 'nextHand':
          if (seat !== (this.options.hostSeat ?? 'dong') || !['DRAW_SERI', 'RESOLVED_HU'].includes(this.state.phase) || isMatchOver(this.match)) throw new Error('Tidak bisa lanjut hand.');
          this.deal(); break;
        case 'draw': if (!legal.canDraw) throw new Error('Tidak bisa tarik.'); this.engine.startTurnDraw(seat); break;
        case 'discard': this.engine.discard(seat, action.tileId); break;
        case 'ankong': {
          if (!legal.ankongOptions.some(group => group.length === action.tileIds.length && group.every(t => action.tileIds.includes(t.id)))) throw new Error('Ankong tidak valid.');
          const group = tiles(action.tileIds); this.engine.declareAnkong(seat, group); this.payments.push(kongPayment(seat, group[0]!, true)); break;
        }
        case 'kakan':
          if (!legal.kakanOptions.some(o => o.tile.id === action.tileId && o.meldIndex === action.meldIndex)) throw new Error('Kakan tidak valid.');
          this.engine.declareKakan(seat, action.tileId, action.meldIndex); break;
        case 'selfHu':
          if (!legal.canSelfDrawHu) throw new Error('Hu tidak valid.');
          this.engine.declareSelfDrawHu(seat); this.settle(seat, legal.selfHuScore!.totalTay, 'tsumo', undefined, legal.selfHuScore!.patterns); break;
        case 'paoChin': if (!legal.canPaoChin || !this.engine.declarePaoChin(seat)) throw new Error('Pao Chin tidak valid.'); break;
        case 'claim': case 'pass': {
          if (!this.decisions.some(d => d.seat === seat && d.kind === 'claim')) throw new Error('Tidak ada klaim.');
          const kind = action.type === 'claim' ? action.kind : 'pass';
          if (!['pass', 'hu', 'pung', 'kong', 'jia'].includes(kind)) throw new Error('Klaim tidak dikenal.');
          if (kind === 'hu' && !legal.canDiscardWinHu) throw new Error('Hu tidak valid.');
          const ids = action.type === 'claim' ? action.tileIds : undefined;
          this.engine.submitClaim({ seat, action: kind, meldTiles: ids ? tiles(ids) : undefined }); break;
        }
        default: throw new Error('Aksi tidak dikenal.');
      }
      this.presence[seat].afk = false;
      // Keep a claim window's deadlines, but start a fresh clock after every turn action.
      if (action.type !== 'paoChin' && action.type !== 'draw' && (before.state.phase !== 'CLAIM_WINDOW' || this.state.phase !== 'CLAIM_WINDOW')) this.decisions = [];
      this.normalize();
      this.version++;
      return { ok: true, version: this.version };
    } catch (error) {
      this.restore(before);
      return { ok: false, code: 'illegal_action', message: error instanceof Error ? error.message : 'Aksi tidak valid.' };
    }
  }

  pendingDecisions(): PendingDecision[] { return copy(this.decisions); }

  timeout(seat: Seat): Result {
    const before = this.serialize();
    try {
      const decision = this.decisions.find(d => d.seat === seat);
      if (!decision || this.now() < decision.deadline) return { ok: false, code: 'not_due', message: 'Waktu belum habis.' };
      if (decision.kind === 'claim') {
        this.engine.submitClaim({ seat, action: 'pass' });
      } else {
        if (this.state.phase === 'TURN_DRAW') this.engine.startTurnDraw(seat);
        if (this.state.phase === 'ACTION_DECISION') {
          const p = this.state.players[seat];
          const tile = this.state.selfDrawSeat === seat ? p.hand.at(-1) : sortTiles(p.hand).at(-1);
          if (!tile) throw new Error('Timeout without a tile');
          // Proposed multiplayer exception: a timed-out Kim is discarded too. Restore the
          // ordinary engine rules immediately; manual Kim discards remain forbidden.
          const rules = this.state.rules;
          const saved = { ...rules };
          Object.assign(rules, { kimMode: 'dedicated', kimDiscardAllowed: true });
          try { this.engine.discard(seat, tile.id); } finally { Object.assign(rules, saved); }
        }
        this.decisions = [];
      }
      this.presence[seat].afk = true;
      this.normalize();
      this.version++;
      return { ok: true, version: this.version };
    } catch (error) {
      this.restore(before);
      return { ok: false, code: 'illegal_action', message: error instanceof Error ? error.message : 'Aksi tidak valid.' };
    }
  }

  /** One bot decision per call, so a host controls pacing. Never drives human seats. */
  stepBots(): boolean {
    const d = this.decisions.find(d => this.options.seats[d.seat] === 'bot');
    if (!d) return false;
    const obs = this.observation(d.seat);
    let action: SessionAction;
    let forceKim = false;
    if (d.kind === 'claim') {
      const c = builtInStrategy.decideClaim(obs, this.random);
      action = c.action === 'pass' ? { type: 'pass', version: this.version } : { type: 'claim', kind: c.action, tileIds: c.meldTiles?.map(t => t.id), version: this.version };
    } else if (this.state.phase === 'TURN_DRAW') action = { type: 'draw', version: this.version };
    else {
      const a = builtInStrategy.decideTurnAction(obs, this.random);
      forceKim = a.type === 'discard' && a.forcedKim === true && obs.legal.discardableTileIds.length === 0 && obs.hand.every(isKim);
      action = a.type === 'hu' ? { type: 'selfHu', version: this.version } : a.type === 'ankong' ? { type: 'ankong', tileIds: a.tiles.map(t => t.id), version: this.version } : { ...a, version: this.version };
    }
    if (!forceKim) return this.apply(d.seat, action).ok;
    // Only an all-Kim bot hand may use the same narrow exception as a timeout.
    const saved = { ...this.state.rules };
    Object.assign(this.state.rules, { kimMode: 'dedicated', kimDiscardAllowed: true });
    try { return this.apply(d.seat, action).ok; }
    finally { Object.assign(this.state.rules, saved); }
  }

  setConnected(seat: Seat, connected: boolean): void {
    if (this.presence[seat].connected !== connected) { this.presence[seat].connected = connected; this.version++; }
  }

  viewFor(seat: Seat | null) {
    const s = this.state;
    return copy({
      version: this.version, phase: s.phase, currentTurn: s.currentTurn, dealer: s.dealerSeat, roundWind: s.roundWind,
      kimFace: s.kimFace ? { type: s.kimFace.type, value: s.kimFace.value } : null, indicator: s.kimIndicator,
      wallCount: s.wall.remainingCount, pendingDiscard: s.discardPending,
      hand: seat ? s.players[seat].hand : [], drawnTileId: seat && s.selfDrawSeat === seat ? s.players[seat].hand.at(-1)?.id ?? null : null,
      legal: seat ? this.actions(seat) : null,
      players: Object.fromEntries(SEAT_ORDER.map(chair => { const p = s.players[chair]; return [chair, { seat: chair, melds: p.melds, flowers: p.flowers, discards: p.discards, concealedCount: p.hand.length, isPaoChin: p.isPaoChin, ...this.presence[chair] }]; })) as Record<Seat, PublicSessionPlayer>,
      pendingDecisions: this.decisions.filter(d => d.seat === seat).map(d => ({ ...d, deadline: d.deadline as number | null })),
      claimWindow: s.phase === 'CLAIM_WINDOW' ? { deadline: this.claimDeadline as number | null } : null,
      deadline: s.phase === 'CLAIM_WINDOW' ? this.claimDeadline : this.decisions.find(d => d.kind === 'turn')?.deadline ?? null,
      lastHand: this.lastHand, match: this.match, lastHandResult: this.match.hands.at(-1) ?? null, matchOver: isMatchOver(this.match),
    });
  }

  serialize(): SerializedSession {
    return copy({ handSeed: this.handSeed, lastHand: this.lastHand, schema: 1, options: this.options, state: { ...this.state, wall: this.state.wall.serialize() }, match: this.match, payments: this.payments, version: this.version, rngState: this.rngState, handIndex: this.handIndex, decisions: this.decisions, claimDeadline: this.claimDeadline, presence: this.presence });
  }

  private restore(data: SerializedSession): void {
    Object.assign(this.engine.getState(), copy(data.state), { wall: Wall.deserialize(copy(data.state.wall)) });
    this.handSeed = data.handSeed;
    this.lastHand = copy(data.lastHand ?? null);
    this.match = copy(data.match); this.payments = copy(data.payments); this.version = data.version;
    this.rngState = data.rngState; this.handIndex = data.handIndex; this.decisions = copy(data.decisions); this.presence = copy(data.presence);
    this.claimDeadline = data.claimDeadline;
  }

  static deserialize(data: SerializedSession, now: () => number, handSeed?: () => HandSeed): TableSession {
    if (data.schema !== 1) throw new Error('Unsupported session schema');
    const session = new TableSession({ ...data.options, now });
    session.restore(data);
    session.handSeedSource = handSeed;
    return session;
  }
}

export type SeatView = ReturnType<TableSession['viewFor']>;
