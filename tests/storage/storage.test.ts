import { afterEach, describe, expect, it } from 'vitest';
import {
  CASUAL_SETTINGS,
  DEFAULT_SETTINGS,
  HISTORY_STORAGE_KEY,
  MAX_HISTORY_RECORDS,
  MemoryStorage,
  SETTINGS_STORAGE_KEY,
  TOURNAMENT_SETTINGS,
  applyPreset,
  clearGameHistory,
  computeHistoryStats,
  deleteGameRecord,
  detectPreset,
  getPreset,
  getStorage,
  isLocalStorageAvailable,
  loadGameHistory,
  loadSettings,
  resetSettings,
  sanitizeGameRecord,
  sanitizeSettings,
  saveGameRecord,
  saveSettings,
  toGameRules,
  toKimRules,
  updateSettings,
  type MatchHistoryRecord,
  type NewMatchHistoryRecord,
  type StorageLike,
} from '../../src/storage';
import { CASUAL_KIM_RULES, TOURNAMENT_KIM_RULES } from '../../src/kim/types';
import type { Tile } from '../../src/core/types';

const kim = (n: number): Tile => ({ id: `kim-0-${n}`, type: 'kim', value: 0, isKim: true });
const tong = (v: number, c = 1): Tile => ({ id: `tong-${v}-${c}`, type: 'tong', value: v });

function makeRecord(overrides: Partial<NewMatchHistoryRecord> = {}): NewMatchHistoryRecord {
  return {
    winner: 'dong',
    winningHand: [tong(1), tong(2), tong(3), kim(1)],
    winningTile: tong(3),
    scoringBreakdown: [
      { id: 7, name: 'Tile KIM', tay: 1 },
      { id: 1, name: 'Ce Mo', tay: 4 },
    ],
    totalTay: 5,
    isWithKim: true,
    winMethod: 'tsumo',
    durationSeconds: 420,
    ...overrides,
  };
}

/** Storage whose every operation throws (e.g. Safari private mode / SecurityError). */
class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('SecurityError');
  }
  setItem(): void {
    throw new Error('QuotaExceededError');
  }
  removeItem(): void {
    throw new Error('SecurityError');
  }
}

/** Storage that rejects writes larger than `limit` characters. */
class QuotaStorage extends MemoryStorage {
  constructor(private readonly limit: number) {
    super();
  }
  override setItem(key: string, value: string): void {
    if (value.length > this.limit) throw new Error('QuotaExceededError');
    super.setItem(key, value);
  }
}

describe('Storage: settings presets', () => {
  it('Tournament preset mirrors BMC06 Kim rules and 5-Tay minimum', () => {
    expect(TOURNAMENT_SETTINGS.kimEnabled).toBe(TOURNAMENT_KIM_RULES.kimEnabled);
    expect(TOURNAMENT_SETTINGS.kimDiscardAllowed).toBe(false);
    expect(TOURNAMENT_SETTINGS.allowKimInMeldClaim).toBe(false);
    expect(TOURNAMENT_SETTINGS.allowKimInPung).toBe(true);
    expect(TOURNAMENT_SETTINGS.allowKimInJia).toBe(true);
    expect(TOURNAMENT_SETTINGS.allowKimInPair).toBe(true);
    expect(TOURNAMENT_SETTINGS.allowKimInTriplet).toBe(true);
    expect(TOURNAMENT_SETTINGS.minHuTay).toBe(5);
    expect(TOURNAMENT_SETTINGS.overlapPolicy).toBe('rulebook_exclusive');
  });

  it('Casual preset mirrors casual Kim rules', () => {
    expect(CASUAL_SETTINGS.allowKimInMeldClaim).toBe(CASUAL_KIM_RULES.allowKimInMeldClaim);
    expect(CASUAL_SETTINGS.allowKimInMeldClaim).toBe(true);
    expect(CASUAL_SETTINGS.minHuTay).toBe(5);
  });

  it('defaults are the Tournament preset and presets are frozen', () => {
    expect(DEFAULT_SETTINGS).toEqual(TOURNAMENT_SETTINGS);
    expect(Object.isFrozen(TOURNAMENT_SETTINGS)).toBe(true);
    expect(Object.isFrozen(CASUAL_SETTINGS)).toBe(true);
  });

  it('getPreset returns an independent mutable copy', () => {
    const p = getPreset('tournament');
    p.minHuTay = 99;
    expect(TOURNAMENT_SETTINGS.minHuTay).toBe(5);
    expect(getPreset('casual')).toEqual(CASUAL_SETTINGS);
  });

  it('detectPreset recognises presets and custom configurations', () => {
    expect(detectPreset(getPreset('tournament'))).toBe('tournament');
    expect(detectPreset(getPreset('casual'))).toBe('casual');
    expect(detectPreset({ ...getPreset('tournament'), aiDifficulty: 'hard' })).toBe('tournament');
    expect(detectPreset({ ...getPreset('tournament'), minHuTay: 8 })).toBe('custom');
  });
});

