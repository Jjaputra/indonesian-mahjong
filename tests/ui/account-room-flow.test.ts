import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';

const h = vi.hoisted(() => ({
  slots: [] as unknown[], index: 0, effects: [] as (() => unknown)[],
  account: null as null | { id: string; name: string; currentRoom: { code: string } | null },
  tables: [] as { code: string; options: { switchRoom?: boolean }; state: Record<string, unknown>; leave: ReturnType<typeof vi.fn> }[],
  openAuth: vi.fn(), leaveRoom: vi.fn(), createRoom: vi.fn(),
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const i = h.index++;
    if (!(i in h.slots)) h.slots[i] = typeof initial === 'function' ? initial() : initial;
    return [h.slots[i], (value: unknown) => { h.slots[i] = value; }];
  },
  useRef: (initial: unknown) => { const i = h.index++; return h.slots[i] ??= { current: initial }; },
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => unknown) => { h.effects.push(fn); },
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}));
vi.mock('../../src/net/auth', () => ({
  useAccount: () => h.account, openAuth: h.openAuth, onlineLoginRequired: () => true,
  refreshAccount: async () => {}, leaveCurrentRoom: h.leaveRoom,
  authStore: { get: () => h.account },
}));
vi.mock('../../src/net/remote-table', () => ({
  createRoom: h.createRoom,
  RemoteTable: class {
    code: string; state = { joined: false, seat: null, ended: null }; leave = vi.fn();
    constructor(readonly options: { code: string; switchRoom?: boolean }) { this.code = options.code; h.tables.push(this); }
    connect() {} disconnect() {} subscribe = () => () => {}; getState = () => this.state;
  },
}));
import { OnlineScreen } from '../../src/ui/components/OnlineScreen';

const noop = () => {};
function render(inviteCode: string | null = 'GHJKLM') {
  h.index = 0; h.effects = [];
  return OnlineScreen({ server: 'https://mp.example', inviteCode, resume: false, onTableChange: noop, optionsOpen: false, onOptionsOpenChange: noop, onExit: noop });
}
async function effects() { for (const fn of h.effects) fn(); for (let i = 0; i < 6; i++) await Promise.resolve(); }
function find(node: ReactNode, predicate: (e: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) return node.map(n => find(n, predicate)).find(Boolean);
  if (!node || typeof node !== 'object' || !('props' in node)) return;
  const e = node as ReactElement<Record<string, unknown>>;
  return predicate(e) ? e : find(e.props.children as ReactNode, predicate);
}
beforeEach(() => { h.slots = []; h.tables = []; h.account = null; h.openAuth.mockReset().mockResolvedValue(undefined); h.leaveRoom.mockReset().mockResolvedValue(undefined); });
afterEach(() => vi.clearAllMocks());

it('autojoins the retained invite after failed auth startup followed by Google sign-in', async () => {
  h.openAuth.mockRejectedValue(new Error('offline'));
  render(); await effects(); expect(h.tables).toHaveLength(0);
  h.account = { id: 'u', name: 'Jason', currentRoom: null };
  render(); await effects(); expect(h.tables[0]?.code).toBe('GHJKLM');
});

it.each([
  { joined: false, seat: null, ended: null },
  { joined: true, seat: null, ended: null },
  { joined: true, seat: 'dong', ended: 'replaced' },
  { joined: true, seat: 'dong', ended: null },
])('only calls account leave for an active seated exit: %j', async state => {
  h.account = { id: 'u', name: 'Jason', currentRoom: null };
  render(); await effects(); render(); await effects();
  Object.assign(h.tables[0]!.state, state);
  const element = find(render(), e => !!e.props.table && typeof e.props.onLeave === 'function')!;
  (element.props.onLeave as () => void)();
  if (state.joined && state.seat && !state.ended) expect(h.leaveRoom).toHaveBeenCalledWith('GHJKLM');
  else expect(h.leaveRoom).not.toHaveBeenCalled();
});

