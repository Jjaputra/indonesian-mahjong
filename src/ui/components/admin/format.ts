import type { Stamp } from '../../../net/admin-api';

const toMs = (value: Stamp) => typeof value === 'number' ? value : Date.parse(value);

/** "2 jam lalu"; older than a month falls back to the date. */
export function relativeTime(value: Stamp | null | undefined, now = Date.now()): string {
  if (value === null || value === undefined) return '—';
  const ms = toMs(value);
  if (!Number.isFinite(ms)) return '—';
  const seconds = Math.max(0, Math.round((now - ms) / 1000));
  if (seconds < 60) return 'baru saja';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return formatDate(value);
}

/** A date in WIB, e.g. "22 Nov 2026". */
export function formatDate(value: Stamp | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const ms = toMs(value);
  return Number.isFinite(ms) ? new Date(ms).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

export function formatDateTime(value: Stamp): string {
  const ms = toMs(value);
  return Number.isFinite(ms) ? new Date(ms).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
}

export const formatNumber = (n: number) => n.toLocaleString('id-ID');
