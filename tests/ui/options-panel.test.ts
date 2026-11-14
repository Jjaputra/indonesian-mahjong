import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryStorage, getPreset } from '@/storage';
import App, { OPTIONS_OPEN_KEY, loadOptionsOpen, saveOptionsOpen, tableViewAppClass } from '@/App';
import { PlayProgress } from '@/ui/components/PlayProgress';
import { GameController } from '@/ui/game-controller';

const noop = () => undefined;

function startedController(): GameController {
  const c = new GameController({ settings: { ...getPreset('tournament'), soundEnabled: false }, seed: 3, saveHistory: false });
  c.startMatch('stay', null, 'none');
  return c;
}

describe('options panel', () => {
  it('defaults open, persists under itm.options-open.v1, and ignores junk', () => {
    const store = new MemoryStorage();
    expect(loadOptionsOpen(store)).toBe(true);
    saveOptionsOpen(false, store);
    expect(store.getItem(OPTIONS_OPEN_KEY)).toBe('0');
    expect(loadOptionsOpen(store)).toBe(false);
    saveOptionsOpen(true, store);
    expect(loadOptionsOpen(store)).toBe(true);
    store.setItem(OPTIONS_OPEN_KEY, 'maybe');
    expect(loadOptionsOpen(store)).toBe(true);
  });

  it('starts closed on narrow viewports when nothing is stored', () => {
    const store = new MemoryStorage();
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        matches: query.includes('640px'),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    try {
      expect(loadOptionsOpen(store)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('adds options-hidden on the table shell when the panel is closed', () => {
    expect(tableViewAppClass('table', 'flat', false)).toContain('options-hidden');
    expect(tableViewAppClass('table', 'flat', true)).not.toContain('options-hidden');
    expect(tableViewAppClass('menu', 'flat', false)).not.toContain('options-hidden');
  });

  it('keeps TableInfo visible while collapsed and exposes toggle buttons', () => {
    const controller = startedController();
    const closed = renderToString(createElement(PlayProgress, {
      controller, paused: false, blocked: false, pace: 'learn', onPaceChange: noop, onToggleMotion: noop,
      onPause: noop, onStep: noop, optionsOpen: false, onOptionsOpenChange: noop,
    }));
    expect(closed).toContain('Angin meja');
    expect(closed).toContain('aria-label="Buka panel OPTION"');
    expect(closed).toMatch(/aria-expanded="false"/);
    expect(closed).toMatch(/id="table-options-panel"[^>]*hidden/);

    const open = renderToString(createElement(PlayProgress, {
      controller, paused: false, blocked: false, pace: 'learn', onPaceChange: noop, onToggleMotion: noop,
      onPause: noop, onStep: noop, optionsOpen: true, onOptionsOpenChange: noop,
    }));
    expect(open).toContain('Tabel Total Poin');
    expect(open).toContain('Tempo &amp; aktivitas');
    expect(open).toMatch(/aria-expanded="true"/);
    expect(open).not.toContain('hidden=""');
  });

  it('App menu shell does not advertise options-hidden', () => {
    const html = renderToString(createElement(App));
    expect(html).not.toContain('options-hidden');
  });
});