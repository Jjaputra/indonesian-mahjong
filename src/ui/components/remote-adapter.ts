// Lets the single-player table components (GameTable.tsx) render a server SeatView.
// They only read a small slice of GameController, so this class provides that slice and nothing more.
import { SEAT_ORDER } from '../../core/tiles';
import type { ClaimDeclaration, PlayerState, Seat, Tile } from '../../core/types';
import type { RemoteTable } from '../../net/remote-table';
import type { GameController, HumanActions } from '../game-controller';
import { SEAT_SHORT } from '../labels';

const NONE: HumanActions = {
  canDraw: false, canDiscard: false, discardableTileIds: [], ankongOptions: [], kakanOptions: [],
  canSelfDrawHu: false, selfHuScore: null, canPaoChin: false, canReplaceFlowers: false, claim: null,
};

const hiddenTile = (seat: Seat, i: number): Tile => ({ id: `hidden-${seat}-${i}`, type: 'tong', value: 1, isKim: false });

/** Display name of a seat: the player's nickname, "Bot …" for a bot, a placeholder for an empty chair. */
export function seatName(table: RemoteTable, seat: Seat): string {
  const s = table.getState();
  const info = s.room?.seats.find(r => r.seat === seat);
  // Chairs aren't winds (the dealer rotates), so bots get a stable number instead of a wind name.
  if (s.view?.matchOver && info?.name) return info.name;
  if (info?.bot) return `Bot ${SEAT_ORDER.indexOf(seat) + 1}`;
  return info?.name ?? `Kursi ${SEAT_SHORT[seat]}`;
}

export class RemoteController {
  readonly outcome = null;
  private trail: { seat: Seat; tile: Tile }[] = [];
  private seen = new Set<string>();
  private cache: { view: unknown; seat: Seat | null; state: ReturnType<RemoteController['build']> } | null = null;

  constructor(private readonly table: RemoteTable) { this.sync(); }

  /** Call once per render, before the components read the controller. */
  sync(): void { this.syncTrail(); }

  /** A spectator (no seat) watches from Dong's side with every hand face-down. */
  get spectator(): boolean { return this.table.getState().seat === null; }
  get humanSeat(): Seat { return this.table.getState().seat ?? 'dong'; }
  premium(seat: Seat): boolean {
    const state = this.table.getState();
    if (this.spectator && seat === this.humanSeat) return !!state.room?.spectatorDetails?.find(p => p.name === this.table.playerName)?.premium;
    return !!seatPremium(this.table)[seat];
  }
  get match() { return this.table.getState().view?.match ?? null; }
  private get view() { return this.table.getState().view!; }

  /** Server chronology survives reloads; the interleaving fallback supports older servers. */
  private syncTrail(): void {
    const view = this.table.getState().view;
    if (!view) return;
    if (view.discardTrail) { this.trail = view.discardTrail; return; }
    const order = [...SEAT_ORDER.slice(SEAT_ORDER.indexOf(view.dealer)), ...SEAT_ORDER.slice(0, SEAT_ORDER.indexOf(view.dealer))];
    const live = new Set(order.flatMap(seat => view.players[seat].discards.map(t => t.id)));
    this.trail = this.trail.filter(d => live.has(d.tile.id));
    this.seen = new Set(this.trail.map(d => d.tile.id));
    const longest = Math.max(...order.map(seat => view.players[seat].discards.length));
    for (let i = 0; i < longest; i++) for (const seat of order) {
      const tile = view.players[seat].discards[i];
      if (tile && !this.seen.has(tile.id)) { this.trail.push({ seat, tile }); this.seen.add(tile.id); }
    }
  }

  /** Badge text for a human seat that is offline or timed out (AFK). */
  presence(seat: Seat): string | null {
    if (this.spectator && seat === this.humanSeat) return null; // that label is the spectator's own
    if (this.table.getState().room?.seats.find(r => r.seat === seat)?.bot) return null;
    const p = this.view.players[seat];
    if (this.table.getState().room?.seats.find(r => r.seat === seat)?.takeover) return 'Bot';
    return !p.connected ? 'Offline' : p.afk ? 'AFK' : null;
  }

  get discardTrail() { return this.trail; }
  get lastDiscard() { return this.trail[this.trail.length - 1] ?? null; }
  get remainingDrawable(): number { return this.view.wallCount; }
  get matchOver(): boolean { return this.view.matchOver; }
  get humanDrawnTileId(): string | null { return this.view.drawnTileId; }
  /** Online has no GameOutcome: the winner of a valid Hu once the hand has ended, else null (playing, Seri, Lew Fit). */
  get huWinner(): Seat | null {
    const v = this.table.getState().view, last = v?.lastHand;
    return v?.phase === 'RESOLVED_HU' && last?.winner && !last.payments.lewFit ? last.winner : null;
  }

  getSettings() { return this.view.settings ?? { kimEnabled: this.table.getState().room?.config.kimMode !== 'off', minHuTay: this.table.getState().room?.config.minHuTay ?? 5 }; }

