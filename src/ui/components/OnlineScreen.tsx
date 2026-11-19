import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoom, RemoteTable } from '../../net/remote-table';
import type { RoomConfig } from '../../net/protocol';
import { forgetRoom, inviteLink, loadLastRoom, loadRoom } from '../../net/room-store';
import { OnlineMenu } from './OnlineMenu';
import { RemoteTableView } from './RemoteTableView';
import '../online.css';
import { ConnectionIndicator, RoomLobby } from './RoomLobby';
import { startTurnAlerts } from '../turn-alert';

export interface OnlineScreenProps {
  server: string;
  /** From `?room=CODE`. */
  inviteCode: string | null;
  /** Rejoin the stored room straight away ("Lanjutkan room" on the main menu). */
  resume: boolean;
  /** The App paints the felt theme while a game is on screen. */
  onTableChange: (onTable: boolean) => void;
  optionsOpen: boolean;
  onOptionsOpenChange: (open: boolean) => void;
  onExit: () => void;
}

interface Join { code: string; name: string; token?: string; config?: RoomConfig }

const emptyStore = () => () => {};

export function SeatRolls({ table }: { table: RemoteTable }) {
  const state = table.getState();
  const dice = state.room!.seatDice!;
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 250); return () => clearInterval(id); }, []);
  const done = dice.settledAt !== null;
  const seconds = Math.max(0, Math.ceil((dice.deadline - table.serverNow()) / 1000));
  const canRoll = state.seat && !dice.dice[state.seat] && !done;
  return <main className="main-menu"><section className="menu-card mp-card online-seating"><ConnectionIndicator {...state} /><h2>Kocok posisi duduk</h2>
    <p>{done ? 'Posisi ditentukan. Permainan segera dimulai...' : `Total tertinggi menjadi Dong; kalau seri, kocok ulang. Sisa ${seconds} detik`}</p>
    <ul>{(done ? dice.groups.flat() : state.room!.seats.map(s => s.seat)).map((seat, i) => {
      const person = state.room!.seats.find(s => s.seat === seat);
      const roll = dice.dice[seat];
      return <li key={seat} className={seat === state.seat ? 'is-self' : undefined}><strong>{person?.name ?? 'Bot'}{seat === state.seat && ' (Anda)'}</strong><span>{roll ? roll.map(n => '⚀⚁⚂⚃⚄⚅'[n - 1]).join(' ') : 'Menunggu...'}</span><b>{roll ? roll.reduce((a, b) => a + b, 0) : '-'}</b>{done && <em>{['Dong', 'Nan', 'Xi', 'Bei'][i]}</em>}</li>;
    })}</ul>
    {canRoll && <button type="button" className="btn btn-gold online-roll" onClick={() => table.rollSeats()}>🎲 Kocok dadu</button>}
  </section></main>;
}

