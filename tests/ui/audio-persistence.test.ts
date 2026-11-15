import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { AudioSettingsWriter } from '../../src/audio';
import { MemoryStorage, loadSettings, updateSettings } from '../../src/storage';

afterEach(() => { vi.useRealTimers(); });

describe('audio preference persistence', () => {
  it('coalesces continuous slider ticks and saves the final values after 250 ms idle', () => {
    vi.useFakeTimers();
    const store = new MemoryStorage();
    const write = vi.fn(patch => { updateSettings(patch, store); });
    const writer = new AudioSettingsWriter(write);
    writer.queue({ musicVolume: 0.1 });
    vi.advanceTimersByTime(200);
    writer.queue({ musicVolume: 0.2, masterVolume: 0.6 });
    vi.advanceTimersByTime(200);
    writer.queue({ effectsVolume: 0.7 });
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(249);
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledExactlyOnceWith({ musicVolume: 0.2, masterVolume: 0.6, effectsVolume: 0.7 });
    expect(loadSettings(store)).toMatchObject({ musicVolume: 0.2, masterVolume: 0.6, effectsVolume: 0.7 });
  });

  it.each(['close', 'save', 'hidden', 'pagehide', 'unmount'])('flushes the final value immediately on %s without a later stale write', () => {
    vi.useFakeTimers();
    const store = new MemoryStorage();
    const write = vi.fn(patch => { updateSettings(patch, store); });
    const writer = new AudioSettingsWriter(write);
    writer.queue({ musicVolume: 0.3 });
    writer.queue({ musicVolume: 0.8 });
    // Other preferences can be saved while an audio write is pending.
    updateSettings({ aiDifficulty: 'hard' }, store);
    writer.flush();
    expect(loadSettings(store)).toMatchObject({ musicVolume: 0.8, aiDifficulty: 'hard' });
    writer.flush();
    vi.runAllTimers();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('cancel replaces pending slider values with the opening snapshot', () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const writer = new AudioSettingsWriter(write);
    writer.queue({ musicVolume: 0.9, masterVolume: 0.3 });
    const original = { soundEnabled: true, musicEnabled: true, musicVolume: 0.5, masterVolume: 1, effectsVolume: 0.4 };
    writer.queue(original);
    writer.flush();
    vi.runAllTimers();
    expect(write).toHaveBeenCalledExactlyOnceWith(original);
  });

  it('wires flushes to modal, visibility, pagehide and cleanup while applying engines live', () => {
    const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('useEffect(() => { audioWriter.flush(); }, [modal, audioWriter])');
    expect(app).toContain('if (document.hidden) audioWriter.flush()');
    expect(app).toContain("window.addEventListener('pagehide', pagehide)");
    expect(app).toContain('if (!document.hidden && unlocked) { void backgroundMusic.start(); void soundEffects.unlock(); }');
    expect(app).toContain("audioWriter.flush();\n      window.removeEventListener('pagehide', pagehide)");
    const change = app.slice(app.indexOf('  const changeAudio ='), app.indexOf('// Sound effects follow'));
    expect(change).not.toContain('persistSettings(');
    expect(change).toContain('audioWriter.queue(patch)');
    expect(change).toContain('patch.soundEnabled !== undefined || patch.musicEnabled !== undefined) audioWriter.flush()');
    expect(change).toContain('backgroundMusic.applySettings(stored)');
    expect(change).toContain('soundEffects.applySettings(stored)');
  });
});
