import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryStorage } from '../../src/storage';
import { captureReferral, pendingReferral } from '../../src/net/referral';
import { openAuth, shareReferral, signIn } from '../../src/net/auth';
import { authStore } from '../../src/net/auth';
import { ReferralShare } from '../../src/ui/components/ReferralShare';
import { AccountPanel } from '../../src/ui/components/OnlineScreen';

afterEach(() => vi.unstubAllGlobals());
it('keeps a successful sign-in when its follow-up referral refresh is unavailable', async () => {
  const account = { id: 'refresh-offline', name: 'Friend', referralCode: null };
  let offline = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/auth/google')) return Response.json(account);
    if (url.endsWith('/me')) { if (offline) throw Error('offline'); return new Response(null, { status: 401 }); }
    return Response.json({});
  }));
  await openAuth('https://api.maciokyu.com');
  offline = true;
  await expect(signIn('google', 'credential')).resolves.toBeUndefined();
  expect(authStore.get()).toMatchObject(account);
});
it('captures valid ref, preserves other URL parts, expires after 30 days and silently ignores invalid/blocked storage', () => {
  const storage = new MemoryStorage(), replaceState = vi.fn();
  const location = { href: 'https://maciokyu.com/?ref=ABC234&room=ABCDEF#game' };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { location, history: { state: { keep: true }, replaceState } });
  captureReferral(1000);
  expect(replaceState).toHaveBeenCalledWith({ keep: true }, '', 'https://maciokyu.com/?room=ABCDEF#game');
  expect(pendingReferral(1000 + 30 * 86400000 - 1)).toBe('ABC234');
  expect(pendingReferral(1000 + 30 * 86400000)).toBeUndefined();
  location.href = 'https://maciokyu.com/?ref=invalid';
  replaceState.mockClear(); captureReferral();
  expect(replaceState).not.toHaveBeenCalled(); expect(pendingReferral()).toBeUndefined();
  vi.stubGlobal('localStorage', { getItem() { throw Error(); }, setItem() { throw Error(); } });
  location.href = 'https://maciokyu.com/?ref=ABC234';
  expect(() => captureReferral()).not.toThrow(); expect(pendingReferral()).toBeUndefined();
});
it.each(['google', 'facebook'] as const)('sends ref on %s login, keeps on failure, clears on success, opens WA synchronously and refreshes bonus/button', async provider => {
  const storage = new MemoryStorage(), open = vi.fn();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { open, location: { href: 'https://maciokyu.com/?ref=ABC234' }, history: { replaceState() {} } });
  captureReferral();
  let shared = false, fail = true;
  const account = { id: 'ref-user', name: 'Friend', premium: false, referralCode: 'ABC234', remainingMatches: 5, bonusMatches: 2 };
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/auth/')) {
      expect(JSON.parse(init!.body as string).ref).toBe('ABC234');
      return fail ? new Response(null, { status: 401 }) : Response.json(account);
    }
    if (url.endsWith('/me/share')) { expect(open).toHaveBeenCalled(); shared = true; return Response.json({ granted: true }); }
    if (url.endsWith('/me')) return Response.json({ ...account, sharedToday: shared, remainingMatches: shared ? 6 : 5 });
    return Response.json({});
  });
  vi.stubGlobal('fetch', fetcher);
  await openAuth('https://api.maciokyu.com');
  await expect(signIn(provider, 'credential')).rejects.toThrow(); expect(pendingReferral()).toBe('ABC234');
  fail = false; await signIn(provider, 'credential'); expect(pendingReferral()).toBeUndefined();
  expect(renderToStaticMarkup(createElement(ReferralShare, { onError() {} }))).toContain('Bagikan ke WA (+1 match)');
  const panel = renderToStaticMarkup(createElement(AccountPanel, { onError() {} }));
  expect(panel).toContain('Jatah host hari ini: sisa 3 +2 tabungan');
  expect(panel).toContain('maks. 10 temen');
  expect(await shareReferral()).toBe(true);
  const url = new URL(open.mock.calls[0]![0]);
  expect(url.origin).toBe('https://wa.me');
  expect(url.searchParams.get('text')).toBe('Yuk main mahjong Indonesia online bareng di maciokYU! 🀄 Gratis, langsung dari browser: https://maciokyu.com/?ref=ABC234');
  const html = renderToStaticMarkup(createElement(ReferralShare, { onError() {} }));
  expect(html).toContain('Bagikan ke WA'); expect(html).not.toContain('(+1 match)');
});
it('shows the share button and note to Premium accounts without the match bonus', async () => {
  const account = { id: 'premium-user', name: 'Admin', premium: true, referralCode: 'XYZ789', sharedToday: false };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/auth/google') || url.endsWith('/me') ? Response.json(account) : Response.json({})));
  await openAuth('https://api.maciokyu.com');
  await signIn('google', 'credential');
  const share = renderToStaticMarkup(createElement(ReferralShare, { onError() {} }));
  expect(share).toContain('Bagikan ke WA'); expect(share).not.toContain('+1 match');
  const panel = renderToStaticMarkup(createElement(AccountPanel, { onError() {} }));
  expect(panel).toContain('Jatah host: tanpa batas');
  expect(panel).toContain('Ajak temen: bagikan link kamu'); expect(panel).not.toContain('+3 match');
  const open = vi.fn();
  vi.stubGlobal('window', { open });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/me/share') ? new Response(null, { status: 500 }) : Response.json(account)));
  await expect(shareReferral()).resolves.toBe(false); expect(open).toHaveBeenCalled();
});
