import {
  isBonus,
  isKim,
  isSameKind,
  isSuited,
  NEXT_SEAT,
  SEAT_ORDER,
  sortTiles,
} from './tiles';
import {
  ClaimDeclaration,
  ClaimResolutionResult,
  DiscardPendingState,
  DiscardResult,
  FlowerReplacementRecord,
  GameRules,
  HuResult,
  KongResult,
  LegalActions,
  Meld,
  PlayerState,
  Seat,
  Tile,
  TileFace,
  TurnDrawResult,
  TurnPhase,
  Wind,
} from './types';
import { Wall, createGameWall } from './wall';
import { isKimAllowedInClaim } from '../kim/kim-validator';

export const DEFAULT_RULES: GameRules = {
  kimEnabled: true,
  kimDiscardAllowed: false,
  allowKimInMeldClaim: false,
  minHuTay: 5,
};

export interface GameEngineState {
  phase: TurnPhase;
  roundWind: Wind;
  currentTurn: Seat;
  dealerSeat: Seat;
  wall: Wall;
  kimFace?: TileFace | null;
  kimIndicator: TileFace | null;
  players: Record<Seat, PlayerState>;
  discardPending: DiscardPendingState | null;
  pendingClaims: Partial<Record<Seat, ClaimDeclaration>>;
  consecutiveKongs: number;
  /**
   * Seat whose last hand tile is a fresh wall tile (dealer's 14th tile, turn draw or Kong
   * replacement) and may therefore declare Ce Mo. Null after a discard or a Pung/Jia claim.
   */
  selfDrawSeat: Seat | null;
  /** Seats that have discarded this game, claimed or not (closes their Pao Chin window). */
  hasDiscarded: Record<Seat, boolean>;
  turnCount: number;
  winnerSeat?: Seat;
  winningTile?: Tile;
  winType?: 'tsumo' | 'ron' | 'chiong_kong';
  rules: GameRules;
}

export interface GameEngineOptions {
  rules?: Partial<GameRules>;
  dealerSeat?: Seat;
  roundWind?: Wind;
  wall?: Wall;
  huValidator?: (hand: Tile[], melds: Meld[], winningTile: Tile, isSelfDraw: boolean) => boolean;
}

/**
 * Calculates counter-clockwise turn distance from fromSeat to toSeat.
 * 0: same seat
 * 1: immediate next downstream seat (right player, only seat eligible for Jia)
 * 2: opposite seat
 * 3: previous upstream seat (left player)
 */
export function getTurnDistance(fromSeat: Seat, toSeat: Seat): number {
  const fromIdx = SEAT_ORDER.indexOf(fromSeat);
  const toIdx = SEAT_ORDER.indexOf(toSeat);
  return (toIdx - fromIdx + 4) % 4;
}

export function getNextSeat(seat: Seat): Seat {
  return NEXT_SEAT[seat];
}

/**
 * Checks if 14 tiles can form 7 pairs.
 */
