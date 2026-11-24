import { createElement as h, Fragment, useEffect, useState } from 'react';
import { SEAT_ORDER, parseTileHand } from '../core/tiles';
import { TableSession } from '../session';
import { DEFAULT_SETTINGS, MemoryStorage, saveGameRecord, loadGameHistory } from '../storage';
import { DEFAULT_ROOM_CONFIG } from '../net/protocol';
import type { RemoteState, RemoteTable } from '../net/remote-table';
import { openAuth } from '../net/auth';
import { RemoteTableView } from './components/RemoteTableView';
import { RoomLobby } from './components/RoomLobby';
import { AccountPanel } from './components/OnlineScreen';
import { PublicTables } from './components/PublicTables';
import { OnlineMenu } from './components/OnlineMenu';
import { MainMenu } from './components/MainMenu';
import { SettingsModal } from './components/SettingsModal';
import { HistoryModal } from './components/HistoryModal';
import { PremiumModal } from './components/PremiumModal';
import { AdminPage } from './components/AdminPage';
import { CHAT_OPEN_KEY } from './components/ChatPanel';
import { recordHand } from './match';
import { kongPayment } from '../core/round-score';
import { KongToast } from './components/CallToast';

export const ONLINE_AUDIT_STATES = ['early', 'mid', 'late', 'melds-0', 'melds-2', 'melds-4', 'flowers', 'spectator', 'pung', 'claims', 'kong', 'warning', 'turn', 'hu', 'seri', 'final', ...[0, 50].flatMap(n => ['open', 'closed'].flatMap(c => ['open', 'closed'].map(o => `chat-${n}-${c}-options-${o}`))), 'public-list', 'public-list-empty', 'lobby', 'menu', 'create', 'join', 'settings', 'history', 'premium', 'admin', 'admin-users', 'admin-settings', 'admin-audit'] as const;
const noop = () => {};
const base = 'http://localhost/__layout_fixture__';

/** Only imported by the DEV lazy entry. No socket or remote account. */
export async function prepareOnlineAudit() {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith(base)) return original(input, init);
    const path = url.slice(base.length);
    const account = { id: 'layout-audit', name: 'ABCDEFGHIJKL', picture: null, premium: false, remainingMatches: 2, admin: true, newsOptIn: true };
    let value: unknown = { dailyMatchLimit: 3, loginRequired: true, discardRevealMs: 1000, facebookEnabled: false, announcement: '' };
    if (path === '/me') value = account;
    if (path.startsWith('/admin/stats')) value = { users: { total: 1234, newToday: 12, new7d: 72, active7d: 301, premium: 24, newsOptIn: 301 }, matches: { today: 45, last7d: 324 }, daily: Array.from({ length: 30 }, (_, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, newUsers: i % 9, matches: i % 12, activeUsers: i + 10 })) };
    if (path.startsWith('/admin/audit')) value = { entries: Array.from({ length: 50 }, (_, i) => ({ at: 1795305600000 + i, by: account, kind: 'setting', key: 'dailyMatchLimit', value: 3 })) };
    if (path.startsWith('/admin/users')) value = { total: 50, page: 1, size: 50, users: Array.from({ length: 50 }, (_, i) => ({ ...account, id: String(i), email: 'long-address@example.com', createdAt: 1795305600000, lastSeenAt: 1795305600000, matchesHosted: 123, matchesToday: 2, currentRoom: 'ABC234' })) };
    return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
  };
  await openAuth(base);
}

