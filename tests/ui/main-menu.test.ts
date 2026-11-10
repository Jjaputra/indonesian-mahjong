import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AbandonMatchDialog } from '@/ui/components/AbandonMatchDialog';
import { MainMenu } from '@/ui/components/MainMenu';

const noop = () => undefined;

function renderMenu(lastResult: string | null = null) {
  return renderToStaticMarkup(createElement(MainMenu, {
    difficultyLabel: 'Sulit',
    lastResult,
    onPractice: noop,
    onCalculator: noop,
  }));
}

describe('MainMenu', () => {
  it('renders the title, both choices, difficulty and Indonesian guidance', () => {
    const html = renderMenu();
    expect(html).toContain('<h1>Mahjong Tradisional Indonesia</h1>');
    expect(html).toContain('Latihan melawan tiga bot, aturan Bandung Mahjong Cup ver06. Anda duduk sebagai Timur.');
    expect(html).toMatch(/<button[^>]*>Latihan <span>Tiga bot: Sulit<\/span><\/button>/);
    expect(html).toMatch(/<button[^>]*>Kalkulator Tay <span>Periksa pola dan hitung Tay<\/span><\/button>/);
    expect(html).toContain('Tingkat kesulitan dapat diubah melalui Pengaturan.');
  });

  it('renders the supplied last result on its own line', () => {
    expect(renderMenu('24 Tay')).toContain('<p>Terakhir: 24 Tay</p>');
  });

  it('omits the last-result line when there is no result', () => {
    const html = renderMenu(null);
    expect(html).not.toContain('Terakhir:');
    expect(html).not.toContain('24 Tay');
  });
});

describe('AbandonMatchDialog', () => {
  it('asks about leaving the match and renders both dialog buttons', () => {
    const html = renderToStaticMarkup(createElement(AbandonMatchDialog, { onStay: noop, onLeave: noop }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Apakah Anda ingin meninggalkan pertandingan saat ini dan kembali ke menu?');
    expect(html).toMatch(/<button[^>]*>Tetap di meja<\/button>/);
    expect(html).toMatch(/<button[^>]*>Kembali ke menu<\/button>/);
  });
});
