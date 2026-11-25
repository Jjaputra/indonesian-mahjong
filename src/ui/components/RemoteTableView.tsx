import { deviceLimitFallback, useAccount } from '../../net/auth';
import { ReferralShare } from './ReferralShare';
import { ConnectionIndicator } from './RoomLobby';
import '../options-panel.css';
import '../online.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import type { RemoteState, RemoteTable } from '../../net/remote-table';
import type { Seat } from '../../core/types';
import type { RoomSeat } from '../../net/protocol';
import { SEAT_SHORT, tileText } from '../labels';
import { seatWindOf } from '../../session/win-context';
import { ActionHud, CenterArea, HumanArea, OpponentPanel, seatPositions } from './GameTable';
import { ChatPanel } from './ChatPanel';
import { ContactLine } from './ContactLine';
import { MatchScoreboard, MatchStandingsModal, StandingsTable, TableInfo } from './MatchBoard';
import { WinningHandReceipt, RoundScoreBlock } from './HuResultModal';
import { KongToast } from './CallToast';
import { modeLabel } from '../tay-calculator';
import { Modal } from './Modal';
import { MeldView, TileRow } from './TileView';
import { RemoteController, asGameController, seatName, seatNames, seatPremium, spectatorBottomNames } from './remote-adapter';
import { AllowanceReset } from './AllowanceReset';
import { DAILY_LIMIT_MESSAGE, useDailyRemaining } from '../../net/daily-limit';

/** Maximum score review window, enforced by the room alarm. */
export const NEXT_HAND_GRACE_MS = 120000;

/** Time bar for the pending decision, driven by the server's deadline and clock offset. Hidden without a time limit. */
function Countdown({ table, state }: { table: RemoteTable; state: RemoteState }) {
  const [, tick] = useState(0);
  const limit = state.room?.config.turnSeconds ?? null;
  const view = state.view;
  const running = limit !== null && !!view && view.deadline !== null && view.phase !== 'DRAW_SERI' && view.phase !== 'RESOLVED_HU';
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick(n => n + 1), 200);
    return () => clearInterval(id);
  }, [running]);
  if (!running || !view) return null;
  const left = Math.max(0, (table.deadlineLocal() ?? 0) - Date.now());
  const ratio = Math.min(1, left / (limit * 1000));
  const who = view.phase === 'CLAIM_WINDOW' ? 'Klaim buangan' : `Giliran ${seatName(table, view.currentTurn)}`;
  const own = view.pendingDecisions.some(d => d.seat === state.seat);
  const seconds = Math.ceil(left / 1000);
  return (<>
    {own && seconds > 0 && seconds <= 5 && <div className="online-warning" role="status"><strong>Waktu hampir abis</strong><b>{seconds}</b></div>}
    <div className={`mp-countdown${ratio < 0.25 ? ' is-low' : ''}`} role="timer" aria-label={`${who}, sisa ${Math.ceil(left / 1000)} detik`}>
      <span>{who}</span>
      <i style={{ transform: `scaleX(${ratio})` }} />
      <b>{Math.ceil(left / 1000)}</b>
    </div>
  </>);
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** Four chips: name plus ready state. Bots count as ready; a human who left shows offline. */
export function ReadyStrip({ seats, self, nameOf }: { seats: RoomSeat[]; self: Seat | null; nameOf: (seat: Seat) => string }) {
  return (
    <ul className="mp-ready-strip" aria-label="Status siap">
      {seats.map(s => {
        const done = s.ready || s.bot;
        const offline = !s.bot && !s.connected;
        return (
          <li key={s.seat} className={`${done ? 'is-ready' : ''}${s.seat === self ? ' is-self' : ''}${offline ? ' is-offline' : ''}`.trim() || undefined}>
            <span>{nameOf(s.seat)}</span><b>{offline ? 'offline' : done ? '✓ siap' : 'nunggu'}</b>
          </li>
        );
      })}
    </ul>
  );
}