export function onlineAuditFixture(mode: string): { state: RemoteState; table: RemoteTable } {
  const session = new TableSession({ settings: { ...DEFAULT_SETTINGS, kimEnabled: true, kimMode: 'dedicated' }, seats: { dong: 'human', nan: 'human', xi: 'human', bei: 'human' }, seed: 7, now: () => 1000 });
  const view = session.viewFor('dong');
  view.hand = parseTileHand('1T 1T 1T 5S 5S 5S 9B 9B KIM 3T 3T 3T 7S 7S');
  view.phase = 'ACTION_DECISION'; view.currentTurn = 'dong'; view.drawnTileId = view.hand.at(-1)!.id;
  Object.assign(view.legal!, { canDiscard: true, discardableTileIds: view.hand.map(t => t.id), canDraw: false });
  const count = mode === 'early' ? 4 : mode === 'late' ? 84 : 40;
  view.wallCount = 100 - count;
  if (mode === 'flowers') view.liveKong = [kongPayment('nan', parseTileHand('DZ')[0]!, true)];
  view.discardTrail = Array.from({ length: count }, (_, i) => ({ seat: SEAT_ORDER[i % 4]!, tile: { ...parseTileHand(`${i % 9 + 1}T`)[0]!, id: `audit-discard-${i}` } }));
  for (const seat of SEAT_ORDER) {
    const p = view.players[seat]; p.discards = view.discardTrail.filter(d => d.seat === seat).map(d => d.tile);
    const n = mode === 'melds-4' ? 4 : mode === 'melds-2' ? 2 : 0;
    p.melds = Array.from({ length: n }, (_, i) => ({ type: i === 0 ? 'kong' : 'pung', tiles: parseTileHand(i === 0 ? 'WN WN WN WN' : '5T 5T 5T'), claimedFrom: 'nan' }));
    p.flowers = mode === 'flowers' || n > 0 ? parseTileHand('F1 F2 F3 F4 M1 M2 M3 M4') : [];
    p.concealedCount = 13 - n * 3;
    if (seat === 'dong' && n) view.hand = view.hand.slice(0, 14 - n * 3);
  }
  const claim = ['pung', 'claims', 'kong', 'warning'].includes(mode);
  if (claim) {
    view.phase = 'CLAIM_WINDOW'; view.pendingDiscard = { tile: parseTileHand('7B')[0]!, discarder: 'bei' };
    Object.assign(view.legal!, { canDiscard: false, canPass: true, canPung: mode !== 'kong', canKong: mode === 'kong', canDiscardWinHu: mode === 'claims' || mode === 'warning', canJia: mode === 'claims' || mode === 'warning', jiaOptions: [parseTileHand('8B 9B'), parseTileHand('5B 6B')] });
  }
  view.deadline = Date.now() + (mode === 'warning' ? 4500 : 14000);
  view.pendingDecisions = [{ seat: 'dong', kind: claim ? 'claim' : 'turn', deadline: view.deadline }];
  const finished = ['hu', 'seri', 'final'].includes(mode);
  if (finished) {
    view.phase = mode === 'seri' ? 'DRAW_SERI' : 'RESOLVED_HU';
    view.match = recordHand(view.match, mode === 'seri' ? null : 'dong', mode !== 'seri', 16);
    if (mode === 'final') for (let i = 1; i < 16; i++) view.match = recordHand(view.match, SEAT_ORDER[i % 4]!, true, 8);
    view.matchOver = mode === 'final';
    view.lastHandResult = view.match.hands.at(-1)!;
    view.lastHand = { winner: mode === 'seri' ? null : 'dong', winMethod: mode === 'seri' ? 'draw' : 'tsumo', discarder: null, hand: view.hand, melds: [], flowers: parseTileHand('F1 F2 F3 F4'), breakdown: Array.from({ length: 30 }, (_, i) => ({ pattern: `Receipt row ${i + 1} — long audit description`, tay: i % 4 })), payments: view.lastHandResult };
    if (mode !== 'seri') {
      const data = session.serialize();
      Object.assign(data.state, { phase: 'ACTION_DECISION', currentTurn: 'dong', selfDrawSeat: 'dong' });
      data.state.players.dong.hand = view.hand;
      data.state.players.dong.melds = [];
      const winning = TableSession.deserialize(data, () => 1000);
      winning.apply('dong', { type: 'selfHu', version: winning.version });
      const scoring = winning.viewFor('dong').lastHand?.scoring;
      if (!scoring) throw new Error('Online audit Hu fixture did not score');
      scoring.patterns = Array.from({ length: 30 }, (_, i) => ({ id: 1, name: `Receipt row ${i + 1}`, description: 'Long audit receipt description for scrolling and footer checks', tay: i % 4 }));
      view.lastHand.scoring = scoring;
    }
  }
  const state: RemoteState = { status: 'open', room: { code: 'ABC234', config: DEFAULT_ROOM_CONFIG, phase: finished ? 'finished' : 'playing', spectators: 12, seats: SEAT_ORDER.map(seat => ({ seat, name: 'ABCDEFGHIJKL', bot: false, connected: true, host: seat === 'dong', ready: false })), continueAt: 121000 }, seat: mode === 'spectator' ? null : 'dong', host: true, view, log: [], chat: mode.includes('50') ? Array.from({ length: 50 }, (_, i) => ({ id: i, at: 1000, seat: i % 2 ? 'nan' : null, name: 'ABCDEFGHIJKL', text: 'Pesan panjang untuk mengukur panel chat dan nama pemain. '.repeat(3) })) : [], error: null, handEndedAt: finished ? 1000 : null, ended: null, joined: true };
  const table = { getState: () => state, now: () => 1000, serverNow: () => 1000, deadlineLocal: () => Date.now() + (mode === 'warning' ? 4000 : 14000), subscribeActions: () => noop, subscribe: () => noop, act: () => true, playerName: 'ABCDEFGHIJKL', dailyLimitStorage: undefined, chat: () => true, ready: noop, rematch: noop, replaceBot: noop } as unknown as RemoteTable;
  return { state, table };
}

