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
  }));
}

describe('MainMenu', () => {
  it('renders a focused game start with current difficulty', () => {
    const html = renderMenu();
    expect(html).toContain('aria-label="Menu utama"');
    expect(html).toContain('Mulai bermain');
    expect(html).toContain('Tiga bot · Sulit');
    expect(html).not.toMatch(/Rulebook|Kalkulator|PDF|ver06|tile-legend|aturan rumah/);
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
    const partial = renderToStaticMarkup(createElement(MainMenu, { difficultyLabel: 'Sulit', lastResult: null, onPractice: noop, kimEnabled: true }));
    expect(partial).not.toContain('Ada Kim');
  });

  it('renders the pregame three-mode Kim choice without development explanations', () => {
    const on = renderToStaticMarkup(createElement(MainMenu, { difficultyLabel: 'Sulit', lastResult: null, onPractice: noop, kimEnabled: true, onKimChange: noop }));
    expect(on).toContain('role="radiogroup" aria-label="Pilihan Kim"');
    expect(on).toContain('<button type="button" role="radio" aria-checked="true" class="is-on">Kim dari tile</button>');
    expect(on).toContain('<button type="button" role="radio" aria-checked="false">Tanpa Kim</button>');
    expect(on).toContain('keempat kopinya jadi Kim');
    expect(on).not.toMatch(/model lama|belum diterapkan|menunggu konfirmasi/);
    const off = renderToStaticMarkup(createElement(MainMenu, { difficultyLabel: 'Sulit', lastResult: null, onPractice: noop, kimEnabled: false, onKimChange: noop }));
    expect(off).toContain('<button type="button" role="radio" aria-checked="false">Kim dari tile</button>');
    expect(off).toContain('<button type="button" role="radio" aria-checked="true" class="is-on">Tanpa Kim</button>');
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