  getState() {
    const { view, seat } = this.table.getState();
    if (this.cache?.view !== view || this.cache.seat !== seat) this.cache = { view, seat, state: this.build() };
    return this.cache.state;
  }

  private build() {
    const v = this.view;
    const players = Object.fromEntries(SEAT_ORDER.map(seat => {
      const p = v.players[seat];
      const hand = seat === this.humanSeat && !this.spectator ? v.hand : Array.from({ length: p.concealedCount }, (_, i) => hiddenTile(seat, i));
      return [seat, { seat, name: seatName(this.table, seat), isHuman: true, hand, melds: p.melds, flowers: p.flowers, discards: p.discards, isCin: false, isPaoChin: p.isPaoChin }];
    })) as Record<Seat, PlayerState>;
    return {
      phase: v.phase, roundWind: v.roundWind, currentTurn: v.currentTurn, dealerSeat: v.dealer, kimFace: v.kimFace, kimIndicator: v.indicator,
      players, discardPending: v.pendingDiscard, pendingClaims: {}, consecutiveKongs: 0, selfDrawSeat: v.drawnTileId && !this.spectator ? this.humanSeat : null,
      wall: { remainingCount: v.wallCount, remainingDrawable: v.wallCount },
    };
  }

  getHumanActions(): HumanActions {
    const v = this.view, l = v.legal;
    if (!l || v.phase === 'DRAW_SERI' || v.phase === 'RESOLVED_HU') return NONE;
    const pending = v.pendingDiscard;
    if (v.phase === 'CLAIM_WINDOW') {
      const mine = v.pendingDecisions.some(d => d.kind === 'claim');
      const claimable = l.canDiscardWinHu || l.canPung || l.canKong || l.canJia;
      if (!mine || !pending || !claimable) return NONE;
      return { ...NONE, claim: {
        tile: pending.tile, discarder: pending.discarder, isPromotedKong: !!pending.isPromotedKong,
        canHu: l.canDiscardWinHu, huScore: l.discardHuScore, canPung: l.canPung, canKong: l.canKong, jiaOptions: l.canJia ? l.jiaOptions : [],
      } };
    }
    if (v.currentTurn !== this.humanSeat) return NONE;
    return { ...NONE, canDraw: l.canDraw, canDiscard: l.canDiscard, discardableTileIds: l.discardableTileIds,
      ankongOptions: l.ankongOptions, kakanOptions: l.kakanOptions, canSelfDrawHu: l.canSelfDrawHu, selfHuScore: l.selfHuScore, canPaoChin: l.canPaoChin };
  }

  humanReplaceFlowers(): void { /* the server replaces Bunga / Musim itself */ }
  humanDraw(): void { this.table.act({ type: 'draw' }); }
  humanDiscard(tileId: string): void { this.table.act({ type: 'discard', tileId }); }
  humanAnkong(index: number): void {
    const group = this.getHumanActions().ankongOptions[index];
    if (group) this.table.act({ type: 'ankong', tileIds: group.map(t => t.id) });
  }
  humanKakan(index: number): void {
    const opt = this.getHumanActions().kakanOptions[index];
    if (opt) this.table.act({ type: 'kakan', tileId: opt.tile.id, meldIndex: opt.meldIndex });
  }
  humanSelfDrawHu(): void { this.table.act({ type: 'selfHu' }); }
  humanPaoChin(): void { this.table.act({ type: 'paoChin' }); }
  humanClaim(action: ClaimDeclaration['action'], jiaIndex = 0): void {
    const claim = this.getHumanActions().claim;
    if (!claim) return;
    if (action === 'pass') this.table.act({ type: 'pass' });
    else if (action === 'jia') {
      const option = claim.jiaOptions[jiaIndex];
      if (option) this.table.act({ type: 'claim', kind: 'jia', tileIds: option.map(t => t.id) });
    } else this.table.act({ type: 'claim', kind: action });
  }
}

/** The table components are typed against GameController; this is the one place the slice is widened to it. */
export const asGameController = (remote: RemoteController): GameController => remote as unknown as GameController;

/** Names for the table components: the room's nicknames, with "(Anda)" or "(Menonton)" on this device's bottom seat. */
export function seatNames(table: RemoteTable): Record<Seat, string> {
  const { seat } = table.getState();
  const names = Object.fromEntries(SEAT_ORDER.map(id => [id, seatName(table, id)])) as Record<Seat, string>;
  if (seat !== null) names[seat] = `${names[seat]} (kamu)`;
  return names;
}

export function seatPremium(table: RemoteTable): Partial<Record<Seat, boolean>> {
  return Object.fromEntries((table.getState().room?.seats ?? []).map(s => [s.seat, !s.bot && !!s.premium]));
}

/** A spectator watches from Dong's side; the bottom label is the spectator's own name. */
export function spectatorBottomNames(table: RemoteTable): Record<Seat, string> {
  return { ...seatNames(table), dong: `${table.playerName} · Menonton` };
}
