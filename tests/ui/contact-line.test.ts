import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { CONTACT_EMAIL, ContactLine } from '@/ui/components/ContactLine';

describe('ContactLine', () => {
  it('links the feedback address with a prefilled subject', () => {
    const html = renderToString(createElement(ContactLine));
    expect(CONTACT_EMAIL).toBe('trirtaprawisuda@gmail.com');
    expect(html).toContain(`href="mailto:${CONTACT_EMAIL}?subject=Masukan%20maciokYU!"`);
    expect(html).toContain('Ada masukan atau nemu bug?');
    expect(html).toContain('href="legal/privasi.html"');
    expect(html).toContain('href="legal/syarat.html"');
  });
});
