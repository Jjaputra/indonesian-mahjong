import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { authHeaders, authStore, deviceLimitFallback, leaveCurrentRoom, openAuth, refreshAccount, setUsername, signIn, signOut } from '../../src/net/auth';
import { AccountPanel } from '../../src/ui/components/OnlineScreen';

afterEach(() => vi.unstubAllGlobals());
it.each(['leave', 'refresh'])('hides a left room after %s failure and retries leave once on the next /me', async failure => {
  const account = { id: `leaver-${failure}`, name: 'Jason', currentRoom: { code: 'ABCDEF', phase: 'finished' } };
  let deletes = 0, failRefresh = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/config')) return Response.json({ loginRequired: true });
    if (url.endsWith('/me/room')) { deletes++; if (failure === 'leave' && deletes === 1) return new Response(null, { status: 503 }); }
    if (url.endsWith('/me')) { if (failRefresh) { failRefresh = false; throw new Error('offline'); } return Response.json(account); }
    return Response.json({ ok: true });
  }));
  await openAuth('http://localhost:8787');
  failRefresh = failure === 'refresh';
  await expect(leaveCurrentRoom('ABCDEF')).rejects.toThrow();
  expect(authStore.get()?.currentRoom).toBeNull();
  await refreshAccount(); expect(deletes).toBe(2);
  expect(authStore.get()?.currentRoom).toBeNull();
  await refreshAccount(); expect(deletes).toBe(2);
  account.currentRoom.code = 'GHJKLM';
  await refreshAccount(); expect(authStore.get()?.currentRoom?.code).toBe('GHJKLM');
  await signOut();
});
it('loads server policy, signs in with credentials, shows account UI and clears the store on logout/deletion', async () => {
  const account = { id: 'u', name: 'Google Private', username: 'Jason', picture: 'https://example.com/avatar', premium: false, remainingMatches: 3 };
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
  for (const text of ['Jason', 'Jatah host hari ini: sisa 3 dari 3 match', 'Keluar', 'Hapus akun', 'mp-avatar', 'mp-pill']) expect(html).toContain(text);
  expect(html).not.toContain('<section'); expect(html).not.toContain('role="alert"');
  expect(renderToStaticMarkup(createElement(AccountPanel, { onError: () => {}, error: 'Gagal masuk, coba lagi.' }))).toContain('<p class="mp-account-error" role="alert">Gagal masuk, coba lagi.</p>');
  await signOut(true); expect(authStore.get()).toBeNull(); expect(authHeaders()).toEqual({});
  const loggedOut = renderToStaticMarkup(createElement(AccountPanel, { onError: () => {} }));
  expect(loggedOut).toContain('Masuk pakai Google dulu buat main.'); expect(loggedOut).toContain('class="mp-google"'); expect(loggedOut).not.toContain('Facebook');
  unsubscribe();
});
it('shows the initial when the account has no picture and "Jatah host: tanpa batas" for premium', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/config') ? Response.json({ loginRequired: true }) : Response.json({ id: 'p', name: 'Google Private', username: 'budi', picture: null, premium: true, remainingMatches: null, token: 't' })));
  await openAuth('http://localhost:8787'); await signIn('google', 'credential');
  const html = renderToStaticMarkup(createElement(AccountPanel, { onError: () => {} }));
  expect(html).toContain('<span class="mp-avatar" aria-hidden="true">B</span>'); expect(html).not.toContain('<img'); expect(html).toContain('Jatah host: tanpa batas'); expect(html).not.toContain('Sisa');
  await signOut();
});
it('handles anonymous sessions, rejects failed login and enables device fallback only when the server permits it', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/config') ? Response.json({ loginRequired: false }) : new Response(null, { status: 401 })));
  await openAuth('http://localhost:8787'); expect(authStore.get()).toBeNull(); expect(deviceLimitFallback()).toBe(true);
  await expect(signIn('google', 'bad')).rejects.toThrow();
  await refreshAccount(); expect(authStore.get()).toBeNull();
});
it('saves a username and recovers when a lost success answer comes back as username_locked', async () => {
  const account: { id: string; name: string; username: string | null } = { id: 'picker', name: '', username: null };
  let lostAnswer = true;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/config')) return Response.json({ loginRequired: true });
    if (url.endsWith('/me/username')) {
      if (account.username) return Response.json({ code: 'username_locked', message: 'Nama ini permanen dan nggak bisa diganti sendiri.' }, { status: 409 });
      account.username = account.name = 'Tomok';
      if (lostAnswer) { lostAnswer = false; throw new Error('network'); }
      return Response.json({ username: 'Tomok' });
    }
    if (url.endsWith('/me')) return Response.json(account);
    return Response.json({ ok: true });
  }));
  await openAuth('http://localhost:8787');
  await expect(setUsername('Tomok')).rejects.toThrow('network');
  expect(authStore.get()?.username).toBeNull();
  await setUsername('Tomok');
  expect(authStore.get()).toMatchObject({ username: 'Tomok', name: 'Tomok' });
  account.username = null; account.name = '';
  await refreshAccount();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/me/username')
    ? Response.json({ code: 'username_taken', message: 'Nama itu udah dipakai, coba yang lain.' }, { status: 409 }) : Response.json(account)));
  await expect(setUsername('Tomok')).rejects.toThrow('Nama itu udah dipakai');
  await signOut();
});
