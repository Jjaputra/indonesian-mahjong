import { useEffect, useState } from 'react';
import { Home, RotateCcw } from 'lucide-react';
import type { Seat, Wind } from '../../core/types';
import { SEAT_ORDER } from '../../core/tiles';
import { standings, isMatchOver, remainingMatchMs, type MatchState } from '../match';
import { PLAYER_NAME, SEAT_SHORT, matchProgressLabel } from '../labels';
import { Modal } from './Modal';

/** Keep lower training thresholds visible wherever the match ranking is shown. */
function MatchMinimumNote({ match }: { match: MatchState }) {
  return match.minHuTay < 5 ? <small className="muted">Minimum latihan {match.minHuTay} Tay — aturan turnamen 5 Tay.</small> : null;
}

export function MatchClock({ match }: { match: MatchState }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (match.timeLimitMinutes === null || match.endedBy !== null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [match.startedAt, match.timeLimitMinutes, match.endedBy]);
  const remaining = remainingMatchMs(match, now);
  const seconds = Math.ceil((remaining ?? 0) / 1000);
  return <span aria-label="Waktu pertandingan">{remaining === null ? 'Waktu: tanpa batas' : `Waktu: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}{remaining === 0 && match.endedBy === null ? ' — waktu habis, selesaikan game ini' : ''}</span>;
}

/** Compact in-play indicator: "Game 3/8 · Angin putaran Timur" plus each player's valid Hu count. */
export function MatchScoreboard({ match, hand, prevailingWind, dealer }: { match: MatchState; hand: number; prevailingWind: Wind; dealer: Seat }) {
  return (
    <div className="match-board" aria-label="Papan skor pertandingan">
      <strong>{matchProgressLabel(hand, match.length, prevailingWind)}</strong>
      <MatchMinimumNote match={match} />
      <MatchClock match={match} />
      <span className="match-scores">
        {SEAT_ORDER.map((seat) => (
          <span key={seat} className={`match-score${seat === dealer ? ' is-dealer' : ''}`} title={seat === dealer ? 'Dealer game ini' : undefined}>
            {PLAYER_NAME[seat]}: <b>{match.huCount[seat]}</b> Hu
          </span>
        ))}
      </span>
    </div>
  );
}

/** Line under a hand's result: what happened to the match and who deals next. */
export function MatchResultNote({ match }: { match: MatchState }) {
  const last = match.hands[match.hands.length - 1];
  if (!last) return null;
  const over = isMatchOver(match);
  const next = match.seating;
  const rotation = last.lewFit ? 'Lew Fit: dealer dan angin duduk berputar satu langkah.' : last.winner === null
    ? 'Tidak ada Hu sah: angin duduk tidak berputar.'
    : last.winner === last.dealer && match.dealerWinRule === 'stay'
      ? `${PLAYER_NAME[last.winner]} (dealer) menang: dealer tetap.`
      : 'Angin duduk berputar satu langkah.';
  return (
    <p className="match-note">
      <strong>{`Game ${last.hand}${match.length === null ? '' : `/${match.length}`} selesai.`}</strong>{' '}
      {over ? match.endedBy === 'time' ? 'Pertandingan berakhir karena batas waktu 90 menit.' : 'Ini game terakhir pertandingan.' : `${rotation} Berikutnya dealer: ${PLAYER_NAME[next.dealer]} · Angin putaran ${SEAT_SHORT[next.prevailingWind]}.`}
    </p>
  );
}

/** Final standings when the match ends: most valid Hu wins, ties go to whoever reached it first. */
export function MatchStandingsModal({ match, onPlayAgain, onMenu }: { match: MatchState; onPlayAgain: () => void; onMenu: () => void }) {
  const rows = standings(match);
  const champion = rows[0] && rows[0].hu > 0 && rows.filter((r) => r.rank === 1).length === 1 ? rows[0] : null;
  return (
    <Modal
      title="Klasemen Akhir"
      onClose={onMenu}
      footer={
        <>
          <button type="button" className="btn" onClick={onMenu}>
            <Home size={14} /> Kembali ke menu
          </button>
          <button type="button" className="btn btn-primary" onClick={onPlayAgain}>
            <RotateCcw size={14} /> Main lagi
          </button>
        </>
      }
    >
      <MatchMinimumNote match={match} />
      {match.endedBy === 'time' && <p>Pertandingan berakhir karena batas waktu 90 menit; game terakhir telah diselesaikan.</p>}
      <p>{champion ? `Pemenang meja: ${PLAYER_NAME[champion.seat]} dengan ${champion.hu} Hu.` : 'Tidak ada pemenang meja tunggal.'}</p>
      <table className="tay-table match-standings">
        <thead>
          <tr>
            <th>#</th>
            <th>Pemain</th>
            <th>Hu</th>
            <th>Total Tay</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.seat}>
              <td>{r.rank}</td>
              <td>{PLAYER_NAME[r.seat]}{r.hu > 0 && r.reachedAt > 0 ? <span className="muted"> · capai di game {r.reachedAt}</span> : null}</td>
              <td className="num">{r.hu}</td>
              <td className="num">{r.tay}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ol className="match-history" aria-label="Riwayat game">
        {match.hands.map((h) => (
          <li key={h.hand}>
            Game {h.hand} · Dealer {PLAYER_NAME[h.dealer]} · {h.winner ? `${PLAYER_NAME[h.winner]} Hu ${h.totalTay} Tay` : h.lewFit ? 'Lew Fit (tidak dihitung)' : 'Seri'}
          </li>
        ))}
      </ol>
      <p className="muted">Peringkat: Hu sah terbanyak (minimal Tay terpenuhi); jika sama, yang lebih dulu mencapai jumlah Hu itu.</p>
    </Modal>
  );
}
