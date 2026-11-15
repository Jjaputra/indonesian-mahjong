import { useEffect, useMemo, useState } from 'react';
import { LogOut } from 'lucide-react';
import type { RemoteState, RemoteTable } from '../../net/remote-table';
import { SEAT_ORDER } from '../../core/tiles';
import type { Seat } from '../../core/types';
import { tileText } from '../labels';
import { ActionHud, CenterArea, HumanArea, OpponentPanel, seatPositions } from './GameTable';
import { MatchScoreboard, TableInfo } from './MatchBoard';
import { Modal } from './Modal';
import { MeldView, TileRow } from './TileView';
import { RemoteController, asGameController, seatName, seatNames, spectatorBottomNames } from './remote-adapter';

/** Seconds the host has to press Lanjut before any seated player may. */
export const NEXT_HAND_GRACE_MS = 30000;

const WIN_TEXT: Record<string, string> = { tsumo: 'Ce Mo (tarik sendiri)', ron: 'Buangan', chiong_kong: 'Chiong Kong' };

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
  return (
    <div className={`mp-countdown${ratio < 0.25 ? ' is-low' : ''}`} role="timer" aria-label={`${who}, sisa ${Math.ceil(left / 1000)} detik`}>
      <span>{who}</span>
      <i style={{ transform: `scaleX(${ratio})` }} />
      <b>{Math.ceil(left / 1000)}</b>
    </div>
  );
}

function HandResult({ table, state, onClose, onLeave }: { table: RemoteTable; state: RemoteState; onClose: () => void; onLeave: () => void }) {
  const view = state.view!;
  const last = view.lastHand ?? null;
  const isHost = table.isHost;
  // The wait runs from when the hand ended, so closing and reopening this panel never restarts it.
  const graceLeft = () => Math.max(0, (state.handEndedAt ?? table.now()) + NEXT_HAND_GRACE_MS - table.now());
  const [graceOver, setGraceOver] = useState(() => graceLeft() === 0);
  useEffect(() => {
    const left = graceLeft();
    setGraceOver(left === 0);
    if (left === 0) return;
    const id = setTimeout(() => setGraceOver(true), left);
    return () => clearTimeout(id);
  }, [state.handEndedAt]);
  const canContinue = state.seat !== null && !view.matchOver && (isHost || graceOver);
  const winner = last?.winner ?? null;
  const record = last?.payments ?? view.lastHandResult;
  const deltas = record?.gameDeltas;
  const title = winner ? `${seatName(table, winner)} ${record?.lewFit ? 'Lew Fit' : 'Hu'}` : record?.lewFit ? 'Lew Fit' : 'Seri';
  return (
    <Modal title={title} onClose={onClose} footer={
      <>
        {view.matchOver && <button type="button" className="btn" onClick={onLeave}>Keluar room</button>}
        {canContinue && <button type="button" className="btn btn-primary" onClick={() => table.act({ type: 'nextHand' })}>Lanjut</button>}
        {!view.matchOver && !canContinue && state.seat !== null && <span className="muted" role="status">Menunggu host…</span>}
        <button type="button" className="btn" onClick={onClose}>Lihat meja</button>
      </>
    }>
      {winner && last && (
        <>
          <p>{last.winMethod === 'draw' ? '' : `${WIN_TEXT[last.winMethod] ?? last.winMethod}${last.discarder ? ` dari ${seatName(table, last.discarder)}` : ''} · `}<strong>{record?.totalTay ?? 0} Tay</strong></p>
          <div className="mp-result-hand">
            <TileRow tiles={last.hand} size="sm" />
            {last.melds.map((m, i) => <MeldView key={i} meld={m} size="sm" owner={winner} />)}
          </div>
          {last.breakdown.length > 0 && (
            <ul className="mp-breakdown" aria-label="Rincian Tay">
              {last.breakdown.map((b, i) => <li key={i}><span>{b.pattern}</span><b>{b.tay}</b></li>)}
            </ul>
          )}
        </>
      )}
      {!winner && <p>{record?.lewFit ? 'Hu di bawah minimum Tay: tidak dihitung.' : 'Tembok habis. Tidak ada pemenang.'}</p>}
      {deltas && (
        <ul className="mp-deltas" aria-label="Perubahan koin">
          {SEAT_ORDER.map((seat: Seat) => <li key={seat}><span>{seatName(table, seat)}</span><b className={deltas[seat] > 0 ? 'is-up' : deltas[seat] < 0 ? 'is-down' : undefined}>{deltas[seat] > 0 ? `+${deltas[seat]}` : deltas[seat]}</b></li>)}
        </ul>
      )}
      {view.matchOver && <p><strong>Pertandingan selesai.</strong></p>}
    </Modal>
  );
}

