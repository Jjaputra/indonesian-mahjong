import { configNow, getConfig } from './config';
import { deviceLimitFallback, useAccount } from './auth';
import { useEffect, useState } from 'react';
import type { StorageLike } from '../storage';

export const DAILY_LIMIT_MESSAGE = () => `Jatah host ${getConfig().dailyMatchLimit} match hari ini udah abis. Tunggu reset 00.00 WIB, atau Premium (segera hadir).`;
export const isPremium = (): boolean => false;
const KEY = 'itm.mp.daily-matches.v1';
const WIB_OFFSET = 7 * 60 * 60 * 1000;
interface Usage { day: string; matches: string[]; aliases?: Record<string, string> }
const failedWrites = new WeakSet<StorageLike>();

export const wibDay = (now = configNow()): string => new Date(now + WIB_OFFSET).toISOString().slice(0, 10);

// Device fallback for servers that permit anonymous hosts; account limits are authoritative.
function read(now: number, storage?: StorageLike): { storage: StorageLike; usage: Usage } | null {
  try {
    const s = storage ?? globalThis.localStorage;
    if (!s) return null;
    const day = wibDay(now);
    const parsed = JSON.parse(s.getItem(KEY) ?? 'null') as Usage | null;
    if (parsed && (typeof parsed.day !== 'string' || !Array.isArray(parsed.matches) || parsed.matches.some(m => typeof m !== 'string'))) return null;
    if (parsed?.aliases && (typeof parsed.aliases !== 'object' || Object.values(parsed.aliases).some(id => typeof id !== 'string'))) return null;
    const usage = parsed?.day === day ? parsed : { day, matches: [] };
    return { storage: s, usage };
  } catch { return null; }
}

export function remainingMatches(now = configNow(), storage?: StorageLike): number {
  if (isPremium()) return getConfig().dailyMatchLimit;
  const data = read(now, storage);
  if (!data || failedWrites.has(data.storage)) return getConfig().dailyMatchLimit;
  const identities = data.usage.matches.map(key => data.usage.aliases?.[key] ?? key);
  return Math.max(0, getConfig().dailyMatchLimit - new Set(identities).size);
}

/** Merge against a fresh read immediately before writing; display reads never write a snapshot back. */
function merge(usage: Usage, storage: StorageLike, now: number): void {
  const latest = read(now, storage);
  if (!latest) return;
  const next: Usage = { day: wibDay(now),
    matches: [...new Set([...usage.matches, ...latest.usage.matches])],
    aliases: { ...usage.aliases, ...latest.usage.aliases } };
  try {
    storage.setItem(KEY, JSON.stringify(next));
    failedWrites.delete(storage);
  } catch { failedWrites.add(storage); }
}

/** Called only on a confirmed start, never on a button press. */
export function countHostedMatch(room: string, identity: string | number, now = configNow(), storage?: StorageLike): void {
  if (isPremium()) return;
  const data = read(now, storage);
  if (!data) return;
  const key = JSON.stringify([room, identity]);
  data.usage.matches.push(key);
  merge(data.usage, data.storage, now);
}

/** Seating precedes the SeatView. Alias its provisional key to the activity log's match identity. */
export function identifyHostedMatch(room: string, startedAt: number, now = configNow(), storage?: StorageLike): void {
  const data = read(now, storage);
  if (!data) return;
  const index = data.usage.matches.findIndex(key => {
    if (data.usage.aliases?.[key]) return false;
    try { const [code, id] = JSON.parse(key); return code === room && typeof id === 'string' && id.startsWith('seating:'); } catch { return false; }
  });
  if (index < 0) return;
  const provisional = data.usage.matches[index]!;
  if (data.usage.aliases?.[provisional]) return;
  const identity = JSON.stringify([room, startedAt]);
  data.usage.matches.push(identity);
  data.usage.aliases = { ...data.usage.aliases, [provisional]: identity };
  merge(data.usage, data.storage, now);
}

export interface HostBoundary { token: string; observedAt: number; previousMatch: number | null }
const boundaryKey = (room: string) => `itm.mp.host-boundary.v1:${room}`;

/** Evidence survives a reload between the start request and the server confirmation. */
export function loadHostBoundary(room: string, storage?: StorageLike): HostBoundary | null {
  try {
    const value = JSON.parse((storage ?? globalThis.localStorage)?.getItem(boundaryKey(room)) ?? 'null') as HostBoundary | null;
    return value && typeof value.token === 'string' && Number.isFinite(value.observedAt) &&
      (value.previousMatch === null || Number.isFinite(value.previousMatch)) ? value : null;
  } catch { return null; }
}

export function saveHostBoundary(room: string, value: HostBoundary | null, storage?: StorageLike): void {
  try {
    const s = storage ?? globalThis.localStorage;
    if (value) s?.setItem(boundaryKey(room), JSON.stringify(value));
    else s?.removeItem(boundaryKey(room));
  } catch { /* storage blocked: no recovery evidence, allow play */ }
}

/** Refresh an open lobby/result at WIB midnight and when another tab uses a match. */
export function useDailyRemaining(storage?: StorageLike): number {
  const account = useAccount();
  const [, tick] = useState(0);
  useEffect(() => {
    const refresh = () => tick(n => n + 1);
    const timer = setInterval(refresh, 1000);
    globalThis.addEventListener?.('storage', refresh);
    return () => { clearInterval(timer); globalThis.removeEventListener?.('storage', refresh); };
  }, []);
  return account ? account.remainingMatches ?? Infinity : deviceLimitFallback() ? remainingMatches(configNow(), storage) : Infinity;
}
