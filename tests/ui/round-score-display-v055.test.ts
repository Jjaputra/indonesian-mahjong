/**
 * v0.5.5 Round Score display (koin): the receipt keeps the Tay breakdown and adds one koin row per
 * player (winner first, payer tagged, Σ 0); Tabel Total Poin, final standings and history show
 * signed koin. The v0.5.4 Pengali x2 / Poin display is gone.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { keyToTile } from '@/core/tiles';
import type { Seat } from '@/core/types';
import { getPreset, type GameSettings, type MatchHistoryRecord } from '@/storage';
import { HistoryModal } from '@/ui/components/HistoryModal';
import { HuResultModal } from '@/ui/components/HuResultModal';
import { MatchScoreboard, MatchStandingsModal, MatchResultNote } from '@/ui/components/MatchBoard';
import { roundScoreOrder, signedKoin, tayKoinText } from '@/ui/components/points';
import { GameController, type HuOutcome } from '@/ui/game-controller';
import { createMatch, recordHand, roundScore } from '@/ui/match';

const noop = () => undefined;
const settings = (patch: Partial<GameSettings> = {}): GameSettings => ({ ...getPreset('tournament'), soundEnabled: false, ...patch });
const MINUS = '−';
const ORDER: Seat[] = ['dong', 'nan', 'xi', 'bei'];

function validHu(): HuOutcome {
  for (let seed = 1; seed < 50; seed++) {
    const c = new GameController({ settings: settings(), seed, saveHistory: false });
    let guard = 0;
    while (!c.outcome && guard++ < 3000) {
      c.runUntilHuman();
      const a = c.getHumanActions();
      if (a.claim) c.humanClaim(a.claim.canHu ? 'hu' : 'pass');
      else if (a.canSelfDrawHu) c.humanSelfDrawHu();
      else if (a.canDiscard) c.humanDiscard(a.discardableTileIds[a.discardableTileIds.length - 1]!);
    }
    if (c.outcome?.kind === 'hu' && c.outcome.scoring.isValidHu) return c.outcome;
  }
  throw new Error('no valid Hu found');
}

/** v0.5.5 shapes are kong-free; Kong koin (v0.5.7) has its own tests in kong-koin-display-v057. */
function withWin(o: HuOutcome, winMethod: HuOutcome['winMethod'], discarder?: Seat): HuOutcome {
  const rs = roundScore(o.winner, o.scoring.totalTay, { winMethod, discarder });
  return { ...o, winMethod, discarder, roundScore: rs, kongPayments: [], gameDeltas: rs.deltas };
}

