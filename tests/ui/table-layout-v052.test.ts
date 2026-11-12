import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { getPreset, type GameSettings } from '@/storage';
import { ActionHud, CenterArea, HumanArea, PracticeCoach, seatPositions } from '@/ui/components/GameTable';
import { MatchResultNote, MatchStandingsModal } from '@/ui/components/MatchBoard';
import { GameController } from '@/ui/game-controller';
import { driveDemo } from '@/ui/dev-demo';
import { createMatch, recordHand } from '@/ui/match';

const noop = () => undefined;
const settings = (patch: Partial<GameSettings> = {}): GameSettings => ({ ...getPreset('tournament'), soundEnabled: false, ...patch });

function controllerAt(mode: 'table' | 'claim'): GameController {
  const c = new GameController({ settings: settings(), seed: 7, saveHistory: false, autoStart: false });
  c.startMatch();
  driveDemo(c, mode);
  return c;
}

describe('v0.5.2 table layout', () => {
  it('lays discards out as one river per player, each holding only that player\'s tiles', () => {
    const c = controllerAt('table');
    const html = renderToString(createElement(CenterArea, { controller: c }));
    const pos = seatPositions(c.humanSeat);
    for (const side of ['bottom', 'right', 'top', 'left'] as const) {
      expect(html).toContain(`class="discard-river river-${side}" data-discard-group="${pos[side]}"`);
    }
    // Every committed discard sits in its owner's river, and nowhere else.
    const tiles = [...html.matchAll(/class="pool-tile[^"]*" data-seat="(\w+)"/g)].map((m) => m[1]);
    expect(tiles).toHaveLength(c.discardTrail.length);
    for (const seat of Object.values(pos)) {
      expect(tiles.filter((s) => s === seat)).toHaveLength(c.discardTrail.filter((d) => d.seat === seat).length);
    }
    expect(html).not.toContain('discard-pool');
    expect(html).toContain('is-fresh');
  });

  it('puts the claimable discard, highlighted, at the end of its discarder\'s river', () => {
    const c = controllerAt('claim');
    const pending = c.getState().discardPending!;
    const html = renderToString(createElement(CenterArea, { controller: c }));
    const river = html.match(new RegExp(`data-discard-group="${pending.discarder}"[^>]*>(.*?)</div>`))![1]!;
    expect(river).toMatch(/class="pool-tile is-fresh is-pending" data-pending-discard=""[^>]*><span class="tile tile-sm[^"]*is-highlight/);
    expect((html.match(/data-pending-discard/g) ?? [])).toHaveLength(1);
  });

  it('shows one turn card naming whose turn it is, without a separate Giliran stat', () => {
    const html = renderToString(createElement(CenterArea, { controller: controllerAt('table') }));
    expect(html).toMatch(/class="table-stage turn-card"[^>]*><span class="turn-who">Giliran <strong>Anda<\/strong><\/span>/);
    expect(html).not.toContain('center-stats');
  });

  it('renders the coach just above the hand, and the action pills without the coach line', () => {
    const c = controllerAt('table');
    const actions = c.getHumanActions();
    const hud = renderToStaticMarkup(createElement(ActionHud, { controller: c, actions, selectedId: null, onSelect: noop }));
    expect(hud).not.toContain('practice-coach');
    const html = renderToStaticMarkup(createElement(HumanArea, { controller: c, actions, selectedId: null, onSelect: noop,
      hud: createElement(ActionHud, { controller: c, actions, selectedId: null, onSelect: noop }),
      coach: createElement(PracticeCoach, { controller: c, actions, selectedId: null }) }));
    expect(html.indexOf('action-hud')).toBeLessThan(html.indexOf('coach-slot'));
    expect(html.indexOf('practice-coach')).toBeLessThan(html.indexOf('hand-row'));
  });
});

describe('v0.5.2 result standings', () => {
  it('ranks players in a compact table with this game\'s Tay, the winner highlighted and the next dealer crowned', () => {
    let m = recordHand(createMatch(), 'nan', true, 12);
    m = recordHand(m, 'xi', true, 7);
    const html = renderToStaticMarkup(createElement(MatchResultNote, { match: m }));
    expect(html).toContain('<strong>Game 2/16 selesai.</strong>');
    expect(html).toContain('+Tay<span class="th-long"> game ini</span>');
    const rows = [...html.matchAll(/<tr( class="([^"]*)")?><td class="rank">(\d)<\/td><th scope="row">([^<]+)/g)].map((r) => ({ cls: r[2] ?? '', rank: r[3], name: r[4] }));
    expect(rows.map((r) => r.name)).toEqual(['Bot Kanan', 'Bot Seberang', 'Anda', 'Bot Kiri']);
    expect(rows[1]!.cls).toContain('is-winner');
    expect(rows.filter((r) => r.cls.includes('is-winner'))).toHaveLength(1);
    // Bot Seberang won this game and, after Bot Kanan's earlier Hu, deals next.
    expect(html).toMatch(/is-winner"><td class="rank">2<\/td><th scope="row">Bot Seberang<svg[^]*?aria-label="Dealer berikutnya"[^]*?<\/th><td class="num gained">\+7<\/td><td class="num total">7<\/td>/);
    expect(html).toContain('<td class="num gained is-zero">–</td>');
  });

  it('final standings use the same table with the champion highlighted', () => {
    let m = createMatch();
    for (let i = 0; i < 16; i++) m = recordHand(m, i === 3 ? 'bei' : null, i === 3, 9);
    const html = renderToStaticMarkup(createElement(MatchStandingsModal, { match: m, onPlayAgain: noop, onMenu: noop }));
    expect(html).toContain('class="standings-table"');
    expect(html).toMatch(/class="is-winner"><td class="rank">1<\/td><th scope="row">Bot Kiri/);
    expect(html).toContain('Total dicapai di game 4');
  });
});
