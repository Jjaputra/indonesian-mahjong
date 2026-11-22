import { AllowanceReset } from './AllowanceReset';
import { useConfig } from '../../net/config';
import { openAuth, refreshAccount, renderGoogle, signOut, useAccount, facebookLogin, onlineLoginRequired, setNewsOptIn, leaveCurrentRoom, authStore } from '../../net/auth';
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

interface Join { code: string; name: string; token?: string; config?: RoomConfig; switchRoom?: boolean }

const emptyStore = () => () => {};

function Avatar({ name, picture }: { name: string; picture: string | null }) {
  const [broken, setBroken] = useState(false);
  return <span className="mp-avatar" aria-hidden="true">
    {picture && !broken ? <img src={picture} alt="" width={26} height={26} referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : (Array.from(name.trim())[0] ?? '?').toUpperCase()}
  </span>;
}

const LOGIN_TO_CREATE = 'Masuk pakai Google dulu, baru buat room.';

export function AccountPanel({ onError, onClear, error }: { onError: (message: string) => void; onClear?: () => void; error?: string | null }) {
  const account = useAccount();
  const config = useConfig();
  const button = useRef<HTMLDivElement>(null);
  // A new attempt (login, Keluar, Hapus akun) wipes the last error; so does a successful login.
  const attempt = <A extends unknown[]>(run: (...args: A) => void) => (...args: A) => { onClear?.(); run(...args); };
  useEffect(() => { if (account) onClear?.(); }, [account?.id]);
  // A click inside the GIS iframe never reaches the page; the window blur with the iframe focused is the only hint.
  useEffect(() => {
    if (account) return;
    const blur = () => { if (button.current?.contains(document.activeElement)) onClear?.(); };
    window.addEventListener('blur', blur);
    return () => window.removeEventListener('blur', blur);
  }, [account, onClear]);
  useEffect(() => {
    if (!account) return;
    const timer = setInterval(() => { void refreshAccount().catch(() => {}); }, 60000);
    return () => clearInterval(timer);
  }, [account?.id]);
  useEffect(() => {
    if (!account && button.current) void renderGoogle(button.current, onError).catch(error => onError(error.message));
  }, [account, onError]);
  return <div className={`mp-account ${account ? 'is-in' : 'is-out'}`} role="group" aria-label="Akun pemain">
    {account ? <>
      <span className="mp-account-who"><Avatar name={account.name} picture={account.picture} /><span className="mp-account-name" title={account.name}>{account.name}</span></span>
      <span className="mp-account-allowance"><span className="mp-pill">{account.premium ? 'Jatah host: tanpa batas' : `Jatah host hari ini: sisa ${account.remainingMatches} dari ${config.dailyMatchLimit} match`}</span>
      <AllowanceReset remaining={account.remainingMatches ?? Infinity} /></span>
      <label className="mp-account-optin"><input type="checkbox" checked={account.newsOptIn === true} onChange={e => { void setNewsOptIn(e.target.checked).catch(error => onError(error.message)); }} /> Kabari lewat email soal Premium dan update maciokYU!</label>
      <span className="mp-account-actions">
        <button type="button" className="mp-link" onClick={attempt(() => { void signOut().catch(error => onError(error.message)); })}>Keluar</button>
        <button type="button" className="mp-link mp-link-quiet" onClick={attempt(() => {
          if (window.confirm('Hapus akun, semua sesi, dan hitungan match?')) void signOut(true).catch(error => onError(error.message));
        })}>Hapus akun</button>
      </span>
    </> : <>
      <p className="mp-account-note">Main bareng harus masuk pakai Google.</p>
      <div className="mp-google" ref={button} />
      {config.facebookEnabled && <button type="button" className="btn" onClick={attempt(() => { void facebookLogin().catch(error => onError(error.message)); })}>Masuk pakai Facebook</button>}
    </>}
    {error && <p className="mp-account-error" role="alert">{error}</p>}
  </div>;
}

export function SeatRolls({ table }: { table: RemoteTable }) {
  const state = table.getState();
  const dice = state.room!.seatDice!;
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 250); return () => clearInterval(id); }, []);
  const done = dice.settledAt !== null;
  const seconds = Math.max(0, Math.ceil((dice.deadline - table.serverNow()) / 1000));
  const canRoll = state.seat && !dice.dice[state.seat] && !done;
  return <main className="main-menu"><section className="menu-card mp-card online-seating"><ConnectionIndicator {...state} /><h2>Kocok kursi</h2>
    <p>{done ? 'Kursi udah ditentukan. Match mulai bentar lagi.' : `Total tertinggi jadi Dong, kalau seri kocok ulang. Sisa ${seconds} detik`}</p>
    <ul>{(done ? dice.groups.flat() : state.room!.seats.map(s => s.seat)).map((seat, i) => {
      const person = state.room!.seats.find(s => s.seat === seat);
      const roll = dice.dice[seat];
      return <li key={seat} className={seat === state.seat ? 'is-self' : undefined}><strong>{person?.name ?? 'Bot'}{seat === state.seat && ' (kamu)'}</strong><span>{roll ? roll.map(n => '⚀⚁⚂⚃⚄⚅'[n - 1]).join(' ') : 'Nunggu…'}</span><b>{roll ? roll.reduce((a, b) => a + b, 0) : '-'}</b>{done && <em>{['Dong', 'Nan', 'Xi', 'Bei'][i]}</em>}</li>;
    })}</ul>
    {canRoll && <button type="button" className="btn btn-gold online-roll" onClick={() => table.rollSeats()}>Kocok dadu</button>}
  </section></main>;
}

