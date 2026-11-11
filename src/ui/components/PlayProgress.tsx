import type { GameController } from '../game-controller';
import type { PracticePace } from '../practice-pace';
import { SEAT_SHORT } from '../labels';

const PHASE: Record<string, string> = {
  FLOWER_REPLACEMENT: 'Mengganti Bunga', TURN_DRAW: 'Menarik tile',
  ACTION_DECISION: 'Memilih aksi atau buangan', CLAIM_WINDOW: 'Memeriksa klaim buangan',
  DRAW_SERI: 'Tembok habis — Seri', RESOLVED_HU: 'Hu dinyatakan',
};
export function PlayProgress({ controller, paused, blocked, pace, onPaceChange, onPause, onStep }: {
  pace: PracticePace; onPaceChange: (pace: PracticePace) => void;
  controller: GameController; paused: boolean; blocked: boolean; onPause: () => void; onStep: () => void;
}) {
  const state = controller.getState();
  const waiting = controller.isWaitingForHuman();
  const finished = !!controller.outcome;
  return <div className="play-progress">
    <div className="play-controls" role="group" aria-label="Kendali tempo bot">
      <label>Tempo bot <select aria-label="Tempo bot" value={pace} onChange={e => onPaceChange(e.target.value as PracticePace)}>
        <option value="learn">Belajar · 1,8 detik</option>
        <option value="slow">Lambat · 1,1 detik</option>
        <option value="normal">Normal · 0,65 detik</option>
        <option value="fast">Cepat · 0,3 detik</option>
        <option value="off">Tanpa jeda animasi</option>
      </select></label>
      <button type="button" className="btn" aria-pressed={paused} onClick={onPause} disabled={finished}>
        {paused ? 'Lanjutkan bot' : 'Jeda bot'}
      </button>
      <button type="button" className="btn" onClick={onStep} disabled={!paused || blocked || controller.isPresenting || waiting || finished}>
        Satu langkah bot
      </button>
      <span role="status">{finished ? 'Permainan selesai' : controller.isPresenting ? 'Transisi meja · aksi berikutnya setelah tile selesai' : blocked ? 'Bot dijeda selama dialog terbuka' : waiting
        ? `Menunggu pilihan Anda${paused ? ' · bot dijeda' : ''}` : paused ? 'Bot dijeda · gunakan satu langkah atau lanjutkan' : 'Bot berjalan otomatis'}</span>
    </div>
    <p>{SEAT_SHORT[state.currentTurn]} · {PHASE[state.phase] ?? (finished ? 'Selesai' : 'Persiapan meja')} · Buangan ke-{controller.discardCount}</p>
    <progress aria-label="Sisa tile tembok sejak pembagian" value={state.wall.remainingCount} max={Math.max(controller.initialWallCount, 1)} />
    {controller.botExplanation && <p className="bot-explanation"><strong>Keputusan bot terakhir:</strong> {controller.botExplanation}</p>}
  </div>;
}
