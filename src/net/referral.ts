import { isRoomCode } from './protocol';

const KEY = 'itm.ref', AGE = 30 * 86400000;
export function captureReferral(now = Date.now()): void {
  if (typeof window === 'undefined' || !window.location?.href) return;
  const url = new URL(window.location.href), code = url.searchParams.get('ref');
  if (!code || !isRoomCode(code)) return;
  try { localStorage.setItem(KEY, JSON.stringify({ code, at: now })); } catch { /* blocked storage */ }
  url.searchParams.delete('ref');
  window.history.replaceState(window.history.state, '', url.toString());
}
export function pendingReferral(now = Date.now()): string | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (value && typeof value.code === 'string' && isRoomCode(value.code) && Number.isFinite(value.at) && value.at <= now && now - value.at < AGE) return value.code;
    clearReferral();
  } catch { /* blocked storage */ }
  return undefined;
}
export function clearReferral(): void {
  try { localStorage.removeItem(KEY); } catch { /* blocked storage */ }
}
