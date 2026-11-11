import { describe, expect, it, vi } from 'vitest';
import { GameController } from '@/ui/game-controller';
import { getPreset } from '@/storage';
import { holdPresentation, motionTiming, publicMotion } from '@/ui/table-transition';
import { scheduleAutomation } from '@/ui/practice-pace';

function game() { return new GameController({ settings: getPreset('tournament'), seed: 10, saveHistory: false }); }
describe('committed table transition leases', () => {
  it('does not lock headless games; only an attached event presenter holds a public discard', () => {
    const c = game();
    let release: (() => void) | undefined;
    const events: unknown[] = [];
    const off = c.onEvent(e => { events.push(e); if (e.type === 'discard') release = c.beginPresentation(); });
    c.humanDiscard(c.getHumanActions().discardableTileIds[0]!);
    expect(events).toContainEqual({ type: 'discard', seat: c.humanSeat, tile: c.getState().discardPending!.tile });
    expect(c.isPresenting).toBe(true);
    const version = c.version;
    expect(c.step()).toBe(false);
    expect(c.version).toBe(version);
    const wake = vi.fn(); c.subscribe(wake);
    release!();
    expect(c.isPresenting).toBe(false);
    expect(wake).toHaveBeenCalledTimes(1);
    expect(c.step()).toBe(true);
    off();
    expect(c.isPresenting).toBe(false);
  });
  it('stale completion cannot release a newer lease or affect a new hand', () => {
    const c = game();
    const old = c.beginPresentation(); const fresh = c.beginPresentation();
    old(); expect(c.isPresenting).toBe(true);
    fresh(); expect(c.isPresenting).toBe(false);
    const previousHand = c.beginPresentation();
    const serial = c.gameSerial;
    c.newGame(); expect(c.gameSerial).toBe(serial + 1);
    const newHand = c.beginPresentation();
    previousHand(); expect(c.isPresenting).toBe(true);
    newHand(); expect(c.isPresenting).toBe(false);
  });
  it('scheduler cannot advance during a lease and completion notifies for rescheduling', () => {
    vi.useFakeTimers();
    try {
      const c = game(); c.humanDiscard(c.getHumanActions().discardableTileIds[0]!);
      const done = c.beginPresentation(); const version = c.version;
      scheduleAutomation(c, 60, false); vi.advanceTimersByTime(60);
      expect(c.version).toBe(version);
      const unsubscribe = c.subscribe(() => scheduleAutomation(c, 60, false));
      done(); unsubscribe(); vi.advanceTimersByTime(60);
      expect(c.version).toBeGreaterThan(version + 1);
    } finally { vi.useRealTimers(); }
  });
  it('draws are back-only even if a malformed event includes a hidden identity; flower events do not queue flights', () => {
    const tile = { id: 'secret', type: 'tong' as const, value: 7 };
    expect(publicMotion({ type: 'draw', seat: 'nan', tile })).toEqual({ kind: 'draw', seat: 'nan' });
    expect(publicMotion({ type: 'flower', seat: 'nan', tile })).toBeNull();
    expect(publicMotion({ type: 'kong', seat: 'nan' })).toBeNull();
    expect(publicMotion({ type: 'pung', seat: 'nan', tile })).toEqual({ kind: 'claim', seat: 'nan', tile, call: 'Pung' });
  });
  it('reduced motion and off keep a readable static transition; fast still finishes travel before release', () => {
    for (const speed of ['off', 'fast', 'normal', 'slow'] as const) {
      const normal = motionTiming(speed, false); const reduced = motionTiming(speed, true);
      expect(normal.hold).toBeGreaterThan(normal.travel + 400);
      expect(reduced.travel).toBe(0); expect(reduced.hold).toBe(normal.hold);
    }
  });
});

describe('presentation completion without geometry', () => {
  it('settles a static or missing-anchor cue and cancels an unmounted cue exactly once', () => {
    vi.useFakeTimers();
    try {
      const release = vi.fn(); const complete = vi.fn();
      const cancel = holdPresentation(900, release, complete);
      vi.advanceTimersByTime(899); expect(release).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1); expect(complete).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);
      cancel(); expect(release).toHaveBeenCalledTimes(1);
      const cancelUnmount = holdPresentation(900, release, complete);
      cancelUnmount(); vi.runAllTimers();
      expect(release).toHaveBeenCalledTimes(2);
      expect(complete).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});
