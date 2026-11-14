import { ANIMATION_DELAY_MS } from './labels';
import { getStorage, loadSettings, SETTINGS_STORAGE_KEY, type GameSettings } from '../storage';

/** An absent preference gets a teaching pace; existing explicit speeds retain their timing. */
export function hasExplicitSpeed(): boolean {
  try {
    const raw = getStorage().getItem(SETTINGS_STORAGE_KEY);
    const speed: unknown = raw ? JSON.parse(raw).animationSpeed : undefined;
    return ['off', 'slow', 'normal', 'fast'].includes(String(speed));
  } catch { return false; }
}
export function loadPracticeSettings(): GameSettings {
  const settings = loadSettings();
  return hasExplicitSpeed() ? settings : { ...settings, animationSpeed: 'slow' };
}
export type PracticePace = 'learn' | GameSettings['animationSpeed'];
const PACE_KEY = 'itm.practice-pace.v1';
const PACES = ['learn', 'off', 'slow', 'normal', 'fast'] as const;
/** Keep the teaching default distinct from an explicitly chosen animation speed. */
export function loadPracticePace(): PracticePace {
  try {
    const saved = getStorage().getItem(PACE_KEY);
    if (PACES.includes(saved as PracticePace)) return saved as PracticePace;
  } catch { /* Storage may be unavailable. */ }
  return hasExplicitSpeed() ? loadSettings().animationSpeed : 'learn';
}
export function savePracticePace(pace: PracticePace): void {
  try { getStorage().setItem(PACE_KEY, pace); } catch { /* Keep the live preference. */ }
}
export function practiceDelay(pace: PracticePace): number {
  return pace === 'learn' ? 1800 : ANIMATION_DELAY_MS[pace];
}

export interface AutomationTarget {
  outcome: unknown;
  isWaitingForHuman(): boolean;
  step(): boolean;
}
/** Rechecks at execution, including manual stepping: a human decision is never automated. */
export function singleAutomationStep(target: AutomationTarget, blocked = false): boolean {
  if (blocked || target.outcome || target.isWaitingForHuman()) return false;
  return target.step();
}
/** The returned disposer cancels pending work on every view/dialog/game transition. */
export function scheduleAutomation(target: AutomationTarget, delay: number, blocked: boolean): () => void {
  if (blocked || target.outcome || target.isWaitingForHuman()) return () => {};
  const timer = setTimeout(() => singleAutomationStep(target), delay);
  return () => clearTimeout(timer);
}

/** Tempo changes preserve deliberate motion-off; enabled travel follows the bot pace. */
export function motionSpeedForPace(pace: PracticePace): GameSettings['animationSpeed'] {
  return pace === 'learn' || pace === 'slow' ? 'slow' : pace === 'fast' ? 'fast' : 'normal';
}
export function settingsForPace(settings: GameSettings, pace: PracticePace): GameSettings {
  return { ...settings, animationSpeed: settings.animationSpeed === 'off' ? 'off' : motionSpeedForPace(pace) };
}
