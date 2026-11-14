import { useState, type ReactNode } from 'react';
import { ArrowRight, Check, Copy, FlaskConical, RotateCcw, Trophy } from 'lucide-react';
import type { Seat } from '../../core/types';
import type { ScoringResult } from '../../scoring';
import type { GameOutcome } from '../game-controller';
import { PLAYER_NAME, SEAT_LABEL, SEAT_SHORT, WIN_METHOD_LABEL } from '../labels';
import { classifyHand, modeLabel } from '../tay-calculator';
import { Modal } from './Modal';
import { SEAT_ORDER } from '../../core/tiles';
import { KONG_KIND_LABEL, PAYER_TAG, gameDeltasOf, kongDeltas, kongFaceText, kongPaymentsOf, koinSum, koinTone, roundScoreHint, roundScoreOrder, signedKoin, windOf, type KongPaymentView } from './points';
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
  /** Developer mode: reopen this hand in the Uji Tangan sandbox */
  onOpenSandbox?: () => void;
}

function roundScoreLines(outcome: Extract<GameOutcome, { kind: 'hu' }>): string[] {
  const rs = outcome.scoring.isValidHu ? outcome.roundScore : null;
  const kongs = kongPaymentsOf(outcome);
  const lines = rs ? ['Round Score (' + roundScoreHint(rs) + ')', ...roundScoreOrder(outcome.winner, rs.payer).map((s) => PLAYER_NAME[s] + ': ' + signedKoin(rs.deltas[s]) + ' koin')] : ['Round Score: 0 koin semua'];
  if (!kongs.length) return lines;
  const total = gameDeltasOf({ roundScore: rs, kongPayments: kongs });
  return [...lines, ...kongs.map((p) => `Kong ${kongFaceText(p)} ${PLAYER_NAME[p.owner]} (${KONG_KIND_LABEL[p.kind]}): tiap pemain ${p.perPlayer} koin`),
    'Total game (Hu + Kong)', ...SEAT_ORDER.map((s) => PLAYER_NAME[s] + ': ' + signedKoin(total[s]) + ' koin')];
}

/** Receipt Tay table (pattern rows, Total Tay) plus the minimum-Hu / Lew Fit line. */
export function TayBreakdown({ scoring: r }: { scoring: ScoringResult }) {
  const valid = r.isValidHu;
  return (
    <>
      <table className="tay-table tay-breakdown">
        <thead>
          <tr>
            <th className="pid">#</th>
            <th>Pola</th>
            <th className="num">Tay</th>
          </tr>
        </thead>
        <tbody>
          {r.patterns.filter((p) => p.id !== 13).map((p) => (
            <tr key={p.id}>
              <td className="pid">{p.id}</td>
              <td>{p.name}</td>
              <td className="num">{p.tay}</td>
            </tr>
          ))}
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
    </>
  );
}

/** Each player's koin for this game, winner first and the payer tagged; sums to 0. `nameOf` relabels rows (sandbox). */
export function RoundScoreBlock({ outcome, kongPayments = [], nameOf = (s) => PLAYER_NAME[s] }: {
  outcome: Pick<Extract<GameOutcome, { kind: 'hu' }>, 'winner' | 'seatWind' | 'roundScore'> | null; nameOf?: (seat: Seat) => string;
  /** Kong koin paid during the hand; listed under the Hu rows with a Hu + Kong total per player. */
  kongPayments?: readonly KongPaymentView[];
}) {
  const rs = outcome?.roundScore ?? null;
  if (!rs && !kongPayments.length) {
    return (
      <section className="round-score is-empty" aria-label="Round Score">
        <h3>Round Score</h3>
        <p>Round Score: 0 koin semua</p>
      </section>
    );
  }
  const order = outcome && rs ? roundScoreOrder(outcome.winner, rs.payer) : SEAT_ORDER;
  const huSum = rs ? koinSum(rs.deltas) : 0;
  return (
    <section className={`round-score${kongPayments.length ? ' has-kong' : ''}`} aria-label="Round Score">
      {outcome && rs ? <>
        <h3>Round Score <small>{roundScoreHint(rs)}</small></h3>
        <ul className="round-score-rows">
          {order.map((s) => {
            const d = rs.deltas[s];
            return (
              <li key={s} className={`round-score-row${s === outcome.winner ? ' is-winner' : ''}${s === rs.payer ? ' is-payer' : ''}`}>
                <span className="rs-name">{nameOf(s)}</span>
                <span className="rs-wind">{SEAT_SHORT[windOf(s, outcome.winner, outcome.seatWind ?? outcome.winner)]}</span>
                {s === outcome.winner && <span className="rs-tag is-win">Hu</span>}
                {s === rs.payer && <span className="rs-tag">{PAYER_TAG[rs.kind]}</span>}
                <span className={`rs-koin ${koinTone(d)}`}>{signedKoin(d)} <small>koin</small></span>
              </li>
            );
          })}
        </ul>
        {!kongPayments.length && <p className={`round-score-sum${huSum === 0 ? '' : ' is-off'}`}>Σ {signedKoin(huSum)}{huSum === 0 ? ' · kit-kit ✓' : ' · tidak seimbang'}</p>}
      </> : <h3>Round Score <small>Hu 0 koin · hanya Kong</small></h3>}
      {kongPayments.length > 0 && <KongSection payments={kongPayments} hu={rs?.deltas ?? null} order={order} nameOf={nameOf} />}
    </section>
  );
}

