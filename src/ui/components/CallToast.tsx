import { useEffect, useRef, useState } from 'react';
import type { Seat } from '../../core/types';
import type { GameEventType } from '../game-controller';
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
      const action = event.tileLabel ? `membuang ${event.tileLabel}` : 'membuang';
      return name ? `${name} ${action}` : action.charAt(0).toUpperCase() + action.slice(1);
    }
    case 'hu':
      return name ? `${name} Hu` : 'Hu';
    case 'flower':
      return name ? `${name} membuka Bunga` : 'Membuka Bunga';
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
export function KongToast({ payments, ms = 3200 }: { payments: readonly KongPaymentView[]; ms?: number }) {
  // Starts at 0: the table mounts with a new match, so any payment already listed is fresh.
  const seen = useRef(0);
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
  return <div className="kong-toast-wrap" role="status" aria-live="polite"><p className="call-toast kong-toast">{kongToastText(shown)}</p></div>;
}
