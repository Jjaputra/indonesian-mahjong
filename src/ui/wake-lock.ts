import { useEffect } from 'react';

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', cb: () => void): void;
}

interface WakeLockNavigator {
  wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
}

/**
 * Holds a screen wake lock while `active`. The browser drops the lock when the tab is hidden, so
 * it is requested again on `visibilitychange`. Where the API is missing or refuses, nothing happens.
 */
export function holdScreenAwake(nav: WakeLockNavigator, doc: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>): () => void {
  if (!nav.wakeLock) return () => undefined;
  let sentinel: WakeLockSentinelLike | null = null;
  let stopped = false;
  let pending = false;
  const acquire = async () => {
    if (stopped || pending || doc.hidden || (sentinel && !sentinel.released)) return;
    pending = true;
    try {
      const lock = await nav.wakeLock!.request('screen');
      if (stopped) { void lock.release().catch(() => undefined); return; }
      sentinel = lock;
      lock.addEventListener('release', () => { if (sentinel === lock) sentinel = null; });
    } catch { /* Unsupported, low battery or not allowed: play on without it. */ }
    finally { pending = false; }
  };
  const onVisibility = () => { if (!doc.hidden) void acquire(); };
  doc.addEventListener('visibilitychange', onVisibility);
  void acquire();
  return () => {
    stopped = true;
    doc.removeEventListener('visibilitychange', onVisibility);
    const lock = sentinel;
    sentinel = null;
    void lock?.release().catch(() => undefined);
  };
}

export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || typeof document === 'undefined') return;
    return holdScreenAwake(navigator as WakeLockNavigator, document);
  }, [active]);
}