describe('Storage: settings persistence', () => {
  it('loadSettings returns defaults on empty storage', () => {
    expect(loadSettings(new MemoryStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips every field through save/load', () => {
    const store = new MemoryStorage();
    const custom = {
      ...getPreset('casual'),
      kimEnabled: false,
      kimDiscardAllowed: true,
      allowKimInPung: false,
      allowKimInJia: false,
      allowKimInPair: false,
      allowKimInTriplet: false,
      minHuTay: 8,
      roundWind: 'xi' as const,
      startingSeatWind: 'bei' as const,
      flowerReplacementMode: 'manual' as const,
      overlapPolicy: 'cumulative' as const,
      aiDifficulty: 'hard' as const,
      animationSpeed: 'fast' as const,
      soundEnabled: false,
    };
    expect(saveSettings(custom, store)).toBe(true);
    expect(loadSettings(store)).toEqual(custom);
  });

  it('falls back to defaults on corrupted JSON', () => {
    const store = new MemoryStorage();
    store.setItem(SETTINGS_STORAGE_KEY, '{not valid json');
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
  });

  it('repairs individually invalid fields while keeping valid ones', () => {
    const store = new MemoryStorage();
    store.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        kimEnabled: 'yes',
        aiDifficulty: 'insane',
        roundWind: 'nan',
        animationSpeed: 42,
        soundEnabled: false,
        minHuTay: 'five',
      }),
    );
    const s = loadSettings(store);
    expect(s.kimEnabled).toBe(DEFAULT_SETTINGS.kimEnabled);
    expect(s.aiDifficulty).toBe(DEFAULT_SETTINGS.aiDifficulty);
    expect(s.animationSpeed).toBe(DEFAULT_SETTINGS.animationSpeed);
    expect(s.minHuTay).toBe(5);
    expect(s.roundWind).toBe('nan');
    expect(s.soundEnabled).toBe(false);
  });

  it('clamps and rounds minHuTay into the valid range', () => {
    expect(sanitizeSettings({ minHuTay: -3 }).minHuTay).toBe(0);
    expect(sanitizeSettings({ minHuTay: 1e9 }).minHuTay).toBe(100);
    expect(sanitizeSettings({ minHuTay: 6.6 }).minHuTay).toBe(7);
    expect(sanitizeSettings({ minHuTay: Number.NaN }).minHuTay).toBe(5);
  });

  it('treats non-object payloads (arrays, null, numbers) as defaults', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings([1, 2, 3])).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it('updateSettings merges a patch onto stored settings', () => {
    const store = new MemoryStorage();
    saveSettings({ ...getPreset('tournament'), aiDifficulty: 'hard' }, store);
    const next = updateSettings({ soundEnabled: false }, store);
    expect(next.aiDifficulty).toBe('hard');
    expect(next.soundEnabled).toBe(false);
    expect(loadSettings(store)).toEqual(next);
  });

  it('applyPreset switches rules but keeps presentation preferences by default', () => {
    const store = new MemoryStorage();
    saveSettings({ ...getPreset('tournament'), aiDifficulty: 'hard', soundEnabled: false }, store);
    const casual = applyPreset('casual', store);
    expect(casual.allowKimInMeldClaim).toBe(true);
    expect(casual.overlapPolicy).toBe('cumulative');
    expect(casual.aiDifficulty).toBe('hard');
    expect(casual.soundEnabled).toBe(false);
    const pure = applyPreset('casual', store, { keepPreferences: false });
    expect(pure).toEqual(CASUAL_SETTINGS);
  });

  it('resetSettings clears persisted settings', () => {
    const store = new MemoryStorage();
    saveSettings({ ...getPreset('casual'), minHuTay: 10 }, store);
    expect(resetSettings(store)).toEqual(DEFAULT_SETTINGS);
    expect(store.getItem(SETTINGS_STORAGE_KEY)).toBeNull();
    expect(loadSettings(store)).toEqual(DEFAULT_SETTINGS);
  });

  it('never throws when storage itself throws', () => {
    const bad = new ThrowingStorage();
    expect(loadSettings(bad)).toEqual(DEFAULT_SETTINGS);
    expect(saveSettings(getPreset('casual'), bad)).toBe(false);
    expect(() => resetSettings(bad)).not.toThrow();
    expect(() => updateSettings({ minHuTay: 9 }, bad)).not.toThrow();
  });

  it('projects settings into GameRules and KimRules contracts', () => {
    const s = { ...getPreset('casual'), minHuTay: 7, allowKimInPair: false };
    expect(toGameRules(s)).toEqual({
      kimEnabled: true,
      kimDiscardAllowed: false,
      allowKimInMeldClaim: true,
      minHuTay: 7,
    });
    expect(toKimRules(s)).toEqual({ ...CASUAL_KIM_RULES, allowKimInPair: false });
  });
});

