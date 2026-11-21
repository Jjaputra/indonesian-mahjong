import { afterEach, expect, it, vi } from 'vitest';
import { AllowanceReset } from '../../src/ui/components/AllowanceReset';
import { acceptConfig } from '../../src/net/config';
import { refreshAccount } from '../../src/net/auth';

const hooks = vi.hoisted(() => ({ effect: undefined as (() => (() => void)) | undefined }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useEffect: (effect: () => (() => void)) => { hooks.effect = effect; },
  useState: (initial: () => number) => [initial(), () => {}],
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock('../../src/net/auth', () => ({ refreshAccount: vi.fn() }));
vi.mock('../../src/net/room-store', () => ({ mpServerUrl: () => 'https://api.test' }));

afterEach(() => {
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetAllMocks();
  acceptConfig({ serverNow: undefined, resetAt: undefined });
});

it.each([false, true])('backs off reset refreshes when resetAt stays expired (network failure: %s)', async failure => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  acceptConfig({ serverNow: 10000, resetAt: failure ? 9999 : 10000 });
  vi.mocked(refreshAccount).mockImplementation(async () => { if (failure) throw new Error('offline'); });
  const fetch = vi.fn(async () => Response.json({ resetAt: 10000, serverNow: 10000 }));
  vi.stubGlobal('fetch', fetch);
  AllowanceReset({ remaining: 0 });
  const cleanup = hooks.effect!();
  try {
    await vi.advanceTimersByTimeAsync(1000);
    expect(refreshAccount).toHaveBeenCalledTimes(1);
    for (const [index, delay] of [2000, 5000, 15000, 60000, 60000].entries()) {
      await vi.advanceTimersByTimeAsync(delay - 1000);
      expect(refreshAccount).toHaveBeenCalledTimes(index + 1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(refreshAccount).toHaveBeenCalledTimes(index + 2);
    }
    // A new reset deadline clears the old retry schedule.
    acceptConfig({ serverNow: 200000, resetAt: 199999 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(refreshAccount).toHaveBeenCalledTimes(7);
  } finally { cleanup(); }
});
