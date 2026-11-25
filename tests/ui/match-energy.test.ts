import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { openAuth, signIn, signOut } from '../../src/net/auth';
import { MatchEnergy, MatchHelpModal } from '../../src/ui/components/MatchEnergy';

afterEach(() => vi.unstubAllGlobals());
async function login(account: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/config') ? Response.json({ dailyMatchLimit: 3, resetAt: 2e12, serverNow: 1e12 }) : Response.json({ id: 'u', name: 'A', picture: null, referralCode: 'ABC234', ...account })));
  await openAuth('https://api.maciokyu.com');
  await signIn('google', 'credential');
}
const pips = (html: string) => [...html.matchAll(/<span( class="is-full")?><\/span>/g)].map(m => !!m[1]);

it('shows today\'s host matches as pips, the banked bonus, the reset countdown and a + to the how-to', async () => {
  await login({ premium: false, remainingMatches: 4, bonusMatches: 2, sharedToday: false });
  const html = renderToStaticMarkup(createElement(MatchEnergy));
  expect(pips(html)).toEqual([true, true, false]);
  expect(html).toContain('2/3'); expect(html).toContain('+2 tabungan');
  expect(html).toContain('Reset 00.00 WIB'); expect(html).toContain('aria-label="Cara nambah jatah"');
});
it('counts today\'s share as an extra pip and hides the bank when empty', async () => {
  await login({ premium: false, remainingMatches: 4, bonusMatches: 0, sharedToday: true });
  const html = renderToStaticMarkup(createElement(MatchEnergy));
  expect(pips(html)).toEqual([true, true, true, true]); expect(html).toContain('4/4');
  expect(html).not.toContain('tabungan');
});
it('shows Premium as unlimited, with no pips or countdown', async () => {
  await login({ premium: true, remainingMatches: null });
  const html = renderToStaticMarkup(createElement(MatchEnergy));
  expect(html).toContain('Tanpa batas'); expect(pips(html)).toEqual([]); expect(html).not.toContain('Reset 00.00');
});
it('explains every way to earn more matches and offers the share button', async () => {
  await login({ premium: false, remainingMatches: 3, bonusMatches: 0, sharedToday: true, referrals: 12 });
  const html = renderToStaticMarkup(createElement(MatchHelpModal, { onClose() {} }));
  for (const text of ['Bagikan ke WA: +1 match hari ini', 'Udah kamu ambil hari ini', 'Ajak temen baru: +3 match tabungan', 'Maks. 10 temen', 'Premium: tanpa batas', 'Gabung room temen gratis', 'class="mp-share-wa"']) expect(html).toContain(text);
});
it('shows 0 today with the bank left, hides pips past six, and renders nothing signed out', async () => {
  await login({ premium: false, remainingMatches: 2, bonusMatches: 2, sharedToday: false });
  let html = renderToStaticMarkup(createElement(MatchEnergy));
  expect(pips(html)).toEqual([false, false, false]); expect(html).toContain('0/3'); expect(html).toContain('+2 tabungan');
  await login({ premium: false, remainingMatches: 5, bonusMatches: 0, sharedToday: false, dailyMatchLimit: 8 });
  html = renderToStaticMarkup(createElement(MatchEnergy));
  expect(pips(html)).toEqual([]); expect(html).toContain('5/8');
  await signOut();
  expect(renderToStaticMarkup(createElement(MatchEnergy))).toBe('');
});
