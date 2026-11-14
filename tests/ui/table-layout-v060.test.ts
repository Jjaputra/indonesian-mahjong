import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { keyToTile } from '@/core/tiles';
import { getPreset, type GameSettings } from '@/storage';
import { ActionHud, CenterArea, HumanArea, OpponentPanel, PracticeCoach } from '@/ui/components/GameTable';
import { GameController } from '@/ui/game-controller';
import { driveDemo } from '@/ui/dev-demo';

const noop = () => undefined;
const settings = (patch: Partial<GameSettings> = {}): GameSettings => ({ ...getPreset('tournament'), soundEnabled: false, ...patch });
const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
/** Declarations of the first top-level rule whose selector list is exactly `selector`. */
const ruleBody = (selector: string) => {
  const escaped = selector.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
  return css.match(new RegExp('(?:^|\\n)' + escaped + ' \\{([^}]*)\\}'))?.[1] ?? '';
};

function controllerAt(mode: 'table' | 'late' | 'melds'): GameController {
  const c = new GameController({ settings: settings(), seed: 7, saveHistory: false, autoStart: false });
  c.startMatch();
  driveDemo(c, mode);
  return c;
}

describe('v0.6.0 table layout: framed discard pool, sets above each hand', () => {
  it('pool runs 17 tiles per row with the side panel open and 20 with it hidden, sized from the frame width', () => {
    expect(ruleBody('.table-felt .discard-pool')).toMatch(/--pool-cols: 17;/);
    expect(ruleBody('.app.options-hidden .table-felt .discard-pool')).toMatch(/--pool-cols: 20;/);
    expect(ruleBody('.table-felt .discard-pool')).toMatch(/container-type: inline-size;/);
    expect(ruleBody('.table-felt .discard-pool .pool-tile > .tile')).toMatch(/--w: calc\(\(100cqw [^;]*\/ var\(--pool-cols\) \* var\(--pool-scale, 1\)\)/);
    const html = renderToStaticMarkup(createElement(CenterArea, { controller: controllerAt('late') }));
    expect(html).toMatch(/<div class="pool-frame"><p data-wall-anchor="" class="wall-counter[^"]*"[^>]*>SISA: <b>\d+<\/b> TILES<\/p>/);
    expect(html).toMatch(/class="pool-frame">.*<div class="discard-pool"/);
  });

  it('frame edges carry the wind of the seat on that side, with dealer and turn marks', () => {
    const c = controllerAt('table');
    const html = renderToStaticMarkup(createElement(CenterArea, { controller: c }));
    const winds = [...html.matchAll(/class="felt-wind felt-(\w+)( is-turn)?" aria-hidden="true"><b>(.)<\/b> ([^<]+)(<small>)?/g)];
    expect(winds.map((w) => w[1]).sort()).toEqual(['bottom', 'left', 'right', 'top']);
    for (const w of winds) expect(`${w[3]} ${w[4]}`).toMatch(/^(西 Xī - WEST|南 Nán - SOUTH|东 Dōng - EAST|北 Běi - NORTH)$/);
    expect(winds.filter((w) => w[2])).toHaveLength(1);
    expect(winds.filter((w) => w[5])).toHaveLength(1);
  });

  it('each seat shows its sets first, then bunga / musim, in one strip after its hidden tiles', () => {
    const c = controllerAt('melds');
    const seat = (['dong', 'nan', 'xi', 'bei'] as const).find((x) => x !== c.humanSeat && c.getState().players[x].melds.length > 0)!;
    expect(seat).toBeDefined();
    c.getState().players[seat].flowers = [keyToTile('F1')];
    const html = renderToStaticMarkup(createElement(OpponentPanel, { seat, position: 'top', controller: c }));
    const order = ['data-hand-anchor', 'class="seat-sets"', `data-meld-anchor="${seat}"`, 'class="rack"'].map((s) => html.indexOf(s));
    expect(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1]!))).toBe(true);
    expect(html).toContain('title="Nomor sendiri: ');
  });

  it('your sets row sits between the coach and your hand; the action pills come first', () => {
    const c = controllerAt('melds');
    const actions = c.getHumanActions();
    const html = renderToStaticMarkup(createElement(HumanArea, { controller: c, actions, selectedId: null, onSelect: noop,
      hud: createElement(ActionHud, { controller: c, actions, selectedId: null, onSelect: noop }),
      coach: createElement(PracticeCoach, { controller: c, actions, selectedId: null }) }));
    const order = ['action-hud', 'coach-slot', 'class="seat-sets"', `data-meld-anchor="${c.humanSeat}"`, 'class="rack"', 'hand-row'].map((s) => html.indexOf(s));
    expect(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1]!))).toBe(true);
  });
});
