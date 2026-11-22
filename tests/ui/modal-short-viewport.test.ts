import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
/** Declarations of the first top-level rule whose selector is exactly `selector`. */
const ruleBody = (selector: string) => {
  const escaped = selector.replace(/[.*+?^$()|[\]\{}]/g, '\$&');
  return css.match(new RegExp('(?:^|\n)' + escaped + ' \{([^}]*)\}'))?.[1] ?? '';
};

describe('shared Modal on a short viewport', () => {
  it('sizes the panel from the dynamic viewport, with a 100vh fallback declared first', () => {
    const panel = ruleBody('.panel');
    expect(panel.indexOf('max-height: calc(100vh - 32px)')).toBeGreaterThanOrEqual(0);
    expect(panel.indexOf('max-height: calc(100dvh - 32px)')).toBeGreaterThan(panel.indexOf('max-height: calc(100vh - 32px)'));
    const drawer = ruleBody('.panel-drawer');
    expect(drawer.indexOf('height: 100dvh')).toBeGreaterThan(drawer.indexOf('height: 100vh'));
  });

  it('scrolls the body and keeps header and footer fixed in size, so the footer buttons stay on screen', () => {
    const body = ruleBody('.panel-body');
    expect(body).toMatch(/overflow:\s*auto/);
    expect(body).toMatch(/min-height:\s*0/);
    expect(body).toMatch(/flex:\s*1 1 auto/);
    expect(ruleBody('.panel-header,\n.panel-footer')).toMatch(/flex:\s*none/);
  });

  it('keeps the dvh limit in the phone rule too', () => {
    expect(css).toMatch(/\.panel \{\s*max-height: calc\(100vh - 16px\);\s*max-height: calc\(100dvh - 16px\);/);
  });
});
