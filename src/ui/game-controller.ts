/**
 * UI-side game loop around the core GameEngine: drives AI seats step by step, exposes the
 * human's legal actions (with the minimum-Tay Hu gate), scores the final hand with the 44-Tay
 * engine and records finished games in storage. Pure TypeScript, so it runs under Vitest in node.
 */
import { GameEngine, canFormWinningHand, type GameEngineState } from '../core/game-engine';
import { SEAT_ORDER, isSameKind } from '../core/tiles';
import type { ClaimDeclaration, LegalActions, Meld, Seat, Tile } from '../core/types';
import { Wall, createMulberry32 } from '../core/wall';
import { canFormWinningHandWithKim } from '../kim/wildcard-solver';
import type { ScoringResult } from '../scoring';
import { saveGameRecord, type GameSettings, type StorageLike, type WinMethod } from '../storage';
import { buildObservation, builtInStrategy, chooseDiscard, isFirstGoAround, type AIStrategy } from './ai-controller';
import { MELD_LABEL, PLAYER_NAME, SEAT_SHORT, tileText } from './labels';
import { scoreHu, toFullRules, toScoringOverlap, type FullRules, type WinFlags } from './win-context';

export type GameEventType = 'draw' | 'discard' | 'jia' | 'pung' | 'kong' | 'flower' | 'hu' | 'lewFit' | 'seri';

export interface GameEvent {
  type: GameEventType;
  seat?: Seat;
}

export interface LogEntry {
  id: number;
  seat?: Seat;
  text: string;
}

export interface HuOutcome {
  kind: 'hu';
  winner: Seat;
  winningTile: Tile;
  winMethod: Exclude<WinMethod, 'draw'>;
  discarder?: Seat;
  /** Concealed tiles including the winning tile */
  hand: Tile[];
  melds: Meld[];
  flowers: Tile[];
  scoring: ScoringResult;
  durationSeconds: number;
}

export interface SeriOutcome {
  kind: 'seri';
  durationSeconds: number;
}

export type GameOutcome = HuOutcome | SeriOutcome;

export interface ClaimOptions {
  tile: Tile;
  discarder: Seat;
  isPromotedKong: boolean;
  /** Hu is legal: complete hand AND >= minimum Tay */
  canHu: boolean;
  /** Scoring of the potential Hu when the hand is structurally complete (shown even below the minimum) */
  huScore: ScoringResult | null;
  canPung: boolean;
  canKong: boolean;
  jiaOptions: Tile[][];
}

export interface HumanActions {
  canDraw: boolean;
  canDiscard: boolean;
  discardableTileIds: string[];
  ankongOptions: Tile[][];
  kakanOptions: { meldIndex: number; tile: Tile }[];
  canSelfDrawHu: boolean;
  selfHuScore: ScoringResult | null;
  canPaoChin: boolean;
  canReplaceFlowers: boolean;
  /** Present while the human must answer a claim window */
  claim: ClaimOptions | null;
}

export interface GameControllerOptions {
  settings: GameSettings;
  /** Base seed for deterministic walls and AI choices (game n uses seed + n) */
  seed?: number;
  humanSeat?: Seat;
  strategy?: AIStrategy;
  storage?: StorageLike;
  /** Persist finished games to history (default true) */
  saveHistory?: boolean;
  now?: () => number;
}

const MAX_LOG = 80;

function claimKey(state: Readonly<GameEngineState>): string {
  const p = state.discardPending;
  return p ? `${state.turnCount}:${p.discarder}:${p.tile.id}:${p.isPromotedKong ? 'k' : 'd'}` : '';
}

/** True when 13 concealed tiles are one tile away from Hu (used to gate Pao Chin). */
export function isReadyHand(tiles: readonly Tile[], kimEnabled: boolean, probe: readonly Tile[]): boolean {
  if (tiles.length !== 13) return false;
  return probe.some((t) => canFormWinningHand([...tiles, t], kimEnabled));
}

