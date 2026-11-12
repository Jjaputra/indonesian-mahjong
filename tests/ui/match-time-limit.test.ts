import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameEngineState, GameEngine } from '@/core/game-engine';
import { parseTileHand } from '@/core/tiles';
import { Wall } from '@/core/wall';
import { getPreset, MemoryStorage } from '@/storage';
import { GameController } from '@/ui/game-controller';
import { createMatch, nextSeating, recordHand, remainingMatchMs, watchMatchClock, loadMatchTimeLimit, saveMatchTimeLimit } from '@/ui/match';
import { MainMenu } from '@/ui/components/MainMenu';
import { MatchClock, MatchScoreboard, MatchResultNote, MatchStandingsModal } from '@/ui/components/MatchBoard';

const minute = 60_000;
const epoch = Date.UTC(2026, 10, 12, 1);
const noop = () => {};
const freshController = () => new GameController({ settings: { ...getPreset('tournament'), kimMode: 'off', kimEnabled: false, soundEnabled: false }, autoStart: false, saveHistory: false, seed: 7 });
function finishDealerHu(c: GameController) {
  const s = (c as unknown as { engine: GameEngine }).engine.getState() as GameEngineState;
  s.phase = 'ACTION_DECISION'; s.currentTurn = 'dong'; s.selfDrawSeat = 'dong';
  s.players.dong.hand = parseTileHand('1T 2T 3T 4T 5T 6T 7B 8B 9B 2S 3S 4S 9T 9T');
  s.players.dong.melds = []; s.players.dong.flowers = [];
  expect(c.getHumanActions().canSelfDrawHu).toBe(true);
  c.humanSelfDrawHu();
}
afterEach(() => vi.useRealTimers());

describe('Lew Fit rotation', () => {
  it('rotates after dealer and non-dealer Lew Fit in either dealer-win mode, without a Hu', () => {
    for (const dealerWinRule of ['stay', 'rotate'] as const) {
      for (const declarer of ['dong', 'xi'] as const) {
        const m = recordHand(createMatch('dong', 'dong', 5, dealerWinRule), declarer, false, 3);
        expect(m.seating).toEqual({ dealer: 'nan', prevailingWind: 'dong', dealerPasses: 1 });
        expect(m.huCount).toEqual({ dong: 0, nan: 0, xi: 0, bei: 0 });
        expect(m.tayTotal).toEqual({ dong: 0, nan: 0, xi: 0, bei: 0 });
        expect(m.hands[0]).toMatchObject({ lewFit: true, winner: null, totalTay: 0 });
        const note = renderToStaticMarkup(createElement(MatchResultNote, { match: m }));
        expect(note).toContain('Lew Fit: dealer dan angin duduk berputar');
      }
    }
  });
  it('advances the prevailing wind on a Lew Fit that completes the circuit, and never on Seri', () => {
    const seating = { dealer: 'bei' as const, prevailingWind: 'dong' as const, dealerPasses: 3 };
    expect(nextSeating(seating, { kind: 'lew_fit' })).toEqual({ dealer: 'dong', prevailingWind: 'nan', dealerPasses: 0 });
    expect(nextSeating(seating, { kind: 'none' }, 'rotate')).toEqual(seating);
  });
});

