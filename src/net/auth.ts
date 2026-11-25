import { clearReferral, pendingReferral } from './referral';
import { acceptConfig, fetchConfig, getConfig } from './config';
import { useSyncExternalStore } from 'react';

export const GOOGLE_CLIENT_ID = '493683615084-apa5g3v01866pb8b9qfrgc75ii4pqtqk.apps.googleusercontent.com';
export interface Account { referralCode?: string | null; sharedToday?: boolean; bonusMatches?: number; referrals?: number; admin?: boolean; dailyMatchLimit?: number; resetAt?: number; serverNow?: number; id: string; username?: string | null; name: string; picture: string | null; premium: boolean; remainingMatches: number | null; currentRoom?: { code: string; phase: string } | null; newsOptIn?: boolean }
interface Google { accounts: { id: { initialize(options: { client_id: string; callback: (result: { credential: string }) => void }): void; renderButton(element: HTMLElement, options: { type: string; text: string; locale: string; theme: string; size: string }): void } } }
interface Facebook { init(options: { appId: string; version: string }): void; login(callback: (response: { authResponse?: { accessToken: string } }) => void, options: { scope: string }): void }
let me: Account | null = null;
let server = '';
let bearer: string | null = null;
const listeners = new Set<() => void>();
export const authStore = {
  get: () => me,
  subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
};
// Keep explicit leaves hidden even when /me is stale or temporarily unavailable.
const leftRooms = new Map<string, { userId: string; retry: boolean }>();
let revision = 0;
const update = (value: Account | null) => { me = value; revision++; for (const fn of listeners) fn(); };
export function useAccount(): Account | null { useSyncExternalStore(authStore.subscribe, () => revision, () => revision); return me; }
export const deviceLimitFallback = () => !me && !getConfig().loginRequired;
export const onlineLoginRequired = () => getConfig().loginRequired;
export function authHeaders(): Record<string, string> { return bearer ? { Authorization: `Bearer ${bearer}` } : {}; }
export function authSocket(url: string): WebSocket { return bearer && new URL(url).hostname === 'localhost' ? new WebSocket(url, ['maciokyu-auth', bearer]) : new WebSocket(url); }
export async function refreshAccount(): Promise<void> {
  for (const [code, leave] of leftRooms) if (leave.retry && leave.userId === me?.id) {
    leave.retry = false;
    await deleteAccountRoom(code).catch(() => {});
  }
  const response = await fetch(`${server}/me`, { credentials: 'include', headers: authHeaders() });
  if (response.status === 401) { update(null); return; }
  if (!response.ok) throw new Error('Akun belum bisa dimuat. Coba refresh halaman.');
  const value = await response.json();
  if (value.resetAt !== undefined) acceptConfig({ resetAt: value.resetAt, serverNow: value.serverNow, dailyMatchLimit: value.dailyMatchLimit });
  if (value.currentRoom && leftRooms.get(value.currentRoom.code)?.userId === value.id) value.currentRoom = null;
  update(value);
}
export async function openAuth(base: string): Promise<void> {
  server = base;
  if (new URL(base).hostname === 'localhost') try { bearer = sessionStorage.getItem(`itm.auth:${base}`); } catch { /* blocked storage */ }
  await fetchConfig(base); update(me);
  await refreshAccount();
}
export async function signIn(provider: 'google' | 'facebook', credential: string): Promise<void> {
  const response = await fetch(`${server}/auth/${provider}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(provider === 'google' ? { credential } : { accessToken: credential }), ref: pendingReferral() }) });
  if (!response.ok) throw new Error('Gagal masuk. Coba lagi.');
  const value = await response.json() as Account & { token?: string };
  clearReferral();
  bearer = value.token ?? null;
  if (bearer) try { sessionStorage.setItem(`itm.auth:${server}`, bearer); } catch { /* blocked storage */ }
  const { token: _token, ...account } = value;
  update(account);
  if (account.referralCode === null) try { await refreshAccount(); } catch { /* login succeeded; periodic refresh retries */ }
}
export async function shareReferral(): Promise<boolean> {
  if (!me?.referralCode) throw new Error('Link belum siap. Coba refresh halaman.');
  const link = 'https://maciokyu.com/?ref=' + me.referralCode;
  const text = 'Yuk main mahjong Indonesia online bareng di maciokYU! 🀄 Gratis, langsung dari browser: ' + link;
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer');
  const response = await fetch(`${server}/me/share`, { method: 'POST', credentials: 'include', headers: authHeaders() });
  if (!response.ok) throw new Error('Bonus belum tersimpan. Coba lagi.');
  const { granted } = await response.json();
  await refreshAccount();
  return granted === true;
}
export async function setUsername(username: string): Promise<void> {
  const response = await fetch(`${server}/me/username`, { method: 'POST', credentials: 'include', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ username }) });
  const body = await response.json().catch(() => ({}));
  if (response.ok && me) update({ ...me, name: body.username, username: body.username });
  // A retry after a lost success answer gets username_locked; the reloaded account already has its name.
  if (response.ok || body.code === 'username_locked') {
    try { await refreshAccount(); } catch { /* keep the local name */ }
    if (me?.username) return;
  }
  throw new Error(body.message ?? 'Nama belum tersimpan. Coba lagi.');
}
export async function setNewsOptIn(newsOptIn: boolean): Promise<void> {
  const response = await fetch(`${server}/me`, { method: 'POST', credentials: 'include', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ newsOptIn }) });
  if (!response.ok) throw new Error('Pilihan email belum tersimpan. Coba lagi.');
  await refreshAccount();
}
async function deleteAccountRoom(code: string): Promise<void> {
  const response = await fetch(`${server}/me/room`, { method: 'DELETE', credentials: 'include', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
  if (!response.ok) throw new Error('Belum bisa keluar dari room. Coba lagi.');
}
export async function leaveCurrentRoom(code: string): Promise<void> {
  if (!me) return;
  const leave = { userId: me.id, retry: false };
  leftRooms.set(code, leave);
  if (me.currentRoom?.code === code) update({ ...me, currentRoom: null });
  try { await deleteAccountRoom(code); await refreshAccount(); }
  catch (error) { leave.retry = true; throw error; }
}
export async function signOut(remove = false): Promise<void> {
  const response = await fetch(`${server}${remove ? '/me' : '/auth/logout'}`, { method: remove ? 'DELETE' : 'POST', credentials: 'include', headers: authHeaders() });
  if (!response.ok) throw new Error('Akun belum ke-update. Coba lagi.');
  bearer = null;
  try { sessionStorage.removeItem(`itm.auth:${server}`); } catch { /* blocked storage */ }
  update(null);
}
let googleLoad: Promise<void> | undefined;
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = src; script.async = true;
    script.onload = () => resolve(); script.onerror = () => reject(new Error('Tombol masuk belum bisa dimuat. Cek koneksi, lalu refresh.')); document.head.append(script);
  });
}
export async function renderGoogle(element: HTMLElement, onError: (message: string) => void): Promise<void> {
  googleLoad ??= loadScript('https://accounts.google.com/gsi/client').catch(error => { googleLoad = undefined; throw error; });
  await googleLoad;
  if (!element.isConnected) return;
  const google = (window as unknown as { google: Google }).google;
  google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: result => { void signIn('google', result.credential).catch(error => onError(error.message)); } });
  google.accounts.id.renderButton(element, { type: 'standard', text: 'signin_with', locale: 'id', theme: 'outline', size: 'large' });
}
let facebookLoad: Promise<void> | undefined;
export async function facebookLogin(): Promise<void> {
  facebookLoad ??= loadScript('https://connect.facebook.net/id_ID/sdk.js'); await facebookLoad;
  const fb = (window as unknown as { FB: Facebook }).FB;
  fb.init({ appId: '1670170614568233', version: 'v27.0' });
  await new Promise<void>((resolve, reject) => fb.login(response => {
    if (!response.authResponse) { reject(new Error('Masuk dibatalkan. Tekan tombolnya lagi buat coba ulang.')); return; }
    signIn('facebook', response.authResponse.accessToken).then(resolve, reject);
  }, { scope: 'email,public_profile' }));
}
