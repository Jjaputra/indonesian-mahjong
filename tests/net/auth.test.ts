import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { authHeaders, authStore, deviceLimitFallback, openAuth, refreshAccount, signIn, signOut } from '../../src/net/auth';
import { AccountPanel } from '../../src/ui/components/OnlineScreen';

afterEach(() => vi.unstubAllGlobals());
it('loads server policy, signs in with credentials, shows account UI and clears the store on logout/deletion', async () => {
  const account = { id: 'u', name: 'Jason', picture: 'https://example.com/avatar', premium: false, remainingMatches: 3 };
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith('/auth/config')) return Response.json({ loginRequired: true });
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
  for (const text of ['Jason', 'Sisa 3 dari 5', 'Keluar', 'Hapus akun']) expect(html).toContain(text);
  await signOut(true); expect(authStore.get()).toBeNull(); expect(authHeaders()).toEqual({});
  const loggedOut = renderToStaticMarkup(createElement(AccountPanel, { onError: () => {} }));
  expect(loggedOut).toContain('Teman yang join tidak perlu.'); expect(loggedOut).not.toContain('Facebook');
  unsubscribe();
});
it('handles anonymous sessions, rejects failed login and enables device fallback only when the server permits it', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/auth/config') ? Response.json({ loginRequired: false }) : new Response(null, { status: 401 })));
  await openAuth('http://localhost:8787'); expect(authStore.get()).toBeNull(); expect(deviceLimitFallback()).toBe(true);
  await expect(signIn('google', 'bad')).rejects.toThrow();
  await refreshAccount(); expect(authStore.get()).toBeNull();
});
