import { Children, isValidElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../../src/core/game-engine';
import { SEAT_ORDER } from '../../src/core/tiles';
import type { Tile } from '../../src/core/types';
import { TableSession } from '../../src/session';
import { DEFAULT_SETTINGS, TOURNAMENT_SETTINGS, MemoryStorage, SETTINGS_STORAGE_KEY, loadSettings, saveSettings } from '../../src/storage';
import { MenuSolo } from '../../src/ui/components/MainMenu';
import { RoomConfigFields } from '../../src/ui/components/RoomConfigFields';
import { DEFAULT_ROOM_CONFIG } from '../../src/net/protocol';

const kim = (mode: 'natural' | 'dedicated'): Tile => mode === 'natural'
  ? { id: 'discarded-kim', type: 'tong', value: 3, isKim: true }
  : { id: 'discarded-kim', type: 'kim', value: 0 };
const filler = (n: number): Tile[] => Array.from({ length: n }, (_, i) => ({ id: `f-${i}`, type: 'sok', value: i % 9 + 1 }));
const humans = { dong: 'human', nan: 'human', xi: 'human', bei: 'human' } as const;

function findChoice(node: ReactNode, label: string): { onChange: (value: never) => void } | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ label?: string; children?: ReactNode; onChange: (value: never) => void }>(child)) continue;
    if (child.props.label === label) return child.props;
    const found = findChoice(child.props.children, label);
    if (found) return found;
  }
}

describe('House rules, players 2026-11-16', () => {
  it.each(['natural', 'dedicated'] as const)('%s Kim is discardable by default but not in tournament play', mode => {
    for (const tournament of [false, true]) {
      const engine = new GameEngine({ ...(tournament ? TOURNAMENT_SETTINGS : DEFAULT_SETTINGS), kimMode: mode });
      const state = engine.getState();
      Object.assign(state, { phase: 'ACTION_DECISION', currentTurn: 'dong' });
      state.players.dong.hand = [...filler(13), kim(mode)];
      expect(engine.getLegalActions('dong').discardableTileIds.includes('discarded-kim')).toBe(!tournament);
      if (tournament) expect(() => engine.discard('dong', 'discarded-kim')).toThrow(/prohibited/);
      else expect(engine.discard('dong', 'discarded-kim').discardedTile.id).toBe('discarded-kim');
    }
  });

  it.each(['natural', 'dedicated'] as const)('%s discarded Kim cannot be claimed, even with a completing hand', mode => {
    // Always-winning validator proves the Kim guard runs before Hu validation.
    const huValidator = vi.fn(() => true);
    const engine = new GameEngine({ ...DEFAULT_SETTINGS, kimMode: mode }, undefined, { huValidator });
    const state = engine.getState();
    Object.assign(state, { phase: 'ACTION_DECISION', currentTurn: 'dong' });
    state.players.dong.hand = [...filler(13), kim(mode)];
    engine.discard('dong', 'discarded-kim');
    for (const seat of SEAT_ORDER.slice(1)) {
      state.players[seat].hand = [...filler(10), ...Array.from({ length: 3 }, (_, i) => ({ id: `match-${i}`, type: 'tong' as const, value: 3 }))];
      expect(engine.getLegalActions(seat)).toMatchObject({ canJia: false, canPung: false, canKong: false, canDiscardWinHu: false });
      for (const action of ['jia', 'pung', 'kong', 'hu'] as const) expect(() => engine.submitClaim({ seat, action })).toThrow(/Kim cannot be claimed/);
    }
    expect(huValidator).not.toHaveBeenCalled();
    engine.resolveClaimWindow();
    expect(state.players.dong.discards).toContainEqual(kim(mode));
    expect(state.currentTurn).toBe('nan');
  });

  it.each(['natural', 'dedicated'] as const)('%s Kim discard opens no TableSession claim prompts', mode => {
    const initial = new TableSession({ settings: { ...DEFAULT_SETTINGS, kimMode: mode }, seats: humans, seed: 8, now: () => 100 });
    const data = initial.serialize();
    data.state.players.dong.hand = [...filler(13), kim(mode)];
    data.state.phase = 'ACTION_DECISION'; data.state.currentTurn = 'dong';
    // A pair wait at the Kim face: 123, 456, 789 Sok + 111 Ban + lone 3 Tong.
    for (const seat of SEAT_ORDER.slice(1)) data.state.players[seat].hand = [
      ...filler(9), ...[1, 2, 3].map(i => ({ id: `ban-${i}`, type: 'ban' as const, value: 1 })),
      { id: 'pair-wait', type: 'tong', value: 3 },
    ];
    let now = 100;
    const session = TableSession.deserialize(data, () => now);
    expect(session.apply('dong', { type: 'discard', tileId: 'discarded-kim', version: session.version })).toMatchObject({ ok: true });
    expect(session.viewFor('nan')).toMatchObject({ phase: 'CLAIM_WINDOW' });
    expect(session.pendingDecisions()).toEqual([]);
    now += 1000;
    expect(session.resolveReveal()).toBe(true);
    expect(session.viewFor('nan')).toMatchObject({ phase: 'ACTION_DECISION', claimWindow: null });
    expect(session.pendingDecisions().every(d => d.kind !== 'claim')).toBe(true);
    expect(session.serialize().state.players.dong.discards).toContainEqual(kim(mode));
  });

  it('migrates old forced natural-Kim bans and preserves a newly saved tournament choice', () => {
    const store = new MemoryStorage();
    store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...TOURNAMENT_SETTINGS, soundEnabled: false }));
    expect(loadSettings(store)).toMatchObject({ kimDiscardAllowed: true, minHuTay: 5, soundEnabled: false });
    expect(loadSettings(store).kimDiscardAllowed).toBe(true);
    saveSettings(TOURNAMENT_SETTINGS, store);
    expect(loadSettings(store).kimDiscardAllowed).toBe(false);
    store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ kimEnabled: false, minHuTay: 5 }));
    expect(loadSettings(store)).toMatchObject({ kimMode: 'off', minHuTay: 3 });
  });

  it.each(['off', 'natural', 'dedicated'] as const)('menu and room choose the correct minimum for %s', mode => {
    const change = vi.fn();
    const menu = MenuSolo({ onPractice: () => {}, lastResult: null, onKimModeChange: change, onBack: () => {} });
    findChoice(menu, 'Pilihan Kim')!.onChange(mode as never);
    expect(change).toHaveBeenCalledWith(mode, mode === 'off' ? 3 : 5);
    let config = { ...DEFAULT_ROOM_CONFIG };
    const room = () => RoomConfigFields({ config, onChange: patch => { config = { ...config, ...patch }; } });
    findChoice(room(), 'Mode Kim')!.onChange(mode as never);
    expect(config.minHuTay).toBe(mode === 'off' ? 3 : 5);
    findChoice(room(), 'Min Tay')!.onChange(8 as never);
    expect(config.minHuTay).toBe(8);
  });
});
