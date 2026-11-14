import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { DiceRoll } from '@/ui/components/DiceRoll';
import { rollOpeningDealer } from '@/ui/match';
import { createMulberry32, Wall } from '@/core/wall';
import { GameController } from '@/ui/game-controller';
import { getPreset } from '@/storage';
import { parseTileHand } from '@/core/tiles';
import type { GameEngineState } from '@/core/game-engine';

// Exercise the component's hooks and event handlers without adding a DOM dependency.
const hooks = vi.hoisted(() => ({ state: undefined as unknown, effect: undefined as (() => void | (() => void)) | undefined }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    if (hooks.state === undefined) hooks.state = initial;
    return [hooks.state, (next: unknown) => { hooks.state = next; }];
  },
  useEffect: (effect: () => void | (() => void)) => { hooks.effect = effect; },
}));

describe('three-dice flow', () => {
  let cleanup: void | (() => void);
  beforeEach(() => {
    hooks.state = undefined;
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout, clearTimeout, matchMedia: () => ({ matches: false }) });
  });
  afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); vi.useRealTimers(); });

  function mount(roll = rollOpeningDealer(createMulberry32(7))) {
    const onDone = vi.fn();
    const render = () => {
      cleanup?.();
      const tree = DiceRoll({ roll, humanSeat: 'dong', onDone });
      cleanup = hooks.effect?.();
      return (tree.props.children[1] as ReactElement<{ disabled: boolean; children: string; onClick: () => void }>).props;
    };
    return { render, onDone };
  }

  it('keeps dice still before Lempar and never closes before OK', () => {
    const { render, onDone } = mount();
    expect(render().children).toBe('Lempar dadu');
    vi.advanceTimersByTime(60000);
    expect(render().children).toBe('Lempar dadu');
    expect(hooks.state).toMatchObject({ rolling: false, started: false });
    render().onClick();
    expect(render().disabled).toBe(true);
    for (let i = 0; i < 20; i++) { vi.advanceTimersByTime(1500); render(); }
    expect(render().children).toBe('OK, mulai main');
    vi.advanceTimersByTime(60000);
    expect(onDone).not.toHaveBeenCalled();
    render().onClick();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('reduced motion still requires Lempar and OK', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const { render, onDone } = mount();
    expect(render().children).toBe('Lempar dadu');
    render().onClick();
    expect(hooks.state).toMatchObject({ rolling: false, done: true });
    expect(render().children).toBe('OK, mulai main');
    expect(onDone).not.toHaveBeenCalled();
    render().onClick();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('every opening result has three dice and a total from 3 to 18', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const roll = rollOpeningDealer(createMulberry32(seed));
      for (const round of roll.rounds) for (const { dice } of round) {
        expect(dice).toHaveLength(3);
        expect(dice.every(value => value >= 1 && value <= 6)).toBe(true);
        const total = dice.reduce((sum, value) => sum + value, 0);
        expect(total).toBeGreaterThanOrEqual(3);
        expect(total).toBeLessThanOrEqual(18);
      }
    }
  });

  it('keeps the opening roll during results, then gives the next dealer a single-seat roll', () => {
    const c = new GameController({ settings: getPreset('tournament'), autoStart: false, seed: 7, saveHistory: false });
    c.startMatch();
    const opening = c.handRoll;
    expect(c.nextHand()).toBe(false);
    const s = c.getState() as GameEngineState;
    s.wall = new Wall([], null);
    s.phase = 'TURN_DRAW'; s.currentTurn = c.humanSeat;
    s.players[c.humanSeat].hand = parseTileHand('1T 2T 3T 4T 5T 6T 7B 8B 9B 1W 1W 2W 3W');
    c.humanDraw(); c.step();
    expect(c.outcome?.kind).toBe('seri');
    expect(c.handRoll).toBe(opening);
    expect(c.nextHand()).toBe(true);
    expect(c.handRoll?.kind).toBe('dealer');
    expect(c.handRoll?.rounds).toHaveLength(1);
    expect(c.handRoll?.rounds[0]).toHaveLength(1);
    expect(c.handRoll?.rounds[0]?.[0]?.seat).toBe(c.getState().dealerSeat);
    expect(c.handRoll?.rounds[0]?.[0]?.dice).toHaveLength(3);
    expect(c.match?.openingRoll).toBe(opening);
  });
});
