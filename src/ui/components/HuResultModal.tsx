import { useState, type ReactNode } from 'react';
import { ArrowRight, Check, Copy, RotateCcw, Trophy } from 'lucide-react';
import type { GameOutcome } from '../game-controller';
import { PLAYER_NAME, SEAT_LABEL, SEAT_SHORT, WIN_METHOD_LABEL } from '../labels';
import { classifyHand, modeLabel } from '../tay-calculator';
import { Modal } from './Modal';
import { PAYER_TAG, koinSum, koinTone, roundScoreHint, roundScoreOrder, signedKoin, windOf } from './points';
import { MeldView, TileRow, TileView } from './TileView';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

interface HuResultModalProps {
  outcome: GameOutcome;
  onClose: () => void;
  onNewGame: () => void;
  /** Match in progress: deal the next hand with rotated seats */
  onNextHand?: () => void;
  /** Last hand of the match finished: open the final standings */
  onStandings?: () => void;
  /** Match status shown above the receipt, e.g. "Game 3/16 selesai" */
  matchSummary?: ReactNode;
}

function roundScoreLines(outcome: Extract<GameOutcome, { kind: 'hu' }>): string[] {
  const rs = outcome.roundScore;
  if (!rs) return ['Round Score: 0 koin semua'];
  return ['Round Score (' + roundScoreHint(rs) + ')', ...roundScoreOrder(outcome.winner, rs.payer).map((s) => PLAYER_NAME[s] + ': ' + signedKoin(rs.deltas[s]) + ' koin')];
}

/** Each player's koin for this game, winner first and the payer tagged; sums to 0. */
export function RoundScoreBlock({ outcome }: { outcome: Extract<GameOutcome, { kind: 'hu' }> | null }) {
  const rs = outcome?.roundScore ?? null;
  if (!outcome || !rs) {
    return (
      <section className="round-score is-empty" aria-label="Round Score">
        <h3>Round Score</h3>
        <p>Round Score: 0 koin semua</p>
      </section>
    );
  }
  const winnerWind = outcome.seatWind ?? outcome.winner;
  const sum = koinSum(rs.deltas);
  return (
    <section className="round-score" aria-label="Round Score">
      <h3>Round Score <small>{roundScoreHint(rs)}</small></h3>
      <ul className="round-score-rows">
        {roundScoreOrder(outcome.winner, rs.payer).map((s) => {
          const d = rs.deltas[s];
          return (
            <li key={s} className={`round-score-row${s === outcome.winner ? ' is-winner' : ''}${s === rs.payer ? ' is-payer' : ''}`}>
              <span className="rs-name">{PLAYER_NAME[s]}</span>
              <span className="rs-wind">{SEAT_SHORT[windOf(s, outcome.winner, winnerWind)]}</span>
              {s === outcome.winner && <span className="rs-tag is-win">Hu</span>}
              {s === rs.payer && <span className="rs-tag">{PAYER_TAG[rs.kind]}</span>}
              <span className={`rs-koin ${koinTone(d)}`}>{signedKoin(d)} <small>koin</small></span>
            </li>
          );
        })}
      </ul>
      <p className={`round-score-sum${sum === 0 ? '' : ' is-off'}`}>Σ {signedKoin(sum)}{sum === 0 ? ' · kit-kit ✓' : ' · tidak seimbang'}</p>
    </section>
  );
}

