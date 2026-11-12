import { useEffect, useState } from 'react';
import { Crown, Home, RotateCcw } from 'lucide-react';
import { SEAT_ORDER, keyToTile } from '../../core/tiles';
import type { Seat, Tile, TileFace, Wind } from '../../core/types';
import { standings, isMatchOver, remainingMatchMs, type MatchState } from '../match';
import { PLAYER_NAME, SEAT_LABEL, SEAT_SHORT, matchProgressLabel, tileText } from '../labels';
import { Modal } from './Modal';
import { TileView } from './TileView';
import { recordPoints, standingPoints, tayPointsText } from './points';

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
 * and no face, the dedicated KIM tile is the Kim. `kimIndicator` is the natural Kim's indicator: one
 * copy of the tile before the Kim, taken out of play and shown face-up (3 copies stay in play).
 */
export function TableInfo({ roundWind, kimEnabled, kimFace, kimIndicator, minHuTay }: { roundWind: Wind; kimEnabled: boolean; kimFace: TileFace | null | undefined; kimIndicator?: TileFace | null; minHuTay: number }) {
  const wind: Tile = { id: 'table-wind', type: 'wind', value: SEAT_ORDER.indexOf(roundWind) + 1, isKim: false };
  const kim: Tile | null = !kimEnabled ? null : kimFace ? { ...kimFace, id: 'table-kim', isKim: false } : keyToTile('KIM');
  const pointer: Tile | null = kim && kimFace && kimIndicator ? { ...kimIndicator, id: 'table-kim-indicator', isKim: false } : null;
  return (
    <dl className="table-info" aria-label="Info meja">
      <div><dt>Angin meja</dt><dd>{SEAT_LABEL[roundWind]} <TileView tile={wind} size="sm" /></dd></div>
      <div><dt>Kim</dt><dd>{kim ? <>{kimFace ? tileText(kim) : 'Tile KIM'} <TileView tile={kim} size="sm" /></> : 'Tanpa Kim'}</dd></div>
      {pointer && <div className="table-info-pointer" title="Satu tile ini dikeluarkan dari permainan dan dibuka"><dt>Penunjuk</dt><dd><TileView tile={pointer} size="sm" /> {tileText(pointer)} <small>(3 tile tersisa)</small></dd></div>}
      <div><dt>Minimum Tay</dt><dd><b>{minHuTay}</b></dd></div>
    </dl>
  );
}

