import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { RemoteTableView } from '@/ui/components/RemoteTableView';
import { RemoteTable } from '@/net/remote-table';
import { TableSession } from '@/session';
import { fakeNetwork, roomInfo } from '../net/fake-transport';
import { DEFAULT_SETTINGS, MemoryStorage } from '@/storage';
import App, { OPTIONS_OPEN_KEY, loadOptionsOpen, saveOptionsOpen, appClass } from '@/App';

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
    expect(appClass('table', false)).toContain('options-hidden');
    expect(appClass('table', true)).not.toContain('options-hidden');
    expect(appClass('menu', false)).not.toContain('options-hidden');
  });



  it('App menu shell does not advertise options-hidden', () => {
    const html = renderToString(createElement(App));
    expect(html).not.toContain('options-hidden');
  });
});


it('keeps online TableInfo visible while collapsed and wires both option buttons', () => {
  const network = fakeNetwork();
  const table = new RemoteTable({ server: 'https://mp.example', code: 'ABC234', name: 'Jason', storage: new MemoryStorage(), socketFactory: network.factory });
  table.connect(); network.last.open();
  const session = new TableSession({ settings: DEFAULT_SETTINGS, seats: { dong: 'human', nan: 'bot', xi: 'bot', bei: 'bot' }, seed: 5, now: () => 1000 });
  network.last.receive({ type: 'welcome', token: 't', seat: 'dong', host: true, serverNow: 1000, room: roomInfo({ phase: 'playing' }) });
  network.last.receive({ type: 'view', view: session.viewFor('dong'), serverNow: 1000 });
  const toggle = vi.fn();
  function buttons(node: ReactNode): ReactElement<any>[] {
    if (Array.isArray(node)) return node.flatMap(buttons);
    if (!node || typeof node !== 'object' || !('props' in node)) return [];
    const e = node as ReactElement<any>;
    return [...(e.type === 'button' ? [e] : []), ...buttons(e.props.children), ...buttons(e.props.progress)];
  }
  try {
    for (const open of [false, true]) {
      let tree: ReactNode;
      function Probe() {
        tree = RemoteTableView({ table, state: table.getState(), optionsOpen: open, onOptionsOpenChange: toggle, onLeave: () => {} });
        return tree;
      }
      const html = renderToString(createElement(Probe));
      expect(html).toContain('table-info');
      expect(html.indexOf('table-info')).toBeLessThan(html.indexOf('id="table-options-panel"'));
      expect(html).toContain(open ? 'class="options-panel is-open"' : 'class="options-panel" hidden=""');
      const label = open ? 'Sembunyikan panel Opsi' : 'Buka panel Opsi';
      const button = buttons(tree!).find(e => e.props['aria-label'] === label)!;
      expect(button.props['aria-expanded']).toBe(open);
      button.props.onClick();
      expect(toggle).toHaveBeenLastCalledWith(!open);
    }
  } finally { table.disconnect(); }
});
