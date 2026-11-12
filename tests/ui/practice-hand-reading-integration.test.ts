import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { getPreset } from '@/storage';
import { PracticeCoach } from '@/ui/components/GameTable';
import { GameController } from '@/ui/game-controller';
import * as reading from '@/ui/hand-reading';
import { toFullRules } from '@/ui/win-context';

afterEach(() => vi.restoreAllMocks());

function renderReading(controller: GameController) {
  const spy = vi.spyOn(reading, 'handReadingLine');
  const actions = controller.getHumanActions();
  const selectedId = actions.discardableTileIds[0]!;
  expect(selectedId).toBeDefined();
  renderToString(createElement(PracticeCoach, { controller, actions, selectedId }));
  expect(spy).toHaveBeenCalledTimes(1);
  return spy.mock.calls[0]![0];
}

describe('selected tile scoring uses active match context', () => {
  it('passes active Kim switches, minimum, and exclusive overlap even when next-game rules differ', () => {
    const settings = { ...getPreset('tournament'), kimEnabled: false, minHuTay: 8, overlapPolicy: 'rulebook_exclusive' as const };
    const controller = new GameController({ settings, seed: 42, saveHistory: false });
    controller.setSettings({ ...settings, kimEnabled: true, minHuTay: 5, overlapPolicy: 'cumulative' });
    const input = renderReading(controller);
    expect(input.rules).toEqual(toFullRules(settings));
    expect(input.rules?.kimEnabled).toBe(false);
    expect(input.minHuTay).toBe(8);
    expect(input.overlapPolicy).toBe('supersede');
  });

  it('uses the untouched dealer opening facts explicitly', () => {
    const controller = new GameController({ settings: getPreset('tournament'), seed: 42, saveHistory: false });
    const input = renderReading(controller);
    expect(input.flags).toMatchObject({ isSelfDraw: true, isFirstGoAround: true, isInitialDealtHand: true, isPaoChin: false, consecutiveKongs: 0 });
  });

  it('does not confuse a nondealer first draw with the untouched dealer hand', () => {
    const controller = new GameController({ settings: getPreset('tournament'), humanSeat: 'nan', seed: 42, saveHistory: false });
    for (let n = 0; n < 30 && !controller.getHumanActions().canDiscard; n++) {
      if (controller.getHumanActions().claim) controller.humanClaim('pass');
      else if (controller.getHumanActions().canDraw) controller.humanDraw();
      else expect(controller.step()).toBe(true);
    }
    const input = renderReading(controller);
    expect(input.flags.isFirstGoAround).toBe(true);
    expect(input.flags.isInitialDealtHand).toBe(false);
    expect(input.overlapPolicy).toBe('supersede');
  });
});
