import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState = 'installed' | 'prompt' | 'ios' | 'none';

export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

function isStandalone(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch { return false; }
}

// Chrome fires beforeinstallprompt once, usually at page load, so it is captured at module load
// (imported from main.tsx) and kept for the Settings line, which may open much later.
let saved: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); saved = e as InstallPromptEvent; notify(); });
  window.addEventListener('appinstalled', () => { saved = null; notify(); });
}

/** What the Settings line should offer: Android/Chrome's own prompt, iPhone's manual steps, or nothing. */
export function usePwaInstall(): { state: InstallState; install: () => void } {
  const [, redraw] = useState(0);
  useEffect(() => {
    const fn = () => redraw((n) => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  const state: InstallState = isStandalone() ? 'installed'
    : saved ? 'prompt'
    : isIosDevice(navigator.userAgent, navigator.maxTouchPoints) ? 'ios' : 'none';
  const install = () => {
    const event = saved;
    if (!event) return;
    void event.prompt().then(() => event.userChoice).finally(() => { saved = null; notify(); });
  };
  return { state, install };
}
