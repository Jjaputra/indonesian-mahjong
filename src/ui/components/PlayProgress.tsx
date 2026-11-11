import { useEffect, useState } from 'react';
import type { GameController } from '../game-controller';
import type { PracticePace } from '../practice-pace';
import { SEAT_SHORT } from '../labels';
import { seatWindOf } from '../win-context';
import { MatchScoreboard } from './MatchBoard';

const PHASE: Record<string, string> = {
  FLOWER_REPLACEMENT: 'Mengganti Bunga', TURN_DRAW: 'Menarik tile',
  ACTION_DECISION: 'Memilih aksi atau buangan', CLAIM_WINDOW: 'Memeriksa klaim buangan',
  DRAW_SERI: 'Tembok habis — Seri', RESOLVED_HU: 'Hu dinyatakan',
};
export function PlayProgress({ controller, paused, blocked, pace, onPaceChange, onPause, onStep, onToggleMotion }: {
  onToggleMotion: () => void; pace: PracticePace; onPaceChange: (pace: PracticePace) => void;
  controller: GameController; paused: boolean; blocked: boolean; onPause: () => void; onStep: () => void;
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
  return <div className="play-progress">
    {match && <MatchScoreboard match={match} hand={match.hands.length + (finished ? 0 : 1)} prevailingWind={state.roundWind} dealer={state.dealerSeat} />}
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
  </div>;
}
