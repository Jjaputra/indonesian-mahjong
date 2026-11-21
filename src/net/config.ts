import { useSyncExternalStore } from 'react';

export interface PublicConfig { dailyMatchLimit: number; discardRevealMs: number; loginRequired: boolean; facebookEnabled: boolean; announcement: string; resetAt?: number; serverNow?: number }
let config: PublicConfig = { dailyMatchLimit: 3, discardRevealMs: 1000, loginRequired: true, facebookEnabled: false, announcement: '' };
let receivedAt = 0;
const listeners = new Set<() => void>();
export const getConfig = () => config;
export function useConfig(): PublicConfig { return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, getConfig, getConfig); }
export const configNow = () => config.serverNow === undefined ? Date.now() : config.serverNow + (performance.now() - receivedAt);
export function acceptConfig(value: Partial<PublicConfig>): void {
  config = { ...config, ...value }; receivedAt = performance.now();
  for (const fn of listeners) fn();
}
export async function fetchConfig(server: string): Promise<void> {
  const response = await fetch(`${server}/config`, { cache: 'no-store', credentials: 'include' });
  if (response.ok) acceptConfig(await response.json());
}
