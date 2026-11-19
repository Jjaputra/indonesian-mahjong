import { soundEffects } from '../audio';
import type { SeatView } from '../session';
import type { ActionInput, RemoteTable } from '../net/remote-table';
import type { Seat } from '../core/types';

function turnKey(view: SeatView, seat: Seat, advance = 0): string {
  const turn = view.turnCount + (view.legal?.canDraw ? 1 : 0) + advance;
  return `${view.match.startedAt}:${view.match.hands.length}:${seat}:${turn}`;
}

/** Versions also change on presence updates and other claim responses; neither is a new decision. */
export class TurnAlertTracker {
  private seen = new Set<string>();
  private ownTurn: string | null = null;

  acted(view: SeatView, seat: Seat | null, action: ActionInput): void {
    if (seat && (['draw', 'ankong', 'kakan', 'paoChin'].includes(action.type) || (action.type === 'claim' && action.kind !== 'hu'))) {
      this.ownTurn = turnKey(view, seat, action.type === 'claim' ? 1 : 0);
    }
  }

  update(view: SeatView | null, seat: Seat | null): boolean {
    if (!view || !seat || view.matchOver || !view.legal) return false;
    const legal = view.legal;
    const claim = view.phase === 'CLAIM_WINDOW' && view.pendingDecisions.some(d => d.seat === seat && d.kind === 'claim')
      && (legal.canDiscardWinHu || legal.canPung || legal.canKong || legal.canJia);
    const turn = view.currentTurn === seat && (legal.canDraw || legal.canDiscard);
    if (!claim && !turn) return false;
    const key = claim ? `claim:${view.match.startedAt}:${view.match.hands.length}:${view.pendingDiscard?.tile.id}:${!!view.pendingDiscard?.isPromotedKong}` : `turn:${turnKey(view, seat)}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return !(turn && this.ownTurn === turnKey(view, seat));
  }
}

/** Lifetime belongs to the room screen, so reconnects and React renders keep the same tracker. */
export function startTurnAlerts(table: RemoteTable): () => void {
  const tracker = new TurnAlertTracker();
  let timer: ReturnType<typeof setInterval> | null = null;
  let title = '';
  const away = () => document.hidden || !document.hasFocus();
  const restore = () => {
    if (timer !== null) { clearInterval(timer); timer = null; document.title = title; }
  };
  const returned = () => { if (!away()) restore(); };
  const update = () => {
    const { view, seat, room, status } = table.getState();
    if (!view || room?.phase !== 'playing') { restore(); return; }
    if (status !== 'open' || !tracker.update(view, seat)) return;
    soundEffects.playFlowerReplacement();
    if (!away()) return;
    try { navigator.vibrate?.(150); } catch { /* Unsupported or blocked by the browser. */ }
    if (timer !== null) return;
    title = document.title;
    document.title = '● Giliran Anda!';
    timer = setInterval(() => {
      if (!away()) { restore(); return; }
      document.title = document.title === title ? '● Giliran Anda!' : title;
    }, 800);
  };
  const unsubscribe = table.subscribe(update);
  const unsubscribeActions = table.subscribeActions(action => {
    const { view, seat } = table.getState();
    if (view) tracker.acted(view, seat, action);
  });
  document.addEventListener('visibilitychange', returned);
  window.addEventListener('focus', returned);
  update();
  return () => {
    unsubscribe(); unsubscribeActions(); restore();
    document.removeEventListener('visibilitychange', returned);
    window.removeEventListener('focus', returned);
  };
}
