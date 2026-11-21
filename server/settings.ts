import type { AuthEnv, Database } from './auth';

export interface Settings { dailyMatchLimit: number; discardRevealMs: number; loginRequired: boolean; facebookEnabled: boolean; announcement: string }
export const defaults = (env: AuthEnv): Settings => ({ dailyMatchLimit: 3, discardRevealMs: 1000, loginRequired: env.LOGIN_REQUIRED === undefined || env.LOGIN_REQUIRED === 'true', facebookEnabled: env.FACEBOOK_ENABLED === 'true', announcement: '' });
const cache = new WeakMap<Database, { until: number; values: Partial<Settings> }>();
export const resetAt = (now: number) => Math.floor((now + 7 * 3600000) / 86400000) * 86400000 + 86400000 - 7 * 3600000;
export function validSettings(value: unknown): value is Partial<Settings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, v]) => {
    if (key === 'dailyMatchLimit' || key === 'discardRevealMs') return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= (key === 'dailyMatchLimit' ? 50 : 3000);
    if (key === 'loginRequired' || key === 'facebookEnabled') return typeof v === 'boolean';
    return key === 'announcement' && typeof v === 'string' && Array.from(v).length <= 200;
  });
}
export function invalidateSettings(db: Database): void { cache.delete(db); }
export async function readSettings(env: AuthEnv, now = Date.now()): Promise<Settings> {
  if (!env.DB) return defaults(env);
  let entry = cache.get(env.DB);
  if (!entry || entry.until <= now) {
    const values: Partial<Settings> = {};
    try {
      const row = await env.DB.prepare("SELECT json_group_object(key,value) AS data FROM settings").first<{ data: string }>();
      for (const [key, raw] of Object.entries(JSON.parse(row?.data ?? '{}'))) {
        try { const patch = { [key]: JSON.parse(raw as string) }; if (validSettings(patch)) Object.assign(values, patch); } catch { /* Ignore invalid stored values. */ }
      }
    } catch (error) {
      console.error('Failed to read settings', error);
      return defaults(env);
    }
    entry = { until: now + 30000, values }; cache.set(env.DB, entry);
  }
  return { ...defaults(env), ...entry.values };
}