/** "Tabel Total Poin": progress, clock, and each player's points and Hu in match-ranking order. */
export function MatchScoreboard({ match, hand, prevailingWind, dealer, human = 'dong' }: { match: MatchState; hand: number; prevailingWind: Wind; dealer: Seat; human?: Seat }) {
  return (
    <div className="match-board" aria-label="Papan skor pertandingan">
      <h3 className="match-board-title">Tabel Total Poin</h3>
      <strong>{matchProgressLabel(hand, prevailingWind)}</strong>
      <MatchMinimumNote match={match} />
      <MatchClock match={match} />
      <table className="match-scores">
        <thead><tr><th scope="col">#</th><th scope="col">Pemain</th><th scope="col" className="num">Poin</th><th scope="col" className="num">Hu</th></tr></thead>
        <tbody>
          {standings(match).map((row) => { const { seat, rank, hu } = row; const points = standingPoints(row); return (
            <tr key={seat} className={`match-score${seat === dealer ? ' is-dealer' : ''}${rank === 1 && points > 0 ? ' is-leader' : ''}${seat === human ? ' is-human' : ''}`}>
              <td className="rank">#{rank}</td>
              <th scope="row">{PLAYER_NAME[seat]}{seat === dealer && <Crown size={11} aria-label="Dealer" className="dealer-mark" />}</th>
              <td className="num"><b>{points}</b></td>
              <td className="num">{hu}</td>
            </tr>
          ); })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Compact ranking table for result dialogs, in match-ranking order. `gained` adds this game's points
 * column; `highlight` marks the winner's row; `dealer` gets the crown.
 */
export function StandingsTable({ match, gained, highlight, dealer, dealerLabel = 'Dealer', human = 'dong', showReached }: {
  match: MatchState; gained?: Partial<Record<Seat, number>>; highlight?: Seat | null; dealer?: Seat | null; dealerLabel?: string; human?: Seat;
  /** Final standings: name the game where each Hu winner reached their final total (the last tie-break). */
  showReached?: boolean;
}) {
  return (
    <table className="standings-table">
      <thead>
        <tr>
          <th scope="col" className="rank">#</th>
          <th scope="col">Pemain</th>
          {gained && <th scope="col" className="num">+Poin<span className="th-long"> game ini</span></th>}
          <th scope="col" className="num">Total Poin</th>
          <th scope="col" className="num">Hu</th>
        </tr>
      </thead>
      <tbody>
        {standings(match).map((row) => { const { seat, rank, hu, reachedAt } = row; return (
          <tr key={seat} className={`${seat === highlight ? 'is-winner' : ''}${seat === human ? ' is-human' : ''}`.trim() || undefined}>
            <td className="rank">{rank}</td>
            <th scope="row">{PLAYER_NAME[seat]}{seat === dealer && <Crown size={13} aria-label={dealerLabel} className="dealer-mark" />}
              {showReached && hu > 0 && reachedAt > 0 && <small className="muted reached">Total dicapai di game {reachedAt}</small>}</th>
            {gained && <td className={`num gained${gained[seat] ? '' : ' is-zero'}`}>{gained[seat] ? `+${gained[seat]}` : '–'}</td>}
            <td className="num total">{standingPoints(row)}</td>
            <td className="num">{hu}</td>
          </tr>
        ); })}
      </tbody>
    </table>
  );
}

/** Under a hand's result: a short line on what happened to the match, then the ranked standings. */
export function MatchResultNote({ match }: { match: MatchState }) {
  const last = match.hands[match.hands.length - 1];
  if (!last) return null;
  const over = isMatchOver(match);
  const next = match.seating;
  const wind = `Angin putaran ${SEAT_SHORT[next.prevailingWind]}.`;
  const rotation = last.lewFit ? `Lew Fit: dealer dan angin duduk berputar. Dealer berikutnya: ${PLAYER_NAME[next.dealer]} · ${wind}`
    : last.winner === null ? `Seri. Dealer pindah ke ${PLAYER_NAME[next.dealer]} · ${wind}`
    : `Dealer pindah ke ${PLAYER_NAME[next.dealer]} · ${wind}`;
  return (
    <div className="match-note"><p>
      <strong>{`Game ${last.hand}/16 selesai.`}</strong>{' '}
      {over ? match.endedBy === 'time' ? 'Pertandingan berakhir karena batas waktu 90 menit.' : 'Ini game terakhir pertandingan.' : rotation}
    </p>
    <StandingsTable match={match} gained={last.winner ? { [last.winner]: recordPoints(last).points } : {}} highlight={last.winner}
      dealer={over ? null : next.dealer} dealerLabel="Dealer berikutnya" />
    </div>
  );
}

/** Final standings when the match ends: total points, then valid Hu, then first to reach final points. */
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
      <p>{champion ? `Pemenang meja: ${PLAYER_NAME[champion.seat]} dengan ${standingPoints(champion)} Poin · ${champion.hu} Hu.` : 'Tidak ada pemenang meja tunggal.'}</p>
      <StandingsTable match={match} highlight={champion?.seat ?? null} showReached />
      <ol className="match-history" aria-label="Riwayat game">
        {match.hands.map((h) => (
          <li key={h.hand}>
            Game {h.hand} · Dealer {PLAYER_NAME[h.dealer]} · {h.winner ? `${PLAYER_NAME[h.winner]} Hu ${tayPointsText(recordPoints(h))}` : h.lewFit ? 'Lew Fit (0 Hu / 0 Tay)' : 'Seri'}
          </li>
        ))}
      </ol>
      <p className="muted">Poin = total Tay, x2 untuk Ce Mo atau Mun. Peringkat: total Poin tertinggi; jika sama, Hu sah terbanyak, lalu yang lebih dulu mencapai total Poin akhir.</p>
    </Modal>
  );
}
