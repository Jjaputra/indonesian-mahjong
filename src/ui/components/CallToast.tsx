import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { MeldType, PlayerState, Seat } from '../../core/types';
import type { GameController, GameEventType } from '../game-controller';
import { PLAYER_NAME } from '../labels';
import { kongToastText, type KongPaymentView } from './points';

export interface CallEvent {
  type: GameEventType;
  seat?: Seat;
  text?: string;
  /** Discarded tile name, e.g. tileText(tile) → "5 Tong" */
  tileLabel?: string;
}

const CALL_WORD: Partial<Record<GameEventType, string>> = { pung: 'Pung', jia: 'Jia', kong: 'Kong' };

/** One short Bahasa Indonesia line for a table event; empty for events that stay quiet. */
export function formatCall(event: CallEvent): string {
  const name = event.seat ? PLAYER_NAME[event.seat] : '';
  const call = CALL_WORD[event.type];
  if (call) return name ? `${name}: ${call}` : call;
  switch (event.type) {
    case 'discard': {
      const action = event.tileLabel ? `buang ${event.tileLabel}` : 'buang';
      return name ? `${name} ${action}` : action.charAt(0).toUpperCase() + action.slice(1);
    }
    case 'hu':
      return name ? `${name} Hu` : 'Hu';
    case 'flower':
      return name ? `${name} buka Bunga` : 'Buka Bunga';
    case 'lewFit':
      return 'Lew Fit';
    case 'seri':
      return 'Seri';
    default:
      return '';
  }
}

export function CallToast({ event }: { event: CallEvent }) {
  const line = formatCall(event);
  if (!line) return null;
  return <p className="call-toast">{line}</p>;
}

/**
 * Live Kong koin toast: when this hand's Kong payment list grows, shows the newest payment
 * ("Kong 中! tiap pemain bayar 4 koin ke Bot Kanan") for a few seconds. A robbed Kong tambahan never
 * reaches the list, so it never toasts.
 */
export function KongToast({ payments, ms = 3200, nameOf, skipExisting = false }: { payments: readonly KongPaymentView[]; ms?: number; nameOf?: (seat: Seat) => string; skipExisting?: boolean }) {
  // Solo starts at 0: the table mounts with a new match, so any payment already listed is fresh.
  // Online can remount mid-hand after a refresh, so it skips payments that are already listed.
  const seen = useRef(skipExisting ? payments.length : 0);
  const [shown, setShown] = useState<KongPaymentView | null>(null);
  useEffect(() => {
    if (payments.length < seen.current) { seen.current = payments.length; setShown(null); return; }
    if (payments.length === seen.current) return;
    seen.current = payments.length;
    setShown(payments[payments.length - 1]!);
  }, [payments]);
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), ms);
    return () => clearTimeout(timer);
  }, [shown, ms]);
  if (!shown) return null;
  return <div className="kong-toast-wrap" role="status" aria-live="polite"><p className="call-toast kong-toast">{kongToastText(shown, nameOf)}</p></div>;
}

// ---------------------------------------------------------------------------
// Seat callouts: PUNG / KONG / JIA / BUNGA by the seat that called, HU with a small flower burst.
// Read from the table state, so single player and online tables (RemoteController has no event feed) share it.
// ---------------------------------------------------------------------------

export type CalloutWord = 'PUNG' | 'KONG' | 'JIA' | 'HU' | 'BUNGA';
export type CalloutPosition = 'bottom' | 'right' | 'top' | 'left';
export interface Callout { id: number; seat: Seat; word: CalloutWord }

const MELD_WORD: Record<MeldType, CalloutWord> = { pung: 'PUNG', jia: 'JIA', kong: 'KONG', ankong: 'KONG' };
const CALLOUT_SEATS: readonly Seat[] = ['dong', 'nan', 'xi', 'bei'];
export const CALLOUT_MS = 1200;
export const HU_MS = 1500;

interface SeatTally { melds: number; kongs: number; flowers: number; last?: MeldType }
export interface TableTally { wall: number; seats: Record<Seat, SeatTally> }

export function tallyTable(wall: number, players: Record<Seat, Pick<PlayerState, 'melds' | 'flowers'>>): TableTally {
  const seats = {} as Record<Seat, SeatTally>;
  for (const seat of CALLOUT_SEATS) {
    const { melds, flowers } = players[seat];
    seats[seat] = { melds: melds.length, kongs: melds.filter((m) => m.type === 'kong' || m.type === 'ankong').length, flowers: flowers.length, last: melds[melds.length - 1]?.type };
  }
  return { wall, seats };
}

/** What changed between two tallies. A new deal (more wall, or any count going down) is a reset, not a call. */
export function calloutsBetween(prev: TableTally, next: TableTally): { seat: Seat; word: CalloutWord }[] {
  if (next.wall > prev.wall) return [];
  const out: { seat: Seat; word: CalloutWord }[] = [];
  for (const seat of CALLOUT_SEATS) {
    const a = prev.seats[seat], b = next.seats[seat];
    if (b.melds < a.melds || b.kongs < a.kongs || b.flowers < a.flowers) return [];
    if (b.kongs > a.kongs) out.push({ seat, word: 'KONG' });
    else if (b.melds > a.melds && b.last) out.push({ seat, word: MELD_WORD[b.last] });
    else if (b.flowers > a.flowers) out.push({ seat, word: 'BUNGA' });
  }
  return out;
}

