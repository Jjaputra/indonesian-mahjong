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

/** Phone landscape: Opsi and chat share the corner, so only one of them is open at a time. */
export const PHONE_LANDSCAPE = '(orientation: landscape) and (max-height: 500px) and (min-width: 500px)';
const phoneLandscape = (): boolean => { try { return window.matchMedia(PHONE_LANDSCAPE).matches; } catch { return false; } };
/** Follows rotation and resizing, so a phone turned sideways with Opsi open also drops the chat. */
export function usePhoneLandscape(): boolean {
  const [phone, setPhone] = useState(phoneLandscape);
  useEffect(() => {
    let query: MediaQueryList;
    try { query = window.matchMedia(PHONE_LANDSCAPE); } catch { return; }
    const sync = () => setPhone(query.matches);
    sync();
    query.addEventListener?.('change', sync);
    return () => query.removeEventListener?.('change', sync);
  }, []);
  return phone;
}

/** Room chat in the table's top-right column: collapsed it shows the last two lines, opened it shows the history and the input. */
export function ChatPanel({ table, state, storage, optionsOpen = false, onOptionsOpenChange }: { table: RemoteTable; state: RemoteState; storage?: StorageLike; optionsOpen?: boolean; onOptionsOpenChange?: (open: boolean, persist?: boolean) => void }) {
  const phone = usePhoneLandscape();
  const [openWanted, setOpen] = useState(() => loadChatOpen(storage));
  const [panelFocused, setPanelFocused] = useState(false);
  // Never render both: on a phone in landscape an open Opsi wins over a chat that was open before it,
  // unless focus is anywhere inside the panel (an active interaction must never unmount).
  const open = openWanted && (!(optionsOpen && phone) || panelFocused);
  const [emoji, setEmoji] = useState(false);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLOListElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const toggled = useRef(false);
  const prevPhone = useRef(phone);
  const lines = state.chat;
  const toggle = (next: boolean) => {
    toggled.current = true; setOpen(next); setEmoji(false); if (!next) setPanelFocused(false); saveChatOpen(next, storage);
    if (next && optionsOpen && phone) onOptionsOpenChange?.(false, false);
  };
  // Leaving phone landscape restores the stored preference without writing to storage.
  useEffect(() => {
    const wasPhone = prevPhone.current;
    prevPhone.current = phone;
    if (wasPhone && !phone) setOpen(loadChatOpen(storage));
  }, [phone, storage]);
  // In phone landscape, an open Opsi suppresses chat without overwriting the saved preference;
  // rotating into landscape with Opsi open also clears any stale openWanted so closing Opsi won't pop chat back open,
  // but only once focus has left the panel.
  useEffect(() => {
    if (phone && optionsOpen && openWanted && !panelFocused) { setOpen(false); setEmoji(false); }
  }, [phone, optionsOpen, openWanted, panelFocused]);
  useEffect(() => {
    if (!emoji && panelFocused && typeof document !== 'undefined' && panelRef.current && !panelRef.current.contains(document.activeElement)) {
      setPanelFocused(false);
    }
  }, [emoji, panelFocused]);
  const lastId = lines.at(-1)?.id;
  // Newest line the viewer has had on screen: the collapsed tab shows a dot (phone landscape only) while someone else's line is newer.
  const [seenId, setSeenId] = useState(-1);
  useEffect(() => { if (open && lastId !== undefined) setSeenId(lastId); }, [open, lastId]);
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

  const lastLine = lines.at(-1);
  const unread = !open && lastLine !== undefined && lastLine.id > seenId && !own(lastLine);
  if (!open) {
    return (
      <section className="chat-panel is-collapsed" aria-label="Chat room">
        <button type="button" className="chat-peek" aria-expanded={false} aria-controls="chat-panel-body" aria-label={unread ? 'Buka chat, ada pesan baru' : 'Buka chat'} onClick={() => toggle(true)}>
          <ol className="chat-lines" aria-hidden="true">
            {lines.length === 0
              ? <li className="chat-empty">Belum ada chat</li>
              : lines.slice(-CHAT_PREVIEW_LINES).map(line => <Line key={line.id} line={line} name={nameOf(line)} own={own(line)} />)}
          </ol>
          <span className="chat-tab-label" aria-hidden="true">Chat</span>
          <span className="chat-mark" aria-hidden="true">▼</span>
          {unread && <span className="chat-dot" aria-hidden="true" />}
        </button>
      </section>
    );
  }
  return (
    <section
      className="chat-panel is-open"
      ref={panelRef}
      id="chat-panel-body"
      aria-label="Chat room"
      onFocus={() => setPanelFocused(true)}
      onBlur={(e) => {
        const root = panelRef.current ?? e?.currentTarget;
        const next = e?.relatedTarget as Node | null | undefined;
        if (next && root?.contains?.(next)) return;
        setPanelFocused(false);
      }}
    >
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
