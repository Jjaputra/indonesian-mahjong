
import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { openAuth, signOut } from '../../src/net/auth';
import { AccountPanel, OnlineScreen } from '../../src/ui/components/OnlineScreen';
import App from '../../src/App';

afterEach(() => vi.unstubAllGlobals());
const noop = () => {};

it('offers the account room on a device without a local seat token and keeps email consent unchecked', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/auth/config')
    ? Response.json({ loginRequired: true })
    : Response.json({ id: 'u', name: 'Jason', picture: null, premium: false, remainingMatches: 5, currentRoom: { code: 'ABCDEF', phase: 'playing' }, newsOptIn: false })));
  await openAuth('https://mp.example');
  vi.stubEnv('VITE_MP_SERVER', 'https://mp.example');
  const html = renderToStaticMarkup(createElement(App));
  vi.unstubAllEnvs();
  expect(html).toContain('Lanjut room ABCDEF');
  const panel = renderToStaticMarkup(createElement(AccountPanel, { onError: noop }));
  expect(panel).toContain('Kabari lewat email soal Premium dan update maciokYU!');
  expect(panel).toContain('type="checkbox"');
  expect(panel).not.toContain('checked=""');
  // Name and actions, the allowance pills, and the opt-in each get their own row, so nothing is squeezed on a tablet.
  expect(panel).toMatch(/class="mp-account-who"[\s\S]*class="mp-account-allowance"[\s\S]*class="mp-account-optin"/);
  await signOut();
});

it('keeps an invite code beside the Google login card while logged out', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/auth/config')
    ? Response.json({ loginRequired: true }) : new Response(null, { status: 401 })));
  await openAuth('https://mp.example');
  const html = renderToStaticMarkup(createElement(OnlineScreen, { server: 'https://mp.example', inviteCode: 'ABCDEF', resume: false, onTableChange: noop, optionsOpen: false, onOptionsOpenChange: noop, onExit: noop }));
  expect(html).toContain('Masuk pakai Google dulu buat gabung ke room ABCDEF');
  expect(html).toContain('class="mp-google"');
  expect(html).toContain('value="ABCDEF"');
});
