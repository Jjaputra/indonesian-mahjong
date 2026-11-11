import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, RotateCcw } from 'lucide-react';
import { PATTERNS, tableTay } from '../../scoring';
import type { GameOutcome } from '../game-controller';
import { PLAYER_NAME, SEAT_LABEL, WIN_METHOD_LABEL, tileText } from '../labels';
import { BONUS_TILE_RULE_LABEL, buildHuReceipt, classifyHand, formatTay, modeLabel, scoringColumnSummary } from '../tay-calculator';
import { Modal } from './Modal';
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
}

export function HuResultModal({ outcome, onClose, onNewGame }: HuResultModalProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const footer = (
    <>
      {outcome.kind === 'hu' && (
        <button
          type="button"
          className="btn"
          onClick={async () => {
            setCopied(await copyText(buildHuReceipt(outcome)));
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Struk disalin' : 'Salin Struk'}
        </button>
      )}
      <button type="button" className="btn btn-primary" onClick={onNewGame}>
        <RotateCcw size={14} /> Permainan Baru
      </button>
    </>
  );

  if (outcome.kind === 'seri') {
    return (
      <Modal title="Seri — Tembok Habis" onClose={onClose} footer={footer}>
        <p>Tidak ada pemain yang Hu sebelum tembok habis. Permainan berakhir Seri.</p>
        <p className="muted">Durasi: {outcome.durationSeconds} detik</p>
      </Modal>
    );
  }

  const r = outcome.scoring;
  const valid = r.isValidHu;
  return (
    <Modal title={valid ? `HU! ${PLAYER_NAME[outcome.winner]}` : `LEW FIT — ${PLAYER_NAME[outcome.winner]}`} onClose={onClose} footer={footer} wide>
      <div className="receipt">
        <dl className="receipt-meta">
          <dt>Pemenang</dt>
          <dd>
            {PLAYER_NAME[outcome.winner]} — {SEAT_LABEL[outcome.winner]}
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
            <span className="muted small">{scoringColumnSummary(r)}</span>
          </dd>
          <dt>Bunga/Musim</dt>
          <dd className="muted small">{BONUS_TILE_RULE_LABEL[r.bonusTileRule]}</dd>
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

        <table className="tay-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Pola</th>
              <th className={r.mode === 'K' ? 'col-active' : ''}>Ada Kim</th>
              <th className={r.mode === 'NK' ? 'col-active' : ''}>Tanpa Kim</th>
              <th>Tay</th>
            </tr>
          </thead>
          <tbody>
            {r.patterns.map((p) => {
              const def = PATTERNS.get(p.id);
              return (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>
                    <strong>{p.name}</strong>
                    <div className="muted small">{p.description}</div>
                  </td>
                  <td className={r.mode === 'K' ? 'col-active' : ''}>{formatTay(def ? tableTay(p.id, 'K', r.scoringBasis) : null)}</td>
                  <td className={r.mode === 'NK' ? 'col-active' : ''}>{formatTay(def ? tableTay(p.id, 'NK', r.scoringBasis) : null)}</td>
                  <td className="num">{p.tay}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Total Tay</td>
              <td className="num total">{r.totalTay}</td>
            </tr>
          </tfoot>
        </table>

        {r.notes.map((note) => (
          <p key={note} className="muted small">
            {note}
          </p>
        ))}
        <p className={`status-line ${valid ? 'ok' : 'bad'}`}>
          {valid ? `✓ Memenuhi minimum Hu: ${r.totalTay} ≥ ${r.minHuTay} Tay` : `✗ ${r.rejectionReason ?? `Kurang dari ${r.minHuTay} Tay`}`}
        </p>

        <button type="button" className="link-btn" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Rincian perhitungan
        </button>
        {expanded && (
          <div className="breakdown">
            <p>
              Pola diperiksa terhadap {r.candidateCount} kemungkinan susunan Kim; dipilih susunan dengan Tay total tertinggi
              {r.decomposition ? ` (bentuk: ${r.decomposition.shape}, Kim: ${r.decomposition.totalKims})` : ''}.
            </p>
            {r.decomposition?.wildcardAssignments.length ? (
              <ul>
                {r.decomposition.wildcardAssignments.map((w, i) => (
                  <li key={i}>
                    KIM → {tileText(w.representedTile)} (peran: {w.role})
                  </li>
                ))}
              </ul>
            ) : null}
            <pre className="receipt-text">{buildHuReceipt(outcome)}</pre>
          </div>
        )}
      </div>
    </Modal>
  );
}
