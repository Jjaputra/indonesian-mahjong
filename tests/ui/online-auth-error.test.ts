import { afterEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OnlineScreen } from '../../src/ui/components/OnlineScreen';

const { effects, updates } = vi.hoisted(() => ({ effects: [] as (() => unknown)[], updates: [] as unknown[] }));
vi.mock('react', async importOriginal => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    useEffect: (effect: () => unknown) => { effects.push(effect); },
    useState: (initial: unknown) => {
      const [value] = react.useState(initial);
      return [value, (next: unknown) => { updates.push(next); }];
    },
  };
});
afterEach(() => { vi.unstubAllGlobals(); effects.length = 0; updates.length = 0; });

it('reports an Indonesian error when online auth initialization fails', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));
  const noop = () => {};
  renderToStaticMarkup(createElement(OnlineScreen, {
    server: 'http://localhost:8787', inviteCode: null, resume: false,
    optionsOpen: false, onTableChange: noop, onOptionsOpenChange: noop, onExit: noop,
  }));
  // Run the initialization effect, with state writes captured so no browser DOM is required.
  effects[0]!();
  await vi.waitFor(() => expect(updates).toContain('Gagal masuk. Coba lagi.'));
});
