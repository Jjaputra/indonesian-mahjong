import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GameController, GameEvent } from '../game-controller';
import { PLAYER_NAME, tileText } from '../labels';
import { TileBack, TileView } from './TileView';
import { holdPresentation, motionTiming, publicMotion, type PublicMotion } from '../table-transition';

interface Flight { motion: PublicMotion; source: DOMRect | null; serial: number; done: () => void }
function rect(selector: string): DOMRect | null { return document.querySelector(selector)?.getBoundingClientRect() ?? null; }

/** Observes committed actions synchronously, while the pre-removal DOM is still measurable. */
export function TableMotion({ controller }: { controller: GameController }) {
  const [flight, setFlight] = useState<Flight | null>(null);
  const [moving, setMoving] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const finish = useRef<(() => void) | null>(null);
  const serial = controller.gameSerial;
  useEffect(() => {
    const off = controller.onEvent((event: GameEvent) => {
      const motion = publicMotion(event);
      if (!motion) return;
      finish.current?.();
      const source = motion.kind === 'draw' ? rect('[data-wall-anchor]')
        : motion.kind === 'claim' ? rect('.pending-discard .tile')
        : motion.seat === controller.humanSeat && motion.tile
          ? rect(`[data-hand-anchor="${motion.seat}"] [data-tile-id="${CSS.escape(motion.tile.id)}"]`)
          : rect(`[data-hand-anchor="${motion.seat}"] .tile-back`);
      const done = controller.beginPresentation();
      finish.current = done;
      setMoving(true);
      setFlight({ motion, source, serial: controller.gameSerial, done });
    });
    return () => { off(); finish.current?.(); finish.current = null; };
  }, [controller]);
  useLayoutEffect(() => {
    if (!flight || flight.serial !== serial) { setFlight(null); return; }
    const { motion, source, done } = flight;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timing = motionTiming(controller.getSettings().animationSpeed, reduced);
    const destinationSelector = motion.kind === 'draw' ? `[data-hand-anchor="${motion.seat}"]`
      : motion.kind === 'claim' ? `[data-meld-anchor="${motion.seat}"] [data-tile-id="${CSS.escape(motion.tile!.id)}"]`
      : '.pending-discard .tile';
    const destination = rect(destinationSelector);
    const el = overlay.current;
    let animation: Animation | undefined;
    const target = motion.kind === 'draw' ? document.querySelector<HTMLElement>(`[data-hand-anchor="${motion.seat}"] .is-drawn`)
      : document.querySelector<HTMLElement>(destinationSelector);
    const previousVisibility = target?.style.visibility ?? '';
    const restore = () => { if (target) target.style.visibility = previousVisibility; };
    const settle = () => { if (el) el.style.visibility = 'hidden'; animation?.cancel(); restore(); setMoving(false); };
    if (el && source && destination && timing.travel > 0 && typeof el.animate === 'function') {
      if (target) target.style.visibility = 'hidden';
      // Center a real tile on each measured anchor. Only the tile is transformed.
      const width = el.offsetWidth; const height = el.offsetHeight;
      const x0 = Math.max(0, Math.min(window.innerWidth - width, source.x + source.width / 2 - width / 2));
      const y0 = Math.max(0, Math.min(window.innerHeight - height, source.y + source.height / 2 - height / 2));
      const x1 = Math.max(0, Math.min(window.innerWidth - width, destination.x + destination.width / 2 - width / 2));
      const y1 = Math.max(0, Math.min(window.innerHeight - height, destination.y + destination.height / 2 - height / 2));
      el.dataset.source = JSON.stringify({ x: x0, y: y0 });
      el.dataset.destination = JSON.stringify({ x: x1, y: y1 });
      animation = el.animate([
        { transform: `translate(${x0}px, ${y0}px)` },
        { transform: `translate(${x1}px, ${y1}px)` },
      ], { duration: timing.travel, easing: 'cubic-bezier(.25,.65,.3,1)', fill: 'both' });
      animation.onfinish = settle;
    } else { setMoving(false); }
    // Geometry changes settle at the newly laid-out destination, never a stale viewport coordinate.
    window.addEventListener('scroll', settle, true);
    window.addEventListener('resize', settle);
    const cancelHold = holdPresentation(timing.hold, done, () => { settle(); setFlight(null); });
    return () => {
      cancelHold(); animation?.cancel(); restore();
      window.removeEventListener('scroll', settle, true); window.removeEventListener('resize', settle);
    };
  }, [flight, serial, controller]);

  const active = flight?.serial === serial ? flight : null;
  const state = controller.getState();
  const actor = PLAYER_NAME[state.currentTurn];
  const cue = active ? `${PLAYER_NAME[active.motion.seat]} · ${active.motion.kind === 'draw'
    ? moving ? 'mengambil tile dari tembok' : 'mengambil tile dari tembok · tiba di tangan, memilih buangan'
    : active.motion.kind === 'claim' ? `${active.motion.call} ${tileText(active.motion.tile!)} · mengambil ke meld terbuka`
    : moving ? `membuang ${tileText(active.motion.tile!)}` : `${tileText(active.motion.tile!)} di tengah · menunggu klaim`}`
    : state.phase === 'CLAIM_WINDOW' ? `${PLAYER_NAME[state.discardPending!.discarder]} · menunggu klaim`
    : `${actor} · ${state.phase === 'TURN_DRAW' ? 'giliran berikutnya · mengambil tile' : state.phase === 'ACTION_DECISION' ? 'memilih buangan' : 'persiapan / akhir giliran'}`;
  return <>
    <p className={`table-stage${active ? ' is-transition' : ''}`} role="status" aria-live="polite" data-stage={active ? moving ? 'moving' : 'reading' : 'selecting'}>
      <strong>{cue}</strong>{active && <small>Transisi meja · tunggu tile selesai</small>}
    </p>
    {active && moving && createPortal(<div ref={overlay} className="table-tile-flight" data-motion-kind={active.motion.kind} aria-hidden="true">
      {active.motion.kind === 'draw' ? <TileBack size="lg" /> : <TileView tile={active.motion.tile!} size="lg" />}
    </div>, document.body)}
  </>;
}
