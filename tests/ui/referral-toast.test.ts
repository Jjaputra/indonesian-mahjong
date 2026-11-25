import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RemoteState, RemoteTable } from '../../src/net/remote-table';
import { roomInfo } from '../net/fake-transport';

const state = vi.hoisted(() => ({ slots: [] as unknown[], index: 0,
  account: { id: 'host', premium: false, referralCode: 'ABC234', remainingMatches: 0, bonusMatches: 0 },
  share: vi.fn<() => Promise<boolean>>() }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useEffect: () => {},
  useState: (initial: unknown) => {
    const i = state.index++;
    if (!(i in state.slots)) state.slots[i] = initial;
    return [state.slots[i], (value: unknown) => { state.slots[i] = value; }];
  },
}));
vi.mock('../../src/net/auth', async original => ({ ...await original<typeof import('../../src/net/auth')>(), useAccount: () => state.account, shareReferral: state.share }));
vi.mock('../../src/net/daily-limit', async original => ({ ...await original<typeof import('../../src/net/daily-limit')>(), useDailyRemaining: () => state.account.remainingMatches }));
import { RoomLobby } from '../../src/ui/components/RoomLobby';
import { FinishedMatchActions } from '../../src/ui/components/RemoteTableView';
import { ReferralShare, SHARE_THANKS } from '../../src/ui/components/ReferralShare';

function find(node: ReactNode, type: unknown): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) return node.map(n => find(n, type)).find(Boolean);
  if (!node || typeof node !== 'object' || !('props' in node)) return;
  const e = node as ReactElement<Record<string, unknown>>;
  return e.type === type ? e : find(e.props.children as ReactNode, type);
}
const noop = () => {};
beforeEach(() => {
  state.slots = []; state.index = 0; state.account.remainingMatches = 0; state.account.bonusMatches = 0;
  state.share.mockReset();
  vi.stubGlobal('window', { location: new URL('https://maciokyu.com/') });
});
afterEach(() => vi.unstubAllGlobals());

it.each(['lobby', 'finished'] as const)('keeps the granted-share message after the %s share button unmounts', async mode => {
  const onToast = vi.fn();
  const parentSlots: unknown[] = [];
  const renderParent = () => {
    state.slots = parentSlots; state.index = 0;
    return mode === 'lobby'
      ? RoomLobby({ room: roomInfo(), seat: 'dong', isHost: true, onToast, onSit: noop, onStand: noop, onStart: noop, onConfig: noop, onLeave: noop })
      : FinishedMatchActions({ table: { rematch: noop } as unknown as RemoteTable, state: { host: true, seat: 'dong' } as RemoteState, onLeave: noop });
  };
  const share = find(renderParent(), ReferralShare)!;
  expect(share).toBeDefined();
  let unmounted = false;
  state.share.mockImplementation(async () => {
    // refreshAccount publishes the new balance before shareReferral resolves.
    state.account.remainingMatches = 1;
    unmounted = !find(renderParent(), ReferralShare);
    return true;
  });
  state.slots = []; state.index = 0;
  const child = ReferralShare(share.props as Parameters<typeof ReferralShare>[0]);
  (find(child, 'button')!.props.onClick as () => void)();
  await vi.waitFor(() => {
    expect(unmounted).toBe(true);
    if (mode === 'lobby') expect(onToast).toHaveBeenCalledWith(SHARE_THANKS);
    else expect(renderToStaticMarkup(renderParent())).toContain(SHARE_THANKS);
  });
});

it.each(['lobby', 'finished'] as const)('shows today and the bank separately in the %s allowance', mode => {
  state.account.remainingMatches = 5; state.account.bonusMatches = 2;
  const node = mode === 'lobby'
    ? RoomLobby({ room: roomInfo(), seat: 'dong', isHost: true, onToast: noop, onSit: noop, onStand: noop, onStart: noop, onConfig: noop, onLeave: noop })
    : FinishedMatchActions({ table: {} as RemoteTable, state: { host: true, seat: 'dong' } as RemoteState, onLeave: noop });
  const html = renderToStaticMarkup(node);
  expect(html).toContain('Jatah host hari ini: sisa 3 +2 tabungan');
  expect(html).not.toContain('dari 3');
});