const render = (outcome: HuOutcome) => renderToStaticMarkup(createElement(HuResultModal, { outcome, onClose: noop, onNewGame: noop }));
const koinCells = (html: string) => [...html.matchAll(/class="rs-koin [^"]*">([^<]+) <small>/g)].map((m) => m[1]);

describe('v0.5.5 Round Score display', () => {
  const base: HuOutcome = { ...validHu(), kongPayments: [], gameDeltas: { dong: 0, nan: 0, xi: 0, bei: 0 } };
  const tay = base.scoring.totalTay;
  const opp = (k: number) => ORDER[(ORDER.indexOf(base.winner) + k) % 4]!;

  it('Ce Mo: winner +6T first, every opponent −2T, Σ 0 kit-kit, Total Tay kept, no x2 / Poin', () => {
    const html = render(withWin(base, 'tsumo'));
    expect(html).toContain('Total Tay');
    expect(html).toContain('Round Score');
    expect(html).toContain(`Ce Mo: 6 × ${tay} tay`);
    expect(koinCells(html)).toEqual([`+${6 * tay}`, `${MINUS}${2 * tay}`, `${MINUS}${2 * tay}`, `${MINUS}${2 * tay}`]);
    expect(html).toContain('Σ 0 · kit-kit ✓');
    expect(html).not.toMatch(/Pengali|x2 \(|Poin</);
    expect(html).toContain(`${tay} Tay · +${6 * tay} koin`);
  });

  it('Buangan: payer listed second and tagged "buang" at −2T, other two −T, winner +4T', () => {
    const html = render(withWin(base, 'ron', opp(2)));
    expect(html).toContain(`Buangan: 4 × ${tay} tay; yang buang 2×, lainnya 1×`);
    expect(koinCells(html)).toEqual([`+${4 * tay}`, `${MINUS}${2 * tay}`, `${MINUS}${tay}`, `${MINUS}${tay}`]);
    expect(html).toMatch(/is-payer"><span class="rs-name">[^<]+<\/span><span class="rs-wind">[^<]+<\/span><span class="rs-tag">buang</);
    expect(html).toContain('class="rs-koin is-plus"');
    expect(html).toContain('class="rs-koin is-minus"');
    expect(roundScoreOrder(base.winner, opp(2))).toEqual([base.winner, opp(2), opp(1), opp(3)]);
  });

  it('Chiong Kong tags the kong declarer "kong"', () => {
    const html = render(withWin(base, 'chiong_kong', opp(1)));
    expect(html).toContain('Chiong Kong: 4 × ');
    expect(html).toMatch(/<span class="rs-tag">kong</);
  });

  it('Lew Fit and Seri: Round Score 0 koin semua', () => {
    const lewFit: HuOutcome = { ...base, winMethod: 'tsumo', scoring: { ...base.scoring, isValidHu: false }, roundScore: null };
    expect(render(lewFit)).toContain('Round Score: 0 koin semua');
    const seri = renderToStaticMarkup(createElement(HuResultModal, { outcome: { kind: 'seri', kongPayments: [], gameDeltas: { dong: 0, nan: 0, xi: 0, bei: 0 }, durationSeconds: 3 }, onClose: noop, onNewGame: noop }));
    expect(seri).toContain('Round Score: 0 koin semua');
  });

  it('Tabel Total Poin: # · Pemain · Koin · Tay · Hu ranked by signed koin, with a Σ 0 footer', () => {
    let m = createMatch();
    m = recordHand(m, 'nan', true, 7, Date.now(), { winMethod: 'tsumo' });
    m = recordHand(m, 'xi', true, 9, Date.now(), { winMethod: 'ron', discarder: 'dong' });
    const board = renderToStaticMarkup(createElement(MatchScoreboard, { match: m, hand: 3, prevailingWind: 'dong', dealer: 'bei' }));
    expect(board).toContain('Tabel Total Poin');
    expect(board).toMatch(/>Pemain<\/th><th scope="col" class="num">Koin<\/th><th scope="col" class="num">Tay<\/th><th scope="col" class="num">Hu<\/th>/);
    // nan +42 −9 = +33; xi −14 +36 = +22; bei −14 −9 = −23; dong −14 −18 = −32
    const koin = [...board.matchAll(/class="num koin [^"]*"><b>([^<]+)<\/b>/g)].map((x) => x[1]);
    expect(koin).toEqual(['+33', '+22', `${MINUS}23`, `${MINUS}32`]);
    expect(board).toContain('Σ 0 · kit-kit ✓');
    const note = renderToStaticMarkup(createElement(MatchResultNote, { match: m }));
    expect(note).toContain('Total Koin');
    expect(note).toContain('+36');
    expect(note).toContain(`${MINUS}18`);
    const final = renderToStaticMarkup(createElement(MatchStandingsModal, { match: m, onMenu: noop, onPlayAgain: noop }));
    expect(final).toContain('Bot Kanan Hu 7 Tay · +42 koin');
    expect(final).toContain('Bot Seberang Hu 9 Tay · +36 koin');
    expect(final).toContain('Pemenang meja: Bot Kanan dengan +33 koin');
    expect(final).not.toMatch(/Poin = |x2/);
  });

  it('history rows show Tay and the winner koin, signed', () => {
    const rec = (id: string, totalTay: number, winMethod: 'tsumo' | 'ron'): MatchHistoryRecord => {
      const rs = roundScore('xi', totalTay, { winMethod, discarder: winMethod === 'ron' ? 'dong' : undefined });
      return {
        id, timestamp: 1, winner: 'xi', winningHand: [keyToTile('1T')], winningTile: keyToTile('1T'), scoringBreakdown: [], totalTay,
        roundScore: rs, kongPayments: [], gameDeltas: rs.deltas, koin: rs.deltas.xi, isWithKim: false, winMethod, durationSeconds: 1, flowers: [], melds: [],
      };
    };
    const html = renderToStaticMarkup(createElement(HistoryModal, { history: [rec('a', 6, 'tsumo'), rec('b', 5, 'ron')], onDelete: noop, onClear: noop, onClose: noop }));
    expect(html).toContain('6 Tay · +36 koin');
    expect(html).toContain('5 Tay · +20 koin');
    expect(tayKoinText({ winner: null, totalTay: 0 })).toBe('0 Tay');
    expect(signedKoin(-25)).toBe(`${MINUS}25`);
  });
});