export function FinishedMatchActions({ table, state, onLeave }: { table: RemoteTable; state: RemoteState; onLeave: () => void }) {
  const account = useAccount();
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);
  useEffect(() => { if (shareToast) { const id = setTimeout(() => setShareToast(null), 5000); return () => clearTimeout(id); } }, [shareToast]);
  const loginBlocked = !account && !deviceLimitFallback();
  const remaining = useDailyRemaining(table.dailyLimitStorage);
  return <>
        {state.host
          ? <div className="online-daily-limit">
              <button type="button" className="btn btn-primary" disabled={remaining === 0 || loginBlocked || !state.seat} onClick={() => table.rematch()}>Main lagi</button>
              <div role="status">{!state.seat && <p>Duduk dulu buat mulai.</p>}<p>{Number.isFinite(remaining) ? `Jatah host hari ini: sisa ${Math.max(0, remaining - (account?.bonusMatches ?? 0))}${account?.bonusMatches ? ` +${account.bonusMatches} tabungan` : ''}` : account ? 'Jatah host: tanpa batas' : 'Host perlu masuk dulu.'}</p>
                {remaining === 0 && <><p>{DAILY_LIMIT_MESSAGE()}</p><ReferralShare onError={setShareError} onToast={setShareToast} /></>}{shareError && <p role="alert">{shareError}</p>}<AllowanceReset remaining={remaining} /></div>
              {shareToast && <p className="mp-referral-toast" role="status">{shareToast}</p>}
            </div>
          : <span className="muted" role="status">Nunggu host mulai lagi</span>}
        <button type="button" className="btn" onClick={onLeave}>Keluar room</button>
  </>;
}

export function OnlineStandings({ table, state, onClose, onLeave, onLastHand }: {
  table: RemoteTable; state: RemoteState; onClose: () => void; onLeave: () => void; onLastHand: () => void;
}) {
  return <MatchStandingsModal match={state.view!.match} names={seatNames(table)} premium={seatPremium(table)} human={state.seat}
    onMenu={onClose} onLastHand={onLastHand} footer={<>
      <FinishedMatchActions table={table} state={state} onLeave={onLeave} />
      <button type="button" className="btn" onClick={onClose}>Lihat meja</button>
    </>} />;
}

