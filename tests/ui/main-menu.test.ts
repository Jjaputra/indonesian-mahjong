import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AIDifficulty } from '@/storage';
import { DIFFICULTY_LABEL } from '@/ui/labels';
import { AbandonMatchDialog } from '@/ui/components/AbandonMatchDialog';
import { DIFFICULTY_NOTE, MainMenu } from '@/ui/components/MainMenu';

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

  it('renders bot difficulty choices with label, options, and one-line note', () => {
    const html = renderToStaticMarkup(createElement(MainMenu, {
      difficulty: 'normal',
      onDifficultyChange: noop,
      lastResult: null,
      onPractice: noop,
    }));
    expect(html).toContain('role="radiogroup" aria-label="Tingkat kesulitan bot"');
    expect(html).toContain('<button type="button" role="radio" aria-checked="false">Mudah</button>');
    expect(html).toContain('<button type="button" role="radio" aria-checked="true" class="is-on">Normal</button>');
    expect(html).toContain('<button type="button" role="radio" aria-checked="false">Sulit</button>');
    expect(html).toContain(DIFFICULTY_NOTE.normal);
    expect(html).toContain('Tiga bot · Normal · 16 game');
  });

  it('omits bot difficulty choice if onDifficultyChange is not provided', () => {
    const html = renderToStaticMarkup(createElement(MainMenu, {
      difficulty: 'normal',
      lastResult: null,
      onPractice: noop,
    }));
    expect(html).not.toContain('aria-label="Tingkat kesulitan bot"');
  });

  it('renders correct note and summary line for each difficulty level', () => {
    for (const level of ['easy', 'normal', 'hard'] as const) {
      const html = renderToStaticMarkup(createElement(MainMenu, {
        difficulty: level,
        onDifficultyChange: noop,
        lastResult: null,
        onPractice: noop,
      }));
      expect(html).toContain(`aria-checked="true" class="is-on">${DIFFICULTY_LABEL[level]}</button>`);
      expect(html).toContain(DIFFICULTY_NOTE[level]);
      expect(html).toContain(`Tiga bot · ${DIFFICULTY_LABEL[level]} · 16 game`);
    }
  });

  it('triggers onDifficultyChange callback when clicking difficulty buttons', () => {
    const onDifficultyChange = vi.fn();
    const tree = MainMenu({
      difficulty: 'normal',
      onDifficultyChange,
      lastResult: null,
      onPractice: noop,
    });
    const section = (tree as any).props.children;
    const children = Array.isArray(section.props.children) ? section.props.children : [section.props.children];
    const difficultyChoice = children.find((c: any) => c && c.props && c.props.label === 'Tingkat kesulitan bot');
    expect(difficultyChoice).toBeDefined();

    expect(difficultyChoice.props.value).toBe('normal');
    difficultyChoice.props.onChange('hard');
    expect(onDifficultyChange).toHaveBeenCalledWith('hard');

    difficultyChoice.props.onChange('easy');
    expect(onDifficultyChange).toHaveBeenCalledWith('easy');
  });

  it('updates label and note when difficulty changes in a stateful harness', () => {
    function StatefulMenu() {
      const [diff, setDiff] = useState<AIDifficulty>('easy');
      return createElement(MainMenu, {
        difficulty: diff,
        onDifficultyChange: setDiff,
        lastResult: null,
        onPractice: noop,
      });
    }
    const initialHtml = renderToStaticMarkup(createElement(StatefulMenu));
    expect(initialHtml).toContain('Tiga bot · Mudah · 16 game');
    expect(initialHtml).toContain(DIFFICULTY_NOTE.easy);
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