/** Kong lines (owner, tile, kind, per-player koin) and each player's game total = Hu + Kong. */
function KongSection({ payments, hu, order, nameOf }: { payments: readonly KongPaymentView[]; hu: Record<Seat, number> | null; order: readonly Seat[]; nameOf: (seat: Seat) => string }) {
  const kong = kongDeltas(payments);
  const total = (s: Seat) => (hu?.[s] ?? 0) + kong[s];
  const sum = order.reduce((n, s) => n + total(s), 0);
  return <>
    <h4 className="rs-sub">Kong <small>0 Tay · dibayar langsung</small></h4>
    <ul className="kong-pay-rows" aria-label="Pembayaran Kong">
      {payments.map((p, i) => (
        <li key={i} className="kong-pay-row">
          <TileView tile={{ ...p.face, id: `kong-pay-${i}`, isKim: false }} size="sm" />
          <span className="kp-text"><span><b>{nameOf(p.owner)}</b> · {KONG_KIND_LABEL[p.kind]}</span><small>tiap pemain bayar {p.perPlayer} koin</small></span>
          <span className="rs-koin is-plus">{signedKoin(p.perPlayer * 3)}</span>
        </li>
      ))}
    </ul>
    <h4 className="rs-sub">Total game <small>{hu ? 'Hu + Kong' : 'Kong saja'}</small></h4>
    <ul className="round-score-rows game-total-rows">
      {order.map((s) => (
        <li key={s} className="round-score-row">
          <span className="rs-name">{nameOf(s)}</span>
          <span className="rs-parts">{hu && <>Hu {signedKoin(hu[s])} · </>}Kong {signedKoin(kong[s])}</span>
          <span className={`rs-koin ${koinTone(total(s))}`}>{signedKoin(total(s))} <small>koin</small></span>
        </li>
      ))}
    </ul>
    <p className={`round-score-sum${sum === 0 ? '' : ' is-off'}`}>Σ {signedKoin(sum)}{sum === 0 ? ' · kit-kit ✓' : ' · tidak seimbang'}</p>
  </>;
}

export function HuResultModal({ outcome, onClose, onNewGame, onNextHand, onStandings, matchSummary, onOpenSandbox }: HuResultModalProps) {
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
      {outcome.kind === 'hu' && onOpenSandbox && (
        <button type="button" className="btn btn-dev" onClick={onOpenSandbox}>
          <FlaskConical size={14} /> Buka di Uji Tangan
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
        <RoundScoreBlock outcome={null} kongPayments={kongPaymentsOf(outcome)} />
        <p className="muted">Durasi: {outcome.durationSeconds} detik</p>
      </Modal>
    );
  }

  const r = outcome.scoring;
  const valid = r.isValidHu;
  const rs = valid ? outcome.roundScore : null;
  const kongs = kongPaymentsOf(outcome);
  return (
    <Modal title={valid ? `HU! ${PLAYER_NAME[outcome.winner]}` : `LEW FIT — ${PLAYER_NAME[outcome.winner]}`} onClose={onClose} footer={footer} wide>
      <div className="receipt">
        <p className={`hu-banner${valid ? '' : ' is-lew-fit'}`} aria-hidden="true">
          {valid ? 'HU' : 'LEW FIT'}
          <small>{PLAYER_NAME[outcome.winner]} · {r.totalTay} Tay{(rs || kongs.length > 0) && ` · ${signedKoin(gameDeltasOf({ roundScore: rs, kongPayments: kongs })[outcome.winner])} koin`}</small>
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

        <TayBreakdown scoring={r} />

        <RoundScoreBlock outcome={valid ? outcome : null} kongPayments={kongs} />
      </div>
    </Modal>
  );
}