/** Dev screenshots: `?demo=hu` opens on a finished hand, so let that one count as a fresh Hu. */
const DEMO_HU = import.meta.env.DEV && typeof window !== 'undefined' && /[?&]demo=hu/.test(window.location.search);

/** The seat that just won with a valid Hu: single player reads the outcome, online tables expose `huWinner`. */
const huWinner = (controller: GameController): Seat | null => {
  const remote = (controller as { huWinner?: Seat | null }).huWinner;
  if (remote !== undefined) return remote;
  const o = controller.outcome;
  return o && o.kind === 'hu' && o.scoring.isValidHu ? o.winner : null;
};

/** One celebration per ended hand: a resync of the same hand keeps the key, a later hand has a new hand count. */
export function huKeyOf(controller: GameController): string | null {
  const winner = huWinner(controller);
  return winner ? `${winner}#${controller.match?.hands.length ?? 0}` : null;
}

/** Flower-tile pieces fly toward the table centre; fixed angles keep the burst stable between renders. */
const AIM: Record<CalloutPosition, number> = { bottom: -90, top: 90, left: 0, right: 180 };
export const CONFETTI_PIECES = 12;
export function confettiPiece(i: number, position: CalloutPosition): { dx: number; dy: number; rot: number; delay: number } {
  const angle = (AIM[position] + ((i % 6) - 2.5) * 30 + (i % 2 ? 7 : -7)) * Math.PI / 180;
  const dist = 70 + (i % 4) * 26 + (i > 5 ? 20 : 0);
  return { dx: Math.round(Math.cos(angle) * dist), dy: Math.round(Math.sin(angle) * dist), rot: (i % 2 ? 1 : -1) * (80 + i * 29), delay: (i % 4) * 40 };
}

function CalloutText({ word, seat }: { word: CalloutWord; seat: Seat }) {
  return <b className={`seat-callout${word === 'HU' ? ' is-hu' : ''}`} data-callout={word} data-seat={seat}>{word}</b>;
}

function CalloutItem({ callout, onDone }: { callout: Callout; onDone: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDone(callout.id), callout.word === 'HU' ? HU_MS : CALLOUT_MS);
    return () => clearTimeout(timer);
  }, [callout.id, callout.word, onDone]);
  return <CalloutText word={callout.word} seat={callout.seat} />;
}

/** HU: the callout, a soft glow and a few flower tiles, above the result dialog (which opens at once) and never blocking it. */
function HuCelebration({ callout, position, onDone }: { callout: Callout; position: CalloutPosition; onDone: (id: number) => void }) {
  const slot = document.querySelector(`[data-callout-slot="${position}"]`)?.getBoundingClientRect();
  const x = slot ? slot.left + slot.width / 2 : window.innerWidth / 2;
  const y = slot ? slot.top + slot.height / 2 : window.innerHeight / 2;
  return createPortal(
    <div className="hu-celebration" style={{ left: x, top: y }} aria-hidden="true">
      <span className="hu-glow" />
      {Array.from({ length: CONFETTI_PIECES }, (_, i) => {
        const p = confettiPiece(i, position);
        return <span key={i} className="hu-flower" style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, animationDelay: `${p.delay}ms` } as CSSProperties}>✿</span>;
      })}
      <CalloutItem callout={callout} onDone={onDone} />
    </div>,
    document.body,
  );
}

/** Mounted inside the centre area: one slot per screen position, callouts appear in the seat's slot. */
export function SeatCallouts({ controller, positions }: { controller: GameController; positions: Record<CalloutPosition, Seat> }) {
  const [callouts, setCallouts] = useState<Callout[]>([]);
  const seen = useRef<{ tally: TableTally; huKey: string | null } | null>(null);
  const serial = useRef(0);
  // Runs after every render: the controller changes, App re-renders, and the diff against the last tally is the event.
  useEffect(() => {
    const state = controller.getState();
    const tally = tallyTable(state.wall.remainingCount, state.players);
    const hu = huWinner(controller);
    const huKey = huKeyOf(controller);
    const prev = seen.current ?? (DEMO_HU ? { tally, huKey: null } : null);
    seen.current = { tally, huKey };
    if (!prev) return;
    const fresh = calloutsBetween(prev.tally, tally);
    if (hu && huKey !== prev.huKey) fresh.push({ seat: hu, word: 'HU' });
    if (!fresh.length) return;
    setCallouts((cur) => [...cur.filter((c) => !fresh.some((f) => f.seat === c.seat)), ...fresh.map((f) => ({ ...f, id: ++serial.current }))]);
  });
  const done = useRef((id: number) => setCallouts((cur) => cur.filter((c) => c.id !== id))).current;
  return <>
    {(Object.keys(positions) as CalloutPosition[]).map((position) => {
      const mine = callouts.filter((c) => c.seat === positions[position]);
      return <span key={position} className={`callout-slot callout-slot-${position}`} data-callout-slot={position}>
        {mine.filter((c) => c.word !== 'HU').map((c) => <CalloutItem key={c.id} callout={c} onDone={done} />)}
        {mine.filter((c) => c.word === 'HU').map((c) => <HuCelebration key={c.id} callout={c} position={position} onDone={done} />)}
      </span>;
    })}
  </>;
}