function canFormSevenPairs(naturalTiles: readonly Tile[], kimCount: number): boolean {
  if (naturalTiles.length + kimCount !== 14) return false;
  const counts = new Map<string, number>();
  for (const t of naturalTiles) {
    const key = `${t.type}-${t.value}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let oddCount = 0;
  for (const c of counts.values()) {
    if (c % 2 !== 0) oddCount++;
  }
  if (kimCount < oddCount) return false;
  const remainingKims = kimCount - oddCount;
  return remainingKims % 2 === 0;
}

/**
 * Recursive meld checker helper for standard 4 melds + 1 pair.
 */
function canFormMelds(counts: Map<string, number>, kimCount: number, meldsNeeded: number): boolean {
  if (meldsNeeded === 0) {
    for (const c of counts.values()) {
      if (c > 0) return false;
    }
    return kimCount % 3 === 0;
  }

  // Find first available tile kind
  let firstKind: string | null = null;
  for (const [k, v] of counts.entries()) {
    if (v > 0) {
      firstKind = k;
      break;
    }
  }

  if (!firstKind) {
    // No natural tiles left; must complete remaining melds with pure Kims
    return kimCount === meldsNeeded * 3;
  }

  const [type, valStr] = firstKind.split('-');
  const val = parseInt(valStr!, 10);
  const count = counts.get(firstKind)!;

  // Option 1: Triplet
  if (count >= 3) {
    counts.set(firstKind, count - 3);
    if (canFormMelds(counts, kimCount, meldsNeeded - 1)) return true;
    counts.set(firstKind, count);
  }
  if (count === 2 && kimCount >= 1) {
    counts.set(firstKind, count - 2);
    if (canFormMelds(counts, kimCount - 1, meldsNeeded - 1)) return true;
    counts.set(firstKind, count);
  }
  if (count === 1 && kimCount >= 2) {
    counts.set(firstKind, count - 1);
    if (canFormMelds(counts, kimCount - 2, meldsNeeded - 1)) return true;
    counts.set(firstKind, count);
  }

  // Option 2: Sequence (only suited tiles)
  if (type === 'tong' || type === 'sok' || type === 'ban') {
    // 2a. val is lowest in sequence [val, val+1, val+2]
    if (val <= 7) {
      const k1 = `${type}-${val}`;
      const k2 = `${type}-${val + 1}`;
      const k3 = `${type}-${val + 2}`;

      const c1 = counts.get(k1) ?? 0;
      const c2 = counts.get(k2) ?? 0;
      const c3 = counts.get(k3) ?? 0;

      const has1 = c1 > 0;
      const has2 = c2 > 0;
      const has3 = c3 > 0;

      const neededKims = (has2 ? 0 : 1) + (has3 ? 0 : 1);
      if (has1 && kimCount >= neededKims) {
        counts.set(k1, c1 - 1);
        if (has2) counts.set(k2, c2 - 1);
        if (has3) counts.set(k3, c3 - 1);

        if (canFormMelds(counts, kimCount - neededKims, meldsNeeded - 1)) return true;

        counts.set(k1, c1);
        if (has2) counts.set(k2, c2);
        if (has3) counts.set(k3, c3);
      }
    }

    // 2b. val is middle in sequence [val-1 (Kim), val, val+1]
    if (val >= 2 && val <= 8 && kimCount >= 1) {
      const k1 = `${type}-${val}`;
      const k2 = `${type}-${val + 1}`;

      const c1 = counts.get(k1) ?? 0;
      const c2 = counts.get(k2) ?? 0;

      const has2 = c2 > 0;
      const neededKims = 1 + (has2 ? 0 : 1);

      if (c1 > 0 && kimCount >= neededKims) {
        counts.set(k1, c1 - 1);
        if (has2) counts.set(k2, c2 - 1);

        if (canFormMelds(counts, kimCount - neededKims, meldsNeeded - 1)) return true;

        counts.set(k1, c1);
        if (has2) counts.set(k2, c2);
      }
    }

    // 2c. val is highest in sequence [val-2 (Kim), val-1 (Kim), val]
    if (val >= 3 && kimCount >= 2) {
      const k1 = `${type}-${val}`;
      const c1 = counts.get(k1) ?? 0;

      if (c1 > 0) {
        counts.set(k1, c1 - 1);

        if (canFormMelds(counts, kimCount - 2, meldsNeeded - 1)) return true;

        counts.set(k1, c1);
      }
    }
  }

  return false;
}

/**
 * Authoritative pattern-independent winning hand validator.
 * Validates whether hand + winningTile satisfies either:
 * - 4 melds + 1 pair (adjusted for exposed melds)
 * - 7 pairs (Tjit Tuei)
 */
export function canFormWinningHand(tiles: readonly Tile[], kimAsWildcard = true): boolean {
  if (tiles.length % 3 !== 2) return false;

  const numMeldsNeeded = (tiles.length - 2) / 3;

  const naturalTiles: Tile[] = [];
  let kimCount = 0;
  for (const t of tiles) {
    if (kimAsWildcard && isKim(t)) {
      kimCount++;
    } else {
      naturalTiles.push(t);
    }
  }

  // Sort natural tiles so sequence deduction and Map key insertion order are strictly ascending
  const sortedNaturalTiles = sortTiles(naturalTiles);

  if (tiles.length === 14 && canFormSevenPairs(sortedNaturalTiles, kimCount)) {
    return true;
  }

  const counts = new Map<string, number>();
  for (const t of sortedNaturalTiles) {
    const key = `${t.type}-${t.value}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  // Try 2 Kims as pair
  if (kimCount >= 2) {
    if (canFormMelds(new Map(counts), kimCount - 2, numMeldsNeeded)) {
      return true;
    }
  }

  const distinctKinds = Array.from(counts.keys());

  for (const kind of distinctKinds) {
    const count = counts.get(kind)!;
    // Try natural pair
    if (count >= 2) {
      counts.set(kind, count - 2);
      if (canFormMelds(new Map(counts), kimCount, numMeldsNeeded)) {
        return true;
      }
      counts.set(kind, count);
    }
    // Try 1 natural + 1 Kim pair
    if (count >= 1 && kimCount >= 1) {
      counts.set(kind, count - 1);
      if (canFormMelds(new Map(counts), kimCount - 1, numMeldsNeeded)) {
        return true;
      }
      counts.set(kind, count);
    }
  }

  return false;
}

export class GameEngine {
  private state: GameEngineState;
  private huValidator: (hand: Tile[], melds: Meld[], winningTile: Tile, isSelfDraw: boolean) => boolean;
  private initialCustomWall?: Wall;
  private customWallConsumed = false;

  constructor(rules?: Partial<GameRules>, customWall?: Wall, options?: Partial<GameEngineOptions>) {
    const mergedRules: GameRules = {
      ...DEFAULT_RULES,
      ...rules,
      ...options?.rules,
    };

    if (mergedRules.kimMode === 'natural') {
      mergedRules.kimDiscardAllowed = false;
      mergedRules.allowKimInMeldClaim = false;
    }
    const dealerSeat: Seat = options?.dealerSeat ?? 'dong';
    const roundWind: Wind = options?.roundWind ?? 'dong';
    this.initialCustomWall = customWall ?? options?.wall;
    const wall = this.initialCustomWall ?? createGameWall(mergedRules.kimMode ?? (mergedRules.kimEnabled ? 'dedicated' : 'off')).wall;

    const players: Record<Seat, PlayerState> = {
      dong: {
        seat: 'dong',
        name: 'Player',
        isHuman: true,
        hand: [],
        melds: [],
        flowers: [],
        discards: [],
        isCin: false,
        isPaoChin: false,
      },
      nan: {
        seat: 'nan',
        name: 'Bot South',
        isHuman: false,
        hand: [],
        melds: [],
        flowers: [],
        discards: [],
        isCin: false,
        isPaoChin: false,
      },
      xi: {
        seat: 'xi',
        name: 'Bot West',
        isHuman: false,
        hand: [],
        melds: [],
        flowers: [],
        discards: [],
        isCin: false,
        isPaoChin: false,
      },
      bei: {
        seat: 'bei',
        name: 'Bot North',
        isHuman: false,
        hand: [],
        melds: [],
        flowers: [],
        discards: [],
        isCin: false,
        isPaoChin: false,
      },
    };

    this.state = {
      phase: 'INIT',
      roundWind,
      currentTurn: dealerSeat,
      dealerSeat,
      wall,
      kimIndicator: wall.kimIndicator,
      kimFace: wall.serialize().tiles.find(t => t.isKim && t.type !== 'kim') ?? null,
      players,
      discardPending: null,
      pendingClaims: {},
      consecutiveKongs: 0,
      selfDrawSeat: null,
      hasDiscarded: { dong: false, nan: false, xi: false, bei: false },
      turnCount: 0,
      rules: mergedRules,
    };

    this.huValidator =
      options?.huValidator ??
      ((hand: Tile[], _melds: Meld[], winningTile: Tile) => {
        const fullHand = [...hand, winningTile];
        return canFormWinningHand(fullHand, this.state.rules.kimEnabled);
      });
  }

  /** Controller-only developer rig: preserve the physical wall metadata. */
  public setDeveloperWall(wall: Wall): void { this.state.wall = wall; }

  public getState(): Readonly<GameEngineState> {
    return this.state;
  }

  public getTurnDistance(fromSeat: Seat, toSeat: Seat): number {
    return getTurnDistance(fromSeat, toSeat);
  }

  public isBonusTile(tile: Tile): boolean {
    return isBonus(tile);
  }

  /**
   * Starts a new game session.
   * If autoReplaceFlowers is false (default), deals tiles and transitions to 'FLOWER_REPLACEMENT'.
   * If autoReplaceFlowers is true, executes flower replacements and transitions to 'ACTION_DECISION'.
   * @param autoReplaceFlowers Whether to automatically execute initial flower replacements
   * @param customWall Optional custom wall to use for this game session
   */
  public startNewGame(autoReplaceFlowers = false, customWall?: Wall): FlowerReplacementRecord[] {
    // Reinitialize fresh wall unless a custom wall was explicitly passed
    if (customWall) {
      this.state.wall = customWall;
    } else if (this.initialCustomWall && !this.customWallConsumed) {
      this.state.wall = this.initialCustomWall;
      this.customWallConsumed = true;
    } else {
      this.state.wall = createGameWall(this.state.rules.kimMode ?? (this.state.rules.kimEnabled ? 'dedicated' : 'off')).wall;
    }

    this.state.kimIndicator = this.state.wall.kimIndicator;
    this.state.kimFace = this.state.wall.serialize().tiles.find(t => t.isKim && t.type !== 'kim') ?? null;

    // Reset player state
    for (const seat of SEAT_ORDER) {
      const p = this.state.players[seat];
      p.hand = [];
      p.melds = [];
      p.flowers = [];
      p.discards = [];
      p.isCin = false;
      p.isPaoChin = false;
    }

    this.state.phase = 'DEAL';
    this.state.discardPending = null;
    this.state.pendingClaims = {};
    this.state.consecutiveKongs = 0;
    this.state.selfDrawSeat = null;
    this.state.hasDiscarded = { dong: false, nan: false, xi: false, bei: false };
    this.state.turnCount = 1;
    this.state.currentTurn = this.state.dealerSeat;

    const dealResult = this.state.wall.dealInitialHands(this.state.dealerSeat);
    for (const seat of SEAT_ORDER) {
      this.state.players[seat].hand = sortTiles(dealResult.hands[seat]);
    }

    this.state.phase = 'FLOWER_REPLACEMENT';

    if (autoReplaceFlowers) {
      return this.performInitialFlowerReplacements();
    }

    return [];
  }

  /**
   * Executes recursive initial flower replacements in counter-clockwise order starting from dealerSeat.
   * Automatically transitions phase to 'ACTION_DECISION' upon completion.
   */
  public performInitialFlowerReplacements(): FlowerReplacementRecord[] {
    const records: FlowerReplacementRecord[] = [];
    const dealerIdx = SEAT_ORDER.indexOf(this.state.dealerSeat);
    const replacementOrder: Seat[] = [
      SEAT_ORDER[dealerIdx]!,
      SEAT_ORDER[(dealerIdx + 1) % 4]!,
      SEAT_ORDER[(dealerIdx + 2) % 4]!,
      SEAT_ORDER[(dealerIdx + 3) % 4]!,
    ];

    let wallExhausted = this.state.wall.isEmpty;

    for (const seat of replacementOrder) {
      const player = this.state.players[seat];
      const record: FlowerReplacementRecord = {
        seat,
        flowers: [],
        replacements: [],
      };

      while (true) {
        const bonusIndices: number[] = [];
        for (let i = 0; i < player.hand.length; i++) {
          const t = player.hand[i];
          if (t && this.isBonusTile(t)) {
            bonusIndices.push(i);
          }
        }

        if (bonusIndices.length === 0) break;

        for (let i = bonusIndices.length - 1; i >= 0; i--) {
          const idx = bonusIndices[i]!;
          const bonusTile = player.hand.splice(idx, 1)[0]!;
          player.flowers.push(bonusTile);
          record.flowers.push(bonusTile);

          if (!this.state.wall.isEmpty) {
            const rep = this.state.wall.drawTail();
            if (rep) {
              record.replacements.push(rep);
              player.hand.push(rep);
            } else {
              wallExhausted = true;
            }
          } else {
            wallExhausted = true;
          }
        }
      }

      if (record.flowers.length > 0) {
        records.push(record);
      }
    }

    if (wallExhausted || this.state.wall.isEmpty) {
      this.state.phase = 'DRAW_SERI';
    } else {
      const hasDiscards = SEAT_ORDER.some((s) => this.state.players[s].discards.length > 0);
      if (!hasDiscards && this.state.turnCount === 1) {
        this.state.phase = 'ACTION_DECISION';
        this.state.currentTurn = this.state.dealerSeat;
        // The dealer's 14th dealt tile counts as a draw (Thien Fu).
        this.state.selfDrawSeat = this.state.dealerSeat;
      }
    }

    return records;
  }

  /**
   * Executes a turn draw for the specified seat from the wall head with recursive flower replacement.
   */
  public startTurnDraw(seat: Seat): TurnDrawResult {
    if (this.state.phase === 'FLOWER_REPLACEMENT') {
      throw new Error(`Cannot draw during FLOWER_REPLACEMENT phase`);
    }

    if (
      this.state.phase !== 'TURN_DRAW' &&
      this.state.phase !== 'ACTION_DECISION' &&
      this.state.phase !== 'DISCARD_PENDING'
    ) {
      throw new Error(`Cannot draw outside turn draw phase (current phase: "${this.state.phase}")`);
    }

    if (seat !== this.state.currentTurn) {
      throw new Error(`Cannot draw out of turn: not ${seat}'s turn to draw (current turn: ${this.state.currentTurn})`);
    }

    const player = this.state.players[seat];
    if (player.hand.length + player.melds.length * 3 >= 14) {
      throw new Error(`Seat "${seat}" already has 14 effective tiles; cannot draw`);
    }

    this.state.consecutiveKongs = 0;
    this.state.turnCount++;
    const exposedFlowers: Tile[] = [];

    if (this.state.wall.isEmpty) {
      this.state.phase = 'DRAW_SERI';
      return { drawnTile: null, exposedFlowers, isSeri: true };
    }

    let currentTile = this.state.wall.drawHead();
    while (currentTile && this.isBonusTile(currentTile)) {
      player.flowers.push(currentTile);
      exposedFlowers.push(currentTile);

      if (this.state.wall.isEmpty) {
        this.state.phase = 'DRAW_SERI';
        return { drawnTile: null, exposedFlowers, isSeri: true };
      }
      currentTile = this.state.wall.drawTail();
    }

    if (!currentTile) {
      this.state.phase = 'DRAW_SERI';
      return { drawnTile: null, exposedFlowers, isSeri: true };
    }

    player.hand.push(currentTile);
    this.state.currentTurn = seat;
    this.state.selfDrawSeat = seat;
    this.state.phase = 'ACTION_DECISION';
    this.state.discardPending = null;
    this.state.pendingClaims = {};

    return { drawnTile: currentTile, exposedFlowers, isSeri: false };
  }

  /**
   * Active player discards a tile from hand.
   */
  public discard(seat: Seat, tileId: string): DiscardResult {
    if (this.state.phase !== 'ACTION_DECISION') {
      throw new Error(`Cannot discard in phase "${this.state.phase}"`);
    }
    if (this.state.currentTurn !== seat) {
      throw new Error(`Not ${seat}'s turn to discard (current turn: ${this.state.currentTurn})`);
    }

    const player = this.state.players[seat];
    const effectiveHandSize = player.hand.length + player.melds.length * 3;
    if (effectiveHandSize === 13) {
      throw new Error('Player cannot discard with 13 tiles; draw required');
    }
    if (effectiveHandSize < 14) {
      throw new Error(`Illegal hand size for discard: expected 14 tiles (hand size equivalent is ${effectiveHandSize})`);
    }

    const tileIndex = player.hand.findIndex((t) => t.id === tileId);
    if (tileIndex === -1) {
      throw new Error(`Tile "${tileId}" not found in hand of seat "${seat}"`);
    }

    const tile = player.hand[tileIndex]!;
    if ((this.state.rules.kimMode === 'natural' || !this.state.rules.kimDiscardAllowed) && isKim(tile)) {
      throw new Error('Discarding Kim is prohibited under tournament rules');
    }

    player.hand.splice(tileIndex, 1);
    this.state.consecutiveKongs = 0;
    this.state.selfDrawSeat = null;
    this.state.hasDiscarded[seat] = true;
    this.state.discardPending = {
      discarder: seat,
      tile,
      isPromotedKong: false,
    };
    this.state.pendingClaims = {};
    this.state.phase = 'CLAIM_WINDOW';

    return {
      discardedTile: tile,
      seat,
      nextPhase: 'CLAIM_WINDOW',
    };
  }

  /**
   * Active player declares a concealed Kong (Ankong) from hand.
   */
  public declareAnkong(seat: Seat, tiles: Tile[]): KongResult {
    if (this.state.phase !== 'ACTION_DECISION' || this.state.currentTurn !== seat) {
      throw new Error(`Cannot declare Ankong outside of own ACTION_DECISION turn`);
    }
    if (tiles.length !== 4) {
      throw new Error('Ankong requires exactly 4 matching tiles');
    }

    const first = tiles[0]!;
    for (const t of tiles) {
      if (!isSameKind(first, t)) {
        throw new Error('All 4 tiles in Ankong must be identical in kind');
      }
    }

    const player = this.state.players[seat];
    const handCopy = [...player.hand];
    for (const t of tiles) {
      const idx = handCopy.findIndex((h) => h.id === t.id);
      if (idx === -1) {
        throw new Error(`Tile ${t.id} not found in player hand for Ankong`);
      }
      handCopy.splice(idx, 1);
    }

    for (const t of tiles) {
      const idx = player.hand.findIndex((h) => h.id === t.id);
      player.hand.splice(idx, 1);
    }

    player.melds.push({
      type: 'ankong',
      tiles,
    });
    this.state.consecutiveKongs++;

    const exposedFlowers: Tile[] = [];
    let rep = this.state.wall.drawTail();
    while (rep && this.isBonusTile(rep)) {
      player.flowers.push(rep);
      exposedFlowers.push(rep);
      rep = this.state.wall.drawTail();
    }

    if (!rep && this.state.wall.isEmpty) {
      this.state.phase = 'DRAW_SERI';
      return { seat, kongType: 'ankong', replacementTile: null, exposedFlowers };
    }

    if (rep) {
      player.hand.push(rep);
      this.state.selfDrawSeat = seat;
    }

    this.state.phase = 'ACTION_DECISION';
    return { seat, kongType: 'ankong', replacementTile: rep, exposedFlowers };
  }

  /**
   * Active player declares a promoted Kong (Kakan) by adding the 4th matching tile to an existing Pung.
   * This immediately opens the Chiong Kong (Robbing the Kong) claim window for opponents.
   */
  public declareKakan(seat: Seat, tileId: string, meldIndex: number): KongResult {
    if (this.state.phase !== 'ACTION_DECISION' || this.state.currentTurn !== seat) {
      throw new Error(`Cannot declare Kakan outside of own ACTION_DECISION turn`);
    }

    const player = this.state.players[seat];
    const meld = player.melds[meldIndex];
    if (!meld || meld.type !== 'pung') {
      throw new Error(`Target meld at index ${meldIndex} is not an exposed Pung`);
    }

    const tileIdx = player.hand.findIndex((t) => t.id === tileId);
    if (tileIdx === -1) {
      throw new Error(`Tile ${tileId} not found in player hand for Kakan`);
    }

    const tile = player.hand[tileIdx]!;
    const pungTile = meld.tiles[0]!;
    if (!isSameKind(pungTile, tile)) {
      throw new Error(`Tile ${tile.id} does not match Pung of ${pungTile.id}`);
    }

    // Remove tile from hand and expose into Chiong Kong window
    player.hand.splice(tileIdx, 1);
    this.state.selfDrawSeat = null;
    this.state.discardPending = {
      discarder: seat,
      tile,
      isPromotedKong: true,
    };
    this.state.pendingClaims = {};
    this.state.phase = 'CLAIM_WINDOW';

    return {
      seat,
      kongType: 'kakan',
      replacementTile: null,
      exposedFlowers: [],
    };
  }

  /**
   * Active player declares self-draw Hu (Ce Mo).
   */
  public declareSelfDrawHu(seat: Seat): HuResult {
    if (this.state.phase !== 'ACTION_DECISION' || this.state.currentTurn !== seat) {
      throw new Error(`Cannot declare self-draw Hu outside own ACTION_DECISION turn`);
    }

    const player = this.state.players[seat];
    if (player.hand.length === 0) {
      throw new Error('Player hand is empty');
    }
    if (this.state.selfDrawSeat !== seat) {
      throw new Error('Cannot declare self-draw Hu without a fresh draw (Pung/Jia claims must discard)');
    }

    const lastDrawn = player.hand[player.hand.length - 1]!;
    const concealedRemaining = player.hand.slice(0, player.hand.length - 1);

    const isValid = this.huValidator(concealedRemaining, player.melds, lastDrawn, true);
    if (!isValid) {
      throw new Error('Hand does not form a legal winning Hu pattern');
    }

    this.state.phase = 'RESOLVED_HU';
    this.state.winnerSeat = seat;
    this.state.winningTile = lastDrawn;
    this.state.winType = 'tsumo';

    return {
      winnerSeat: seat,
      winType: 'tsumo',
      winningTile: lastDrawn,
    };
  }

  /**
   * Declares Pao Chin on turn 1.
   */
  public declarePaoChin(seat: Seat): boolean {
    if (this.state.phase !== 'ACTION_DECISION' || this.state.currentTurn !== seat) {
      return false;
    }
    if (!this.canDeclarePaoChin(seat)) {
      return false;
    }
    const player = this.state.players[seat];
    player.isPaoChin = true;
    player.isCin = true;
    return true;
  }

  /**
   * Submits a claim for a player during the CLAIM_WINDOW.
   * Validates claim legality against getLegalActions and enforces strict ITM rules:
   * - Discarder cannot claim own discard
   * - Promoted Kong (Kakan) can only be intercepted by Hu (Chiong Kong)
   * - Hu requires legal winning hand (legal.canDiscardWinHu === true)
   * - Jia is permitted ONLY from immediate upstream player (left player) and requires a valid sequence
   * - Pung / Kong requires 2 / 3 matching tiles in hand
   * - Kim usage in meld claims is prohibited under tournament rules
   */
  public submitClaim(declaration: ClaimDeclaration): void {
    if (this.state.phase !== 'CLAIM_WINDOW') {
      throw new Error(`Cannot submit claim outside of CLAIM_WINDOW (current: "${this.state.phase}")`);
    }
    if (!this.state.discardPending) {
      throw new Error('No pending discard to claim against');
    }

    const { discarder, tile: discardTile, isPromotedKong } = this.state.discardPending;

    if (declaration.seat === discarder) {
      throw new Error(`Discarder "${discarder}" cannot claim their own discarded tile`);
    }

    // Verify Kim prohibition in meld claims
    if (!this.state.rules.allowKimInMeldClaim && declaration.meldTiles) {
      for (const t of declaration.meldTiles) {
        if (isKim(t)) {
          throw new Error('Using Kim in Jia/Pung/Kong claims is prohibited (triggers Lew Fit)');
        }
      }
    }
    // Casual: the per-type Kim toggles (Jia / Pung + Tris) also bind direct claims
    if (
      declaration.meldTiles?.some(isKim) &&
      (declaration.action === 'jia' || declaration.action === 'pung' || declaration.action === 'kong') &&
      !this.kimClaimsAllowed(declaration.action)
    ) {
      throw new Error(`Using Kim in a ${declaration.action} claim is disabled by the Kim rules`);
    }

    const claimant = this.state.players[declaration.seat];
    const legal = this.getLegalActions(declaration.seat);

    switch (declaration.action) {
      case 'pass': {
        // Pass is always valid for non-discarders
        break;
      }

      case 'hu': {
        if (!legal.canDiscardWinHu) {
          throw new Error(
            `Seat "${declaration.seat}" cannot claim Hu on discard "${discardTile.id}": hand does not form a legal winning Hu pattern`
          );
        }
        break;
      }

      case 'jia': {
        if (isPromotedKong) {
          throw new Error('Cannot claim Jia on a promoted Kong (only Hu/Chiong Kong is permitted)');
        }

        const expectedSeat = getNextSeat(discarder);
        if (declaration.seat !== expectedSeat) {
          throw new Error(
            `Seat "${declaration.seat}" cannot claim Jia: Jia is allowed only from the player to your left (discarder: "${discarder}", expected: "${expectedSeat}")`
          );
        }

        // If specific meldTiles provided, verify they exist in hand FIRST
        if (declaration.meldTiles && declaration.meldTiles.length > 0) {
          if (declaration.meldTiles.length !== 2) {
            throw new Error(
              `Jia claim requires exactly 2 meldTiles from hand (received ${declaration.meldTiles.length})`
            );
          }

          // Verify both tiles exist in claimant hand (distinct copies)
          const handCopy = [...claimant.hand];
          for (const m of declaration.meldTiles) {
            const idx = handCopy.findIndex((h) => h.id === m.id);
            if (idx === -1) {
              throw new Error(
                `Tile "${m.id}" for Jia claim not found in hand of seat "${declaration.seat}"`
              );
            }
            handCopy.splice(idx, 1);
          }
        } else {
          // If meldTiles was not provided, auto-populate from legal options
          if (legal.jiaOptions.length >= 1) {
            declaration.meldTiles = [...legal.jiaOptions[0]!];
          } else {
            throw new Error(
              `Seat "${declaration.seat}" cannot claim Jia: hand cannot form a valid sequence with discarded tile "${discardTile.id}"`
            );
          }
        }

        if (!legal.canJia) {
          throw new Error(
            `Seat "${declaration.seat}" cannot claim Jia: hand cannot form a valid sequence with discarded tile "${discardTile.id}"`
          );
        }

        // Verify valid consecutive sequence with discarded tile (a permitted Kim fills one slot)
        const [m1, m2] = declaration.meldTiles;
        const naturalJia = declaration.meldTiles.filter((t) => !isKim(t));
        if (!isSuited(discardTile) || naturalJia.some((t) => !isSuited(t))) {
          throw new Error('Jia sequence requires suited tiles (Tong, Sok, or Ban)');
        }
        if (naturalJia.some((t) => t.type !== discardTile.type)) {
          throw new Error(
            `Jia sequence suit mismatch: tiles are type "${m1!.type}" and "${m2!.type}", but discard is "${discardTile.type}"`
          );
        }
        if (!this.isValidJiaTiles(declaration.meldTiles, discardTile)) {
          const vals = [m1!.value, m2!.value, discardTile.value].sort((a, b) => a - b);
          throw new Error(
            `Tiles [${vals.join(', ')}] do not form a consecutive sequence for Jia`
          );
        }
        break;
      }

      case 'pung': {
        if (isPromotedKong) {
          throw new Error('Cannot claim Pung on a promoted Kong (only Hu/Chiong Kong is permitted)');
        }

        if (!legal.canPung) {
          throw new Error(
            `Seat "${declaration.seat}" cannot claim Pung: requires at least 2 matching tiles of kind "${discardTile.type}-${discardTile.value}" in hand`
          );
        }

        if (!declaration.meldTiles || declaration.meldTiles.length === 0) {
          if (legal.pungTiles) {
            declaration.meldTiles = [...legal.pungTiles];
          }
        } else {
          if (declaration.meldTiles.length !== 2) {
            throw new Error(
              `Pung claim requires exactly 2 meldTiles from hand (received ${declaration.meldTiles.length})`
            );
          }
          const handCopy = [...claimant.hand];
          for (const m of declaration.meldTiles) {
            const idx = handCopy.findIndex((h) => h.id === m.id);
            if (idx === -1) {
              throw new Error(
                `Tile "${m.id}" for Pung claim not found in hand of seat "${declaration.seat}"`
              );
            }
            handCopy.splice(idx, 1);
            if (!this.isClaimMatch(m, discardTile)) {
              throw new Error(
                `Tile "${m.id}" does not match discarded tile "${discardTile.id}" for Pung`
              );
            }
          }
        }
        break;
      }

      case 'kong': {
        if (isPromotedKong) {
          throw new Error('Cannot claim Kong on a promoted Kong (only Hu/Chiong Kong is permitted)');
        }

        if (!legal.canKong) {
          throw new Error(
            `Seat "${declaration.seat}" cannot claim Kong: requires at least 3 matching tiles of kind "${discardTile.type}-${discardTile.value}" in hand`
          );
        }

        if (!declaration.meldTiles || declaration.meldTiles.length === 0) {
          if (legal.kongTiles) {
            declaration.meldTiles = [...legal.kongTiles];
          }
        } else {
          if (declaration.meldTiles.length !== 3) {
            throw new Error(
              `Kong claim requires exactly 3 meldTiles from hand (received ${declaration.meldTiles.length})`
            );
          }
          const handCopy = [...claimant.hand];
          for (const m of declaration.meldTiles) {
            const idx = handCopy.findIndex((h) => h.id === m.id);
            if (idx === -1) {
              throw new Error(
                `Tile "${m.id}" for Kong claim not found in hand of seat "${declaration.seat}"`
              );
            }
            handCopy.splice(idx, 1);
            if (!this.isClaimMatch(m, discardTile)) {
              throw new Error(
                `Tile "${m.id}" does not match discarded tile "${discardTile.id}" for Kong`
              );
            }
          }
        }
        break;
      }

      default: {
        throw new Error(`Unknown claim action "${(declaration as any).action}"`);
      }
    }

    this.state.pendingClaims[declaration.seat] = declaration;
  }

  /**
   * Arbitrates all declared claims in the CLAIM_WINDOW according to official ITM priority:
   * 1. Hu (Ron / Chiong Kong) — resolved with multi-Hu tie-breaker (nearest downstream seat)
   * 2. Kong / Pung — pre-empts Jia, jumps turn to claimant
   * 3. Jia — valid only for immediate downstream player
   * 4. All Pass — discarded tile committed to pool; turn advances or DRAW_SERI
   */
  public resolveClaimWindow(): ClaimResolutionResult {
    if (this.state.phase !== 'CLAIM_WINDOW' || !this.state.discardPending) {
      throw new Error('Cannot resolve claim window: no active discard pending');
    }

    const { discarder, tile, isPromotedKong } = this.state.discardPending;
    const claims = Object.values(this.state.pendingClaims).filter(Boolean) as ClaimDeclaration[];

    // 1. Check for Hu claims
    const huClaims = claims.filter((c) => c.action === 'hu');
    if (huClaims.length > 0) {
      // Sort multi-Hu claims by counter-clockwise turn distance downstream from discarder
      huClaims.sort((a, b) => {
        return getTurnDistance(discarder, a.seat) - getTurnDistance(discarder, b.seat);
      });

      const winnerClaim = huClaims[0]!;
      const winner = this.state.players[winnerClaim.seat];

      // Defensive guard: Assert winning hand validity
      const isValid = this.huValidator(winner.hand, winner.melds, tile, false);
      if (!isValid) {
        throw new Error(
          `Cannot resolve Hu: claimant at seat "${winnerClaim.seat}" does not hold a winning hand`
        );
      }

      winner.hand.push(tile);

      this.state.phase = 'RESOLVED_HU';
      this.state.winnerSeat = winnerClaim.seat;
      this.state.winningTile = tile;
      this.state.winType = isPromotedKong ? 'chiong_kong' : 'ron';
      this.state.discardPending = null;

      const displaced = claims.filter((c) => c.seat !== winnerClaim.seat);
      return {
        winnerSeat: winnerClaim.seat,
        winningAction: 'hu',
        displacedClaims: displaced,
        nextTurn: winnerClaim.seat,
        nextPhase: 'RESOLVED_HU',
      };
    }

    // If this was a promoted kong and nobody robbed it:
    if (isPromotedKong) {
      const discarderPlayer = this.state.players[discarder];
      // Find the pung to upgrade
      const pungMeld = discarderPlayer.melds.find(
        (m) => m.type === 'pung' && isSameKind(m.tiles[0]!, tile)
      );
      if (pungMeld) {
        (pungMeld as any).type = 'kong';
        (pungMeld.tiles as Tile[]).push(tile);
      } else {
        discarderPlayer.hand.push(tile);
      }

      this.state.consecutiveKongs++;

      // Draw tail replacement
      let rep = this.state.wall.drawTail();
      const exposedFlowers: Tile[] = [];
      while (rep && this.isBonusTile(rep)) {
        discarderPlayer.flowers.push(rep);
        exposedFlowers.push(rep);
        rep = this.state.wall.drawTail();
      }

      if (!rep && this.state.wall.isEmpty) {
        this.state.phase = 'DRAW_SERI';
        this.state.discardPending = null;
        return {
          winningAction: 'pass',
          displacedClaims: [],
          nextTurn: discarder,
          nextPhase: 'DRAW_SERI',
        };
      }

      if (rep) {
        discarderPlayer.hand.push(rep);
        this.state.selfDrawSeat = discarder;
      }

      this.state.phase = 'ACTION_DECISION';
      this.state.currentTurn = discarder;
      this.state.discardPending = null;

      return {
        winningAction: 'pass',
        displacedClaims: [],
        nextTurn: discarder,
        nextPhase: 'ACTION_DECISION',
      };
    }

    // 2. Check for Kong claims
    const kongClaim = claims.find((c) => c.action === 'kong');
    if (kongClaim) {
      const claimant = this.state.players[kongClaim.seat];

      // Defensive guard: Assert matching tile count
      const matchingCount = claimant.hand.filter(
        (t) => this.isClaimMatch(t, tile)
      ).length;
      if (matchingCount < 3) {
        throw new Error(
          `Cannot execute Kong claim: seat "${kongClaim.seat}" has only ${matchingCount} matching tiles (needs 3)`
        );
      }

      // Remove the 3 matching tiles from claimant's hand
      const matchingTiles: Tile[] = [];
      if (kongClaim.meldTiles && kongClaim.meldTiles.length === 3) {
        for (const m of kongClaim.meldTiles) {
          const idx = claimant.hand.findIndex((h) => h.id === m.id);
          if (idx !== -1) {
            matchingTiles.push(claimant.hand.splice(idx, 1)[0]!);
          }
        }
      } else {
        for (let i = claimant.hand.length - 1; i >= 0; i--) {
          if (isSameKind(claimant.hand[i]!, tile)) {
            matchingTiles.push(claimant.hand.splice(i, 1)[0]!);
            if (matchingTiles.length === 3) break;
          }
        }
      }

      if (matchingTiles.length !== 3) {
        throw new Error(
          `Failed to extract 3 matching tiles for Kong claim from hand of seat "${kongClaim.seat}"`
        );
      }

      claimant.melds.push({
        type: 'kong',
        tiles: [...matchingTiles, tile],
        claimedFrom: discarder,
      });

      this.state.consecutiveKongs++;
      this.state.turnCount++;

      // Kong draws tail replacement
      let rep = this.state.wall.drawTail();
      while (rep && this.isBonusTile(rep)) {
        claimant.flowers.push(rep);
        rep = this.state.wall.drawTail();
      }

      if (!rep && this.state.wall.isEmpty) {
        this.state.phase = 'DRAW_SERI';
        this.state.discardPending = null;
        return {
          winningAction: 'kong',
          displacedClaims: claims.filter((c) => c.seat !== kongClaim.seat),
          nextTurn: kongClaim.seat,
          nextPhase: 'DRAW_SERI',
        };
      }

      if (rep) {
        claimant.hand.push(rep);
        this.state.selfDrawSeat = kongClaim.seat;
      }

      this.state.currentTurn = kongClaim.seat;
      this.state.phase = 'ACTION_DECISION';
      this.state.discardPending = null;

      return {
        winningAction: 'kong',
        displacedClaims: claims.filter((c) => c.seat !== kongClaim.seat),
        nextTurn: kongClaim.seat,
        nextPhase: 'ACTION_DECISION',
      };
    }

    // 3. Check for Pung claims
    const pungClaim = claims.find((c) => c.action === 'pung');
    if (pungClaim) {
      const claimant = this.state.players[pungClaim.seat];

      // Defensive guard: Assert matching tile count
      const matchingCount = claimant.hand.filter(
        (t) => this.isClaimMatch(t, tile)
      ).length;
      if (matchingCount < 2) {
        throw new Error(
          `Cannot execute Pung claim: seat "${pungClaim.seat}" has only ${matchingCount} matching tiles (needs 2)`
        );
      }

      const matchingTiles: Tile[] = [];
      if (pungClaim.meldTiles && pungClaim.meldTiles.length === 2) {
        for (const m of pungClaim.meldTiles) {
          const idx = claimant.hand.findIndex((h) => h.id === m.id);
          if (idx !== -1) {
            matchingTiles.push(claimant.hand.splice(idx, 1)[0]!);
          }
        }
      } else {
        for (let i = claimant.hand.length - 1; i >= 0; i--) {
          if (isSameKind(claimant.hand[i]!, tile)) {
            matchingTiles.push(claimant.hand.splice(i, 1)[0]!);
            if (matchingTiles.length === 2) break;
          }
        }
      }

      if (matchingTiles.length !== 2) {
        throw new Error(
          `Failed to extract 2 matching tiles for Pung claim from hand of seat "${pungClaim.seat}"`
        );
      }

      claimant.melds.push({
        type: 'pung',
        tiles: [...matchingTiles, tile],
        claimedFrom: discarder,
      });

      this.state.currentTurn = pungClaim.seat;
      this.state.selfDrawSeat = null;
      this.state.turnCount++;
      this.state.phase = 'ACTION_DECISION';
      this.state.discardPending = null;

      return {
        winningAction: 'pung',
        displacedClaims: claims.filter((c) => c.seat !== pungClaim.seat),
        nextTurn: pungClaim.seat,
        nextPhase: 'ACTION_DECISION',
      };
    }

    // 4. Check for Jia claims
    const jiaClaim = claims.find((c) => c.action === 'jia');
    if (jiaClaim) {
      // Defensive guard: Must be immediate downstream player
      if (getTurnDistance(discarder, jiaClaim.seat) !== 1) {
        throw new Error(
          `Cannot execute Jia claim: seat "${jiaClaim.seat}" is not immediate downstream from discarder "${discarder}"`
        );
      }

      const claimant = this.state.players[jiaClaim.seat];
      const meldTiles = jiaClaim.meldTiles ?? [];

      // Defensive guard: exactly 2 tiles
      if (meldTiles.length !== 2) {
        throw new Error(
          `Cannot execute Jia claim: expected 2 meldTiles, received ${meldTiles.length}`
        );
      }

      // Defensive guard: Sequence validity
      const naturalJia = meldTiles.filter((t) => !isKim(t));
      if (!isSuited(tile) || naturalJia.some((t) => !isSuited(t))) {
        throw new Error('Cannot execute Jia claim: non-suited tiles involved');
      }
      if (naturalJia.some((t) => t.type !== tile.type)) {
        throw new Error('Cannot execute Jia claim: suit mismatch');
      }
      if (!this.isValidJiaTiles(meldTiles, tile)) {
        const vals = [meldTiles[0]!.value, meldTiles[1]!.value, tile.value].sort((a, b) => a - b);
        throw new Error(
          `Cannot execute Jia claim: values [${vals.join(', ')}] do not form a consecutive sequence`
        );
      }

      for (const m of meldTiles) {
        const idx = claimant.hand.findIndex((h) => h.id === m.id);
        if (idx === -1) {
          throw new Error(
            `Cannot execute Jia claim: tile "${m.id}" not found in hand of seat "${jiaClaim.seat}"`
          );
        }
        claimant.hand.splice(idx, 1);
      }

      claimant.melds.push({
        type: 'jia',
        tiles: [...meldTiles, tile],
        claimedFrom: discarder,
      });

      this.state.currentTurn = jiaClaim.seat;
      this.state.selfDrawSeat = null;
      this.state.turnCount++;
      this.state.phase = 'ACTION_DECISION';
      this.state.discardPending = null;

      return {
        winningAction: 'jia',
        displacedClaims: claims.filter((c) => c.seat !== jiaClaim.seat),
        nextTurn: jiaClaim.seat,
        nextPhase: 'ACTION_DECISION',
      };
    }

    // 5. All Pass: Discarded tile goes into discarder's river
    const discarderPlayer = this.state.players[discarder];
    discarderPlayer.discards.push(tile);
    this.state.discardPending = null;
    this.state.consecutiveKongs = 0;

    if (this.state.wall.isEmpty) {
      this.state.phase = 'DRAW_SERI';
      return {
        winningAction: 'pass',
        displacedClaims: [],
        nextTurn: discarder,
        nextPhase: 'DRAW_SERI',
      };
    }

    const nextSeat = getNextSeat(discarder);
    this.state.phase = 'TURN_DRAW';
    this.state.currentTurn = nextSeat;
    this.startTurnDraw(nextSeat);

    return {
      winningAction: 'pass',
      displacedClaims: [],
      nextTurn: nextSeat,
      nextPhase: this.state.phase,
    };
  }

  /**
   * Pao Chin (rulebook #10: "Hand langsung Cin pada pembagian tile pertama, harus dideclare") is
   * declared on the seat's first turn: before it has ever discarded (a claimed discard never reaches
   * the river, so this is tracked separately) and before it has melded.
   */
  private canDeclarePaoChin(seat: Seat): boolean {
    const player = this.state.players[seat];
    return !player.isPaoChin && !this.state.hasDiscarded[seat] && player.discards.length === 0 && player.melds.length === 0;
  }

  /**
   * True when the rules let a Kim from hand stand in for a missing tile in this claim type:
   * master allowKimInMeldClaim plus allowKimInJia (Jia) or allowKimInPung + allowKimInTriplet
   * (Pung/Kong). Rules objects without the per-type flags keep them enabled.
   */
  private kimClaimsAllowed(action: 'jia' | 'pung' | 'kong'): boolean {
    return isKimAllowedInClaim(action, this.state.rules);
  }

  /** May `t` from hand fill a Pung/Kong slot for the discarded `tile`? */
  private isClaimMatch(t: Tile, tile: Tile): boolean {
    if (isKim(t)) return this.kimClaimsAllowed('pung');
    return isSameKind(t, tile);
  }

  /** `need` hand tiles for a Pung (2) or Kong (3) on `tile`: natural copies first, Kims fill the rest. */
  private claimKindTiles(hand: readonly Tile[], tile: Tile, need: number): Tile[] | null {
    const natural = hand.filter((t) => !isKim(t) && isSameKind(t, tile));
    const kims = this.kimClaimsAllowed('pung') ? hand.filter(isKim) : [];
    const picked = [...natural, ...kims].slice(0, need);
    return picked.length === need ? picked : null;
  }

  /** Jia options for `tile`: all-natural options first, then options where one Kim fills a gap. */
  private jiaOptionsFor(hand: readonly Tile[], tile: Tile): Tile[][] {
    if (!isSuited(tile)) return [];
    const v = tile.value;
    const patterns: [number, number][] = [];
    if (v >= 3) patterns.push([v - 2, v - 1]);
    if (v >= 2 && v <= 8) patterns.push([v - 1, v + 1]);
    if (v <= 7) patterns.push([v + 1, v + 2]);
    const find = (value: number) => hand.find((t) => !isKim(t) && t.type === tile.type && t.value === value);
    const kim = this.kimClaimsAllowed('jia') ? hand.find(isKim) : undefined;
    const natural: Tile[][] = [];
    const assisted: Tile[][] = [];
    for (const [a, b] of patterns) {
      const t1 = find(a);
      const t2 = find(b);
      if (t1 && t2) natural.push([t1, t2]);
      else if (kim && (t1 || t2)) assisted.push([(t1 ?? t2)!, kim]);
    }
    return [...natural, ...assisted];
  }

  /** Two hand tiles + discard form a sequence; a permitted Kim fills any one slot. */
  private isValidJiaTiles(meldTiles: readonly Tile[], tile: Tile): boolean {
    if (meldTiles.length !== 2 || !isSuited(tile)) return false;
    const naturals = meldTiles.filter((t) => !isKim(t));
    const kimCount = meldTiles.length - naturals.length;
    if (kimCount > 0 && !this.kimClaimsAllowed('jia')) return false;
    if (naturals.some((t) => !isSuited(t) || t.type !== tile.type)) return false;
    const vals = [...naturals.map((t) => t.value), tile.value].sort((a, b) => a - b);
    if (new Set(vals).size !== vals.length) return false;
    if (kimCount === 0) return vals[1]! === vals[0]! + 1 && vals[2]! === vals[1]! + 1;
    return vals[vals.length - 1]! - vals[0]! <= 2;
  }

  /**
   * Introspects legal actions available to the player at seat.
   */
  public getLegalActions(seat: Seat): LegalActions {
    const player = this.state.players[seat];
    const isMyTurn = this.state.currentTurn === seat;

    const result: LegalActions = {
      canDiscard: false,
      discardableTileIds: [],
      canAnkong: false,
      ankongOptions: [],
      canKakan: false,
      kakanOptions: [],
      canSelfDrawHu: false,
      canPaoChin: false,
      canPass: false,
      canJia: false,
      jiaOptions: [],
      canPung: false,
      pungTiles: undefined,
      canKong: false,
      kongTiles: undefined,
      canDiscardWinHu: false,
    };

    if (this.state.phase === 'ACTION_DECISION' && isMyTurn) {
      const effectiveHandSize = player.hand.length + player.melds.length * 3;
      if (effectiveHandSize === 14) {
        const discardable = player.hand
          .filter((t) => (this.state.rules.kimMode !== 'natural' && this.state.rules.kimDiscardAllowed) || !isKim(t))
          .map((t) => t.id);
        result.discardableTileIds = discardable;
        result.canDiscard = discardable.length > 0;
      }

      // Ankong options: check for 4 of a kind
      const kindMap = new Map<string, Tile[]>();
      for (const t of player.hand) {
        if (!this.state.rules.allowKimInMeldClaim && isKim(t)) continue;
        const key = `${t.type}-${t.value}`;
        const arr = kindMap.get(key) || [];
        arr.push(t);
        kindMap.set(key, arr);
      }
      for (const group of kindMap.values()) {
        if (group.length === 4) {
          result.canAnkong = true;
          result.ankongOptions.push(group);
        }
      }

      // Kakan options: check for exposed pung matching hand tile
      player.melds.forEach((m, idx) => {
        if (m.type === 'pung') {
          const matchingHandTile = player.hand.find((t) => isSameKind(m.tiles[0]!, t));
          if (matchingHandTile) {
            result.canKakan = true;
            result.kakanOptions.push({
              meldIndex: idx,
              tile: matchingHandTile,
            });
          }
        }
      });

      // Self-draw Hu: only with a fresh wall tile, never straight after a Pung/Jia claim
      if (player.hand.length > 0 && this.state.selfDrawSeat === seat) {
        const lastTile = player.hand[player.hand.length - 1]!;
        const remaining = player.hand.slice(0, player.hand.length - 1);
        if (this.huValidator(remaining, player.melds, lastTile, true)) {
          result.canSelfDrawHu = true;
        }
      }

      result.canPaoChin = this.canDeclarePaoChin(seat);
    } else if (this.state.phase === 'CLAIM_WINDOW' && this.state.discardPending) {
      const { discarder, tile, isPromotedKong } = this.state.discardPending;

      if (seat !== discarder) {
        result.canPass = true;

        // Hu check
        if (this.huValidator(player.hand, player.melds, tile, false)) {
          result.canDiscardWinHu = true;
        }

        // Only Hu is permitted on Chiong Kong (isPromotedKong)
        if (!isPromotedKong) {
          // Pung & Kong check (Casual: a Kim may fill a slot when allowKimInMeldClaim is on)
          const pungTiles = this.claimKindTiles(player.hand, tile, 2);
          if (pungTiles) {
            result.canPung = true;
            result.pungTiles = pungTiles;
          }
          const kongTiles = this.claimKindTiles(player.hand, tile, 3);
          if (kongTiles) {
            result.canKong = true;
            result.kongTiles = kongTiles;
          }

          // Jia check: Only legal for immediate downstream player
          if (getTurnDistance(discarder, seat) === 1 && isSuited(tile)) {
            result.jiaOptions = this.jiaOptionsFor(player.hand, tile);
            result.canJia = result.jiaOptions.length > 0;
          }
        }
      }
    }

    return result;
  }
}