function RoomScreen({ table, optionsOpen, onOptionsOpenChange, onLeave, toast }: { table: RemoteTable; optionsOpen: boolean; onOptionsOpenChange: (open: boolean) => void; onLeave: () => void; toast: (text: string) => void }) {
  const state = useSyncExternalStore(table.subscribe, table.getState, table.getState);
  const account = useAccount();
  const accountId = account?.id ?? null;
  const priorAccount = useRef(accountId);
  useEffect(() => {
    if (priorAccount.current !== accountId) { priorAccount.current = accountId; table.connect(); }
  }, [accountId, table]);
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
          <h2>{state.ended === 'replaced' ? 'Room ini dibuka di tab atau HP lain' : 'Room ditutup'}</h2>
          <p className="muted">{state.ended === 'replaced' ? 'Kursi kamu sekarang dipakai di sana. Tutup tab ini atau balik ke menu.' : 'Room ini ditutup host.'}</p>
          {state.ended === 'replaced' && <button type="button" className="btn btn-gold" onClick={() => table.reclaim()}>Ambil lagi kursi</button>}
          <div className="menu-choices"><button type="button" className="btn btn-primary menu-choice" onClick={onLeave}><strong>Ke menu</strong></button></div>
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
        : <RoomLobby connection={state} room={state.room} seat={state.seat} isHost={table.isHost} dailyLimitStorage={table.dailyLimitStorage} onSit={seat => table.sit(seat)} onStand={() => table.stand()} onStart={() => table.start()} onConfig={config => table.setConfig(config)} onLeave={onLeave} onToast={toast} />}
    </>
  );
}

