import { useEffect, useState, type ReactNode } from 'react';
import type { GameController } from '../game-controller';
import type { PracticePace } from '../practice-pace';
import { SEAT_SHORT, matchProgressLabel } from '../labels';
import { seatWindOf } from '../win-context';
import { MatchScoreboard, TableInfo } from './MatchBoard';
import { TableMotion } from './TableMotion';
import { kongPaymentsOf } from './points';
import '../options-panel.css';

const PHASE: Record<string, string> = {
  FLOWER_REPLACEMENT: 'Mengganti Bunga', TURN_DRAW: 'Menarik tile',
  ACTION_DECISION: 'Memilih aksi atau buangan', CLAIM_WINDOW: 'Memeriksa klaim buangan',
  DRAW_SERI: 'Tembok habis — Seri', RESOLVED_HU: 'Hu dinyatakan',
};

const OPTIONS_PANEL_ID = 'table-options-panel';

export function PlayProgress({ controller, paused, blocked, pace, onPaceChange, onPause, onStep, onToggleMotion, optionsOpen, onOptionsOpenChange, children }: {
  onToggleMotion: () => void; pace: PracticePace; onPaceChange: (pace: PracticePace) => void;
  controller: GameController; paused: boolean; blocked: boolean; onPause: () => void; onStep: () => void;
  optionsOpen: boolean; onOptionsOpenChange: (open: boolean) => void; children?: ReactNode;
}) {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const state = controller.getState();
  const waiting = controller.isWaitingForHuman();
  const finished = !!controller.outcome;
  const match = controller.match;
  const handNo = match ? match.hands.length + (finished ? 0 : 1) : null;
  return <div className="play-progress">
    <TableInfo roundWind={state.roundWind} kimEnabled={controller.getSettings().kimEnabled} kimFace={state.kimFace} kimIndicator={state.kimIndicator} minHuTay={match?.minHuTay ?? controller.getSettings().minHuTay} />
    {!optionsOpen && (
      <button
        type="button"
        className="options-tab"
        id="table-options-trigger"
        aria-controls={OPTIONS_PANEL_ID}
        aria-expanded={false}
        aria-label="Buka panel OPTION"
        onClick={() => onOptionsOpenChange(true)}
      >
        <span className="options-tab-mark" aria-hidden="true">◀</span>
        <span className="options-tab-label">OPTION</span>
      </button>
    )}
    <section id={OPTIONS_PANEL_ID} className={`options-panel${optionsOpen ? ' is-open' : ''}`} hidden={!optionsOpen} aria-labelledby="table-options-title">
      <header className="options-panel-head">
        <h2 id="table-options-title" className="options-panel-title">OPTION</h2>
        {handNo !== null && <p className="options-panel-sub">{matchProgressLabel(handNo, state.roundWind)}</p>}
        <button
          type="button"
          className="options-panel-close"
          aria-controls={OPTIONS_PANEL_ID}
          aria-expanded={optionsOpen}
          aria-label="Sembunyikan panel OPTION"
          onClick={() => onOptionsOpenChange(false)}
        >
          <span className="options-close-mark" aria-hidden="true">▶</span>
        </button>
      </header>
      <div className="options-panel-body">
        {match && <MatchScoreboard match={match} hand={handNo!} prevailingWind={state.roundWind} dealer={state.dealerSeat} human={controller.humanSeat} liveKong={finished ? [] : kongPaymentsOf({ kongPayments: controller.currentKongPayments })} />}
        <TableMotion controller={controller} />
        <details className="table-tools">
          <summary>Tempo &amp; aktivitas</summary>
          <div className="play-controls" role="group" aria-label="Kendali tempo bot">
            <label>Tempo bot <select aria-label="Tempo bot" value={pace} onChange={e => onPaceChange(e.target.value as PracticePace)}>
              <option value="learn">Belajar · 1,8 detik</option>
              <option value="slow">Lambat · 1,1 detik</option>
              <option value="normal">Normal · 0,65 detik</option>
              <option value="fast">Cepat · 0,3 detik</option>
              <option value="off">Tanpa jeda bot</option>
            </select></label>
            <button type="button" className="btn" aria-pressed={controller.getSettings().animationSpeed !== 'off'} onClick={onToggleMotion}>
              Animasi: {controller.getSettings().animationSpeed === 'off' ? 'mati' : reduced ? 'statis (sistem)' : 'aktif'}
            </button>
            <button type="button" className="btn" data-bot-pause aria-pressed={paused} onClick={onPause} disabled={finished}>
              {paused ? 'Lanjutkan bot' : 'Jeda bot'}
            </button>
            <button type="button" className="btn" onClick={onStep} disabled={!paused || blocked || controller.isPresenting || waiting || finished}>
              Satu langkah bot
            </button>
            <span role="status">{finished ? 'Permainan selesai' : controller.isPresenting ? 'Transisi meja · aksi berikutnya setelah tile selesai' : blocked ? 'Bot dijeda selama dialog terbuka' : waiting
              ? `Menunggu pilihan Anda${paused ? ' · bot dijeda' : ''}` : paused ? 'Bot dijeda · gunakan satu langkah atau lanjutkan' : 'Bot berjalan otomatis'}</span>
          </div>
          <p>{SEAT_SHORT[seatWindOf(state, state.currentTurn)]} · {PHASE[state.phase] ?? (finished ? 'Selesai' : 'Persiapan meja')} · Buangan ke-{controller.discardCount}</p>
          <progress aria-label="Sisa tile tembok sejak pembagian" value={state.wall.remainingCount} max={Math.max(controller.initialWallCount, 1)} />
          {controller.botExplanation && <p className="bot-explanation"><strong>Keputusan bot terakhir:</strong> {controller.botExplanation}</p>}
          <details className="activity-history"><summary>Aktivitas terbaru</summary><ol className="game-log" aria-label="Log permainan" start={Math.max(1, controller.log.length - 11)}>{controller.log.slice(-12).map(l => <li key={l.id}>{l.text}</li>)}</ol></details>
        </details>
        {children}
      </div>
    </section>
  </div>;
}