export function HandResult({ table, state, onClose, onLeave, onStandings }: { table: RemoteTable; state: RemoteState; onClose: () => void; onLeave: () => void; onStandings?: () => void }) {
  const view = state.view!;
  const last = view.lastHand ?? null;
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 250); return () => clearInterval(id); }, []);
  const left = Math.max(0, (state.room?.continueAt ?? table.serverNow()) - table.serverNow());
  const seconds = Math.ceil(left / 1000);
  const ready = state.room?.seats.find(s => s.seat === state.seat)?.ready;
  const canContinue = state.seat !== null && !view.matchOver;
  const winner = last?.winner ?? null;
  const record = last?.payments ?? view.lastHandResult;
  const deltas = record?.gameDeltas;
  const lewFit = !!record?.lewFit;
  const banner = lewFit ? 'LEW FIT' : winner ? 'HU' : 'SERI';
  const title = winner ? `${seatName(table, winner)} ${lewFit ? 'Lew Fit' : 'Hu'}` : lewFit ? 'Lew Fit' : 'Seri';
  const winKoin = winner && deltas ? deltas[winner] : null;
  const rows = last?.breakdown ?? [];
  return (
    <Modal title={title} onClose={onClose} wide footer={
      <>
        {view.matchOver && <>
          <button type="button" className="btn btn-primary" onClick={onStandings}>Lihat klasemen akhir</button>
          <FinishedMatchActions table={table} state={state} onLeave={onLeave} />
        </>}
        {canContinue && <button type="button" className="btn btn-primary" disabled={ready} onClick={() => table.ready()}>{ready ? 'Siap ✓' : 'Lanjut'}</button>}
        <button type="button" className="btn" onClick={onClose}>Lihat meja</button>
      </>
    }>
      <div className="mp-result">
        <p className={`hu-banner${lewFit || !winner ? ' is-lew-fit' : ''}`} aria-hidden="true">
          {banner}
          {winner && <small>{seatName(table, winner)} · {SEAT_SHORT[seatWindOf({ dealerSeat: view.dealer }, winner)]} · {record?.totalTay ?? 0} Tay{winKoin !== null && ` · ${signed(winKoin)} koin`}</small>}
        </p>
        {winner && last && last.winMethod !== 'draw' && (
          <p className="mp-win-chip"><span className={`badge ${last.winMethod === 'tsumo' ? 'badge-round' : 'badge-seat'}`}>
            {last.winMethod === 'tsumo' ? 'Ce Mo · tarik sendiri' : last.winMethod === 'chiong_kong' ? 'Chiong Kong' : 'Buangan'}
            {last.discarder && ` · dari ${seatName(table, last.discarder)}`}
          </span></p>
        )}
        {winner && last && (
          <>
            {last.scoring ? <>
              <p>Tabel <span className={`badge ${last.scoring.mode === 'K' ? 'badge-kim' : 'badge-seat'}`}>{modeLabel(last.scoring.mode)}</span></p>
              <WinningHandReceipt hand={last.hand} melds={last.melds} flowers={last.flowers ?? []} scoring={last.scoring} winningTileId={last.winningTileId ?? undefined} />
            </> : <>
            <div className="mp-result-hand">
              <TileRow tiles={last.hand} size="md" highlightId={last.winningTileId ?? undefined} />
              {last.melds.map((m, i) => <MeldView key={i} meld={m} size="md" owner={winner} />)}
            </div>
            {rows.length > 0 && (
              <table className="mp-breakdown" aria-label="Rincian Tay">
                <tbody>{rows.map((b, i) => <tr key={i}><td>{b.pattern}</td><td className="num">{b.tay}</td></tr>)}</tbody>
                <tfoot><tr className="total-row"><td>Total Tay</td><td className="num">{record?.totalTay ?? 0}</td></tr></tfoot>
              </table>
            )}</>}

          </>
        )}
        {!winner && !lewFit && <p className="mp-result-note">Tembok abis. Nggak ada pemenang.</p>}
        {lewFit && <p className="mp-result-note">Hu di bawah minimum Tay, nggak dihitung.</p>}
        <RoundScoreBlock outcome={winner && record ? { winner, seatWind: seatWindOf({ dealerSeat: view.dealer }, winner), roundScore: lewFit ? null : record.roundScore } : null} kongPayments={record?.kongPayments ?? []} nameOf={seat => seatName(table, seat)} />
        <p className="muted">Game {view.match.hands.length}/16 selesai · Koin game ini udah masuk klasemen sementara.</p>
        <StandingsTable match={view.match} gained={deltas} names={seatNames(table)} human={state.seat ?? undefined} />
        {!view.matchOver && state.room && (
          <div className="online-ready" role="status">
            <ReadyStrip seats={state.room.seats} self={state.seat} nameOf={seat => seatName(table, seat)} />
            <p className="mp-next">Game berikutnya {seconds} detik lagi</p>
            <div className="mp-next-bar"><i style={{ transform: `scaleX(${Math.min(1, left / NEXT_HAND_GRACE_MS)})` }} /></div>
          </div>
        )}
        {view.matchOver && <><p><strong>Match selesai.</strong></p><ContactLine /></>}
      </div>
    </Modal>
  );
}

export interface RemoteTableViewProps {
  table: RemoteTable;
  state: RemoteState;
  optionsOpen: boolean;
  onOptionsOpenChange: (open: boolean, persist?: boolean) => void;
  onLeave: () => void;
}

