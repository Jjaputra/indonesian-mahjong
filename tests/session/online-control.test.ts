import { describe, expect, it } from 'vitest';
import { TableSession } from '../../src/session';
import { DEFAULT_SETTINGS } from '../../src/storage';

const create = () => new TableSession({ settings: { ...DEFAULT_SETTINGS }, seats: { dong: 'human', nan: 'human', xi: 'human', bei: 'human' }, seed: 41, now: () => 1000 });

describe('online seat control', () => {
  it('keeps an offline human idle until explicitly replaced, persists control, and restores it', () => {
    let s = create();
    s.setConnected('dong', false);
    const before = s.serialize();
    expect(s.stepBots()).toBe(false);
    s.setControl('dong', 'bot');
    expect(s.serialize().state.players.dong.hand).toEqual(before.state.players.dong.hand);
    s = TableSession.deserialize(s.serialize(), () => 1000);
    expect(s.serialize().options.seats.dong).toBe('bot');
    expect(s.serialize().state.players.dong.isHuman).toBe(false);
    s.setControl('dong', 'human'); s.setConnected('dong', true);
    expect(s.stepBots()).toBe(false);
    expect(s.serialize().state.players.dong.isHuman).toBe(true);
  });
  it('returns a deterministic paced delay and does not consume bot randomness', () => {
    const s = create(); expect(s.botDelay()).toBeNull(); s.setControl('dong', 'bot');
    const before = s.serialize(), delay = s.botDelay();
    expect(delay).toBeGreaterThanOrEqual(1500); expect(delay).toBeLessThanOrEqual(3000);
    expect(s.serialize()).toEqual(before);
    expect(TableSession.deserialize(before, () => 5000).botDelay()).toBe(delay);
  });
});