export interface RemoteTableViewProps {
  table: RemoteTable;
  state: RemoteState;
  optionsOpen: boolean;
  onOptionsOpenChange: (open: boolean) => void;
  onLeave: () => void;
}

export function RemoteTableView({ table, state, optionsOpen, onOptionsOpenChange, onLeave }: RemoteTableViewProps) {
  const remote = useMemo(() => new RemoteController(table), [table]);
  const controller = asGameController(remote);
  const view = state.view!;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const finished = view.phase === 'DRAW_SERI' || view.phase === 'RESOLVED_HU';
  const handNo = view.match.hands.length + (finished ? 0 : 1);
  remote.sync();
  const actions = remote.getHumanActions();

  const names = seatNames(table);
  const spectator = remote.spectator;

  useEffect(() => { setResultOpen(finished); }, [finished, view.match.hands.length]);
  useEffect(() => {
    if (selectedId && !actions.discardableTileIds.includes(selectedId)) setSelectedId(null);
  }, [actions.discardableTileIds, selectedId]);

  const pos = seatPositions(remote.humanSeat);
  const config = state.room?.config;
  const kimEnabled = config ? config.kimMode !== 'off' : !!view.kimFace;
  return (
    <>
      <main className="table-felt is-online">
        <Countdown table={table} state={state} />
        {view.kimFace && <div className="kim-indicator">Kim: {tileText({ ...view.kimFace, id: 'kim-indicator', isKim: false })}</div>}
        <OpponentPanel seat={pos.top} position="top" controller={controller} names={names} />
        <OpponentPanel seat={pos.left} position="left" controller={controller} names={names} />
        <CenterArea controller={controller} names={names} progress={
          <div className="play-progress">
            <TableInfo roundWind={view.roundWind} kimEnabled={kimEnabled} kimFace={view.kimFace} kimIndicator={view.indicator} minHuTay={view.match.minHuTay} />
            {!optionsOpen && (
              <button type="button" className="options-tab" id="table-options-trigger" aria-controls="table-options-panel" aria-expanded={false} aria-label="Buka panel OPTION" onClick={() => onOptionsOpenChange(true)}>
                <span className="options-tab-mark" aria-hidden="true">◀</span>
                <span className="options-tab-label">OPTION</span>
              </button>
            )}
            <section id="table-options-panel" className={`options-panel${optionsOpen ? ' is-open' : ''}`} hidden={!optionsOpen} aria-labelledby="table-options-title">
              <header className="options-panel-head">
                <h2 id="table-options-title" className="options-panel-title">ROOM {state.room?.code}</h2>
                <button type="button" className="options-panel-close" aria-controls="table-options-panel" aria-expanded={optionsOpen} aria-label="Sembunyikan panel OPTION" onClick={() => onOptionsOpenChange(false)}>
                  <span className="options-close-mark" aria-hidden="true">▶</span>
                </button>
              </header>
              <div className="options-panel-body">
                <MatchScoreboard match={view.match} hand={handNo} prevailingWind={view.roundWind} dealer={view.dealer} human={spectator ? undefined : remote.humanSeat} names={names} />
                <details className="table-tools">
                  <summary>Aktivitas terbaru</summary>
                  <ol className="game-log" aria-label="Log permainan">{state.log.slice(-12).map(l => <li key={l.id}>{l.text}</li>)}</ol>
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
          {finished && !resultOpen && (
            <button type="button" className="btn btn-gold result-reopen" onClick={() => setResultOpen(true)}>Lihat hasil permainan</button>
          )}
        </div>
      </main>
      {finished && resultOpen && <HandResult table={table} state={state} onClose={() => setResultOpen(false)} onLeave={onLeave} />}
    </>
  );
}