export function RemoteTableView({ table, state, optionsOpen, onOptionsOpenChange, onLeave }: RemoteTableViewProps) {
  const remote = useMemo(() => new RemoteController(table), [table]);
  const controller = asGameController(remote);
  const view = state.view!;
  const finished = view.phase === 'DRAW_SERI' || view.phase === 'RESOLVED_HU';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A mounted finished view is a rejoin; a live transition reviews the last hand first.
  const [resultOpen, setResultOpen] = useState(finished && !view.matchOver);
  const [standingsOpen, setStandingsOpen] = useState(view.matchOver);
  const resultKey = `${view.match.startedAt}:${view.match.hands.length}:${finished}:${view.matchOver}`;
  const presented = useRef(resultKey);
  const handNo = view.match.hands.length + (finished ? 0 : 1);
  remote.sync();
  const actions = remote.getHumanActions();

  const names = seatNames(table);
  const spectator = remote.spectator;

  useEffect(() => {
    if (presented.current === resultKey) return;
    presented.current = resultKey;
    setResultOpen(finished);
    setStandingsOpen(false);
  }, [finished, resultKey]);
  const showStandings = () => { setResultOpen(false); setStandingsOpen(true); };
  useEffect(() => {
    if (selectedId && !actions.discardableTileIds.includes(selectedId)) setSelectedId(null);
  }, [actions.discardableTileIds, selectedId]);

  const pos = seatPositions(remote.humanSeat);
  const config = state.room?.config;
  const kimEnabled = config ? config.kimMode !== 'off' : !!view.kimFace;
  return (
    <>
      <KongToast key={`${view.match.startedAt}:${handNo}`} payments={view.liveKong ?? []} nameOf={seat => seatName(table, seat)} skipExisting />
      <main className="table-felt is-online">
        <div className="online-table-connection"><ConnectionIndicator {...state} /></div>
        <Countdown table={table} state={state} />
        {view.kimFace && <div className="kim-indicator">Kim: {tileText({ ...view.kimFace, id: 'kim-indicator', isKim: false })}</div>}
        <OpponentPanel seat={pos.top} position="top" controller={controller} names={names} />
        <OpponentPanel seat={pos.left} position="left" controller={controller} names={names} />
        <CenterArea controller={controller} names={names} progress={
          <div className="play-progress">
            <TableInfo roundWind={view.roundWind} kimEnabled={kimEnabled} kimFace={view.kimFace} kimIndicator={view.indicator} minHuTay={view.match.minHuTay} />
            <ChatPanel table={table} state={state} optionsOpen={optionsOpen} onOptionsOpenChange={onOptionsOpenChange} />
            {!optionsOpen && (
              <button type="button" className="options-tab" id="table-options-trigger" aria-controls="table-options-panel" aria-expanded={false} aria-label="Buka panel Opsi" onClick={() => onOptionsOpenChange(true)}>
                <span className="options-tab-mark" aria-hidden="true">◀</span>
                <span className="options-tab-label">Opsi</span>
              </button>
            )}
            <section id="table-options-panel" className={`options-panel${optionsOpen ? ' is-open' : ''}`} hidden={!optionsOpen} aria-labelledby="table-options-title">
              <header className="options-panel-head">
                <h2 id="table-options-title" className="options-panel-title">ROOM {state.room?.code}</h2>
                <button type="button" className="options-panel-close" aria-controls="table-options-panel" aria-expanded={optionsOpen} aria-label="Sembunyikan panel Opsi" onClick={() => onOptionsOpenChange(false)}>
                  <span className="options-close-mark" aria-hidden="true">▶</span>
                </button>
              </header>
              <div className="options-panel-body">
                <MatchScoreboard liveKong={finished ? [] : view.liveKong ?? []} match={view.match} hand={handNo} prevailingWind={view.roundWind} dealer={view.dealer} human={spectator ? undefined : remote.humanSeat} names={names} />
                {state.host && state.room?.seats.filter(s => s.name && !s.bot && !s.connected && !s.takeover).map(s => <button key={s.seat} type="button" className="btn" onClick={() => table.replaceBot(s.seat)}>Ganti {s.name} dengan bot</button>)}
                <details className="table-tools">
                  <summary>Aktivitas terbaru</summary>
                  <ol className="game-log" aria-label="Log game">{state.log.slice(-12).map(l => <li key={l.id}>{l.text}</li>)}</ol>
                </details>
                <button type="button" className="btn mp-leave" onClick={onLeave}><LogOut size={14} aria-hidden="true" /> Keluar room</button>
              </div>
            </section>
          </div>
        } />
        <OpponentPanel seat={pos.right} position="right" controller={controller} names={names} />
        <div className="seat-bottom">
          <HumanArea controller={controller} actions={actions} selectedId={selectedId} onSelect={setSelectedId}
            names={spectator ? spectatorBottomNames(table) : names} facedown={spectator}
            hud={spectator ? undefined : <ActionHud controller={controller} actions={actions} selectedId={selectedId} onSelect={setSelectedId} names={names} />} />
          {finished && !resultOpen && !standingsOpen && (
            <button type="button" className="btn btn-gold result-reopen" onClick={() => view.matchOver ? showStandings() : setResultOpen(true)}>{view.matchOver ? 'Lihat klasemen akhir' : 'Lihat hasil game'}</button>
          )}
        </div>
      </main>
      {finished && resultOpen && <HandResult table={table} state={state} onClose={() => setResultOpen(false)} onStandings={showStandings} onLeave={onLeave} />}
      {view.matchOver && standingsOpen && <OnlineStandings table={table} state={state} onClose={() => setStandingsOpen(false)} onLeave={onLeave} onLastHand={() => { setStandingsOpen(false); setResultOpen(true); }} />}
    </>
  );
}
