import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, MemoryStorage, SETTINGS_STORAGE_KEY, loadSettings, updateSettings } from '@/storage';
import { holdScreenAwake } from '@/ui/wake-lock';
import { isIosDevice } from '@/ui/pwa-install';
import { withPreset } from '@/ui/components/SettingsModal';

describe('QoL settings', () => {
  it('default: screen stays on', () => {
    expect(DEFAULT_SETTINGS.keepScreenOn).toBe(true);
    expect(loadSettings(new MemoryStorage())).toMatchObject({ keepScreenOn: true });
  });

  it('migrates rows saved before the settings existed and ignores junk', () => {
    const store = new MemoryStorage();
    store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ soundEnabled: false, houseRulesVersion: 1 }));
    expect(loadSettings(store)).toMatchObject({ soundEnabled: false, keepScreenOn: true });
    store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ keepScreenOn: 'yes', doubleTapDiscard: true }));
    expect(loadSettings(store)).toMatchObject({ keepScreenOn: true });
  });

  it('persists a change and keeps it through a preset swap', () => {
    const store = new MemoryStorage();
    updateSettings({ keepScreenOn: false }, store);
    const saved = loadSettings(store);
    expect(saved).toMatchObject({ keepScreenOn: false });
    expect(withPreset(saved, 'casual')).toMatchObject({ keepScreenOn: false });
  });
});

describe('screen wake lock', () => {
  const fakeDoc = () => {
    const handlers = new Set<() => void>();
    const doc = {
      hidden: false,
      addEventListener: (_: string, cb: () => void) => { handlers.add(cb); },
      removeEventListener: (_: string, cb: () => void) => { handlers.delete(cb); },
    };
    return { doc: doc as unknown as Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'> & { hidden: boolean }, fire: () => handlers.forEach(h => h()), handlers };
  };
  const fakeNav = () => {
    const log = { requests: 0, releases: 0 };
    const nav = { wakeLock: { request: async () => {
      log.requests++;
      const s = { released: false, release: async () => { s.released = true; log.releases++; }, addEventListener: () => undefined };
      return s;
    } } };
    return { nav, log };
  };
  const tick = () => new Promise(r => setTimeout(r, 0));

  it('is a silent no-op without the API', () => {
    const { doc } = fakeDoc();
    expect(() => holdScreenAwake({}, doc)()).not.toThrow();
  });

  it('requests on start, re-requests when the tab is visible again, releases on stop', async () => {
    const { doc, fire, handlers } = fakeDoc();
    const { nav, log } = fakeNav();
    const stop = holdScreenAwake(nav, doc);
    await tick();
    expect(log.requests).toBe(1);
    fire(); await tick();
    expect(log.requests).toBe(1); // still held
    stop(); await tick();
    expect(log.releases).toBe(1);
    expect(handlers.size).toBe(0);
  });

  it('does not request while hidden and survives a refused request', async () => {
    const { doc } = fakeDoc();
    doc.hidden = true;
    const { nav, log } = fakeNav();
    holdScreenAwake(nav, doc)();
    await tick();
    expect(log.requests).toBe(0);
    doc.hidden = false;
    const refusing = { wakeLock: { request: async () => { throw new Error('NotAllowedError'); } } };
    expect(() => holdScreenAwake(refusing, doc)()).not.toThrow();
    await tick();
  });
});

describe('install hint', () => {
  it('spots iPhone and iPadOS Safari', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 14)')).toBe(false);
  });
});
