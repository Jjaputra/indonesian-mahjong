import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoPreviewEnabled } from '@/App';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DemoPreview } from '@/ui/dev-demo';

afterEach(() => vi.unstubAllEnvs());

describe('development preview gate', () => {
  it.each(['table', 'late', 'claim', 'hu', 'seri', 'dice', 'melds', 'final'])('accepts %s only in DEV', mode => {
    vi.stubEnv('DEV', true);
    expect(demoPreviewEnabled(`?demo=${mode}`)).toBe(true);
    vi.stubEnv('DEV', false);
    expect(demoPreviewEnabled(`?demo=${mode}`)).toBe(false);
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
