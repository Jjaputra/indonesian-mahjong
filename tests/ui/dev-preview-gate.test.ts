import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoPreviewEnabled } from '@/App';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DemoPreview } from '@/ui/dev-demo';
import { OnlineAuditPreview, ONLINE_AUDIT_STATES } from '@/ui/dev-online-demo';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('development preview gate', () => {
  it.each(['online', 'table', 'late', 'claim', 'hu', 'seri', 'dice', 'melds', 'final'])('accepts %s only in DEV', mode => {
    vi.stubEnv('DEV', true);
    expect(demoPreviewEnabled(`?demo=${mode}`)).toBe(true);
    vi.stubEnv('DEV', false);
    expect(demoPreviewEnabled(`?demo=${mode}`)).toBe(false);
  });

  it.each(ONLINE_AUDIT_STATES)('renders real online audit state %s without a connection', state => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost:5199', href: 'http://localhost:5199/' } });
    const html = renderToStaticMarkup(createElement(OnlineAuditPreview, { search: `?demo=online&state=${state}` }));
    expect(html).toContain(`data-layout-audit="${state}"`);
    if (['hu', 'seri', 'final'].includes(state)) expect(html).toContain('role="dialog"');
    if (state === 'claims') expect(html).toContain('Jia 7-8-9');
    if (state === 'hu') { expect(html).toContain('receipt-set'); expect(html).toContain('Receipt row 30'); }
  });

  it('ignores missing or unknown previews in development too', () => {
    vi.stubEnv('DEV', true);
    expect(demoPreviewEnabled('')).toBe(false);
    expect(demoPreviewEnabled('?demo=sandbox')).toBe(false);
  });

  it.each(['table', 'late', 'claim', 'hu', 'seri', 'dice', 'melds', 'final'])('renders the %s preview without developer controls', mode => {
    const html = renderToStaticMarkup(createElement(DemoPreview, { search: `?demo=${mode}` }));
    expect(html).toContain('class="table-felt"');
    expect(html).not.toMatch(/Uji Tangan|Mode developer/);
    if (mode === 'hu' || mode === 'seri' || mode === 'final') expect(html).toContain('role="dialog"');
  });
});
