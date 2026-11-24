import { authHeaders } from './auth';
import type { PublicConfig } from './config';

export type AdminSettings = Pick<PublicConfig, 'dailyMatchLimit' | 'discardRevealMs' | 'loginRequired' | 'facebookEnabled' | 'announcement'>;
/** A server timestamp: epoch milliseconds, or an ISO string. */
export type Stamp = number | string;
export interface DailyStat { day: string; newUsers: number; activeUsers: number; matches: number }
export interface AdminStats {
  users: { total: number; newToday: number; new7d: number; active7d: number; premium: number; newsOptIn: number };
  matches: { today: number; last7d: number };
  daily: DailyStat[];
}
export type UserFilter = 'all' | 'premium' | 'optin';
export type UserSort = 'newest' | 'oldest' | 'active' | 'name' | 'matches';
export interface UsersQuery { q: string; filter: UserFilter; sort: UserSort; page: number; size: number }
export interface AdminUser {
  id: string; name: string; username?: string | null; email: string | null; picture: string | null; premium: boolean | number; newsOptIn: boolean | number;
  createdAt: Stamp | null; lastSeenAt: Stamp | null; matchesHosted: number; matchesToday: number; currentRoom: string | null;
}
export interface UsersPage { total: number; page: number; size: number; users: AdminUser[] }
export interface AuditEntry {
  at: Stamp; by: { id: string; name: string }; kind: 'setting' | 'premium';
  key?: string; value?: unknown; userId?: string; userName?: string; premium?: boolean | number;
}

export const USER_PAGE_SIZE = 50;

async function request<T>(server: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${server}/admin/${path}`, {
    method: body === undefined ? 'GET' : 'PUT', credentials: 'include', cache: 'no-store',
    headers: { ...authHeaders(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error('Server nggak kehubung. Coba lagi bentar lagi.');
  return response.json() as Promise<T>;
}

/** The filters shared by the user list and the CSV export; an empty search is left out. */
function filterParams({ q, filter, sort }: Pick<UsersQuery, 'q' | 'filter' | 'sort'>): URLSearchParams {
  const params = new URLSearchParams();
  const search = q.trim();
  if (search) params.set('q', search);
  params.set('filter', filter); params.set('sort', sort);
  return params;
}

export const adminStats = (server: string) => request<AdminStats>(server, 'stats');
export function adminUsers(server: string, query: UsersQuery): Promise<UsersPage> {
  const params = filterParams(query);
  params.set('page', String(query.page)); params.set('size', String(query.size));
  return request<UsersPage>(server, `users?${params}`);
}
export const adminUsersCsvUrl = (server: string, query: Pick<UsersQuery, 'q' | 'filter' | 'sort'>) => `${server}/admin/users.csv?${filterParams(query)}`;
export const adminAudit = (server: string, limit = 50) => request<{ entries: AuditEntry[] }>(server, `audit?limit=${limit}`).then(value => value.entries);
export const adminSettings = (server: string) => request<AdminSettings>(server, 'settings');
export const saveAdminSettings = (server: string, settings: AdminSettings) => request<AdminSettings>(server, 'settings', settings);
export const setUserPremium = (server: string, id: string, premium: boolean) => request<unknown>(server, `users/${encodeURIComponent(id)}/premium`, { premium });
export const adminNewsEmails = (server: string) => request<string[]>(server, 'news-emails');

/** Downloads the CSV with the login attached (a plain link would not send the bearer token on localhost). */
export async function downloadUsersCsv(server: string, query: Pick<UsersQuery, 'q' | 'filter' | 'sort'>): Promise<void> {
  const response = await fetch(adminUsersCsvUrl(server, query), { credentials: 'include', cache: 'no-store', headers: authHeaders() });
  if (!response.ok) throw new Error('CSV gagal diunduh. Coba lagi.');
  const blob = await response.blob();
  const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'maciokyu-users.csv';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
