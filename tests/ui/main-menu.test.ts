import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AIDifficulty } from '@/storage';
import { DIFFICULTY_LABEL } from '@/ui/labels';
import { AbandonMatchDialog } from '@/ui/components/AbandonMatchDialog';
import { DIFFICULTY_NOTE, MainMenu, MenuFront, MenuSolo } from '@/ui/components/MainMenu';
import { PremiumModal } from '@/ui/components/PremiumModal';

const noop = () => undefined;

/** The options screen ("Main sendiri"); the front screen is covered separately below. */
function renderMenu(lastResult: string | null = null) {
  return renderToStaticMarkup(createElement(MainMenu, {
    difficultyLabel: 'Sulit',
    lastResult,
    onPractice: noop,
    initialStep: 'solo',
  }));
}

/** Every element in an unexpanded React tree (components are not rendered). */
function elements(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}
function textOf(node: any): string {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object') return textOf(node.props?.children);
  return typeof node === 'string' ? node : '';
}
function buttonWith(node: any, text: string): any {
  return elements(node).find((e) => e.type === 'button' && textOf(e).includes(text));
}

describe('MainMenu', () => {
  it('renders a focused game start with current difficulty', () => {
    const html = renderMenu();
    expect(html).toContain('aria-label="Main sendiri"');
    expect(html).toContain('Mulai bermain');
    expect(html).toContain('Tiga bot · Sulit');
    expect(html).not.toMatch(/Rulebook|Kalkulator|PDF|ver06|tile-legend|aturan rumah/);
  });

  it('shows the last result only on the front screen', () => {
    const front = renderToStaticMarkup(createElement(MainMenu, { lastResult: '24 Tay', onPractice: noop }));
    expect(front).toContain('>Terakhir: 24 Tay</p>');
    expect(renderMenu('24 Tay')).not.toContain('Terakhir:');
  });

  it('omits the last-result line when there is no result', () => {
    const html = renderToStaticMarkup(createElement(MainMenu, { lastResult: null, onPractice: noop }));
    expect(html).not.toContain('Terakhir:');
    expect(html).not.toContain('24 Tay');
  });

  it('reads as a practice screen: calm primary action and no online/multiplayer entry', () => {
    const html = renderMenu();
    expect(html).toContain('btn btn-primary menu-choice');
    expect(html).not.toContain('btn-gold');
    expect(html).not.toMatch(/online|multiplayer|daring/i);
  });

  it('omits the Kim choice unless both kimEnabled and onKimChange are supplied', () => {
    expect(renderMenu()).not.toContain('Ada Kim');
    const partial = renderToStaticMarkup(createElement(MainMenu, { difficultyLabel: 'Sulit', lastResult: null, onPractice: noop, kimEnabled: true, initialStep: 'solo' }));
    expect(partial).not.toContain('Ada Kim');
  });

  it('renders the pregame three-mode Kim choice without development explanations', () => {
    const on = renderToStaticMarkup(createElement(MainMenu, { difficultyLabel: 'Sulit', lastResult: null, onPractice: noop, kimEnabled: true, onKimChange: noop, initialStep: 'solo' }));
    expect(on).toContain('role="radiogroup" aria-label="Pilihan Kim"');
    expect(on).toContain('<button type="button" role="radio" aria-checked="true" class="is-on">Kim dari tile</button>');
    expect(on).toContain('<button type="button" role="radio" aria-checked="false">Tanpa Kim</button>');
    expect(on).toContain('keempat kopinya jadi Kim');
    expect(on).not.toMatch(/model lama|belum diterapkan|menunggu konfirmasi/);
    const off = renderToStaticMarkup(createElement(MainMenu, { difficultyLabel: 'Sulit', lastResult: null, onPractice: noop, kimEnabled: false, onKimChange: noop, initialStep: 'solo' }));
    expect(off).toContain('<button type="button" role="radio" aria-checked="false">Kim dari tile</button>');
    expect(off).toContain('<button type="button" role="radio" aria-checked="true" class="is-on">Tanpa Kim</button>');
  });

  it('renders bot difficulty choices with label, options, and one-line note', () => {
    const html = renderToStaticMarkup(createElement(MainMenu, {
      difficulty: 'normal',
      onDifficultyChange: noop,
      lastResult: null,
      onPractice: noop,
      initialStep: 'solo',
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
      initialStep: 'solo',
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
        initialStep: 'solo',
      }));
      expect(html).toContain(`aria-checked="true" class="is-on">${DIFFICULTY_LABEL[level]}</button>`);
      expect(html).toContain(DIFFICULTY_NOTE[level]);
      expect(html).toContain(`Tiga bot · ${DIFFICULTY_LABEL[level]} · 16 game`);
    }
  });

  it('triggers onDifficultyChange callback when clicking difficulty buttons', () => {
    const onDifficultyChange = vi.fn();
    const tree = MenuSolo({ difficulty: 'normal', onDifficultyChange, lastResult: null, onPractice: noop, onBack: noop });
    const difficultyChoice = elements(tree).find((c: any) => c.props?.label === 'Tingkat kesulitan bot');
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
        initialStep: 'solo',
      });
    }
    const initialHtml = renderToStaticMarkup(createElement(StatefulMenu));
    expect(initialHtml).toContain('Tiga bot · Mudah · 16 game');
    expect(initialHtml).toContain(DIFFICULTY_NOTE.easy);
  });
});

