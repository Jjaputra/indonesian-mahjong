import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { RemoteState, RemoteTable } from '../../net/remote-table';
import { CHAT_MAX_LENGTH, REACTIONS, type ChatLine, type ReactionId } from '../../net/protocol';
import type { StorageLike } from '../../storage';
import { seatName } from './remote-adapter';

export const CHAT_OPEN_KEY = 'itm.chat-open.v1';
/** Lines the collapsed panel shows. */
export const CHAT_PREVIEW_LINES = 2;

/** Collapsed unless this viewer opened it before. */
export function loadChatOpen(storage?: StorageLike): boolean {
  try { return (storage ?? localStorage).getItem(CHAT_OPEN_KEY) === '1'; } catch { return false; }
}
export function saveChatOpen(open: boolean, storage?: StorageLike): void {
  try { (storage ?? localStorage).setItem(CHAT_OPEN_KEY, open ? '1' : '0'); } catch { /* unavailable */ }
}

export const chatLineText = (line: ChatLine): string => line.reaction !== undefined ? REACTIONS[line.reaction] ?? '' : line.text ?? '';

function Line({ line, name, own }: { line: ChatLine; name: string; own: boolean }) {
  return <li className={`chat-line${own ? ' is-own' : ''}`}><b>{name}</b>{': '}<span>{chatLineText(line)}</span></li>;
}

/** Room chat in the table's top-right column: collapsed it shows the last two lines, opened it shows the history and the input. */
export function ChatPanel({ table, state, storage }: { table: RemoteTable; state: RemoteState; storage?: StorageLike }) {
  const [open, setOpen] = useState(() => loadChatOpen(storage));
  const [emoji, setEmoji] = useState(false);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const toggled = useRef(false);
  const lines = state.chat;
  const toggle = (next: boolean) => { toggled.current = true; setOpen(next); setEmoji(false); saveChatOpen(next, storage); };
  const lastId = lines.at(-1)?.id;
  useEffect(() => {
    const list = listRef.current;
    if (open && list) list.scrollTop = list.scrollHeight;
  }, [open, lastId]);
  // Below the felt on a phone the opened card can start off screen: bring it into view when the viewer opens it.
  useEffect(() => {
    if (open && toggled.current) panelRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [open]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (table.chat(text)) setText('');
  };
  // Seated players are told apart by seat, since two of them can share a name; a spectator (seat null) falls back to the name.
  const own = (line: ChatLine) => state.seat ? line.seat === state.seat : line.seat === null && line.name === table.playerName;
  // Seat lines show the match's name for that seat, as the table does; a bot that took over keeps the sender's own name.
  const nameOf = (line: ChatLine) => line.seat === null ? `${line.name} (nonton)` : state.room?.seats.find(r => r.seat === line.seat)?.bot ? line.name : seatName(table, line.seat);

  if (!open) {
    return (
      <section className="chat-panel is-collapsed" aria-label="Chat room">
        <button type="button" className="chat-peek" aria-expanded={false} aria-controls="chat-panel-body" aria-label="Buka chat" onClick={() => toggle(true)}>
          <ol className="chat-lines" aria-hidden="true">
            {lines.length === 0
              ? <li className="chat-empty">Belum ada chat</li>
              : lines.slice(-CHAT_PREVIEW_LINES).map(line => <Line key={line.id} line={line} name={nameOf(line)} own={own(line)} />)}
          </ol>
          <span className="chat-tab-label" aria-hidden="true">Chat</span>
          <span className="chat-mark" aria-hidden="true">▼</span>
        </button>
      </section>
    );
  }
  return (
    <section className="chat-panel is-open" ref={panelRef} id="chat-panel-body" aria-label="Chat room">
      <header className="chat-head">
        <h2>Chat</h2>
        <button type="button" className="chat-close" aria-expanded aria-controls="chat-panel-body" aria-label="Tutup chat" onClick={() => toggle(false)}>
          <span aria-hidden="true">▲</span>
        </button>
      </header>
      <ol className="chat-lines chat-history" ref={listRef} role="log" aria-label="Riwayat chat">
        {lines.length === 0 ? <li className="chat-empty">Belum ada chat</li> : lines.map(line => <Line key={line.id} line={line} name={nameOf(line)} own={own(line)} />)}
      </ol>
      {emoji && <div className="chat-emoji" role="group" aria-label="Reaksi">
        {REACTIONS.map((label, id) => <button type="button" key={id} className="btn" onClick={() => { table.react(id as ReactionId); setEmoji(false); }}>{label}</button>)}
      </div>}
      <form className="chat-form" onSubmit={submit}>
        <input value={text} maxLength={CHAT_MAX_LENGTH} placeholder="Tulis pesan…" aria-label="Tulis pesan" autoComplete="off" enterKeyHint="send" onChange={e => setText(e.target.value)} />
        <button type="button" className="chat-emoji-btn" aria-label="Reaksi" aria-expanded={emoji} onClick={() => setEmoji(!emoji)}>😊</button>
      </form>
    </section>
  );
}
