import { useEffect, useRef, useState } from 'react';
import type { Seat } from '../../core/types';
import { PLAYER_NAME } from '../labels';
import type { MatchState, OpeningRoll } from '../match';
import { seatPositions } from './GameTable';

export type { OpeningRoll };

/** The match's opening roll, when it has one worth showing. */
export function openingRollOf(match: MatchState | null): OpeningRoll | null {
  const roll = match?.openingRoll;
  return roll && roll.rounds.length ? roll : null;
}

const ROLL_MS = 1500;
const SETTLE_MS = 1100;
const CLOSE_MS = 2600;

/** Pip cells on a 3×3 grid (1 = top-left … 9 = bottom-right). */
const PIPS: Record<number, number[]> = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };

function Die({ value, rolling }: { value: number; rolling: boolean }) {
  return (
    <span className={`die${rolling ? ' is-rolling' : ''}`} data-value={value} role="img" aria-label={rolling ? 'Dadu bergulir' : `Dadu ${value}`}>
      <span className="die-cube">
        {[1, 2, 3, 4, 5, 6].map((face) => (
          <span key={face} className={`die-face face-${face}`}>
            {Array.from({ length: 9 }, (_, i) => <i key={i} className={PIPS[face]!.includes(i + 1) ? 'pip' : undefined} />)}
          </span>
        ))}
      </span>
    </span>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Opening dice overlay: each round tumbles for ~1.5s, then settles on its totals; a tie shows
 * which seats re-roll. Tap or "Lewati" jumps to the dealer announcement; reduced motion starts there.
 */
export function DiceRoll({ roll, humanSeat, onDone, autoClose = true }: { roll: OpeningRoll; humanSeat: Seat; onDone: () => void; autoClose?: boolean }) {
  const last = roll.rounds.length - 1;
  const [step, setStep] = useState(() => (prefersReducedMotion() ? { round: last, rolling: false, done: true } : { round: 0, rolling: true, done: false }));
  // The parent re-renders on every clock tick; the timers must not restart with a new callback.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (step.done) {
      if (!autoClose) return;
      const t = window.setTimeout(() => done.current(), CLOSE_MS);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setStep(step.rolling ? { ...step, rolling: false }
      : step.round < last ? { round: step.round + 1, rolling: true, done: false } : { ...step, done: true }), step.rolling ? ROLL_MS : SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [step, last, autoClose]);

  const skip = () => (step.done ? done.current() : setStep({ round: last, rolling: false, done: true }));
  const positions = seatPositions(humanSeat);
  // A seat shows its latest roll up to the current round; seats knocked out earlier stay dimmed.
  const latest = (seat: Seat) => {
    for (let r = step.round; r >= 0; r--) {
      const entry = roll.rounds[r]!.find((e) => e.seat === seat);
      if (entry) return { entry, round: r };
    }
    return null;
  };
  const current = roll.rounds[step.round]!;
  const totals = current.map((e) => e.dice[0] + e.dice[1]);
  const best = Math.max(...totals);
  const tied = current.filter((_, i) => totals[i] === best).map((e) => e.seat);
  const status = step.done
    ? `${PLAYER_NAME[roll.dealer]} jadi dealer (Timur)`
    : step.rolling
      ? step.round === 0 ? 'Lempar dadu: angka tertinggi jadi dealer' : `Lempar ulang: ${current.map((e) => PLAYER_NAME[e.seat]).join(', ')}`
      : tied.length > 1 ? `Seri ${best}: ${tied.map((s) => PLAYER_NAME[s]).join(' & ')} lempar ulang` : `${PLAYER_NAME[tied[0]!]} tertinggi (${best})`;

  return (
    <div className="dice-overlay" role="dialog" aria-modal="true" aria-label="Lempar dadu pembuka" onClick={skip}>
      <div className="dice-board">
        {(Object.entries(positions) as [string, Seat][]).map(([position, seat]) => {
          const shown = latest(seat);
          const live = shown?.round === step.round;
          const rolling = live && step.rolling;
          const total = shown ? shown.entry.dice[0] + shown.entry.dice[1] : null;
          const winner = step.done && seat === roll.dealer;
          return (
            <div key={seat} className={`dice-seat dice-${position}${live ? '' : ' is-out'}${winner ? ' is-dealer' : ''}`}>
              <strong>{PLAYER_NAME[seat]}</strong>
              <span className="dice-pair">
                {shown && shown.entry.dice.map((v, i) => <Die key={`${shown.round}-${i}`} value={v} rolling={rolling} />)}
              </span>
              <span className="dice-total" aria-live="off">{rolling || total === null ? '…' : total}</span>
            </div>
          );
        })}
        <p className={`dice-status${step.done ? ' is-final' : ''}`} role="status">{status}</p>
      </div>
      <button type="button" className="btn dice-skip" onClick={(e) => { e.stopPropagation(); skip(); }}>
        {step.done ? 'Mulai main' : 'Lewati'}
      </button>
    </div>
  );
}