const PROBE_TILES: Tile[] = (() => {
  const out: Tile[] = [];
  for (const type of ['tong', 'sok', 'ban'] as const) {
    for (let v = 1; v <= 9; v++) out.push({ id: `probe-${type}-${v}`, type, value: v });
  }
  for (let v = 1; v <= 4; v++) out.push({ id: `probe-wind-${v}`, type: 'wind', value: v });
  for (let v = 1; v <= 3; v++) out.push({ id: `probe-dragon-${v}`, type: 'dragon', value: v });
  return out;
})();

export class GameController {
  readonly humanSeat: Seat;
  private engine!: GameEngine;
  /** Settings of the game in progress */
  private settings: GameSettings;
  /** Settings to use from the next game */
  private nextSettings: GameSettings;
  private rules: FullRules;
  private readonly strategy: AIStrategy;
  private readonly storage?: StorageLike;
  private readonly saveHistory: boolean;
  private readonly now: () => number;
  private readonly baseSeed?: number;
  private gameIndex = 0;
  private rng: () => number = Math.random;
  private startedAt = 0;
  private aiClaimsFor = '';
  private humanAnsweredFor = '';
  private logSeq = 0;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(e: GameEvent) => void>();

  outcome: GameOutcome | null = null;
  log: LogEntry[] = [];
  /** Id of the tile the human just drew (highlighted on the right of the hand) */
  humanDrawnTileId: string | null = null;
  /** Discard currently on the table, for last-discard highlighting */
  lastDiscard: { seat: Seat; tile: Tile } | null = null;
  /** Committed (unclaimed) discards in table order */
  discardTrail: { seat: Seat; tile: Tile }[] = [];
  /** Bumped on every change so React can re-render */
  version = 0;

  constructor(options: GameControllerOptions) {
    this.settings = { ...options.settings };
    this.nextSettings = { ...options.settings };
    this.rules = toFullRules(this.settings);
    this.humanSeat = options.humanSeat ?? 'dong';
    this.strategy = options.strategy ?? builtInStrategy;
    this.storage = options.storage;
    this.saveHistory = options.saveHistory ?? true;
    this.now = options.now ?? Date.now;
    this.baseSeed = options.seed;
    this.newGame();
  }