export function HuResultModal({ outcome, onClose, onNewGame, onNextHand, onStandings, matchSummary }: HuResultModalProps) {
  const inMatch = !!(onNextHand || onStandings);
  const [copied, setCopied] = useState(false);

  const footer = (
    <>
      {outcome.kind === 'hu' && (
        <button
          type="button"
          className="btn"
          onClick={async () => {
            setCopied(await copyText([
              'Pemenang: ' + PLAYER_NAME[outcome.winner],
              modeLabel(outcome.scoring.mode),
              ...outcome.scoring.patterns.filter(p => p.id !== 13).map(p => p.name + ': ' + p.tay + ' Tay'),
              'Total Tay: ' + outcome.scoring.totalTay,
              ...roundScoreLines(outcome),
            ].join('\n')));
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Struk disalin' : 'Salin Struk'}
        </button>
      )}
      <button type="button" className={inMatch ? 'btn' : 'btn btn-primary'} onClick={onNewGame}>
        <RotateCcw size={14} /> {inMatch ? 'Kembali ke menu' : 'Permainan Baru'}
      </button>
      {onNextHand && (
        <button type="button" className="btn btn-primary" onClick={onNextHand}>
          Lanjut ke game berikutnya <ArrowRight size={14} />
        </button>
      )}
      {onStandings && (
        <button type="button" className="btn btn-primary" onClick={onStandings}>
          <Trophy size={14} /> Lihat klasemen akhir
        </button>
      )}
    </>
  );

  if (outcome.kind === 'seri') {
    return (
      <Modal title="Seri — Tembok Habis" onClose={onClose} footer={footer}>
        {matchSummary}
        <p>Tidak ada pemain yang Hu sebelum tembok habis. Permainan berakhir Seri.</p>
        <RoundScoreBlock outcome={null} />
        <p className="muted">Durasi: {outcome.durationSeconds} detik</p>
      </Modal>
    );
  }

  const r = outcome.scoring;
  const valid = r.isValidHu;
  const rs = valid ? outcome.roundScore : null;
  return (
    <Modal title={valid ? `HU! ${PLAYER_NAME[outcome.winner]}` : `LEW FIT — ${PLAYER_NAME[outcome.winner]}`} onClose={onClose} footer={footer} wide>
      <div className="receipt">
        <p className={`hu-banner${valid ? '' : ' is-lew-fit'}`} aria-hidden="true">
          {valid ? 'HU' : 'LEW FIT'}
          <small>{PLAYER_NAME[outcome.winner]} · {r.totalTay} Tay{rs && ` · ${signedKoin(rs.deltas[outcome.winner])} koin`}</small>
        </p>
        {matchSummary}
        <dl className="receipt-meta">
          <dt>Pemenang</dt>
          <dd>
            {PLAYER_NAME[outcome.winner]} — {SEAT_LABEL[outcome.seatWind ?? outcome.winner]}
          </dd>
          <dt>Tile menang</dt>
          <dd>
            <TileView tile={outcome.winningTile} size="md" highlight />
          </dd>
          <dt>Cara menang</dt>
          <dd>
            <span className={`badge ${outcome.winMethod === 'tsumo' ? 'badge-round' : 'badge-seat'}`}>{WIN_METHOD_LABEL[outcome.winMethod]}</span>
            {outcome.discarder && <span className="muted"> dari {PLAYER_NAME[outcome.discarder]}</span>}
          </dd>
          <dt>Klasifikasi</dt>
          <dd>{classifyHand(r)}</dd>
          <dt>Tabel</dt>
          <dd>
            <span className={`badge ${r.mode === 'K' ? 'badge-kim' : 'badge-seat'}`}>{modeLabel(r.mode)}</span>{' '}

          </dd>
        </dl>

        <div className="receipt-hand">
          <TileRow tiles={outcome.hand} size="md" highlightId={outcome.winningTile.id} />
          {outcome.melds.map((m, i) => (
            <MeldView key={i} meld={m} size="md" />
          ))}
          {outcome.flowers.length > 0 && (
            <span className="rack">
              <TileRow tiles={outcome.flowers} size="sm" />
            </span>
          )}
        </div>

        <table className="tay-table tay-breakdown">
          <thead>
            <tr>
              <th className="pid">#</th>
              <th>Pola</th>
              <th className="num">Tay</th>
            </tr>
          </thead>
          <tbody>
            {r.patterns.filter((p) => p.id !== 13).map((p) => {
              return (
                <tr key={p.id}>
                  <td className="pid">{p.id}</td>
                  <td>{p.name}</td>
                  <td className="num">{p.tay}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="total-row">
              <td colSpan={2}>Total Tay</td>
              <td className="num total">{r.totalTay}</td>
            </tr>
          </tfoot>
        </table>

        <p className={`status-line ${valid ? 'ok' : 'bad'}`}>
          {valid ? `✓ Memenuhi minimum Hu: ${r.totalTay} ≥ ${r.minHuTay} Tay` : `✗ ${r.rejectionReason ?? `Kurang dari ${r.minHuTay} Tay`}`}
        </p>

        <RoundScoreBlock outcome={valid ? outcome : null} />
      </div>
    </Modal>
  );
}
