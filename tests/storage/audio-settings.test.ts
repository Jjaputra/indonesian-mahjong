import { describe, expect, it } from 'vitest';
import { applyPreset, loadSettings, MemoryStorage, sanitizeSettings, saveSettings, SETTINGS_STORAGE_KEY, updateSettings } from '../../src/storage';

describe('persisted audio settings', () => {
  it('loads old saves with music on at half slider volume', () => {
    const store = new MemoryStorage();
    store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ soundEnabled: false }));
    expect(loadSettings(store)).toMatchObject({ soundEnabled: false, musicEnabled: true, musicVolume: 0.5, masterVolume: 1, effectsVolume: 0.4 });
  });
  it('round trips the independent switches and volume, including zero', () => {
    const store = new MemoryStorage();
    expect(saveSettings({ soundEnabled: false, musicEnabled: true, musicVolume: 0.72, masterVolume: 0.8, effectsVolume: 0.3 }, store)).toBe(true);
    expect(loadSettings(store)).toMatchObject({ soundEnabled: false, musicEnabled: true, musicVolume: 0.72, masterVolume: 0.8, effectsVolume: 0.3 });
    updateSettings({ musicEnabled: false, musicVolume: 0, masterVolume: 0, effectsVolume: 0 }, store);
    expect(loadSettings(store)).toMatchObject({ soundEnabled: false, musicEnabled: false, musicVolume: 0, masterVolume: 0, effectsVolume: 0 });
  });
  it('sanitizes malformed and out of range fields', () => {
    expect(sanitizeSettings({ musicEnabled: 'no', musicVolume: NaN })).toMatchObject({ musicEnabled: true, musicVolume: 0.5 });
    expect(sanitizeSettings({ musicVolume: Infinity }).musicVolume).toBe(0.5);
    expect(sanitizeSettings({ musicVolume: '0' }).musicVolume).toBe(0.5);
    expect(sanitizeSettings({ musicVolume: -1 }).musicVolume).toBe(0);
    expect(sanitizeSettings({ musicVolume: 3 }).musicVolume).toBe(1);
  });
  it.each(['masterVolume', 'effectsVolume'] as const)('sanitizes %s with a safe default', (field) => {
    const fallback = field === 'masterVolume' ? 1 : 0.4;
    for (const value of [NaN, Infinity, '0', null]) expect(sanitizeSettings({ [field]: value })[field]).toBe(fallback);
    expect(sanitizeSettings({ [field]: -2 })[field]).toBe(0);
    expect(sanitizeSettings({ [field]: 2 })[field]).toBe(1);
  });
  it('keeps audio choices when applying a rules preset', () => {
    const store = new MemoryStorage();
    saveSettings({ soundEnabled: false, musicEnabled: false, musicVolume: 0.2, masterVolume: 0.7, effectsVolume: 0.6 }, store);
    expect(applyPreset('casual', store)).toMatchObject({ soundEnabled: false, musicEnabled: false, musicVolume: 0.2, masterVolume: 0.7, effectsVolume: 0.6 });
  });
});
