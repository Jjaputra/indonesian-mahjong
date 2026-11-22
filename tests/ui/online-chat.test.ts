import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TableSession } from '../../src/session';
import { DEFAULT_SETTINGS, MemoryStorage } from '../../src/storage';
import { REACTIONS, type ChatLine } from '../../src/net/protocol';
import { RemoteTable, type RemoteState } from '../../src/net/remote-table';
import { RemoteTableView } from '../../src/ui/components/RemoteTableView';
import { CHAT_OPEN_KEY, ChatPanel, loadChatOpen, saveChatOpen } from '../../src/ui/components/ChatPanel';
import { fakeNetwork, roomInfo } from '../net/fake-transport';

const lines: ChatLine[] = [
  { id: 1, at: 1000, seat: 'dong', name: 'Jason', text: 'halo' },
  { id: 2, at: 2000, seat: 'nan', name: 'Disa', text: 'ayo mulai' },
  { id: 3, at: 3000, seat: null, name: 'Nonton', reaction: 0 },
  { id: 4, at: 4000, seat: 'xi', name: 'Liong', text: 'Hu <b>cepet</b>' },
];

function table(room = roomInfo({ phase: 'playing' })) {
  const net = fakeNetwork();
  const t = new RemoteTable({ server: 'https://mp.example', code: 'ABC234', name: 'Jason', storage: new MemoryStorage(), socketFactory: net.factory });
  t.connect(); net.last.open();
  const session = new TableSession({ settings: DEFAULT_SETTINGS, seats: { dong: 'human', nan: 'bot', xi: 'bot', bei: 'bot' }, seed: 5, now: () => 1000 });
  net.last.receive({ type: 'welcome', token: 't', seat: 'dong', host: true, serverNow: 0, room });
  net.last.receive({ type: 'view', view: session.viewFor('dong'), serverNow: 1000 });
  net.last.receive({ type: 'chatHistory', lines });
  return t;
}

describe('online chat panel', () => {
  it('collapsed shows only the last two lines, escaped, with a button to open', () => {
    const t = table();
    const html = renderToStaticMarkup(createElement(ChatPanel, { table: t, state: t.getState(), storage: new MemoryStorage() }));
    expect(html).toContain('is-collapsed');
    expect(html.match(/<li class="chat-line/g)).toHaveLength(2);
    expect(html).toContain(`<b>Nonton (nonton)</b>: <span>${REACTIONS[0]}</span>`);
    expect(html).toContain('Hu &lt;b&gt;cepet&lt;/b&gt;');
    expect(html).not.toContain('halo'); expect(html).not.toContain('ayo mulai');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('<input');
    t.disconnect();
  });

  it('says so when there is no chat yet, and shows one line when only one exists', () => {
    const t = table();
    const empty = renderToStaticMarkup(createElement(ChatPanel, { table: t, state: { ...t.getState(), chat: [] }, storage: new MemoryStorage() }));
    expect(empty).toContain('Belum ada chat');
    const one = renderToStaticMarkup(createElement(ChatPanel, { table: t, state: { ...t.getState(), chat: lines.slice(0, 1) }, storage: new MemoryStorage() }));
    expect(one.match(/<li class="chat-line/g)).toHaveLength(1);
    t.disconnect();
  });

  it('opened shows the whole history, the input and the emoji button', () => {
    const t = table();
    const storage = new MemoryStorage(); saveChatOpen(true, storage);
    const html = renderToStaticMarkup(createElement(ChatPanel, { table: t, state: t.getState(), storage }));
    expect(html).toContain('is-open');
    expect(html.match(/<li class="chat-line/g)).toHaveLength(4);
    expect(html).toContain('placeholder="Tulis pesan…"'); expect(html).toContain('maxLength="120"');
    expect(html).toContain('aria-label="Reaksi"');
    t.disconnect();
  });

  it('marks own lines by seat, so two players with the same name are told apart, and tags spectators', () => {
    const room = roomInfo({ phase: 'playing', seats: (['dong', 'nan', 'xi', 'bei'] as const).map((seat, i) => ({ seat, name: i < 2 ? 'Jason' : null, bot: false, connected: true, host: i === 0 })) });
    const t = table(room);
    const same: ChatLine[] = [
      { id: 1, at: 1, seat: 'dong', name: 'Jason', text: 'dari aku' },
      { id: 2, at: 2, seat: 'nan', name: 'Jason', text: 'bukan aku' },
      { id: 3, at: 3, seat: null, name: 'Jason', text: 'penonton' },
    ];
    const storage = new MemoryStorage(); saveChatOpen(true, storage);
    const html = renderToStaticMarkup(createElement(ChatPanel, { table: t, state: { ...t.getState(), chat: same }, storage }));
    console.log(html.match(/<li class="chat-line[^>]*>.*?<\/li>/g));
    const items = html.match(/<li class="chat-line[^>]*>.*?<\/li>/g)!;
    expect(items[0]).toContain('is-own'); expect(items[0]).toContain('<b>Jason</b>');
    expect(items[1]).not.toContain('is-own'); expect(items[1]).toContain('<b>Jason</b>');
    expect(items[2]).not.toContain('is-own'); expect(items[2]).toContain('<b>Jason (nonton)</b>');
    // A spectator has no seat, so only the spectator line with their own name is theirs.
    const watcher = renderToStaticMarkup(createElement(ChatPanel, { table: t, state: { ...t.getState(), seat: null, chat: same }, storage }));
    const w = watcher.match(/<li class="chat-line[^>]*>.*?<\/li>/g)!;
    expect(w[0]).not.toContain('is-own'); expect(w[1]).not.toContain('is-own'); expect(w[2]).toContain('is-own');
    t.disconnect();
  });

  it('remembers open or closed per viewer and survives storage that throws', () => {
    const store = new MemoryStorage();
    expect(loadChatOpen(store)).toBe(false);
    saveChatOpen(true, store); expect(store.getItem(CHAT_OPEN_KEY)).toBe('1'); expect(loadChatOpen(store)).toBe(true);
    saveChatOpen(false, store); expect(loadChatOpen(store)).toBe(false);
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} };
    expect(loadChatOpen(broken)).toBe(false);
    expect(() => saveChatOpen(true, broken)).not.toThrow();
  });

  it('the table has no reaction bubbles or mute checkbox, and the chat panel sits in the info column above Opsi', () => {
    const t = table();
    const state: RemoteState = t.getState();
    const html = renderToStaticMarkup(createElement(RemoteTableView, { table: t, state, optionsOpen: false, onOptionsOpenChange: () => {}, onLeave: () => {} }));
    expect(html).toContain('class="chat-panel is-collapsed"');
    expect(html.match(/<li class="chat-line/g)).toHaveLength(2);
    expect(html).not.toContain('mp-reaction'); expect(html).not.toContain('Bisukan reaksi');
    expect(html.indexOf('chat-panel')).toBeGreaterThan(html.indexOf('table-info'));
    expect(html.indexOf('chat-panel')).toBeLessThan(html.indexOf('options-tab'));
    t.disconnect();
  });
});
