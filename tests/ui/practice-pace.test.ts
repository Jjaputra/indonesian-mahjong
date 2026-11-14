import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage, SETTINGS_STORAGE_KEY, updateSettings } from '@/storage';
import { hasExplicitSpeed, settingsForPace, motionSpeedForPace, loadPracticeSettings, loadPracticePace, savePracticePace, practiceDelay, scheduleAutomation, singleAutomationStep } from '@/ui/practice-pace';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('practice pacing and cancellation', () => {
  it('defaults new players to teaching pace and preserves every stored speed', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    expect(hasExplicitSpeed()).toBe(false);
    expect(loadPracticeSettings().animationSpeed).toBe('slow');
    expect(practiceDelay(loadPracticePace())).toBe(1800);
    for (const [speed, delay] of [['off', 60], ['fast', 300], ['normal', 650], ['slow', 1100]] as const) {
      storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ animationSpeed: speed }));
      expect(hasExplicitSpeed()).toBe(true);
      expect(loadPracticeSettings().animationSpeed).toBe(speed);
      expect(practiceDelay(speed)).toBe(delay);
    }
  });
  it('persists teaching tempo through unrelated settings writes and reloads', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    savePracticePace(loadPracticePace());
    updateSettings({ ...loadPracticeSettings(), soundEnabled: false, kimEnabled: false });
    expect(loadPracticePace()).toBe('learn');
    expect(practiceDelay(loadPracticePace())).toBe(1800);
    savePracticePace('fast');
    updateSettings({ kimEnabled: true });
    expect(loadPracticePace()).toBe('fast');
    expect(practiceDelay(loadPracticePace())).toBe(300);
  });
  it('keeps legacy off visible across learning tempo, explicit enable, unrelated saves and reload', () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    updateSettings({ animationSpeed: 'off' });
    savePracticePace('learn');
    expect(loadPracticeSettings().animationSpeed).toBe('off');
    updateSettings(settingsForPace(loadPracticeSettings(), 'learn'));
    expect(loadPracticePace()).toBe('learn');
    expect(loadPracticeSettings().animationSpeed).toBe('off');
    updateSettings({ animationSpeed: motionSpeedForPace(loadPracticePace()) });
    expect(loadPracticeSettings().animationSpeed).toBe('slow');
    updateSettings({ soundEnabled: false });
    expect(loadPracticeSettings().animationSpeed).toBe('slow');
    for (const pace of ['normal', 'fast', 'learn'] as const) {
      updateSettings(settingsForPace(loadPracticeSettings(), pace));
      expect(loadPracticeSettings().animationSpeed).toBe(motionSpeedForPace(pace));
    }
    updateSettings({ animationSpeed: 'off' });
    for (const pace of ['normal', 'fast', 'learn'] as const) {
      updateSettings(settingsForPace(loadPracticeSettings(), pace));
      expect(loadPracticeSettings().animationSpeed).toBe('off');
    }
  });
  it('invalid or missing speed is not mistaken for an explicit preference', () => {
    const storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    for (const raw of ['{', '{}', '{"animationSpeed":"warp"}']) {
      storage.setItem(SETTINGS_STORAGE_KEY, raw);
      expect(hasExplicitSpeed()).toBe(false);
    }
  });
  it('cancels a pending step when paused, opening a dialog, leaving a view, or replacing a game', () => {
    vi.useFakeTimers();
    const target = { outcome: null, isWaitingForHuman: () => false, step: vi.fn(() => true) };
    const dispose = scheduleAutomation(target, 1800, false);
    vi.advanceTimersByTime(1799);
    expect(target.step).not.toHaveBeenCalled();
    dispose();
    scheduleAutomation(target, 1800, true);
    vi.advanceTimersByTime(3600);
    expect(target.step).not.toHaveBeenCalled();
    scheduleAutomation(target, 1800, false);
    vi.advanceTimersByTime(1800);
    expect(target.step).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(9000);
    expect(target.step).toHaveBeenCalledTimes(1);
  });
  it('manual step never bypasses a human choice or dialog and timers recheck waiting state', () => {
    vi.useFakeTimers();
    let waiting = false;
    const target = { outcome: null as unknown, isWaitingForHuman: () => waiting, step: vi.fn(() => true) };
    scheduleAutomation(target, 100, false);
    waiting = true;
    vi.advanceTimersByTime(100);
    expect(singleAutomationStep(target)).toBe(false);
    waiting = false;
    expect(singleAutomationStep(target, true)).toBe(false);
    expect(singleAutomationStep(target)).toBe(true);
    target.outcome = {};
    expect(singleAutomationStep(target)).toBe(false);
    expect(target.step).toHaveBeenCalledTimes(1);
  });
});