  // --------------------------------------------------------------------------
  // Subscriptions
  // --------------------------------------------------------------------------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onEvent(listener: (e: GameEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private changed(): void {
    this.version++;
    for (const l of this.listeners) l();
  }

  private emit(type: GameEventType, seat?: Seat): void {
    for (const l of this.eventListeners) l({ type, seat });
  }

  private addLog(text: string, seat?: Seat): void {
    this.log = [...this.log, { id: ++this.logSeq, seat, text }].slice(-MAX_LOG);
  }

  // --------------------------------------------------------------------------
  // Game lifecycle
  // --------------------------------------------------------------------------

  getSettings(): GameSettings {
    return this.settings;
  }

  /**
   * Rule settings take effect from the next game (rules cannot change mid-hand);
   * AI difficulty, animation and sound apply immediately.
   */
  setSettings(settings: GameSettings): void {
    this.nextSettings = { ...settings };
    this.settings = {
      ...this.settings,
      aiDifficulty: settings.aiDifficulty,
      animationSpeed: settings.animationSpeed,
      soundEnabled: settings.soundEnabled,
    };
    this.changed();
  }

  getState(): Readonly<GameEngineState> {
    return this.engine.getState();
  }

  newGame(): void {
    this.settings = { ...this.nextSettings };
    this.rules = toFullRules(this.settings);
    const seed = this.baseSeed === undefined ? undefined : this.baseSeed + this.gameIndex;
    this.gameIndex++;
    this.rng = seed === undefined ? Math.random : createMulberry32(seed * 7919 + 17);
    const rules = this.rules;
    this.engine = new GameEngine(rules, undefined, {
      dealerSeat: this.settings.startingSeatWind,
      roundWind: this.settings.roundWind,
      huValidator: (hand, melds, winningTile) => {
        const full = [...hand, winningTile];
        return canFormWinningHand(full, rules.kimEnabled) || canFormWinningHandWithKim(full, melds, rules);
      },
    });
    const auto = this.settings.flowerReplacementMode === 'auto';
    const wall = seed === undefined ? new Wall() : new Wall(undefined, seed);
    const records = this.engine.startNewGame(auto, wall);
    this.outcome = null;
    this.log = [];
    this.aiClaimsFor = '';
    this.humanAnsweredFor = '';
    this.lastDiscard = null;
    this.discardTrail = [];
    this.humanDrawnTileId = null;
    this.startedAt = this.now();
    this.addLog(`Permainan baru dimulai. Dealer: ${SEAT_SHORT[this.settings.startingSeatWind]}.`);
    this.logFlowerRecords(records);
    this.checkSeri();
    this.changed();
  }

  private logFlowerRecords(records: { seat: Seat; flowers: Tile[] }[]): void {
    for (const r of records) {
      this.addLog(`${PLAYER_NAME[r.seat]} membuka ${r.flowers.map(tileText).join(', ')} dan mengganti dari ekor tembok.`, r.seat);
      this.emit('flower', r.seat);
    }
  }

  private flowerCounts(): Record<Seat, number> {
    const s = this.getState();
    return { dong: s.players.dong.flowers.length, nan: s.players.nan.flowers.length, xi: s.players.xi.flowers.length, bei: s.players.bei.flowers.length };
  }

  private logNewFlowers(before: Record<Seat, number>): void {
    const s = this.getState();
    for (const seat of SEAT_ORDER) {
      const fresh = s.players[seat].flowers.slice(before[seat]);
      if (fresh.length) this.logFlowerRecords([{ seat, flowers: fresh }]);
    }
  }

  private durationSeconds(): number {
    return Math.max(0, Math.round((this.now() - this.startedAt) / 1000));
  }

  private checkSeri(): boolean {
    if (this.getState().phase !== 'DRAW_SERI' || this.outcome) return false;
    this.outcome = { kind: 'seri', durationSeconds: this.durationSeconds() };
    this.addLog('Tembok habis — permainan Seri (tidak ada pemenang).');
    this.emit('seri');
    this.record();
    return true;
  }

  private record(): void {
    if (!this.saveHistory || !this.outcome) return;
    const o = this.outcome;
    if (o.kind === 'seri') {
      saveGameRecord(
        { winner: null, winningHand: [], winningTile: null, scoringBreakdown: [], totalTay: 0, isWithKim: false, winMethod: 'draw', durationSeconds: o.durationSeconds },
        this.storage
      );
      return;
    }
    saveGameRecord(
      {
        winner: o.winner,
        winningHand: [...o.hand, ...o.melds.flatMap((m) => m.tiles)],
        winningTile: o.winningTile,
        scoringBreakdown: o.scoring.patterns.map((p) => ({ id: p.id, name: p.name, tay: p.tay })),
        totalTay: o.scoring.totalTay,
        isWithKim: o.scoring.isWithKim,
        winMethod: o.winMethod,
        durationSeconds: o.durationSeconds,
      },
      this.storage
    );
  }

  // --------------------------------------------------------------------------
  // Scoring helpers
  // --------------------------------------------------------------------------

  private flagsFor(seat: Seat, isSelfDraw: boolean): WinFlags {
    const s = this.getState();
    return {
      isSelfDraw,
      isRobbingKong: !isSelfDraw && !!s.discardPending?.isPromotedKong,
      consecutiveKongs: s.consecutiveKongs,
      isFirstGoAround: isFirstGoAround(s),
      isPaoChin: s.players[seat].isPaoChin,
      discarderSeat: isSelfDraw ? undefined : s.discardPending?.discarder,
    };
  }

  private scoreSelfDraw(seat: Seat): ScoringResult | null {
    const p = this.getState().players[seat];
    const winningTile = p.hand[p.hand.length - 1];
    if (!winningTile) return null;
    return scoreHu(
      { hand: p.hand.slice(0, -1), melds: p.melds, flowers: p.flowers, winningTile },
      seat,
      this.getState().roundWind,
      this.flagsFor(seat, true),
      this.rules,
      toScoringOverlap(this.settings.overlapPolicy)
    );
  }

  private scoreDiscard(seat: Seat): ScoringResult | null {
    const s = this.getState();
    if (!s.discardPending) return null;
    const p = s.players[seat];
    return scoreHu(
      { hand: p.hand, melds: p.melds, flowers: p.flowers, winningTile: s.discardPending.tile },
      seat,
      s.roundWind,
      this.flagsFor(seat, false),
      this.rules,
      toScoringOverlap(this.settings.overlapPolicy)
    );
  }

  private finishHu(seat: Seat, scoring: ScoringResult, winMethod: HuOutcome['winMethod'], discarder?: Seat): void {
    const s = this.getState();
    const p = s.players[seat];
    const winningTile = s.winningTile ?? p.hand[p.hand.length - 1]!;
    this.outcome = {
      kind: 'hu',
      winner: seat,
      winningTile,
      winMethod,
      discarder,
      hand: [...p.hand],
      melds: p.melds.map((m) => ({ ...m, tiles: [...m.tiles] })),
      flowers: [...p.flowers],
      scoring,
      durationSeconds: this.durationSeconds(),
    };
    const how = winMethod === 'tsumo' ? 'Ce Mo' : winMethod === 'chiong_kong' ? 'Chiong Kong' : `buangan ${PLAYER_NAME[discarder!]}`;
    this.addLog(`${PLAYER_NAME[seat]} HU! (${how}, ${tileText(winningTile)}) — ${scoring.totalTay} Tay.`, seat);
    this.emit(scoring.isValidHu ? 'hu' : 'lewFit', seat);
    this.record();
  }

  // --------------------------------------------------------------------------
  // Human view
  // --------------------------------------------------------------------------

  private legal(seat: Seat): LegalActions {
    return this.engine.getLegalActions(seat);
  }

  /** The human must act before the game can continue. */
  isWaitingForHuman(): boolean {
    if (this.outcome) return false;
    const s = this.getState();
    const me = this.humanSeat;
    if (s.phase === 'FLOWER_REPLACEMENT') return this.settings.flowerReplacementMode === 'manual';
    if ((s.phase === 'ACTION_DECISION' || s.phase === 'TURN_DRAW') && s.currentTurn === me) return true;
    if (s.phase === 'CLAIM_WINDOW') return this.humanClaimPending();
    return false;
  }

  private humanClaimPending(): boolean {
    const s = this.getState();
    if (!s.discardPending || s.discardPending.discarder === this.humanSeat) return false;
    if (this.humanAnsweredFor === claimKey(s)) return false;
    const c = this.claimOptions();
    return !!c && (c.canHu || c.canPung || c.canKong || c.jiaOptions.length > 0);
  }

  private claimOptions(): ClaimOptions | null {
    const s = this.getState();
    const pending = s.discardPending;
    if (s.phase !== 'CLAIM_WINDOW' || !pending || pending.discarder === this.humanSeat) return null;
    const legal = this.legal(this.humanSeat);
    const huScore = legal.canDiscardWinHu ? this.scoreDiscard(this.humanSeat) : null;
    return {
      tile: pending.tile,
      discarder: pending.discarder,
      isPromotedKong: !!pending.isPromotedKong,
      canHu: !!huScore?.isValidHu,
      huScore,
      canPung: legal.canPung,
      canKong: legal.canKong,
      jiaOptions: legal.canJia ? legal.jiaOptions : [],
    };
  }

  getHumanActions(): HumanActions {
    const none: HumanActions = {
      canDraw: false,
      canDiscard: false,
      discardableTileIds: [],
      ankongOptions: [],
      kakanOptions: [],
      canSelfDrawHu: false,
      selfHuScore: null,
      canPaoChin: false,
      canReplaceFlowers: false,
      claim: null,
    };
    if (this.outcome) return none;
    const s = this.getState();
    const me = this.humanSeat;
    const p = s.players[me];
    if (s.phase === 'FLOWER_REPLACEMENT') {
      return { ...none, canReplaceFlowers: this.settings.flowerReplacementMode === 'manual' };
    }
    if (s.phase === 'CLAIM_WINDOW') {
      return this.humanClaimPending() ? { ...none, claim: this.claimOptions() } : none;
    }
    if (s.currentTurn !== me) return none;
    const effective = p.hand.length + p.melds.length * 3;
    if ((s.phase === 'TURN_DRAW' || s.phase === 'ACTION_DECISION') && effective === 13) {
      return { ...none, canDraw: true };
    }
    if (s.phase !== 'ACTION_DECISION') return none;
    const legal = this.legal(me);
    const selfHuScore = legal.canSelfDrawHu ? this.scoreSelfDraw(me) : null;
    const canPaoChin =
      legal.canPaoChin &&
      p.melds.length === 0 &&
      p.hand.some((t) => legal.discardableTileIds.includes(t.id) && isReadyHand(p.hand.filter((h) => h.id !== t.id), s.rules.kimEnabled, PROBE_TILES));
    return {
      ...none,
      canDiscard: legal.canDiscard,
      discardableTileIds: legal.discardableTileIds,
      ankongOptions: legal.ankongOptions,
      kakanOptions: legal.kakanOptions,
      canSelfDrawHu: !!selfHuScore?.isValidHu,
      selfHuScore,
      canPaoChin,
    };
  }

  // --------------------------------------------------------------------------
  // Human actions
  // --------------------------------------------------------------------------

  humanReplaceFlowers(): void {
    if (this.getState().phase !== 'FLOWER_REPLACEMENT') return;
    this.logFlowerRecords(this.engine.performInitialFlowerReplacements());
    this.checkSeri();
    this.changed();
  }

  humanDraw(): void {
    if (!this.getHumanActions().canDraw) return;
    this.drawFor(this.humanSeat);
    this.changed();
  }

  humanDiscard(tileId: string): void {
    const a = this.getHumanActions();
    if (!a.canDiscard || !a.discardableTileIds.includes(tileId)) return;
    this.discardFor(this.humanSeat, tileId);
    this.changed();
  }

  humanAnkong(index: number): void {
    const group = this.getHumanActions().ankongOptions[index];
    if (!group) return;
    this.ankongFor(this.humanSeat, group);
    this.changed();
  }

  humanKakan(index: number): void {
    const opt = this.getHumanActions().kakanOptions[index];
    if (!opt) return;
    this.kakanFor(this.humanSeat, opt.tile.id, opt.meldIndex);
    this.changed();
  }

  humanSelfDrawHu(): void {
    const a = this.getHumanActions();
    if (!a.canSelfDrawHu || !a.selfHuScore) return;
    this.engine.declareSelfDrawHu(this.humanSeat);
    this.finishHu(this.humanSeat, a.selfHuScore, 'tsumo');
    this.changed();
  }

  humanPaoChin(): void {
    if (!this.getHumanActions().canPaoChin) return;
    if (this.engine.declarePaoChin(this.humanSeat)) this.addLog(`${PLAYER_NAME[this.humanSeat]} declare Pao Chin!`, this.humanSeat);
    this.changed();
  }

  /** Answer a claim window: 'hu' | 'kong' | 'pung' | 'jia' (with option index) | 'pass'. */
  humanClaim(action: ClaimDeclaration['action'], jiaIndex = 0): void {
    const c = this.getHumanActions().claim;
    if (!c) return;
    const decl: ClaimDeclaration = { seat: this.humanSeat, action };
    if (action === 'hu' && !c.canHu) return;
    if (action === 'kong' && !c.canKong) return;
    if (action === 'pung' && !c.canPung) return;
    if (action === 'jia') {
      const option = c.jiaOptions[jiaIndex];
      if (!option) return;
      decl.meldTiles = option;
    }
    this.engine.submitClaim(decl);
    this.humanAnsweredFor = claimKey(this.getState());
    this.changed();
  }

  // --------------------------------------------------------------------------
  // Shared action implementations
  // --------------------------------------------------------------------------

  private drawFor(seat: Seat): void {
    const before = this.flowerCounts();
    const r = this.engine.startTurnDraw(seat);
    this.logNewFlowers(before);
    if (r.drawnTile) {
      this.emit('draw', seat);
      if (seat === this.humanSeat) this.humanDrawnTileId = r.drawnTile.id;
    }
    this.checkSeri();
  }

  private discardFor(seat: Seat, tileId: string): void {
    const r = this.engine.discard(seat, tileId);
    this.lastDiscard = { seat, tile: r.discardedTile };
    if (seat === this.humanSeat) this.humanDrawnTileId = null;
    this.addLog(`${PLAYER_NAME[seat]} buang ${tileText(r.discardedTile)}.`, seat);
    this.emit('discard', seat);
  }

  private ankongFor(seat: Seat, tiles: Tile[]): void {
    const before = this.flowerCounts();
    const r = this.engine.declareAnkong(seat, tiles);
    this.addLog(`${PLAYER_NAME[seat]} Ankong ${tileText(tiles[0]!)}.`, seat);
    this.emit('kong', seat);
    this.logNewFlowers(before);
    if (seat === this.humanSeat) this.humanDrawnTileId = r.replacementTile?.id ?? null;
    this.checkSeri();
  }

  private kakanFor(seat: Seat, tileId: string, meldIndex: number): void {
    this.engine.declareKakan(seat, tileId, meldIndex);
    const tile = this.getState().discardPending?.tile;
    this.addLog(`${PLAYER_NAME[seat]} Kakan (Kong tambahan) ${tile ? tileText(tile) : ''} — menunggu Chiong Kong.`, seat);
    this.emit('kong', seat);
    if (seat === this.humanSeat) this.humanDrawnTileId = null;
  }

  // --------------------------------------------------------------------------
  // Automation
  // --------------------------------------------------------------------------

  private aiObservation(seat: Seat) {
    return buildObservation(
      this.getState(),
      seat,
      this.legal(seat),
      this.settings.aiDifficulty,
      this.rules,
      toScoringOverlap(this.settings.overlapPolicy)
    );
  }

  private aiTurn(seat: Seat): void {
    const s = this.getState();
    const p = s.players[seat];
    if (p.hand.length + p.melds.length * 3 === 13) {
      this.drawFor(seat);
      return;
    }
    const action = this.strategy.decideTurnAction(this.aiObservation(seat), this.rng);
    switch (action.type) {
      case 'hu': {
        const scoring = this.scoreSelfDraw(seat);
        if (scoring?.isValidHu) {
          this.engine.declareSelfDrawHu(seat);
          this.finishHu(seat, scoring, 'tsumo');
          return;
        }
        // A strategy asked for an invalid Hu: never commit a Lew Fit, discard instead.
        const tileId = chooseDiscard(this.aiObservation(seat), this.rng);
        if (tileId) this.discardFor(seat, tileId);
        return;
      }
      case 'ankong':
        this.ankongFor(seat, action.tiles);
        return;
      case 'kakan':
        this.kakanFor(seat, action.tileId, action.meldIndex);
        return;
      case 'discard':
        this.discardFor(seat, action.tileId);
        return;
    }
  }

  private collectAIClaims(): void {
    const s = this.getState();
    const pending = s.discardPending!;
    for (const seat of SEAT_ORDER) {
      if (seat === this.humanSeat || seat === pending.discarder) continue;
      const decl = this.strategy.decideClaim(this.aiObservation(seat), this.rng);
      if (decl.action === 'pass') continue;
      if (decl.action === 'hu' && !this.scoreDiscard(seat)?.isValidHu) continue; // Tay gate
      try {
        this.engine.submitClaim({ ...decl, seat });
      } catch {
        // Illegal claim from a strategy is treated as a pass.
      }
    }
    this.aiClaimsFor = claimKey(s);
  }

  private resolveClaims(): void {
    const s = this.getState();
    const pending = s.discardPending!;
    const claims = Object.values(s.pendingClaims).filter((c): c is ClaimDeclaration => !!c);
    const huClaims = claims.filter((c) => c.action === 'hu');
    // Score every Hu claimant now: the pending discard is cleared by the engine on resolution.
    const huScores = new Map<Seat, ScoringResult>();
    for (const c of huClaims) {
      const r = this.scoreDiscard(c.seat);
      if (r) huScores.set(c.seat, r);
    }
    const before = this.flowerCounts();
    const result = this.engine.resolveClaimWindow();

    if (result.winningAction === 'hu' && result.winnerSeat) {
      this.lastDiscard = null;
      const scoring = huScores.get(result.winnerSeat)!;
      this.finishHu(result.winnerSeat, scoring, pending.isPromotedKong ? 'chiong_kong' : 'ron', pending.discarder);
      return;
    }

    if (result.winningAction === 'kong' || result.winningAction === 'pung' || result.winningAction === 'jia') {
      const claimant = result.nextTurn;
      this.lastDiscard = null;
      this.addLog(`${PLAYER_NAME[claimant]} ${MELD_LABEL[result.winningAction]} ${tileText(pending.tile)} dari ${PLAYER_NAME[pending.discarder]}.`, claimant);
      this.emit(result.winningAction, claimant);
      if (claimant === this.humanSeat) {
        const hand = this.getState().players[claimant].hand;
        this.humanDrawnTileId = result.winningAction === 'kong' ? hand[hand.length - 1]?.id ?? null : null;
      }
    } else if (pending.isPromotedKong) {
      this.addLog(`Kong ${PLAYER_NAME[pending.discarder]} sah; ambil tile pengganti dari ekor tembok.`, pending.discarder);
      if (pending.discarder === this.humanSeat) {
        const hand = this.getState().players[this.humanSeat].hand;
        this.humanDrawnTileId = hand[hand.length - 1]?.id ?? null;
      }
    } else {
      this.discardTrail = [...this.discardTrail, { seat: pending.discarder, tile: pending.tile }];
    }
    if (result.winningAction === 'pass' && !pending.isPromotedKong && this.getState().phase === 'ACTION_DECISION') {
      // All passed: the engine committed the discard and drew for the next seat.
      const next = result.nextTurn;
      this.emit('draw', next);
      if (next === this.humanSeat) {
        const hand = this.getState().players[next].hand;
        this.humanDrawnTileId = hand[hand.length - 1]?.id ?? null;
      }
    }
    this.logNewFlowers(before);
    this.checkSeri();
  }

  /**
   * Advance the game by one automated unit (an AI turn, AI claims, or claim resolution).
   * Returns false when nothing can happen without the human, or the game is over.
   */
  step(): boolean {
    if (this.outcome) return false;
    const s = this.getState();
    let progressed = false;
    switch (s.phase) {
      case 'FLOWER_REPLACEMENT':
        if (this.settings.flowerReplacementMode === 'manual') return false;
        this.logFlowerRecords(this.engine.performInitialFlowerReplacements());
        this.checkSeri();
        progressed = true;
        break;
      case 'TURN_DRAW':
      case 'ACTION_DECISION':
        if (s.currentTurn === this.humanSeat) return false;
        this.aiTurn(s.currentTurn);
        progressed = true;
        break;
      case 'CLAIM_WINDOW': {
        const key = claimKey(s);
        if (this.aiClaimsFor !== key) {
          this.collectAIClaims();
          progressed = true;
          break;
        }
        if (this.humanClaimPending()) return false;
        this.resolveClaims();
        progressed = true;
        break;
      }
      default:
        this.checkSeri();
        return false;
    }
    if (progressed) this.changed();
    return progressed;
  }

  /** Run automation until the human must act or the game ends. Returns steps taken. */
  runUntilHuman(maxSteps = 2000): number {
    let n = 0;
    while (n < maxSteps && this.step()) n++;
    return n;
  }

  /** Number of copies of a kind visible to the human (own hand + public), used by tooltips. */
  countVisible(tile: Tile): number {
    const s = this.getState();
    let n = 0;
    for (const seat of SEAT_ORDER) {
      const p = s.players[seat];
      const pub = [...p.discards, ...p.melds.flatMap((m) => m.tiles), ...(seat === this.humanSeat ? p.hand : [])];
      n += pub.filter((t) => isSameKind(t, tile)).length;
    }
    return n;
  }
}
