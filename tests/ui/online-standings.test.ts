import { beforeEach, expect, it, vi } from 'vitest';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableSession } from '../../src/session';
import { DEFAULT_SETTINGS } from '../../src/storage';
import { createMatch, recordHand } from '../../src/ui/match';
import type { RemoteState, RemoteTable } from '../../src/net/remote-table';
import { roomInfo } from '../net/fake-transport';

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, effects: [] as (() => void)[] }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useMemo: (fn: () => unknown) => fn(),
  useState: (initial: unknown) => {
    const i = hooks.index++;
    if (!(i in hooks.slots)) hooks.slots[i] = typeof initial === 'function' ? initial() : initial;
    return [hooks.slots[i], (value: unknown) => { hooks.slots[i] = value; }];
  },
  useRef: (initial: unknown) => { const i = hooks.index++; return hooks.slots[i] ??= { current: initial }; },
  useEffect: (fn: () => void, deps: unknown[]) => {
    const i = hooks.index++, old = hooks.slots[i] as unknown[] | undefined;
    if (!old || deps.some((d, n) => d !== old[n])) { hooks.effects.push(fn); hooks.slots[i] = deps; }
  },
}));
import { HandResult, OnlineStandings, RemoteTableView } from '../../src/ui/components/RemoteTableView';

function fixture() {
  const session = new TableSession({ settings: DEFAULT_SETTINGS, seats: { dong: 'human', nan: 'bot', xi: 'bot', bei: 'bot' }, seed: 5, now: () => 1000 });
  let match = createMatch();
  for (let i = 0; i < 16; i++) match = recordHand(match, i < 10 ? 'nan' : 'dong', true, 6, 1000 + i, { winMethod: 'tsumo' });
  const state = { view: { ...session.viewFor('dong'), match }, room: roomInfo({ seats: roomInfo().seats.map((s, i) => ({ ...s, bot: false, name: ['Jason', 'Disa', 'Liong', 'Ce Mo'][i]! })) }),
    seat: 'dong', host: false, log: [], joined: true, ended: null } as unknown as RemoteState;
  const table = { getState: () => state, serverNow: () => 1000, now: () => 1000, rematch: vi.fn() } as unknown as RemoteTable;
  return { state, table };
}
function find(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) return node.map(n => find(n, type)).find(Boolean);
  if (!node || typeof node !== 'object' || !('props' in node)) return;
  const e = node as ReactElement<Record<string, unknown>>;
  return e.type === type ? e : find(e.props.children as ReactNode, type);
}
const noop = () => {};
function render(f: ReturnType<typeof fixture>) {
  hooks.index = 0; hooks.effects = [];
  const node = RemoteTableView({ ...f, optionsOpen: false, onOptionsOpenChange: noop, onLeave: noop });
  for (const effect of hooks.effects) effect();
  return node;
}
beforeEach(() => { hooks.slots = []; hooks.index = 0; hooks.effects = []; });
it('keeps a departed champion name in standings and last hand with bot control', () => {
  const f = fixture(); Object.assign(f.state.view!, { matchOver: true, phase: 'DRAW_SERI' });
  f.state.view!.lastHandResult = f.state.view!.match.hands.at(-1)!;
  Object.assign(f.state.room!.seats[1]!, { bot: true, connected: false });
  const html = renderToStaticMarkup(createElement(OnlineStandings, { ...f, onClose: noop, onLeave: noop, onLastHand: noop }));
  expect(html).toContain('Pemenang meja: Disa');
  const last = renderToStaticMarkup(createElement(HandResult, { ...f, onClose: noop, onLeave: noop, onStandings: noop }));
  expect(last).toContain('Disa'); expect(last).not.toContain('Bot 2');
});

it('reviews the last hand first, then opens standings once and allows viewing the table and last hand', () => {
  const f = fixture(); render(f);
  Object.assign(f.state.view!, { matchOver: true, phase: 'DRAW_SERI' });
  render(f);
  const hand = find(render(f), HandResult)!;
  expect(hand).toBeDefined(); expect(find(render(f), OnlineStandings)).toBeUndefined();
  (hand.props.onStandings as () => void)();
  const final = find(render(f), OnlineStandings)!;
  expect(final).toBeDefined();
  (final.props.onLastHand as () => void)();
  expect(find(render(f), HandResult)).toBeDefined();
  (find(render(f), HandResult)!.props.onClose as () => void)();
  expect(find(render(f), OnlineStandings)).toBeUndefined();
  expect(find(render(f), HandResult)).toBeUndefined();
  (final.props.onLastHand as () => void)();
  (find(render(f), HandResult)!.props.onStandings as () => void)();
  (find(render(f), OnlineStandings)!.props.onClose as () => void)();
  expect(find(render(f), OnlineStandings)).toBeUndefined();
  expect(find(render(f), HandResult)).toBeUndefined();
  // A later broadcast of the same finished hand must not reopen either modal.
  f.state.view = { ...f.state.view! };
  expect(find(render(f), OnlineStandings)).toBeUndefined();
});

it('rejoining a finished match opens standings directly and rematch clears them', () => {
  const f = fixture(); Object.assign(f.state.view!, { matchOver: true, phase: 'DRAW_SERI' });
  expect(find(render(f), OnlineStandings)).toBeDefined();
  expect(find(render(f), HandResult)).toBeUndefined();
  Object.assign(f.state.view!, { matchOver: false, phase: 'AWAIT_DRAW', match: createMatch() });
  render(f);
  expect(find(render(f), OnlineStandings)).toBeUndefined();
  expect(find(render(f), HandResult)).toBeUndefined();
});

it('uses online names, correct ranking and zero sum, a crown, own highlight and online footer', () => {
  const f = fixture(); Object.assign(f.state.view!, { matchOver: true, phase: 'DRAW_SERI' });
  const html = renderToStaticMarkup(createElement(OnlineStandings, { ...f, onClose: noop, onLeave: noop, onLastHand: noop }));
  expect(html).toContain('Pemenang meja: Disa');
  expect(html).toMatch(/<td class="rank">1<\/td><th scope="row">Disa/);
  expect(html).toContain('aria-label="Juara"'); expect(html).toContain('is-human');
  expect(html).toContain('Σ 0 · kit-kit ✓'); expect(html).toContain('Nunggu host mulai lagi');
  expect(html).toContain('+288'); expect(html).toContain('+96'); expect(html).toContain('−192');
  expect(html).toContain('Keluar room'); expect(html).toContain('Lihat meja'); expect(html).toContain('Lihat hasil game terakhir');
  const last = renderToStaticMarkup(createElement(HandResult, { ...f, onClose: noop, onLeave: noop, onStandings: noop }));
  expect(last).toContain('Lihat klasemen akhir');
});