export function OnlineScreen({ server, inviteCode, resume, onTableChange, optionsOpen, onOptionsOpenChange, onExit }: OnlineScreenProps) {
  const account = useAccount();
  const [authReady, setAuthReady] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<{ config: RoomConfig; name: string } | null>(null);
  const [pendingJoin, setPendingJoin] = useState<Join | null>(null);
  const [switchJoin, setSwitchJoin] = useState<Join | null>(null);
  const [table, setTable] = useState<RemoteTable | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const clearAuthError = useCallback(() => setAuthError(null), []);
  useEffect(() => { void openAuth(server).catch(() => setAuthError('Gagal masuk. Coba lagi.')).finally(() => setAuthReady(true)); }, [server]);
  // The login reminder from an earlier Buat room no longer applies once someone is logged in.
  useEffect(() => { if (account) setError(e => e === LOGIN_TO_CREATE ? null : e); }, [account?.id]);
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
    const current = authStore.get();
    if (!current && onlineLoginRequired()) { setPendingJoin(j); return; }
    if (!j.switchRoom && current?.currentRoom && current.currentRoom.code !== j.code) { setSwitchJoin(j); return; }
    setError(null);
    const next = new RemoteTable({ server, code: j.code, name: j.name, token: j.token, initialConfig: j.config, switchRoom: j.switchRoom });
    next.connect();
    setTable(next);
  }, [server, account]);

  // Explicit leave releases the account's seat.
  const leave = useCallback(() => {
    const seated = table?.getState().joined && table.getState().seat && !table.getState().ended;
    if (table?.getState().ended !== 'replaced') {
      table?.leave();
      if (account && table) forgetRoom(table.code);
    }
    if (account && seated && table) void leaveCurrentRoom(table.code).catch(() => {});
    setTable(null);
    setLastRoom(loadLastRoom());
    try { window.history.replaceState(null, '', window.location.pathname); } catch { /* sandboxed frame */ }
  }, [table, account]);

  // A stored seat for the invited room (or "Lanjutkan room") rejoins directly instead of showing the form.
  const autoJoined = useRef(false);
  useEffect(() => {
    if (table || (autoJoined.current && !pendingJoin) || !authReady || (!account && onlineLoginRequired())) return;
    const code = pendingJoin?.code ?? inviteCode ?? (resume ? account ? account.currentRoom?.code : loadLastRoom()?.code : null);
    if (!code) return;
    const stored = loadRoom(code);
    if (!account && !stored && !pendingJoin) return;
    autoJoined.current = true;
    join({ code, name: pendingJoin?.name ?? stored?.name ?? account?.name ?? 'Pemain', token: stored?.token });
    setPendingJoin(null);
  }, [inviteCode, resume, join, account, authReady, pendingJoin, table]);

  useEffect(() => () => table?.disconnect(), [table]);

  // The server says the room is gone: forget it and explain on the menu.
  const ended = useSyncExternalStore(table?.subscribe ?? emptyStore, () => table?.getState().ended ?? null, () => null);
  useEffect(() => {
    if (ended !== 'room_not_found' || !table) return;
    forgetRoom(table.code);
    setTable(null);
    setLastRoom(loadLastRoom());
    setError('Room nggak ketemu. Cek lagi kodenya atau minta link baru.');
  }, [ended, table]);

  const state = useSyncExternalStore(table?.subscribe ?? emptyStore, () => table?.getState() ?? null, () => null);
  useEffect(() => {
    if (state?.error?.code === 'current_room' && !state.joined && table) {
      table.disconnect(); setTable(null);
      void refreshAccount().then(() => setSwitchJoin({ code: table.code, name: table.playerName })).catch(() => setError(state.error!.message));
    }
    if (state?.error?.code === 'login_required' && !state.joined && table) {
      setPendingJoin({ code: table.code, name: table.playerName });
      table.disconnect(); setTable(null); autoJoined.current = false;
      void refreshAccount().catch(() => {});
    }
  }, [state?.error, state?.joined, table]);
  const onTable = !!state?.view && state.room?.phase !== 'lobby' && state.ended === null;
  useEffect(() => { onTableChange(onTable); }, [onTable, onTableChange]);
  useEffect(() => () => onTableChange(false), [onTableChange]);

  const resumeRoom = account?.currentRoom ? { code: account.currentRoom.code, name: account.name, token: loadRoom(account.currentRoom.code)?.token ?? '' } : account ? null : lastRoom;
  const create = async (config: RoomConfig, name: string, replace = false) => {
    if (!account && onlineLoginRequired()) { setError(LOGIN_TO_CREATE); return; }
    await refreshAccount().catch(() => {});
    if (!replace && authStore.get()?.currentRoom) { setPendingCreate({ config, name }); return; }
    setBusy(true);
    setError(null);
    try {
      const code = await createRoom(server, undefined, replace);
      setPendingCreate(null);
      // The server already moved the account to the new room; don't offer the old one again.
      await refreshAccount().catch(() => {});
      join({ code, name, config, switchRoom: replace || undefined });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Room belum jadi. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {switchJoin && account?.currentRoom && <div className="main-menu"><section className="menu-card mp-card" role="dialog" aria-modal="true" aria-label="Kursi masih aktif"><p>Kamu masih duduk di room {account.currentRoom.code}.</p><button type="button" onClick={() => { setSwitchJoin(null); join({ code: account.currentRoom!.code, name: account.name }); }}>Lanjut {account.currentRoom.code}</button><button type="button" onClick={() => { const next = switchJoin; setSwitchJoin(null); join({ ...next, switchRoom: true }); }}>Gabung {switchJoin.code}</button></section></div>}
      {pendingCreate && <div className="main-menu"><section className="menu-card mp-card" role="dialog" aria-modal="true" aria-label="Room masih aktif"><p>Kamu masih punya room {resumeRoom?.code}.</p><button type="button" onClick={() => { setPendingCreate(null); if (resumeRoom) join(resumeRoom); }}>Lanjut</button><button type="button" disabled={busy} onClick={() => { void create(pendingCreate.config, pendingCreate.name, true); }}>Buat room baru</button></section></div>}
      {table && (state?.room?.phase === 'lobby' || state?.room?.phase === 'finished') && <div className="mp-account-standalone"><AccountPanel onError={setAuthError} onClear={clearAuthError} error={authError} /></div>}
      {table && error && <p className="mp-error" role="alert">{error}</p>}
      {table
        ? <RoomScreen table={table} optionsOpen={optionsOpen} onOptionsOpenChange={onOptionsOpenChange} onLeave={leave} toast={toast} />
        : <OnlineMenu inviteCode={inviteCode} lastRoom={resumeRoom} busy={busy} error={error}
            account={<>{!account && (inviteCode || pendingJoin) && <p>Masuk pakai Google dulu buat gabung ke room {inviteCode ?? pendingJoin?.code}</p>}<AccountPanel onError={setAuthError} onClear={clearAuthError} error={authError} /></>}
            onCreate={create} onJoin={(code, name) => join({ code, name, token: loadRoom(code)?.token })}
            onResume={() => resumeRoom && join(resumeRoom)} onBack={onExit} />}
      {toastText && <div className="mp-toast-wrap"><p className="mp-toast" role="status">{toastText}</p></div>}
    </>
  );
}
