import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { computeHistoryStats, concealedHistoryTiles, type MatchHistoryRecord } from '../../storage';
import { PLAYER_NAME, WIN_METHOD_LABEL } from '../labels';
import { modeLabel } from '../tay-calculator';
import { Modal } from './Modal';
import { KONG_KIND_LABEL, kongFaceText, kongNote, kongPaymentsOf, tayKoinText } from './points';
import { MeldView, TileRow, TileView } from './TileView';

interface HistoryModalProps {
  history: MatchHistoryRecord[];
  onDelete: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function HistoryDetail({ record, onDelete }: { record: MatchHistoryRecord; onDelete: (id: string) => void }) {
  const concealed = concealedHistoryTiles(record);
  return (
    <div className="history-detail">
      {record.winningTile && (
        <p>
          Tile menang: <TileView tile={record.winningTile} size="sm" highlight />
        </p>
      )}
      {concealed.length > 0 && <TileRow tiles={concealed} size="sm" highlightId={record.winningTile?.id} />}
      {record.melds.map((meld, index) => (
        <MeldView key={`${meld.type}-${index}`} meld={meld} size="sm" />
      ))}
      {record.flowers.length > 0 && (
        <p>
          Bunga/Musim: <TileRow tiles={record.flowers} size="sm" />
        </p>
      )}
      {record.scoringBreakdown.length > 0 && (
        <table className="tay-table">
          <tbody>
            {record.scoringBreakdown.map((b) => (
              <tr key={b.id}>
                <td>#{b.id}</td>
                <td>{b.name}</td>
                <td className="num">{b.tay}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {kongPaymentsOf(record).length > 0 && (
        <ul className="history-kongs" aria-label="Pembayaran Kong">
          {kongPaymentsOf(record).map((p, i) => (
            <li key={i}>{KONG_KIND_LABEL[p.kind]} {kongFaceText(p)} · {PLAYER_NAME[p.owner]} +{p.perPlayer * 3} koin (tiap pemain {p.perPlayer})</li>
          ))}
        </ul>
      )}
      <p className="muted small">Durasi: {record.durationSeconds} detik</p>
      <button type="button" className="btn btn-danger" onClick={() => onDelete(record.id)}>
        <Trash2 size={14} /> Hapus
      </button>
    </div>
  );
}

export function HistoryModal({ history, onDelete, onClear, onClose }: HistoryModalProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const stats = computeHistoryStats(history);
  return (
    <Modal
      title="Riwayat Permainan"
      onClose={onClose}
      wide
      footer={
        <button type="button" className="btn btn-danger" disabled={!history.length} onClick={onClear}>
          <Trash2 size={14} /> Hapus semua riwayat
        </button>
      }
    >
      <div className="history-stats">
        <span>
          Main: <b>{stats.gamesPlayed}</b>
        </span>
        <span>
          Seri: <b>{stats.draws}</b>
        </span>
        <span>
          Tay tertinggi: <b>{stats.highestTay}</b>
        </span>
        <span>
          Rata-rata Tay: <b>{stats.averageTay.toFixed(1)}</b>
        </span>
        <span>
          Menang (Ada Kim / Tanpa Kim): <b>{stats.kimWins}</b> / <b>{stats.noKimWins}</b>
        </span>
        {/* Wins per player (chair); seat winds rotate within a match, so they are not tallied here. */}
        {(['dong', 'nan', 'xi', 'bei'] as const).map((s) => (
          <span key={s}>
            {PLAYER_NAME[s]}: <b>{stats.wins[s]}</b>
          </span>
        ))}
      </div>
      {history.length === 0 && <p className="muted">Belum ada permainan yang selesai.</p>}
      <ul className="history-list">
        {history.map((r) => {
          const open = openId === r.id;
          return (
            <li key={r.id} className={open ? 'is-open' : ''}>
              <button type="button" className="history-row" onClick={() => setOpenId(open ? null : r.id)} aria-expanded={open}>
                <span className="muted">{formatDate(r.timestamp)}</span>
                <strong>{r.winner ? `${PLAYER_NAME[r.winner]} Hu` : 'Seri'}</strong>
                <span>{WIN_METHOD_LABEL[r.winMethod].split(' (')[0]}</span>
                {r.winner && <span className="badge badge-kim">{modeLabel(r.tableColumn ?? (r.isWithKim ? 'K' : 'NK'))}</span>}
                <span className="num">{r.winner || !kongPaymentsOf(r).length ? tayKoinText(r) : ''}{kongPaymentsOf(r).length > 0 && `${r.winner ? ' · ' : ''}${kongNote(kongPaymentsOf(r))}`}</span>
              </button>
              {open && <HistoryDetail record={r} onDelete={onDelete} />}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
