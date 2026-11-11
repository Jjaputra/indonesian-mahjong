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
    expect(html).toContain('aria-label="Menu utama"');
    expect(html).toContain('>Mahjong Tradisional Indonesia</h2>');
    expect(html).toContain('Latihan melawan tiga bot, aturan Bandung Mahjong Cup ver06. Anda duduk sebagai Timur.');
    expect(html).toContain('>Latihan</strong>');
    expect(html).toContain('>Tiga bot: Sulit</span>');
    expect(html).toContain('>Kalkulator Tay</strong>');
    expect(html).toContain('>Periksa pola dan hitung Tay</span>');
    expect(html).toContain('Tingkat kesulitan dapat diubah melalui Pengaturan.');
  });

  it('renders the supplied last result on its own line', () => {
    expect(renderMenu('24 Tay')).toContain('>Terakhir: 24 Tay</p>');
  });

  it('omits the last-result line when there is no result', () => {
    const html = renderMenu(null);
    expect(html).not.toContain('Terakhir:');
    expect(html).not.toContain('24 Tay');
  });

  it('reads as a practice menu: calm primary action and no online/multiplayer entry', () => {
    const html = renderMenu();
    expect(html).toContain('btn btn-primary menu-choice');
    expect(html).not.toContain('btn-gold');
    expect(html).not.toMatch(/online|multiplayer|daring/i);
  });

  it('omits the Kim choice unless both kimEnabled and onKimChange are supplied', () => {
    expect(renderMenu()).not.toContain('Ada Kim');
    const partial = renderToStaticMarkup(createElement(MainMenu, { difficultyLabel: 'Sulit', lastResult: null, onPractice: noop, onCalculator: noop, kimEnabled: true }));
    expect(partial).not.toContain('Ada Kim');
  });

  it('renders the pregame Ada Kim / Tanpa Kim choice with honest legacy-model wording', () => {
    const on = renderToStaticMarkup(createElement(MainMenu, { difficultyLabel: 'Sulit', lastResult: null, onPractice: noop, onCalculator: noop, kimEnabled: true, onKimChange: noop }));
    expect(on).toMatch(/aria-pressed="true">Ada Kim<\/button>/);
    expect(on).toMatch(/aria-pressed="false">Tanpa Kim<\/button>/);
    expect(on).toContain('model lama');
    expect(on).toContain('belum diterapkan');
    expect(on).toContain('menunggu konfirmasi');
    const off = renderToStaticMarkup(createElement(MainMenu, { difficultyLabel: 'Sulit', lastResult: null, onPractice: noop, onCalculator: noop, kimEnabled: false, onKimChange: noop }));
    expect(off).toMatch(/aria-pressed="false">Ada Kim<\/button>/);
    expect(off).toMatch(/aria-pressed="true">Tanpa Kim<\/button>/);
  });

  it('includes a collapsible tile legend covering suits, honours, bonus positions and Kim', () => {
    const html = renderMenu();
    expect(html).toContain('<details class="tile-legend">');
    for (const text of ['Tong (bulatan)', 'Sok (bambu)', 'Ban (karakter)', 'Angin', 'Naga', 'Bunga &amp; Musim', '1 Timur, 2 Selatan, 3 Barat, 4 Utara', 'Kim']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('aria-label="Bunga 1, bunga hitam/biru, angka biru tua"');
    expect(html).toContain('aria-label="Musim 4, musim/kembang merah, angka merah"');
    expect(html).toContain('class="tile-art art-white"');
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
