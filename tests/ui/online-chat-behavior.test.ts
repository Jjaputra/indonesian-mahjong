import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { TableSession } from '@/session';
import { DEFAULT_SETTINGS, MemoryStorage } from '@/storage';
import { RemoteTable } from '@/net/remote-table';
import { fakeNetwork, roomInfo } from '../net/fake-transport';

const h = vi.hoisted(() => ({
  slots: [] as unknown[],
  index: 0,
  effects: [] as { fn: () => unknown; deps?: unknown[] }[],
  prevDeps: [] as (unknown[] | undefined)[],
  cleanups: [] as ((() => void) | undefined)[],
  refs: new Map<number, { current: unknown }>(),
}));

vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useState: (initial: unknown) => {
    const i = h.index++;
    if (!(i in h.slots)) h.slots[i] = typeof initial === 'function' ? initial() : initial;
    return [
      h.slots[i],
      (value: unknown) => {
        h.slots[i] = typeof value === 'function' ? (value as (prev: unknown) => unknown)(h.slots[i]) : value;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const i = h.index++;
    if (!h.refs.has(i)) h.refs.set(i, { current: initial });
    return h.refs.get(i)!;
  },
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => unknown, deps?: unknown[]) => {
    const i = h.index++;
    const prev = h.prevDeps[i];
    const changed = !deps || !prev || deps.length !== prev.length || deps.some((d, idx) => !Object.is(d, prev[idx]));
    if (changed) {
      h.prevDeps[i] = deps;
      h.effects.push({ fn, deps });
    }
  },
  useLayoutEffect: () => {},
}));

import { OPTIONS_OPEN_KEY, saveOptionsOpen, useOptionsOpen } from '@/App';
import { CHAT_OPEN_KEY, ChatPanel, PHONE_LANDSCAPE, saveChatOpen } from '@/ui/components/ChatPanel';
import { RemoteTableView } from '@/ui/components/RemoteTableView';

function createTable() {
  const net = fakeNetwork();
  const t = new RemoteTable({ server: 'https://mp.example', code: 'ABC234', name: 'Jason', storage: new MemoryStorage(), socketFactory: net.factory });
  t.connect();
  net.last.open();
  const session = new TableSession({ settings: DEFAULT_SETTINGS, seats: { dong: 'human', nan: 'bot', xi: 'bot', bei: 'bot' }, seed: 5, now: () => 1000 });
  net.last.receive({ type: 'welcome', token: 't', seat: 'dong', host: true, serverNow: 0, room: roomInfo({ phase: 'playing' }) });
  net.last.receive({ type: 'view', view: session.viewFor('dong'), serverNow: 1000 });
  return t;
}

function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  const queries: string[] = [];
  vi.stubGlobal('window', {
    matchMedia: (query: string) => {
      queries.push(query);
      return {
        get matches() { return query === PHONE_LANDSCAPE ? matches : false; },
        addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
        removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn),
      };
    },
  });
  return {
    queries,
    setPhoneLandscape: (next: boolean) => {
      matches = next;
      for (const fn of [...listeners]) fn();
    },
  };
}

function find(node: ReactNode, predicate: (e: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) return node.map((n) => find(n, predicate)).find(Boolean);
  if (!node || typeof node !== 'object' || !('props' in node)) return undefined;
  const e = node as ReactElement<Record<string, unknown>>;
  if (typeof e.type === 'function') {
    return find((e.type as (p: Record<string, unknown>) => ReactNode)(e.props), predicate);
  }
  if (predicate(e)) return e;
  for (const val of Object.values(e.props)) {
    if (val && typeof val === 'object') {
      const hit = find(val as ReactNode, predicate);
      if (hit) return hit;
    }
  }
  return undefined;
}

function renderChat(props: Parameters<typeof ChatPanel>[0]) {
  h.index = 0;
  h.effects = [];
  const tree = ChatPanel(props);
  for (const eff of h.effects) {
    const cleanup = eff.fn();
    if (typeof cleanup === 'function') h.cleanups.push(cleanup as () => void);
  }
  return tree;
}

function renderTable(props: Parameters<typeof RemoteTableView>[0]) {
  h.index = 0;
  h.effects = [];
  return find(createElement(RemoteTableView, props), (e) => typeof e.props.className === 'string' && e.props.className.includes('chat-panel'));
}

