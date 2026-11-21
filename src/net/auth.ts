import { useSyncExternalStore } from 'react';

export const GOOGLE_CLIENT_ID = '493683615084-apa5g3v01866pb8b9qfrgc75ii4pqtqk.apps.googleusercontent.com';
export interface Account { id: string; name: string; picture: string | null; premium: boolean; remainingMatches: number | null }
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
let revision = 0;
const update = (value: Account | null) => { me = value; revision++; for (const fn of listeners) fn(); };
export function useAccount(): Account | null { useSyncExternalStore(authStore.subscribe, () => revision, () => revision); return me; }
export const deviceLimitFallback = () => !me && !loginRequired;
let loginRequired = false;
export function authHeaders(): Record<string, string> { return bearer ? { Authorization: `Bearer ${bearer}` } : {}; }
export function authSocket(url: string): WebSocket { return bearer && new URL(url).hostname === 'localhost' ? new WebSocket(url, ['maciokyu-auth', bearer]) : new WebSocket(url); }
export async function refreshAccount(): Promise<void> {
  const response = await fetch(`${server}/me`, { credentials: 'include', headers: authHeaders() });
  if (response.status === 401) { update(null); return; }
  if (!response.ok) throw new Error('Gagal memuat akun.');
  update(await response.json());
}
export async function openAuth(base: string): Promise<void> {
  server = base;
  if (new URL(base).hostname === 'localhost') try { bearer = sessionStorage.getItem(`itm.auth:${base}`); } catch { /* blocked storage */ }
  const config = await fetch(`${base}/auth/config`, { credentials: 'include' });
  if (config.ok) { loginRequired = (await config.json()).loginRequired === true; update(me); }
  await refreshAccount();
}
export async function signIn(provider: 'google' | 'facebook', credential: string): Promise<void> {
  const response = await fetch(`${server}/auth/${provider}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(provider === 'google' ? { credential } : { accessToken: credential }) });
  if (!response.ok) throw new Error('Gagal masuk. Coba lagi.');
  const value = await response.json() as Account & { token?: string };
  bearer = value.token ?? null;
  if (bearer) try { sessionStorage.setItem(`itm.auth:${server}`, bearer); } catch { /* blocked storage */ }
  update({ id: value.id, name: value.name, picture: value.picture, premium: value.premium, remainingMatches: value.remainingMatches });
}
export async function signOut(remove = false): Promise<void> {
  const response = await fetch(`${server}${remove ? '/me' : '/auth/logout'}`, { method: remove ? 'DELETE' : 'POST', credentials: 'include', headers: authHeaders() });
  if (!response.ok) throw new Error('Gagal memperbarui akun.');
  bearer = null;
  try { sessionStorage.removeItem(`itm.auth:${server}`); } catch { /* blocked storage */ }
  update(null);
}
let googleLoad: Promise<void> | undefined;
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = src; script.async = true;
    script.onload = () => resolve(); script.onerror = () => reject(new Error('Gagal memuat login.')); document.head.append(script);
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
    if (!response.authResponse) { reject(new Error('Login dibatalkan.')); return; }
    signIn('facebook', response.authResponse.accessToken).then(resolve, reject);
  }, { scope: 'email,public_profile' }));
}
