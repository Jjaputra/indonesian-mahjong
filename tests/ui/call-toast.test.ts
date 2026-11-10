import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { CallToast, formatCall } from '@/ui/components/CallToast';

describe('CallToast', () => {
  it('renders a Pung call with the bot name', () => {
    const html = renderToString(createElement(CallToast, { event: { type: 'pung', seat: 'nan' } }));
    expect(html).toContain('class="call-toast"');
    expect(html).toContain('Bot Selatan: Pung');
  });

  it('renders a discard with the tile label', () => {
    const html = renderToString(createElement(CallToast, { event: { type: 'discard', seat: 'xi', tileLabel: '5 Tong' } }));
    expect(html).toContain('Bot Barat membuang 5 Tong');
  });

  it('renders nothing for a quiet draw', () => {
    expect(renderToString(createElement(CallToast, { event: { type: 'draw', seat: 'dong' } }))).toBe('');
  });
});

describe('formatCall', () => {
  it('formats Hu for the player', () => {
    expect(formatCall({ type: 'hu', seat: 'dong' })).toBe('Anda Hu');
  });

  it('formats Seri', () => {
    expect(formatCall({ type: 'seri' })).toBe('Seri');
  });

  it('omits the name when the seat is missing', () => {
    expect(formatCall({ type: 'kong' })).toBe('Kong');
    expect(formatCall({ type: 'hu' })).toBe('Hu');
  });
});