function renderOptions(storage: MemoryStorage) {
  h.index = 0;
  h.effects = [];
  const res = useOptionsOpen(storage);
  for (const eff of h.effects) {
    const cleanup = eff.fn();
    if (typeof cleanup === 'function') h.cleanups.push(cleanup as () => void);
  }
  return res;
}

beforeEach(() => {
  h.slots = [];
  h.index = 0;
  h.effects = [];
  h.prevDeps = [];
  h.cleanups = [];
  h.refs.clear();
});

afterEach(() => {
  for (const fn of h.cleanups) fn?.();
  vi.unstubAllGlobals();
});

describe('ChatPanel and RemoteTableView mutual exclusion', () => {
  it('PHONE_LANDSCAPE requires min-width: 500px so narrow portrait keyboards do not match', () => {
    expect(PHONE_LANDSCAPE).toContain('(min-width: 500px)');
    expect(PHONE_LANDSCAPE).toContain('(orientation: landscape) and (max-height: 500px)');
  });

  it('allows both Chat and Opsi open when phone landscape is false, and suppresses Chat when true', () => {
    const t = createTable();
    const storage = new MemoryStorage();
    saveChatOpen(true, storage);

    stubMatchMedia(false);
    const desktopTree = renderChat({ table: t, state: t.getState(), storage, optionsOpen: true });
    expect(find(desktopTree, (e) => e.type === 'input')).toBeDefined();

    h.slots = []; h.prevDeps = []; h.refs.clear();
    stubMatchMedia(true);
    const phoneTree = renderChat({ table: t, state: t.getState(), storage, optionsOpen: true });
    expect(find(phoneTree, (e) => e.type === 'input')).toBeUndefined();
    expect(find(phoneTree, (e) => e.type === 'section')?.props.className).toContain('is-collapsed');
    t.disconnect();
  });

  it('suppresses Opsi without persisting when opening Chat in phone landscape', () => {
    const t = createTable();
    const storage = new MemoryStorage();
    stubMatchMedia(true);
    const onOptionsOpenChange = vi.fn();

    const tree = renderChat({ table: t, state: t.getState(), storage, optionsOpen: true, onOptionsOpenChange });
    const peek = find(tree, (e) => e.type === 'button' && e.props.className === 'chat-peek')!;
    (peek.props.onClick as () => void)();

    expect(onOptionsOpenChange).toHaveBeenCalledWith(false, false);
    expect(storage.getItem(CHAT_OPEN_KEY)).toBe('1');
    t.disconnect();
  });

  it('clears stale openWanted on rotation into landscape with Opsi open without overwriting saved chat preference', () => {
    const t = createTable();
    const storage = new MemoryStorage();
    saveChatOpen(true, storage);
    const mm = stubMatchMedia(false);

    // Portrait/desktop: both open.
    let tree = renderChat({ table: t, state: t.getState(), storage, optionsOpen: true });
    expect(find(tree, (e) => e.type === 'input')).toBeDefined();

    // Rotate into phone landscape with Opsi still open.
    mm.setPhoneLandscape(true);
    tree = renderChat({ table: t, state: t.getState(), storage, optionsOpen: true });
    expect(find(tree, (e) => e.type === 'input')).toBeUndefined();
    expect(storage.getItem(CHAT_OPEN_KEY)).toBe('1');

    // Closing Opsi in landscape must NOT pop chat back open.
    tree = renderChat({ table: t, state: t.getState(), storage, optionsOpen: false });
    expect(find(tree, (e) => e.type === 'input')).toBeUndefined();
    expect(find(tree, (e) => e.type === 'section')?.props.className).toContain('is-collapsed');
    t.disconnect();
  });

  it('keeps the chat panel mounted while focus stays inside panelRef, and clears openWanted only after focus leaves', () => {
    const t = createTable();
    const storage = new MemoryStorage();
    saveChatOpen(true, storage);
    const mm = stubMatchMedia(false);

    let tree = renderChat({ table: t, state: t.getState(), storage, optionsOpen: true });
    const panel = find(tree, (e) => e.type === 'section')!;
    (panel.props.onFocus as () => void)();

    // Re-render with focus active, then switch to phone landscape.
    renderChat({ table: t, state: t.getState(), storage, optionsOpen: true });
    mm.setPhoneLandscape(true);
    tree = renderChat({ table: t, state: t.getState(), storage, optionsOpen: true });
    expect(find(tree, (e) => e.type === 'input')).toBeDefined();

    // Moving focus to another control inside the panel (e.g. emoji button or Send) keeps it mounted and openWanted intact.
    const emojiBtn = {};
    (find(tree, (e) => e.type === 'section')!.props.onBlur as (e: unknown) => void)({
      relatedTarget: emojiBtn,
      currentTarget: { contains: (n: unknown) => n === emojiBtn },
    });
    tree = renderChat({ table: t, state: t.getState(), storage, optionsOpen: true });
    expect(find(tree, (e) => e.type === 'input')).toBeDefined();
    tree = renderChat({ table: t, state: t.getState(), storage, optionsOpen: false });
    expect(find(tree, (e) => e.type === 'input')).toBeDefined();

    // Once focus leaves the panel, phone landscape suppression takes effect and clears openWanted without overwriting storage.
    tree = renderChat({ table: t, state: t.getState(), storage, optionsOpen: true });
    (find(tree, (e) => e.type === 'section')!.props.onBlur as (e: unknown) => void)({
      relatedTarget: null,
      currentTarget: { contains: () => false },
    });
    tree = renderChat({ table: t, state: t.getState(), storage, optionsOpen: true });
    expect(find(tree, (e) => e.type === 'input')).toBeUndefined();
    expect(storage.getItem(CHAT_OPEN_KEY)).toBe('1');
    tree = renderChat({ table: t, state: t.getState(), storage, optionsOpen: false });
    expect(find(tree, (e) => e.type === 'input')).toBeUndefined();
    t.disconnect();
  });

  it('restores chat from storage without writing to it when leaving phone landscape', () => {
    const t = createTable();
    const storage = new MemoryStorage();
    saveChatOpen(true, storage);
    const setItem = vi.spyOn(storage, 'setItem');
    const mm = stubMatchMedia(false);

    let tree = renderChat({ table: t, state: t.getState(), storage, optionsOpen: true });
    expect(find(tree, (e) => e.type === 'input')).toBeDefined();

    mm.setPhoneLandscape(true);
    tree = renderChat({ table: t, state: t.getState(), storage, optionsOpen: true });
    expect(find(tree, (e) => e.type === 'input')).toBeUndefined();

    // Rotating back restores chat from storage without calling setItem.
    mm.setPhoneLandscape(false);
    renderChat({ table: t, state: t.getState(), storage, optionsOpen: true });
    tree = renderChat({ table: t, state: t.getState(), storage, optionsOpen: true });
    expect(find(tree, (e) => e.type === 'input')).toBeDefined();
    expect(setItem).not.toHaveBeenCalled();
    t.disconnect();
  });

  it('restores Opsi from storage without writing to it when leaving phone landscape', () => {
    const storage = new MemoryStorage();
    saveOptionsOpen(true, storage);
    const setItem = vi.spyOn(storage, 'setItem');
    const mm = stubMatchMedia(false);

    let [open, change] = renderOptions(storage);
    expect(open).toBe(true);

    // Suppress Opsi in phone landscape without persisting.
    mm.setPhoneLandscape(true);
    [, change] = renderOptions(storage);
    change(false, false);
    [open] = renderOptions(storage);
    expect(open).toBe(false);
    expect(storage.getItem(OPTIONS_OPEN_KEY)).toBe('1');

    // Leaving phone landscape restores Opsi from storage without calling setItem.
    mm.setPhoneLandscape(false);
    renderOptions(storage);
    [open] = renderOptions(storage);
    expect(open).toBe(true);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('RemoteTableView enforces mutual exclusion via matchMedia', () => {
    const t = createTable();
    const store = new MemoryStorage();
    saveChatOpen(true, store);
    vi.stubGlobal('localStorage', store);

    stubMatchMedia(false);
    const desktopChat = renderTable({ table: t, state: t.getState(), optionsOpen: true, onOptionsOpenChange: () => {}, onLeave: () => {} });
    expect(desktopChat?.props.className).toContain('is-open');

    h.slots = []; h.prevDeps = []; h.refs.clear();
    stubMatchMedia(true);
    // RemoteTableView passes ChatPanel without explicit storage, so ChatPanel reads global localStorage.
    const phoneChat = renderTable({ table: t, state: t.getState(), optionsOpen: true, onOptionsOpenChange: () => {}, onLeave: () => {} });
    expect(phoneChat?.props.className).toContain('is-collapsed');
    t.disconnect();
  });
});
