import { useEffect, useState } from 'react';
import { configNow, fetchConfig, getConfig, useConfig } from '../../net/config';
import { refreshAccount } from '../../net/auth';
import { mpServerUrl } from '../../net/room-store';

export function formatCountdown(ms: number, exhausted = false): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
  return exhausted ? `Jatah host hari ini abis. Reset dalam ${[h, m, s].map(n => String(n).padStart(2, '0')).join(':')}` : `Reset 00.00 WIB · ${h} jam ${m} menit lagi`;
}
let refreshing: Promise<void> | undefined;
let retryAt = 0, retryStep = 0, expiredResetAt: number | undefined;
const retryDelays = [2000, 5000, 15000, 60000];
export function AllowanceReset({ remaining }: { remaining: number }) {
  const config = useConfig();
  const [now, tick] = useState(configNow);
  useEffect(() => {
    const timer = setInterval(() => {
      const current = configNow(); tick(current);
      const resetAt = getConfig().resetAt;
      if (resetAt !== expiredResetAt) { expiredResetAt = resetAt; retryAt = 0; retryStep = 0; }
      if (resetAt !== undefined && current >= resetAt && performance.now() >= retryAt && !refreshing) {
        refreshing = (async () => { await refreshAccount(); const server = mpServerUrl(); if (server) await fetchConfig(server); })().catch(() => {}).finally(() => {
          retryAt = performance.now() + retryDelays[Math.min(retryStep++, retryDelays.length - 1)]!;
          refreshing = undefined;
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  if (!Number.isFinite(remaining) || config.resetAt === undefined) return null;
  return <span className={`mp-pill allowance-reset${remaining === 0 ? ' is-exhausted' : ''}`} role="status">{formatCountdown(config.resetAt - now, remaining === 0)}</span>;
}