export function OnlineAuditPreview({ search }: { search: string }) {
  const mode = new URLSearchParams(search).get('state') ?? 'early';
  const fixtureChatOpen = mode.includes('-open-options-') ? '1' : '0';
  const [{ state, table, previousChatOpen }] = useState(() => {
    const previousChatOpen = typeof localStorage !== 'undefined' ? localStorage.getItem(CHAT_OPEN_KEY) : null;
    if (typeof localStorage !== 'undefined') localStorage.setItem(CHAT_OPEN_KEY, fixtureChatOpen);
    return { ...onlineAuditFixture(mode), previousChatOpen };
  });
  // Keep the fixture preference while the preview lives (a viewport change re-reads it); restore the browser's own on leave.
  // Setup writes it again, since StrictMode runs the cleanup once right after mounting.
  useEffect(() => {
    localStorage.setItem(CHAT_OPEN_KEY, fixtureChatOpen);
    const restore = () => {
      if (previousChatOpen === null) localStorage.removeItem(CHAT_OPEN_KEY);
      else localStorage.setItem(CHAT_OPEN_KEY, previousChatOpen);
    };
    window.addEventListener('pagehide', restore);
    return () => { window.removeEventListener('pagehide', restore); restore(); };
  }, [previousChatOpen, fixtureChatOpen]);
  useEffect(() => {
    if (mode === 'turn') document.querySelector<HTMLButtonElement>('.hand-row button')?.click();
  }, [mode]);
  const [optionsOpen, setOptionsOpen] = useState(mode.endsWith('options-open'));
  const [history] = useState(() => {
    const storage = new MemoryStorage();
    for (let i = 0; i < 40; i++) saveGameRecord({ id: `layout-history-${i}`, timestamp: 1795305600000 + i * 60000, winner: 'dong', winningHand: state.view!.hand, winningTile: state.view!.hand.at(-1)!, melds: [], flowers: [], scoringBreakdown: [{ id: 1, name: 'Audit receipt', tay: 16 }], totalTay: 16, isWithKim: true, winMethod: 'tsumo', durationSeconds: 312, online: true, roomCode: 'ABC234', names: { dong: 'ABCDEFGHIJKL', nan: 'ABCDEFGHIJKL', xi: 'ABCDEFGHIJKL', bei: 'ABCDEFGHIJKL' } }, storage);
    return loadGameHistory(storage);
  });
  const account = h(AccountPanel, { onError: noop });
  let content;
  if (mode.startsWith('admin')) content = h(AdminPage, { server: base, initialTab: mode === 'admin-users' ? 'users' : mode === 'admin-settings' ? 'settings' : mode === 'admin-audit' ? 'audit' : 'stats' });
  else if (mode.startsWith('public-list')) content = h(PublicTables, { server: base, onJoin: noop, onCreate: noop, onBack: noop, initialRooms: Array.from({ length: mode.endsWith('empty') ? 0 : 8 }, (_, i) => ({ code: `ABC23${i}`, hostName: 'ABCDEFGHIJKL', humans: 2, config: { ...DEFAULT_ROOM_CONFIG, public: true }, updatedAt: 1000 })) });
  else if (mode === 'lobby') content = h(Fragment, null, h("div", { className: "mp-account-standalone" }, account), h(RoomLobby, { connection: state, room: { ...state.room!, phase: 'lobby' }, seat: 'dong', isHost: true, onSit: noop, onStand: noop, onStart: noop, onConfig: noop, onLeave: noop, onToast: noop }));
  else if (mode === 'create' || mode === 'join') content = h(OnlineMenu, { initialStep: mode, inviteCode: mode === 'join' ? 'ABC234' : null, busy: false, error: null, account, onCreate: noop, onJoin: noop, onBack: noop });
  else if (['menu', 'settings', 'history', 'premium'].includes(mode)) content = h(Fragment, null, h(MainMenu, { onOnline: noop }), mode === 'settings' ? h(SettingsModal, { settings: DEFAULT_SETTINGS, onSave: noop, onClose: noop }) : mode === 'history' ? h(HistoryModal, { history, onDelete: noop, onClear: noop, onClose: noop }) : mode === 'premium' ? h(PremiumModal, { onClose: noop }) : null);
  else content = h(RemoteTableView, { table, state, optionsOpen, onOptionsOpenChange: setOptionsOpen, onLeave: noop });
  return h('div', { 'data-layout-audit': mode, style: { display: 'contents' } }, content,
    mode === 'flowers' ? h(KongToast, { payments: state.view!.liveKong, ms: 3600000 }) : null);
}
