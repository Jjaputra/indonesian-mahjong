import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMatch, recordHand, countedGames, isMatchOver, standings, rollOpeningDealer, migrateMatchLengthPreference, loadDeadWall, saveDeadWall } from '@/ui/match';
import { GameController } from '@/ui/game-controller';
import type { GameEngineState } from '@/core/game-engine';
import { GameEngine } from '@/core/game-engine';
import { Wall, createMulberry32 } from '@/core/wall';
import { parseTileHand, createCompleteTileSet } from '@/core/tiles';
import { MemoryStorage, getPreset, sanitizeSettings, updateSettings, loadSettings } from '@/storage';
import { MatchScoreboard, MatchResultNote, MatchStandingsModal, TableInfo } from '@/ui/components/MatchBoard';
import { HuResultModal } from '@/ui/components/HuResultModal';
import { MainMenu } from '@/ui/components/MainMenu';
import { seatWindOf } from '@/ui/win-context';

const options = { settings: { ...getPreset('tournament'), kimEnabled: false, kimMode: 'off' as const }, autoStart: false, saveHistory: false };
const noop = () => {};
describe('v0.4.2 match options', () => {
  it('counts every hand once and ends after 16, with no replay for dealer Hu or Seri', () => {
    let m = createMatch();
    for (let i = 0; i < 14; i++) m = recordHand(m, null, false, 0);
    m = recordHand(m, 'dong', true, 5);
    expect(countedGames(m)).toBe(15);
    expect(m.seating.dealer).toBe('nan');
    expect(isMatchOver(m)).toBe(false);
    m = recordHand(m, null, false, 0);
    expect(countedGames(m)).toBe(16);
    expect(isMatchOver(m)).toBe(true);
    expect(m.seating.dealer).toBe('nan');
    expect(recordHand(m, 'nan', true, 100)).toBe(m);
    const lewFit = recordHand(createMatch(), 'dong', false, 100);
    expect(countedGames(lewFit)).toBe(1);
    expect(lewFit.seating.dealer).toBe('nan');
  });
  it('ranks by valid Tay before Hu count and displays both', () => {
    let m = recordHand(createMatch(), 'dong', true, 5);
    m = recordHand(m, 'nan', true, 100);
    m = recordHand(m, 'dong', false, 200);
    m = recordHand(m, null, false, 100);
    m = recordHand(m, 'dong', true, 18);
    expect(m.tayTotal).toEqual({ dong: 23, nan: 100, xi: 0, bei: 0 });
    expect(standings(m)[0]!.seat).toBe('nan');
    const board = renderToStaticMarkup(createElement(MatchScoreboard, { match: m, hand: 6, prevailingWind: 'dong', dealer: 'dong' }));
    expect(board).toContain('Tabel Total Poin');
    expect(board).toMatch(/<tr class="match-score is-leader"><td class="rank">#1<\/td><th scope="row">Bot Kanan<\/th>/);
    expect(board).toMatch(/is-human"><td class="rank">#2<\/td><th scope="row">Anda/);
    expect(board.indexOf('Bot Kanan')).toBeLessThan(board.indexOf('Anda'));
    for (const html of [board,
      renderToStaticMarkup(createElement(MatchResultNote, { match: m })),
      renderToStaticMarkup(createElement(HuResultModal, { outcome: { kind: 'seri', durationSeconds: 1 }, matchSummary: createElement(MatchResultNote, { match: m }), onClose: noop, onNewGame: noop })),
      renderToStaticMarkup(createElement(MatchStandingsModal, { match: m, onMenu: noop, onPlayAgain: noop })),
    ]) {
      expect(html).toContain('23'); expect(html).toContain('Hu');
      // Result notes mention the next dealer before their ranked standings table.
      const scoreSummary = html.match(/<div class="match-note"><p>.*?<\/p>(<table class="standings-table">.*?<\/table>)/)?.[1] ?? html;
      expect(scoreSummary.indexOf('Bot Kanan')).toBeLessThan(scoreSummary.indexOf('Anda'));
    }
  });
  it('breaks Tay ties by valid Hu, then first to reach the final Tay total', () => {
    let m = recordHand(createMatch(), 'dong', true, 20);
    m = recordHand(m, 'nan', true, 10);
    m = recordHand(m, 'nan', true, 10);
    m = recordHand(m, 'xi', true, 5);
    m = recordHand(m, 'xi', true, 15);
    expect(standings(m).map(r => r.seat)).toEqual(['nan', 'xi', 'dong', 'bei']);
    expect(standings(m).map(r => r.reachedAt)).toEqual([3, 5, 1, 0]);
  });
  it('re-rolls only tied highest chairs and retains every round', () => {
    const values = [5, 5, 2, 2, 5, 5, 0, 0, 0, 1, 3, 3].map(n => n / 6);
    const roll = rollOpeningDealer(() => values.shift()!);
    expect(roll).toEqual({ rounds: [
      [{ seat: 'dong', dice: [6, 6] }, { seat: 'nan', dice: [3, 3] }, { seat: 'xi', dice: [6, 6] }, { seat: 'bei', dice: [1, 1] }],
      [{ seat: 'dong', dice: [1, 2] }, { seat: 'xi', dice: [4, 4] }],
    ], dealer: 'xi' });
  });
  it('opening dice are deterministic and a bot dealer receives Timur and 14 tiles', () => {
    expect(rollOpeningDealer(createMulberry32(7))).toEqual(rollOpeningDealer(createMulberry32(7)));
    const a = new GameController({ ...options, seed: 7 }); a.startMatch();
    const b = new GameController({ ...options, seed: 7 }); b.startMatch();
    expect(a.match!.openingRoll).toEqual(b.match!.openingRoll);
    const s = a.getState();
    expect(s.dealerSeat).not.toBe(a.humanSeat);
    expect(s.dealerSeat).toBe(a.match!.openingRoll!.dealer);
    expect(seatWindOf(s, s.dealerSeat)).toBe('dong');
    expect(s.players[s.dealerSeat].hand).toHaveLength(14);
    expect(a.isWaitingForHuman()).toBe(false);
    expect(a.step()).toBe(true);
  });
  it('reserves 14 for both head and tail draws, including clone and serialization', () => {
    const wall = new Wall(createCompleteTileSet().slice(0, 16), null); wall.reservedCount = 14;
    expect(wall.remainingDrawable).toBe(2);
    expect(wall.drawHead()).not.toBeNull(); expect(wall.drawTail()).not.toBeNull();
    expect(wall.remainingCount).toBe(14); expect(wall.remainingDrawable).toBe(0);
    expect(wall.drawTail()).toBeNull(); expect(wall.drawHead()).toBeNull();
    expect(wall.clone().remainingDrawable).toBe(0);
    expect(Wall.deserialize(wall.serialize()).drawTail()).toBeNull();
  });
  it('ends at the reserve with Seri, counting once and keeping seating', () => {
    const c = new GameController({ ...options, seed: 7 }); c.startMatch('stay', null, '14');
    expect(c.remainingDrawable).toBe(c.getState().wall.remainingCount - 14);
    const s = c.getState() as GameEngineState;
    s.wall = new Wall(createCompleteTileSet().slice(0, 14), null); s.wall.reservedCount = 14;
    s.phase = 'TURN_DRAW'; s.currentTurn = c.humanSeat;
    s.players[c.humanSeat].hand = parseTileHand('1T 2T 3T 4T 5T 6T 7B 8B 9B 1W 1W 2W 3W');
    const seating = { ...c.match!.seating };
    c.humanDraw(); c.step();
    expect(c.outcome?.kind).toBe('seri'); expect(countedGames(c.match!)).toBe(1);
    expect(c.match!.seating).toEqual(seating); expect(s.wall.remainingCount).toBe(14);
    expect(c.remainingDrawable).toBe(0);
  });
  it('does not dip into the reserve for a bunga replacement', () => {
    const e = new GameEngine({ kimEnabled: false });
    const s = e.getState() as GameEngineState;
    s.wall = new Wall([...parseTileHand('F1'), ...createCompleteTileSet().slice(0, 14)], null); s.wall.reservedCount = 14;
    s.phase = 'TURN_DRAW'; s.currentTurn = 'dong'; s.players.dong.hand = [];
    expect(e.startTurnDraw('dong').isSeri).toBe(true);
    expect(s.wall.remainingCount).toBe(14);
    expect(s.players.dong.flowers).toHaveLength(1);
  });
  it('migrates old length and Kim preferences and persists all new choices', () => {
    const store = new MemoryStorage();
    for (const legacy of ['4', '8', '16', '16++', 'endless']) {
      store.setItem('itm.match-length.v1', legacy);
      migrateMatchLengthPreference(store);
      expect(store.getItem('itm.match-length.v1')).toBeNull();
    }
    expect(loadDeadWall(store)).toBe('none'); saveDeadWall('14', store); expect(loadDeadWall(store)).toBe('14');
    expect(sanitizeSettings({ kimEnabled: true }).kimMode).toBe('natural');
    expect(sanitizeSettings({ kimEnabled: false }).kimMode).toBe('off');
    for (const kimMode of ['natural', 'dedicated', 'off'] as const) {
      updateSettings({ kimMode }, store); expect(loadSettings(store).kimMode).toBe(kimMode);
    }
  });
  it('renders the three Kim choices and two wall choices together in the menu', () => {
    const html = renderToStaticMarkup(createElement(MainMenu, { difficultyLabel: 'Normal', lastResult: null, onPractice: noop, kimMode: 'natural', onKimModeChange: noop, deadWall: 'none', onDeadWallChange: noop }));
    for (const label of ['Kim dari tile', 'Kim tambahan (pemula)', 'Tanpa Kim', 'Sampai habis (turnamen)', 'Sisa 14 tile (dead wall)']) expect(html).toContain(label);
  });
});

describe('table info panel', () => {
  it('shows the table wind and Kim with real tiles, and the minimum Tay', () => {
    const natural = renderToStaticMarkup(createElement(TableInfo, { roundWind: 'nan', kimEnabled: true, kimFace: { type: 'tong', value: 9 }, minHuTay: 5 }));
    expect(natural).toContain('Angin meja');
    expect(natural).toContain('Selatan (Nan)');
    expect(natural).toContain('9 Tong');
    expect((natural.match(/class="tile tile-sm/g) ?? []).length).toBe(2);
    expect(natural).toMatch(/Minimum Tay<\/dt><dd><b>5<\/b>/);
    const dedicated = renderToStaticMarkup(createElement(TableInfo, { roundWind: 'dong', kimEnabled: true, kimFace: null, minHuTay: 3 }));
    expect(dedicated).toContain('Tile KIM');
    expect(dedicated).toContain('kim-badge');
    const off = renderToStaticMarkup(createElement(TableInfo, { roundWind: 'dong', kimEnabled: false, kimFace: null, minHuTay: 5 }));
    expect(off).toContain('Tanpa Kim');
    expect((off.match(/class="tile tile-sm/g) ?? []).length).toBe(1);
  });
});