describe('optional real-time match limit', () => {
  it('defaults to unlimited, persists 90 minutes, and rejects malformed stored choices', () => {
    const storage = new MemoryStorage();
    expect(loadMatchTimeLimit(storage)).toBeNull();
    saveMatchTimeLimit(90, storage); expect(loadMatchTimeLimit(storage)).toBe(90);
    saveMatchTimeLimit(null, storage); expect(loadMatchTimeLimit(storage)).toBeNull();
    storage.setItem('itm.match-time-limit.v1', '5'); expect(loadMatchTimeLimit(storage)).toBeNull();
    const html = renderToStaticMarkup(createElement(MainMenu, { difficultyLabel: 'Normal', lastResult: null, onPractice: noop, timeLimitMinutes: null, onTimeLimitChange: noop }));
    expect(html).toContain('role="radiogroup" aria-label="Waktu"');
    expect(html).toContain('<button type="button" role="radio" aria-checked="true" class="is-on">Tanpa batas (default)</button>');
    expect(html).toContain('<button type="button" role="radio" aria-checked="false">90 menit</button>');
    expect(html).toContain('90 menit');
  });

  it('time expiry leaves the active hand playable, then counts its Hu and ends by time', () => {
    vi.useFakeTimers(); vi.setSystemTime(epoch);
    const c = freshController(); c.startMatch('stay', 90);
    const stop = watchMatchClock(c);
    const version = c.version;
    vi.advanceTimersByTime(90 * minute);
    expect(c.version).toBe(version); // Clock ticks do not reset bot automation/presentation timers.
    expect(c.outcome).toBeNull(); expect(c.matchOver).toBe(false);
    expect(c.nextHand()).toBe(false);
    expect(remainingMatchMs(c.match!)).toBe(0);
    const clock = renderToStaticMarkup(createElement(MatchClock, { match: c.match! }));
    expect(clock).toContain('0:00'); expect(clock).toContain('selesaikan game ini');
    finishDealerHu(c);
    expect(c.match!.huCount.dong).toBe(1); expect(c.match!.hands).toHaveLength(1);
    expect(c.match!.endedBy).toBe('time'); expect(c.matchOver).toBe(true);
    expect(c.nextHand()).toBe(false);
    const html = renderToStaticMarkup(createElement(MatchStandingsModal, { match: c.match!, onMenu: noop, onPlayAgain: noop }));
    expect(html).toContain('berakhir karena batas waktu 90 menit');
    stop();
  });

  it('includes dialogs, hidden-tab/bot pauses and waiting between hands without needing bot actions', () => {
    vi.useFakeTimers(); vi.setSystemTime(epoch);
    const c = freshController(); c.startMatch('stay', 90);
    finishDealerHu(c);
    const outcome = c.outcome;
    const stop = watchMatchClock(c);
    // The clock watcher has no pause, modal, visibility or automation dependency.
    vi.advanceTimersByTime(89 * minute);
    expect(c.matchOver).toBe(false);
    vi.advanceTimersByTime(minute);
    expect(c.matchOver).toBe(true); expect(c.match!.endedBy).toBe('time');
    expect(c.outcome).toBe(outcome); expect(c.match!.hands).toHaveLength(1);
    expect(c.nextHand()).toBe(false);
    expect(renderToStaticMarkup(createElement(MatchResultNote, { match: c.match! }))).toContain('batas waktu 90 menit');
    stop();
  });

  it('checks expiry synchronously before dealing, even if background timers were throttled', () => {
    vi.useFakeTimers(); vi.setSystemTime(epoch);
    const c = freshController(); c.startMatch('stay', 90); finishDealerHu(c);
    const serial = c.gameSerial;
    vi.setSystemTime(epoch + 91 * minute);
    expect(c.nextHand()).toBe(false); expect(c.gameSerial).toBe(serial);
    expect(c.match!.endedBy).toBe('time');
  });

  it('counts a live wall-out Seri after expiry without rotating or awarding points', () => {
    vi.useFakeTimers(); vi.setSystemTime(epoch);
    const c = freshController(); c.startMatch('rotate', 90);
    const seating = { ...c.match!.seating };
    vi.setSystemTime(epoch + 91 * minute);
    const s = (c as unknown as { engine: GameEngine }).engine.getState() as GameEngineState;
    s.wall = new Wall([], null);
    s.phase = 'TURN_DRAW'; s.currentTurn = c.humanSeat;
    s.players[c.humanSeat].hand = parseTileHand('1T 2T 3T 4T 5T 6T 7B 8B 9B 1W 1W 2W 3W');
    c.humanDraw();
    expect(c.outcome?.kind).toBe('seri');
    expect(c.match!.hands).toHaveLength(1);
    expect(c.match!.seating).toEqual(seating);
    expect(c.match!.huCount.dong).toBe(0);
    expect(c.match!.tayTotal.dong).toBe(0);
    expect(c.match!.endedBy).toBe('time');
    expect(c.nextHand()).toBe(false);
  });

  it('counts Lew Fit at timeout, rotates once, and leaves standings uncredited', () => {
    const m = recordHand(createMatch('bei', 'dong', 5, 'stay', 90, epoch), 'bei', false, 100, epoch + 91 * minute);
    expect(m.hands).toHaveLength(1);
    expect(m.hands[0]).toMatchObject({ lewFit: true, winner: null, totalTay: 0 });
    expect(m.seating).toEqual({ dealer: 'dong', prevailingWind: 'dong', dealerPasses: 1 });
    expect(m.huCount.bei).toBe(0); expect(m.tayTotal.bei).toBe(0);
    expect(m.endedBy).toBe('time');
    expect(recordHand(m, 'dong', true, 10, epoch + 92 * minute)).toBe(m);
  });

  it('finishes earlier by hand count and freezes the clock at completion', () => {
    vi.useFakeTimers(); vi.setSystemTime(epoch);
    const c = freshController(); c.startMatch('stay', 90);
    vi.advanceTimersByTime(5 * minute);
    for (let i = 0; i < 16; i++) { finishDealerHu(c); if (i < 15) c.nextHand(); }
    expect(c.matchOver).toBe(true); expect(c.match!.endedBy).toBe('hands');
    expect(remainingMatchMs(c.match!)).toBe(85 * minute);
    vi.advanceTimersByTime(100 * minute); c.tickMatchClock();
    expect(c.match!.endedBy).toBe('hands'); expect(remainingMatchMs(c.match!)).toBe(85 * minute);
  });

  it('does not restart the clock on nextHand, and keeps unlimited matches unlimited', () => {
    vi.useFakeTimers(); vi.setSystemTime(epoch);
    const c = freshController(); c.startMatch('stay', 90);
    vi.advanceTimersByTime(3 * minute); finishDealerHu(c); expect(c.nextHand()).toBe(true);
    expect(c.match!.startedAt).toBe(epoch); expect(remainingMatchMs(c.match!)).toBe(87 * minute);
    const unlimited = freshController(); unlimited.startMatch();
    vi.advanceTimersByTime(200 * minute); finishDealerHu(unlimited);
    expect(unlimited.matchOver).toBe(false); expect(unlimited.nextHand()).toBe(true);
    expect(remainingMatchMs(unlimited.match!)).toBeNull();
  });

  it('disposes the open-app watcher and starts a new runtime match without charging closed-app time', () => {
    vi.useFakeTimers(); vi.setSystemTime(epoch);
    const old = freshController(); old.startMatch('stay', 90);
    const tick = vi.spyOn(old, 'tickMatchClock'); const stop = watchMatchClock(old);
    vi.advanceTimersByTime(minute); expect(tick).toHaveBeenCalledTimes(60);
    stop(); vi.advanceTimersByTime(24 * 60 * minute); expect(tick).toHaveBeenCalledTimes(60);
    const reopened = freshController(); reopened.startMatch('stay', 90);
    expect(remainingMatchMs(reopened.match!)).toBe(90 * minute);
    expect(reopened.match!.hands).toHaveLength(0);
  });

  it('persists the time preference and hand history without restoring the match runtime', () => {
    vi.useFakeTimers(); vi.setSystemTime(epoch);
    const storage = new MemoryStorage();
    saveMatchTimeLimit(90, storage);
    const options = { settings: { ...getPreset('tournament'), kimMode: 'off' as const, kimEnabled: false }, storage, autoStart: false, seed: 7 };
    const c = new GameController(options);
    const write = vi.spyOn(storage, 'setItem');
    c.startMatch('stay', loadMatchTimeLimit(storage));
    vi.setSystemTime(epoch + 5 * minute); c.tickMatchClock();
    expect(write).not.toHaveBeenCalled();
    finishDealerHu(c);
    expect(write).toHaveBeenCalled(); // Finished hand history still saves normally.
    const reopened = new GameController(options);
    expect(reopened.match).toBeNull(); expect(reopened.outcome).toBeNull();
    vi.setSystemTime(epoch + 24 * 60 * minute);
    reopened.startMatch('stay', loadMatchTimeLimit(storage));
    expect(reopened.match!.hands).toHaveLength(0);
    expect(remainingMatchMs(reopened.match!)).toBe(90 * minute);
  });

  it('renders remaining time on the scoreboard', () => {
    vi.useFakeTimers(); vi.setSystemTime(epoch);
    const match = createMatch('dong', 'dong', 5, 'stay', 90);
    vi.advanceTimersByTime(65_000);
    const html = renderToStaticMarkup(createElement(MatchScoreboard, { match, hand: 1, prevailingWind: 'dong', dealer: 'dong' }));
    expect(html).toContain('Waktu: 88:55');
  });
});
