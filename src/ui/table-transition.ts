import type { GameEvent } from './game-controller';
import type { Seat, Tile } from '../core/types';
import type { AnimationSpeed } from '../storage';
export interface PublicMotion { kind: 'draw' | 'discard' | 'claim'; seat: Seat; tile?: Tile; call?: string }
/** Deliberately never propagates a draw face, including from an accidental richer event. */
export function publicMotion(event: GameEvent): PublicMotion | null {
  if (!event.seat) return null;
  if (event.type === 'draw') return { kind: 'draw', seat: event.seat };
  if (event.type === 'discard' && event.tile) return { kind: 'discard', seat: event.seat, tile: event.tile };
  if (['jia', 'pung', 'kong'].includes(event.type) && event.tile) return {
    kind: 'claim', seat: event.seat, tile: event.tile, call: event.type[0]!.toUpperCase() + event.type.slice(1),
  };
  return null;
}
export function motionTiming(speed: AnimationSpeed, reduced: boolean): { travel: number; hold: number } {
  return { travel: reduced || speed === 'off' ? 0 : speed === 'slow' ? 620 : 420,
    hold: speed === 'slow' ? 1400 : speed === 'fast' || speed === 'off' ? 900 : 1150 };
}

/** Geometry is optional: every visible transition settles, even with missing anchors. */
export function holdPresentation(hold: number, release: () => void, onComplete: () => void): () => void {
  let settled = false;
  const finish = (completed: boolean) => {
    if (settled) return;
    settled = true;
    if (completed) onComplete();
    release();
  };
  const timer = setTimeout(() => finish(true), hold);
  return () => { clearTimeout(timer); finish(false); };
}