function RoomScreen({ table, optionsOpen, onOptionsOpenChange, onLeave, toast }: { table: RemoteTable; optionsOpen: boolean; onOptionsOpenChange: (open: boolean) => void; onLeave: () => void; toast: (text: string) => void }) {
  const state = useSyncExternalStore(table.subscribe, table.getState, table.getState);
  useEffect(() => startTurnAlerts(table), [table]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') table.onVisible(); };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [table]);
  useEffect(() => { if (state.error) toast(state.error.message); }, [state.error, toast]);
  // Once in, the address bar keeps only the clean invite link, so a reload or a shared tab URL rejoins this room.
  useEffect(() => {
    if (state.joined) try { window.history.replaceState(null, '', inviteLink(table.code, window.location)); } catch { /* sandboxed frame */ }
  }, [state.joined, table.code]);

  if (state.ended === 'replaced' || state.ended === 'room_closed') {
    return (
      <main className="main-menu">
        <section className="menu-card mp-card" role="alert">
          <h2>{state.ended === 'replaced' ? 'Room ini dibuka di perangkat lain' : 'Room ditutup'}</h2>
          <p className="muted">{state.ended === 'replaced' ? 'Kursi Anda sekarang dipakai di perangkat itu. Tutup tab ini atau kembali ke menu.' : 'Host menutup room ini.'}</p>
          <div className="menu-choices"><button type="button" className="btn btn-primary menu-choice" onClick={onLeave}><strong>Kembali ke menu</strong></button></div>
        </section>
      </main>
    );
  }
  if (!state.joined || !state.room) {
    return (
      <main className="main-menu">
        <section className="menu-card mp-card" role="status">
          <p className="menu-eyebrow">Room {table.code}</p>
          <h2>{state.status === 'reconnecting' ? 'Menyambung ulang…' : 'Menyambung…'}</h2>
          <div className="menu-choices"><button type="button" className="btn menu-choice" onClick={onLeave}><strong>Batal</strong></button></div>
        </section>
      </main>
    );
  }
  return (
    <>
      {state.room.phase === 'seating' && state.room.seatDice ? <SeatRolls table={table} /> : state.view && state.room.phase !== 'lobby'
        ? <RemoteTableView table={table} state={state} optionsOpen={optionsOpen} onOptionsOpenChange={onOptionsOpenChange} onLeave={onLeave} />
        : <RoomLobby connection={state} room={state.room} seat={state.seat} isHost={table.isHost} onSit={seat => table.sit(seat)} onStand={() => table.stand()} onStart={() => table.start()} onConfig={config => table.setConfig(config)} onLeave={onLeave} onToast={toast} />}
    </>
  );
}

export function OnlineScreen({ server, inviteCode, resume, onTableChange, optionsOpen, onOptionsOpenChange, onExit }: OnlineScreenProps) {
  const [table, setTable] = useState<RemoteTable | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastText, setToastText] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastRoom, setLastRoom] = useState(() => loadLastRoom());

  const toast = useCallback((text: string) => {
    setToastText(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastText(null), 2600);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const join = useCallback((j: Join) => {
    setError(null);
    const next = new RemoteTable({ server, code: j.code, name: j.name, token: j.token, initialConfig: j.config });
    next.connect();
    setTable(next);
  }, [server]);

  // Leaving keeps the seat (the token stays stored); only the live connection is dropped.
  const leave = useCallback(() => {
    table?.disconnect();
    setTable(null);
    setLastRoom(loadLastRoom());
    try { window.history.replaceState(null, '', window.location.pathname); } catch { /* sandboxed frame */ }
  }, [table]);

  // A stored seat for the invited room (or "Lanjutkan room") rejoins directly instead of showing the form.
  const autoJoined = useRef(false);
  useEffect(() => {
    if (autoJoined.current) return;
    autoJoined.current = true;
    const stored = inviteCode ? loadRoom(inviteCode) : resume ? loadLastRoom() : null;
    if (stored) join({ code: stored.code, name: stored.name, token: stored.token });
  }, [inviteCode, resume, join]);

  useEffect(() => () => table?.disconnect(), [table]);

  // The server says the room is gone: forget it and explain on the menu.
  const ended = useSyncExternalStore(table?.subscribe ?? emptyStore, () => table?.getState().ended ?? null, () => null);
  useEffect(() => {
    if (ended !== 'room_not_found' || !table) return;
    forgetRoom(table.code);
    setTable(null);
    setLastRoom(loadLastRoom());
    setError('Room tidak ditemukan. Periksa kode atau minta tautan baru.');
  }, [ended, table]);

  const state = useSyncExternalStore(table?.subscribe ?? emptyStore, () => table?.getState() ?? null, () => null);
  const onTable = !!state?.view && state.room?.phase !== 'lobby' && state.ended === null;
  useEffect(() => { onTableChange(onTable); }, [onTable, onTableChange]);
  useEffect(() => () => onTableChange(false), [onTableChange]);

  const create = async (config: RoomConfig, name: string) => {
    setBusy(true);
    setError(null);
    try {
      join({ code: await createRoom(server), name, config });
    } catch {
      setError('Gagal membuat room. Periksa koneksi lalu coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {table
        ? <RoomScreen table={table} optionsOpen={optionsOpen} onOptionsOpenChange={onOptionsOpenChange} onLeave={leave} toast={toast} />
        : <OnlineMenu inviteCode={inviteCode} lastRoom={lastRoom} busy={busy} error={error}
            onCreate={create} onJoin={(code, name) => join({ code, name, token: loadRoom(code)?.token })}
            onResume={() => lastRoom && join({ code: lastRoom.code, name: lastRoom.name, token: lastRoom.token })} onBack={onExit} />}
      {toastText && <div className="mp-toast-wrap"><p className="mp-toast" role="status">{toastText}</p></div>}
    </>
  );
}
