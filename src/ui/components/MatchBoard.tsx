import { useEffect, useState } from 'react';
import { Crown, Home, RotateCcw } from 'lucide-react';
import { SEAT_ORDER, keyToTile } from '../../core/tiles';
import type { Seat, Tile, TileFace, Wind } from '../../core/types';
import { standings, isMatchOver, remainingMatchMs, type MatchState } from '../match';
import { PLAYER_NAME, SEAT_LABEL, SEAT_SHORT, matchProgressLabel, tileText } from '../labels';
import { Modal } from './Modal';
import { TileView } from './TileView';

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

/**
 * Table info at the top of the side panel: the prevailing (table) wind and this hand's Kim, each
 * with its real tile, and the match's minimum Tay. `kimFace` is the natural Kim face; with Kim on
 * and no face, the dedicated KIM tile is the Kim.
 */
export function TableInfo({ roundWind, kimEnabled, kimFace, minHuTay }: { roundWind: Wind; kimEnabled: boolean; kimFace: TileFace | null | undefined; minHuTay: number }) {
  const wind: Tile = { id: 'table-wind', type: 'wind', value: SEAT_ORDER.indexOf(roundWind) + 1, isKim: false };
  const kim: Tile | null = !kimEnabled ? null : kimFace ? { ...kimFace, id: 'table-kim', isKim: false } : keyToTile('KIM');
  return (
    <dl className="table-info" aria-label="Info meja">
      <div><dt>Angin meja</dt><dd>{SEAT_LABEL[roundWind]} <TileView tile={wind} size="sm" /></dd></div>
      <div><dt>Kim</dt><dd>{kim ? <>{kimFace ? tileText(kim) : 'Tile KIM'} <TileView tile={kim} size="sm" /></> : 'Tanpa Kim'}</dd></div>
      <div><dt>Minimum Tay</dt><dd><b>{minHuTay}</b></dd></div>
    </dl>
  );
}

/** "Tabel Total Poin": progress, clock, and each player's Tay and Hu in match-ranking order. */
export function MatchScoreboard({ match, hand, prevailingWind, dealer, human = 'dong' }: { match: MatchState; hand: number; prevailingWind: Wind; dealer: Seat; human?: Seat }) {
  return (
    <div className="match-board" aria-label="Papan skor pertandingan">
      <h3 className="match-board-title">Tabel Total Poin</h3>
      <strong>{matchProgressLabel(hand, prevailingWind)}</strong>
      <MatchMinimumNote match={match} />
      <MatchClock match={match} />
      <table className="match-scores">
        <thead><tr><th scope="col">#</th><th scope="col">Pemain</th><th scope="col" className="num">Tay</th><th scope="col" className="num">Hu</th></tr></thead>
        <tbody>
          {standings(match).map(({ seat, rank, tay, hu }) => (
            <tr key={seat} className={`match-score${seat === dealer ? ' is-dealer' : ''}${rank === 1 && tay > 0 ? ' is-leader' : ''}${seat === human ? ' is-human' : ''}`}>
              <td className="rank">#{rank}</td>
              <th scope="row">{PLAYER_NAME[seat]}{seat === dealer && <Crown size={11} aria-label="Dealer" className="dealer-mark" />}</th>
              <td className="num"><b>{tay}</b></td>
              <td className="num">{hu}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
    : last.winner === last.dealer
      ? `${PLAYER_NAME[last.winner]} (dealer) menang: dealer tetap.`
      : 'Angin duduk berputar satu langkah.';
  return (
    <div className="match-note"><p>
      <strong>{`Game ${last.hand}/16 selesai.`}</strong>{' '}
      {over ? match.endedBy === 'time' ? 'Pertandingan berakhir karena batas waktu 90 menit.' : 'Ini game terakhir pertandingan.' : `${rotation} Berikutnya dealer: ${PLAYER_NAME[next.dealer]} · Angin putaran ${SEAT_SHORT[next.prevailingWind]}.`}
    </p>
    <p>{standings(match).map(r => `${PLAYER_NAME[r.seat]}: ${r.tay} Tay · ${r.hu} Hu`).join(' / ')}</p>
    </div>
  );
}

/** Final standings when the match ends: total Tay, then valid Hu, then first to reach final Tay. */
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
      <p>{champion ? `Pemenang meja: ${PLAYER_NAME[champion.seat]} dengan ${champion.tay} Tay · ${champion.hu} Hu.` : 'Tidak ada pemenang meja tunggal.'}</p>
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
              <td>{PLAYER_NAME[r.seat]}{r.hu > 0 && r.reachedAt > 0 ? <span className="muted"> · total Tay dicapai di game {r.reachedAt}</span> : null}</td>
              <td className="num">{r.hu}</td>
              <td className="num">{r.tay}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ol className="match-history" aria-label="Riwayat game">
        {match.hands.map((h) => (
          <li key={h.hand}>
            Game {h.hand} · Dealer {PLAYER_NAME[h.dealer]} · {h.winner ? `${PLAYER_NAME[h.winner]} Hu ${h.totalTay} Tay` : h.lewFit ? 'Lew Fit (0 Hu / 0 Tay)' : 'Seri'}
          </li>
        ))}
      </ol>
      <p className="muted">Peringkat: total Tay tertinggi; jika sama, Hu sah terbanyak, lalu yang lebih dulu mencapai total Tay akhir.</p>
    </Modal>
  );
}