it('offers continue A or confirmed join B before opening another room', async () => {
  h.account = { id: 'u', name: 'Jason', currentRoom: { code: 'ABCDEF' } };
  render(); await effects(); render(); await effects();
  expect(h.tables).toHaveLength(0);
  const dialog = find(render(), e => e.props.role === 'dialog')!;
  expect(dialog).toBeDefined();
  const button = find(dialog, e => e.type === 'button' && (e.props.children as unknown[])?.[0] === 'Gabung ')!;
  (button.props.onClick as () => void)();
  expect(h.tables[0]?.code).toBe('GHJKLM');
  expect(h.tables[0]?.options.switchRoom).toBe(true);
});


it('keeps the old room when Buat room baru fails', async () => {
  h.account = { id: 'u', name: 'Jason', currentRoom: { code: 'ABCDEF' } };
  h.createRoom.mockRejectedValueOnce(new Error('Server sibuk. Coba lagi.'));
  const menu = find(render(null), e => typeof e.props.onCreate === 'function')!;
  await (menu.props.onCreate as (config: object, name: string) => Promise<void>)({}, 'Jason');
  const dialog = find(render(null), e => e.props.role === 'dialog')!;
  const button = find(dialog, e => e.type === 'button' && e.props.children === 'Buat room baru')!;
  (button.props.onClick as () => void)();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(h.createRoom).toHaveBeenCalledWith('https://mp.example', undefined, true);
  expect(h.leaveRoom).not.toHaveBeenCalled(); expect(h.tables).toHaveLength(0);
  expect(h.account.currentRoom?.code).toBe('ABCDEF');
  const result = render(null);
  expect(find(result, e => typeof e.props.onCreate === 'function')!.props.error).toBe('Server sibuk. Coba lagi.');
});

it('opens the new room after Buat room baru succeeds instead of offering the old one', async () => {
  h.account = { id: 'u', name: 'Jason', currentRoom: { code: 'ABCDEF' } };
  h.createRoom.mockResolvedValueOnce('NPQRST');
  const menu = find(render(null), e => typeof e.props.onCreate === 'function')!;
  await (menu.props.onCreate as (config: object, name: string) => Promise<void>)({}, 'Jason');
  const dialog = find(render(null), e => e.props.role === 'dialog')!;
  (find(dialog, e => e.type === 'button' && e.props.children === 'Buat room baru')!.props.onClick as () => void)();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(h.tables.map(t => t.code)).toEqual(['NPQRST']);
  expect(h.tables[0]!.options.switchRoom).toBe(true);
  expect(find(render(null), e => e.props.role === 'dialog')).toBeUndefined();
});

it('stops the socket before account leave and shows the menu immediately for a completed match', async () => {
  h.account = { id: 'u', name: 'Jason', currentRoom: null };
  render(); await effects(); render(); await effects();
  Object.assign(h.tables[0]!.state, { joined: true, seat: 'dong', ended: null, view: { matchOver: true } });
  let complete!: () => void;
  h.leaveRoom.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
  const element = find(render(), e => !!e.props.table && typeof e.props.onLeave === 'function')!;
  const leaving = (element.props.onLeave as () => Promise<void>)();
  expect(h.tables[0]!.leave).toHaveBeenCalledOnce();
  expect(h.tables[0]!.leave.mock.invocationCallOrder[0]).toBeLessThan(h.leaveRoom.mock.invocationCallOrder[0]!);
  expect(find(render(), e => !!e.props.table)).toBeUndefined();
  complete(); await leaving;
  expect(h.tables[0]!.leave).toHaveBeenCalledOnce();
  expect(find(render(), e => !!e.props.table)).toBeUndefined();
});

it('still returns to the menu if account leave fails', async () => {
  h.account = { id: 'u', name: 'Jason', currentRoom: null };
  render(); await effects(); render(); await effects();
  Object.assign(h.tables[0]!.state, { joined: true, seat: 'dong', ended: null, view: { matchOver: true } });
  h.leaveRoom.mockRejectedValueOnce(new Error('offline'));
  const element = find(render(), e => !!e.props.table && typeof e.props.onLeave === 'function')!;
  await (element.props.onLeave as () => Promise<void>)();
  expect(h.tables[0]!.leave).toHaveBeenCalledOnce();
  expect(find(render(), e => !!e.props.table)).toBeUndefined();
});
