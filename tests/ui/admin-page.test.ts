import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { openAuth, signOut } from '../../src/net/auth';
import { AdminPage } from '../../src/ui/components/AdminPage';

afterEach(() => vi.unstubAllGlobals());

it('never renders blank while the account is unknown, logged out or not an admin', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/auth/config')
    ? Response.json({ loginRequired: true }) : new Response(null, { status: 401 })));
  await openAuth('https://mp.example');
  const loggedOut = renderToStaticMarkup(createElement(AdminPage, { server: 'https://mp.example' }));
  expect(loggedOut).toContain('Pengaturan admin');
  expect(loggedOut).toContain('Kembali ke menu');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/auth/config')
    ? Response.json({ loginRequired: true })
    : Response.json({ id: 'u', name: 'Jason', picture: null, premium: false, remainingMatches: 3, admin: true })));
  await openAuth('https://mp.example');
  const admin = renderToStaticMarkup(createElement(AdminPage, { server: 'https://mp.example' }));
  expect(admin).toContain('Ringkasan');
  expect(admin).toContain('Riwayat perubahan');
  await signOut();
});
