import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { authHeaders, authStore, deviceLimitFallback, openAuth, refreshAccount, signIn, signOut } from '../../src/net/auth';
import { AccountPanel } from '../../src/ui/components/OnlineScreen';

afterEach(() => vi.unstubAllGlobals());
it('loads server policy, signs in with credentials, shows account UI and clears the store on logout/deletion', async () => {
  const account = { id: 'u', name: 'Jason', picture: 'https://example.com/avatar', premium: false, remainingMatches: 3 };
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith('/config')) return Response.json({ loginRequired: true });
    if (url.endsWith('/auth/google')) return Response.json({ ...account, token: 'test-bearer' });
    if (url.endsWith('/me')) return Response.json(account);
    return Response.json({ ok: true });
  });
  vi.stubGlobal('fetch', fetcher);
  await openAuth('http://localhost:8787');
  const changed = vi.fn(), unsubscribe = authStore.subscribe(changed);
  await signIn('google', 'credential');
  expect(authStore.get()).toEqual(account); expect(changed).toHaveBeenCalledOnce();
  expect(deviceLimitFallback()).toBe(false);
  expect(authHeaders()).toEqual({ Authorization: 'Bearer test-bearer' });
  expect(fetcher.mock.calls.find(([url]) => url.endsWith('/auth/google'))).toBeDefined();
  const html = renderToStaticMarkup(createElement(AccountPanel, { onError: () => {} }));
  for (const text of ['Jason', 'Sisa 3 dari 3 match hari ini', 'Keluar', 'Hapus akun', 'mp-avatar', 'mp-pill']) expect(html).toContain(text);
  expect(html).not.toContain('<section'); expect(html).not.toContain('role="alert"');
  expect(renderToStaticMarkup(createElement(AccountPanel, { onError: () => {}, error: 'Gagal masuk, coba lagi.' }))).toContain('<p class="mp-account-error" role="alert">Gagal masuk, coba lagi.</p>');
  await signOut(true); expect(authStore.get()).toBeNull(); expect(authHeaders()).toEqual({});
  const loggedOut = renderToStaticMarkup(createElement(AccountPanel, { onError: () => {} }));
  expect(loggedOut).toContain('Semua pemain online perlu masuk dengan Google.'); expect(loggedOut).toContain('class="mp-google"'); expect(loggedOut).not.toContain('Facebook');
  unsubscribe();
});
it('shows the initial when the account has no picture and "Tanpa batas" for premium', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/config') ? Response.json({ loginRequired: true }) : Response.json({ id: 'p', name: 'budi', picture: null, premium: true, remainingMatches: null, token: 't' })));
  await openAuth('http://localhost:8787'); await signIn('google', 'credential');
  const html = renderToStaticMarkup(createElement(AccountPanel, { onError: () => {} }));
  expect(html).toContain('<span class="mp-avatar" aria-hidden="true">B</span>'); expect(html).not.toContain('<img'); expect(html).toContain('Tanpa batas'); expect(html).not.toContain('Sisa');
  await signOut();
});
it('handles anonymous sessions, rejects failed login and enables device fallback only when the server permits it', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/config') ? Response.json({ loginRequired: false }) : new Response(null, { status: 401 })));
  await openAuth('http://localhost:8787'); expect(authStore.get()).toBeNull(); expect(deviceLimitFallback()).toBe(true);
  await expect(signIn('google', 'bad')).rejects.toThrow();
  await refreshAccount(); expect(authStore.get()).toBeNull();
});