describe('Storage: backend resolution', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('falls back to in-memory storage when localStorage is missing', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });
    expect(isLocalStorageAvailable()).toBe(false);
    const store = getStorage();
    expect(store).toBeInstanceOf(MemoryStorage);
    expect(saveSettings({ ...getPreset('casual') })).toBe(true);
    expect(loadSettings().overlapPolicy).toBe('cumulative');
    resetSettings();
  });

  it('falls back when accessing localStorage throws (SecurityError)', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });
    expect(isLocalStorageAvailable()).toBe(false);
    expect(() => loadSettings()).not.toThrow();
    expect(() => loadGameHistory()).not.toThrow();
  });

  it('uses a working global localStorage when available', () => {
    const fake = new MemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true });
    expect(isLocalStorageAvailable()).toBe(true);
    saveSettings({ ...getPreset('tournament'), aiDifficulty: 'easy' });
    expect(fake.getItem(SETTINGS_STORAGE_KEY)).toContain('"aiDifficulty":"easy"');
  });
});

describe('Storage: match history', () => {
  it('returns an empty list on empty or corrupted storage', () => {
    const store = new MemoryStorage();
    expect(loadGameHistory(store)).toEqual([]);
    store.setItem(HISTORY_STORAGE_KEY, 'garbage[');
    expect(loadGameHistory(store)).toEqual([]);
    store.setItem(HISTORY_STORAGE_KEY, JSON.stringify({ not: 'an array' }));
    expect(loadGameHistory(store)).toEqual([]);
  });

  it('saves a record with generated id/timestamp and round-trips all fields', () => {
    const store = new MemoryStorage();
    const saved = saveGameRecord(makeRecord(), store);
    expect(saved).not.toBeNull();
    expect(typeof saved!.id).toBe('string');
    expect(saved!.id.length).toBeGreaterThan(0);
    expect(saved!.timestamp).toBeGreaterThan(0);
    const [loaded] = loadGameHistory(store);
    expect(loaded).toEqual(saved);
    expect(loaded!.winner).toBe('dong');
    expect(loaded!.winningTile).toEqual(tong(3));
    expect(loaded!.winningHand).toHaveLength(4);
    expect(loaded!.winningHand[3]!.isKim).toBe(true);
    expect(loaded!.scoringBreakdown).toEqual([
      { id: 7, name: 'Tile KIM', tay: 1 },
      { id: 1, name: 'Ce Mo', tay: 4 },
    ]);
    expect(loaded!.totalTay).toBe(5);
    expect(loaded!.isWithKim).toBe(true);
    expect(loaded!.winMethod).toBe('tsumo');
    expect(loaded!.durationSeconds).toBe(420);
  });

  it('orders history newest first and de-duplicates by id', () => {
    const store = new MemoryStorage();
    saveGameRecord(makeRecord({ id: 'a', timestamp: 1000 }), store);
    saveGameRecord(makeRecord({ id: 'b', timestamp: 3000 }), store);
    saveGameRecord(makeRecord({ id: 'c', timestamp: 2000 }), store);
    saveGameRecord(makeRecord({ id: 'a', timestamp: 1000, totalTay: 12 }), store);
    const history = loadGameHistory(store);
    expect(history.map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect(history.find((r) => r.id === 'a')!.totalTay).toBe(12);
  });

  it('supports drawn games (Seri) with a null winner and tile', () => {
    const store = new MemoryStorage();
    const saved = saveGameRecord(
      makeRecord({
        winner: null,
        winningTile: null,
        winningHand: [],
        scoringBreakdown: [],
        totalTay: 0,
        isWithKim: false,
        winMethod: 'draw',
      }),
      store,
    );
    expect(saved?.winner).toBeNull();
    expect(loadGameHistory(store)[0]!.winMethod).toBe('draw');
  });

  it('caps history at MAX_HISTORY_RECORDS keeping the newest', () => {
    const store = new MemoryStorage();
    const records: MatchHistoryRecord[] = [];
    for (let i = 0; i < MAX_HISTORY_RECORDS + 5; i++) {
      records.push(sanitizeGameRecord({ ...makeRecord(), id: `r${i}`, timestamp: i + 1 })!);
    }
    store.setItem(HISTORY_STORAGE_KEY, JSON.stringify(records));
    saveGameRecord(makeRecord({ id: 'newest', timestamp: 1e12 }), store);
    const history = loadGameHistory(store);
    expect(history).toHaveLength(MAX_HISTORY_RECORDS);
    expect(history[0]!.id).toBe('newest');
    expect(history.some((r) => r.id === 'r0')).toBe(false);
  });

  it('skips corrupted entries but keeps valid ones', () => {
    const store = new MemoryStorage();
    const good = sanitizeGameRecord({ ...makeRecord(), id: 'ok', timestamp: 5 });
    store.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify([
        null,
        42,
        { id: '', timestamp: 1 },
        { id: 'bad-winner', timestamp: 2, winner: 'center' },
        { id: 'no-ts' },
        good,
      ]),
    );
    const history = loadGameHistory(store);
    expect(history.map((r) => r.id)).toEqual(['ok']);
  });

  it('sanitizes malformed nested fields with safe fallbacks', () => {
    const rec = sanitizeGameRecord({
      id: 'x',
      timestamp: 10,
      winner: 'xi',
      winningHand: [tong(1), { id: 5 }, 'junk', { id: 'q', type: 'unknown', value: 1 }],
      winningTile: 'not-a-tile',
      scoringBreakdown: [{ id: 3, name: 'Ping Fu', tay: 2 }, { id: 'x' }],
      winMethod: 'teleport',
      durationSeconds: -5,
      isWithKim: 'maybe',
    })!;
    expect(rec.winningHand).toEqual([tong(1)]);
    expect(rec.winningTile).toBeNull();
    expect(rec.scoringBreakdown).toEqual([{ id: 3, name: 'Ping Fu', tay: 2 }]);
    expect(rec.totalTay).toBe(2); // derived from breakdown when missing
    expect(rec.winMethod).toBe('ron');
    expect(rec.durationSeconds).toBe(0);
    expect(rec.isWithKim).toBe(false);
  });

  it('rejects invalid input records instead of persisting them', () => {
    const store = new MemoryStorage();
    const bad = { ...makeRecord(), winner: 'center' } as unknown as NewMatchHistoryRecord;
    expect(saveGameRecord(bad, store)).toBeNull();
    expect(loadGameHistory(store)).toEqual([]);
  });

  it('deleteGameRecord and clearGameHistory remove records', () => {
    const store = new MemoryStorage();
    saveGameRecord(makeRecord({ id: 'a', timestamp: 1 }), store);
    saveGameRecord(makeRecord({ id: 'b', timestamp: 2 }), store);
    expect(deleteGameRecord('a', store)).toBe(true);
    expect(deleteGameRecord('missing', store)).toBe(false);
    expect(loadGameHistory(store).map((r) => r.id)).toEqual(['b']);
    expect(clearGameHistory(store)).toBe(true);
    expect(loadGameHistory(store)).toEqual([]);
  });

  it('degrades gracefully when storage throws', () => {
    const bad = new ThrowingStorage();
    expect(loadGameHistory(bad)).toEqual([]);
    expect(saveGameRecord(makeRecord(), bad)).toBeNull();
    expect(clearGameHistory(bad)).toBe(false);
    expect(deleteGameRecord('a', bad)).toBe(false);
  });

  it('evicts older history and retries when quota is exceeded', () => {
    const store = new QuotaStorage(Number.MAX_SAFE_INTEGER);
    for (let i = 0; i < 40; i++) saveGameRecord(makeRecord({ id: `r${i}`, timestamp: i + 1 }), store);
    const full = loadGameHistory(store);
    const size = store.getItem(HISTORY_STORAGE_KEY)!.length;
    // Quota so tight that the full list (+1) no longer fits, but half does.
    const tight = new QuotaStorage(Math.floor(size * 0.75));
    // Seed directly through the parent class, bypassing the quota check.
    MemoryStorage.prototype.setItem.call(tight, HISTORY_STORAGE_KEY, JSON.stringify(full));
    const saved = saveGameRecord(makeRecord({ id: 'latest', timestamp: 1e12 }), tight);
    expect(saved?.id).toBe('latest');
    const after = loadGameHistory(tight);
    expect(after[0]!.id).toBe('latest');
    expect(after.length).toBeLessThan(full.length);
  });

  it('computeHistoryStats aggregates wins, draws and Tay', () => {
    const history = [
      sanitizeGameRecord({ ...makeRecord({ totalTay: 5, isWithKim: true }), id: '1', timestamp: 1 })!,
      sanitizeGameRecord({
        ...makeRecord({ winner: 'nan', totalTay: 15, isWithKim: false }),
        id: '2',
        timestamp: 2,
      })!,
      sanitizeGameRecord({
        ...makeRecord({ winner: null, totalTay: 0, winMethod: 'draw' }),
        id: '3',
        timestamp: 3,
      })!,
    ];
    const stats = computeHistoryStats(history);
    expect(stats.gamesPlayed).toBe(3);
    expect(stats.wins).toEqual({ dong: 1, nan: 1, xi: 0, bei: 0 });
    expect(stats.draws).toBe(1);
    expect(stats.highestTay).toBe(15);
    expect(stats.averageTay).toBe(10);
    expect(stats.kimWins).toBe(1);
    expect(stats.noKimWins).toBe(1);
    expect(computeHistoryStats([]).averageTay).toBe(0);
  });
});
