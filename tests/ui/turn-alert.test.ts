import { afterEach, describe, expect, it, vi } from 'vitest';
import { TableSession } from '../../src/session';
import { DEFAULT_SETTINGS } from '../../src/storage';
import { startTurnAlerts, TurnAlertTracker } from '../../src/ui/turn-alert';
import { soundEffects } from '../../src/audio';
import { RemoteTable } from '../../src/net/remote-table';
import { MemoryStorage } from '../../src/storage';
import { fakeNetwork, fakeTimers, roomInfo } from '../net/fake-transport';

function view() {
  return new TableSession({ settings: DEFAULT_SETTINGS, seats: { dong: 'human', nan: 'human', xi: 'human', bei: 'human' }, seed: 5, now: () => 1000 }).viewFor('dong');
}

describe('turn alerts', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('blinks and vibrates only while away, restores on return and cleans up on leave', () => {
    vi.useFakeTimers();
    let focused = false;
    const doc = Object.assign(new EventTarget(), { title: 'Mahjong', hidden: true, hasFocus: () => focused });
    const win = new EventTarget(), vibrate = vi.fn();
    vi.stubGlobal('document', doc); vi.stubGlobal('window', win); vi.stubGlobal('navigator', { vibrate });
    const sound = vi.spyOn(soundEffects, 'playFlowerReplacement').mockReturnValue(true);
    const net = fakeNetwork(), clock = fakeTimers();
    const table = new RemoteTable({ server: 'https://mp.example', code: 'ABC234', name: 'Jason', storage: new MemoryStorage(), socketFactory: net.factory, timers: clock.timers });
    table.connect(); net.last.open();
    net.last.receive({ type: 'welcome', token: 't', seat: 'dong', host: true, serverNow: 0, room: { ...roomInfo(), phase: 'playing' } });
    const stop = startTurnAlerts(table), v = view();
    net.last.receive({ type: 'view', view: v, serverNow: 0 });
    expect(doc.title).toBe('● Giliran kamu'); expect(vibrate).toHaveBeenCalledWith(150); expect(sound).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(800); expect(doc.title).toBe('Mahjong');
    vi.advanceTimersByTime(800); expect(doc.title).toBe('● Giliran kamu');
    doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'));
    expect(doc.title).toBe('● Giliran kamu');
    focused = true; win.dispatchEvent(new Event('focus')); expect(doc.title).toBe('Mahjong');
    net.last.receive({ type: 'view', view: { ...v, version: 5 }, serverNow: 0 });
    expect(sound).toHaveBeenCalledTimes(1);
    net.last.receive({ type: 'view', view: { ...v, match: { ...v.match, startedAt: 2000 } }, serverNow: 0 });
    expect(sound).toHaveBeenCalledTimes(2); expect(vibrate).toHaveBeenCalledTimes(1); expect(doc.title).toBe('Mahjong');
    doc.hidden = true;
    net.last.receive({ type: 'view', view: { ...v, match: { ...v.match, startedAt: 3000 } }, serverNow: 0 });
    expect(doc.title).toBe('● Giliran kamu');
    stop(); expect(doc.title).toBe('Mahjong');
    vi.advanceTimersByTime(1600); expect(doc.title).toBe('Mahjong');
    table.disconnect();
  });
  it('alerts once per discard decision despite versions, presence updates, or reconnect snapshots', () => {
    const tracker = new TurnAlertTracker(), v = view();
    expect(v.legal!.canDiscard).toBe(true);
    expect(tracker.update(v, 'dong')).toBe(true);
    expect(tracker.update(v, 'dong')).toBe(false);
    expect(tracker.update({ ...v, version: v.version + 2 }, 'dong')).toBe(false);
    expect(tracker.update(null, 'dong')).toBe(false);
    expect(tracker.update(structuredClone(v), 'dong')).toBe(false);
    expect(tracker.update({ ...v, turnCount: v.turnCount + 1 }, 'dong')).toBe(true);
    expect(tracker.update({ ...v, match: { ...v.match, startedAt: 2000 } }, 'dong')).toBe(true);
  });
  it('treats draw and discard as one turn so a player away before drawing is alerted', () => {
    const tracker = new TurnAlertTracker(), v = view();
    const draw = { ...v, turnCount: v.turnCount - 1, legal: { ...v.legal!, canDraw: true, canDiscard: false } };
    expect(tracker.update(draw, 'dong')).toBe(true);
    expect(tracker.update(v, 'dong')).toBe(false);
  });
  it('skips spectators, finished matches and an own action echo', () => {
    const tracker = new TurnAlertTracker(), v = view();
    expect(tracker.update(v, null)).toBe(false);
    expect(tracker.update({ ...v, matchOver: true }, 'dong')).toBe(false);
    tracker.acted({ ...v, turnCount: v.turnCount - 1, legal: { ...v.legal!, canDraw: true, canDiscard: false } }, 'dong', { type: 'draw' });
    expect(tracker.update({ ...v, version: v.version + 1 }, 'dong')).toBe(false);
    expect(tracker.update({ ...v, version: v.version + 2 }, 'dong')).toBe(false);
  });
  it('only alerts for actionable claims, and other claim responses do not repeat it', () => {
    const tracker = new TurnAlertTracker(), v = view();
    v.phase = 'CLAIM_WINDOW';
    v.legal!.canDiscard = false;
    v.legal!.canPung = true;
    v.pendingDiscard = { tile: v.hand[0]!, discarder: 'nan' };
    v.pendingDecisions = [{ seat: 'dong', kind: 'claim', deadline: null }];
    expect(tracker.update(v, 'dong')).toBe(true);
    expect(tracker.update({ ...v, version: v.version + 1 }, 'dong')).toBe(false);
    v.pendingDiscard = { tile: v.hand[1]!, discarder: 'nan' };
    expect(tracker.update(v, 'dong')).toBe(true);
    v.pendingDecisions = [];
    expect(tracker.update(v, 'dong')).toBe(false);
  });
  it('suppresses the turn resulting from a submitted claim even if others answer later', () => {
    const tracker = new TurnAlertTracker(), v = view();
    tracker.acted(v, 'dong', { type: 'claim', kind: 'pung' });
    expect(tracker.update({ ...v, turnCount: v.turnCount + 1, version: v.version + 4 }, 'dong')).toBe(false);
  });
});