describe('MainMenu front screen', () => {
  const front = (extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(MainMenu, { lastResult: null, onPractice: noop, onOnline: noop, ...extra }));

  it('opens on the three choices and none of the single-player options', () => {
    const html = front();
    expect(html).toContain('aria-label="Menu utama"');
    expect(html).toContain('Main sendiri');
    expect(html).toContain('Lawan tiga bot');
    expect(html).toContain('Main bareng teman');
    expect(html).toContain('Room pribadi · undang lewat tautan');
    expect(html).toContain('Premium · segera hadir');
    expect(html).toContain('Mahjong Indonesia · main bareng teman');
    expect(html).not.toContain('Mulai bermain');
    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain('role="dialog"');
  });

  it('hides Main bareng teman without a room server, and keeps the room resume', () => {
    const offline = front({ onOnline: undefined });
    expect(offline).not.toContain('Room pribadi');
    expect(offline).toContain('Main sendiri');
    const resume = front({ resumeRoomCode: 'ABCD', onResumeRoom: noop });
    expect(resume).toContain('Lanjutkan room ABCD');
  });

  it('Main sendiri reveals the options and Kembali returns to the front screen', () => {
    const onSolo = vi.fn();
    buttonWith(MenuFront({ lastResult: null, onSolo, onPremium: noop }), 'Main sendiri').props.onClick();
    expect(onSolo).toHaveBeenCalledOnce();

    const solo = renderToStaticMarkup(createElement(MainMenu, { difficulty: 'normal', onDifficultyChange: noop, lastResult: null, onPractice: noop, initialStep: 'solo', onOnline: noop }));
    expect(solo).toContain('<h2>Main sendiri</h2>');
    expect(solo).toContain('aria-label="Tingkat kesulitan bot"');
    expect(solo).toContain('Mulai bermain');
    expect(solo).toContain('Kembali');
    expect(solo).not.toContain('Premium · segera hadir');

    const onBack = vi.fn();
    buttonWith(MenuSolo({ lastResult: null, onPractice: noop, onBack }), 'Kembali').props.onClick();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('opens the Premium modal from the small Premium choice', () => {
    const onPremium = vi.fn();
    buttonWith(MenuFront({ lastResult: null, onSolo: noop, onPremium }), 'Premium · segera hadir').props.onClick();
    expect(onPremium).toHaveBeenCalledOnce();
    expect(front({ initialPremiumOpen: true })).toContain('maciokYU! Premium');
  });
});

describe('PremiumModal', () => {
  it('announces Premium without payment, prices or sign-up', () => {
    const html = renderToStaticMarkup(createElement(PremiumModal, { onClose: noop }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('maciokYU! Premium');
    expect(html).toContain('Segera hadir');
    expect(html).toContain('Main bareng teman tanpa batas harian. Tanpa Premium, host bisa memulai 3 match online per hari; teman yang join tetap gratis.');
    expect(html).toContain('Fitur lain menyusul.');
    expect(html).toMatch(/<button[^>]*>Oke<\/button>/);
    expect(html).not.toMatch(/<input|<form|Rp|\$|bayar|email/i);
  });

  it('closes from Oke and hands the same close to the shared Modal (Escape, backdrop, X)', () => {
    const onClose = vi.fn();
    const modal: any = PremiumModal({ onClose });
    expect(modal.props.onClose).toBe(onClose);
    buttonWith(modal.props.footer, 'Oke').props.onClick();
    expect(onClose).toHaveBeenCalledOnce();
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
