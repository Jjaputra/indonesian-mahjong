import type { Seat } from '../../core/types';
import type { GameEventType } from '../game-controller';
import { PLAYER_NAME } from '../labels';

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
