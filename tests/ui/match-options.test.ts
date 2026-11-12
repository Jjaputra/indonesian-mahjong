import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMatch, recordHand, countedGames, isMatchOver, standings, rollOpeningDealer, loadMatchLength, saveMatchLength, loadDeadWall, saveDeadWall } from '@/ui/match';
import { GameController } from '@/ui/game-controller';
import type { GameEngineState } from '@/core/game-engine';
import { GameEngine } from '@/core/game-engine';
import { Wall, createMulberry32 } from '@/core/wall';
import { parseTileHand, createCompleteTileSet } from '@/core/tiles';
import { MemoryStorage, getPreset, sanitizeSettings, updateSettings, loadSettings } from '@/storage';
import { MatchScoreboard, MatchResultNote, MatchStandingsModal } from '@/ui/components/MatchBoard';
import { MainMenu } from '@/ui/components/MainMenu';
import { seatWindOf } from '@/ui/win-context';

const options = { settings: { ...getPreset('tournament'), kimEnabled: false, kimMode: 'off' as const }, autoStart: false, saveHistory: false };
const noop = () => {};
describe('v0.4.2 match options', () => {
  it('16++ counts Seri and Lew Fit but excludes valid dealer wins, including the last replay', () => {
    let m = createMatch('16++');
    for (let i = 0; i < 15; i++) m = recordHand(m, null, false, 0);
    for (let i = 0; i < 4; i++) m = recordHand(m, 'dong', true, 5);
    expect(countedGames(m)).toBe(15);
    expect(m.hands).toHaveLength(19);
    expect(m.huCount.dong).toBe(4);
    expect(isMatchOver(m)).toBe(false);
    m = recordHand(m, 'dong', false, 100);
    expect(countedGames(m)).toBe(16);
    expect(isMatchOver(m)).toBe(true);
    expect(m.tayTotal.dong).toBe(20);
    expect(m.seating.dealer).toBe('nan');
    const draw = recordHand(createMatch('16++'), null, false, 100);
    expect(countedGames(draw)).toBe(1);
    expect(draw.seating.dealer).toBe('dong');
  });
  it('valid non-dealer wins advance 16++ and normal lengths count dealer wins', () => {
    expect(countedGames(recordHand(createMatch('16++'), 'nan', true, 5))).toBe(1);
    expect(countedGames(recordHand(createMatch(16), 'dong', true, 5))).toBe(1);
  });
  it('accumulates valid Tay only and never ranks by Tay', () => {
    let m = recordHand(createMatch(null), 'dong', true, 5);
    m = recordHand(m, 'nan', true, 100);
    m = recordHand(m, 'dong', false, 200);
    m = recordHand(m, null, false, 100);
    expect(m.tayTotal).toEqual({ dong: 5, nan: 100, xi: 0, bei: 0 });
    expect(standings(m)[0]!.seat).toBe('dong');
    m = recordHand(m, 'dong', true, 18);
    expect(m.tayTotal.dong).toBe(23);
    for (const html of [
      renderToStaticMarkup(createElement(MatchScoreboard, { match: m, hand: 5, prevailingWind: 'dong', dealer: 'dong' })),
      renderToStaticMarkup(createElement(MatchResultNote, { match: m })),
      renderToStaticMarkup(createElement(MatchStandingsModal, { match: m, onMenu: noop, onPlayAgain: noop })),
    ]) expect(html).toContain('23');
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
    const a = new GameController({ ...options, seed: 7 }); a.startMatch(16);
    const b = new GameController({ ...options, seed: 7 }); b.startMatch(16);
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
    const c = new GameController({ ...options, seed: 7 }); c.startMatch('16++', 'stay', null, '14');
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
    expect(loadMatchLength(store)).toBe(16);
    store.setItem('itm.match-length.v1', '4'); expect(loadMatchLength(store)).toBe(16);
    for (const length of [8, 16, '16++', null] as const) { saveMatchLength(length, store); expect(loadMatchLength(store)).toBe(length); }
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
