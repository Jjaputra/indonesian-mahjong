/**
 * v0.5.7 Kong koin display: each completed Kong pays the owner at once (di dalam 2, makan dari orang
 * 1, Kong Zhong 4 / 2). The result's Round Score block lists one line per Kong under the Hu rows and
 * a per-player game total (Hu + Kong, Σ 0); a Seri shows only Kong and totals. Tabel Total Poin adds
 * this hand's live Kong koin with a chip on the owner; final standings and history mention Kong.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { keyToTile } from '@/core/tiles';
import { gameDeltas, kongPayment, roundScore } from '@/core/round-score';
import { type MatchHistoryRecord } from '@/storage';
import { HistoryModal } from '@/ui/components/HistoryModal';
import { HuResultModal, RoundScoreBlock } from '@/ui/components/HuResultModal';
import { MatchScoreboard, MatchStandingsModal } from '@/ui/components/MatchBoard';
import { KONG_KIND_LABEL, gameDeltasOf, kongNote, kongToastText, recordDeltas, tayKoinText } from '@/ui/components/points';
import { createMatch, recordHand } from '@/ui/match';

const noop = () => undefined;
const MINUS = '−';
const zhong = kongPayment('nan', { type: 'dragon', value: 1 }, true); // 4 each → +12
const fiveTong = kongPayment('dong', { type: 'tong', value: 5 }, false); // 1 each → +3
const kongs = [fiveTong, zhong];
const totals = (html: string) => [...html.matchAll(/game-total-rows[\s\S]*$/g)][0]?.[0] ?? '';
const koinCells = (html: string) => [...html.matchAll(/class="rs-koin [^"]*">([^<]+) <small>/g)].map((m) => m[1]);

describe('v0.5.7 Kong koin display', () => {
  it('labels and toast text in Bahasa Indonesia', () => {
    expect(KONG_KIND_LABEL).toEqual({ ankong: 'Kong di dalam', kong: 'Kong makan dari orang', ankong_zhong: 'Kong Zhong di dalam', kong_zhong: 'Kong Zhong makan dari orang' });
    expect(kongToastText(zhong)).toBe('Kong 中: tiap pemain bayar 4 koin ke Bot Kanan');
    expect(kongToastText(fiveTong)).toBe('Kong 5 Tong: tiap pemain bayar 1 koin ke Kamu');
    expect(kongToastText(zhong, () => 'A Liong')).toBe('Kong 中: tiap pemain bayar 4 koin ke A Liong');
    expect(kongNote(kongs)).toBe(`Kong Kamu ${MINUS}1, Bot Kanan +11`);
    expect(kongNote([])).toBe('');
  });

  it('Hu: Kong lines under the Hu rows, then Hu + Kong totals summing to 0', () => {
    const rs = roundScore('xi', 5, { winMethod: 'ron', discarder: 'dong' });
    const html = renderToStaticMarkup(createElement(RoundScoreBlock, { outcome: { winner: 'xi', seatWind: 'xi', roundScore: rs }, kongPayments: kongs }));
    expect(html).toContain('Buangan: 4 × 5 Tay');
    expect(html).toContain('<b>Bot Kanan</b> · Kong Zhong di dalam');
    expect(html).toContain('tiap pemain bayar 4 koin');
    expect(html).toContain('<b>Kamu</b> · Kong makan dari orang');
    expect(html).toContain('Hu + Kong');
    // Hu rows (+20, −10, −5, −5), then totals in the same order: xi +20−5, dong −10−1, bei −5−5, nan −5+11
    expect(koinCells(html)).toEqual(['+20', `${MINUS}10`, `${MINUS}5`, `${MINUS}5`, '+15', `${MINUS}11`, `${MINUS}10`, '+6']);
    expect(totals(html)).toContain('Hu +20 · Kong ' + MINUS + '5');
    expect(html.match(/Σ 0 · kit-kit ✓/g)).toHaveLength(1);
  });

  it('Seri with kongs: only the Kong section and totals', () => {
    const html = renderToStaticMarkup(createElement(HuResultModal, {
      outcome: { kind: 'seri', kongPayments: kongs, gameDeltas: gameDeltas(null, kongs), durationSeconds: 3 }, onClose: noop, onNewGame: noop,
    }));
    expect(html).not.toContain('Round Score: semua 0 koin');
    expect(html).toContain('hanya Kong');
    expect(html).toContain('Kong saja');
    expect(koinCells(html)).toEqual([`${MINUS}1`, '+11', `${MINUS}5`, `${MINUS}5`]);
    expect(html).toContain('Σ 0 · kit-kit ✓');
  });

  it('Seri without kongs keeps "0 koin semua"', () => {
    const html = renderToStaticMarkup(createElement(RoundScoreBlock, { outcome: null, kongPayments: [] }));
    expect(html).toContain('Round Score: semua 0 koin');
  });

  it('Tabel Total Poin: live Kong koin counted, chip beside each owner, Σ 0', () => {
    let m = createMatch();
    m = recordHand(m, 'xi', true, 5, Date.now(), { winMethod: 'tsumo' });
    const board = renderToStaticMarkup(createElement(MatchScoreboard, { match: m, hand: 2, prevailingWind: 'dong', dealer: 'nan', liveKong: kongs }));
    expect(board).toContain('class="kong-chip"');
    expect(board).toContain('+11 kong');
    expect(board).toContain(`${MINUS}1 kong`);
    // xi +30 −5 = +25; nan −10 +11 = +1; dong −10 −1 = −11; bei −10 −5 = −15
    expect(board).toMatch(/Bot Seberang[\s\S]*?<b>\+25<\/b>/);
    expect(board).toMatch(/Bot Kanan[\s\S]*?<b>\+1<\/b>/);
    expect(board).toContain('Σ 0 · kit-kit ✓');
    const quiet = renderToStaticMarkup(createElement(MatchScoreboard, { match: m, hand: 2, prevailingWind: 'dong', dealer: 'nan' }));
    expect(quiet).not.toContain('kong-chip');
  });

  it('final standings: per-game koin from gameDeltas and a Kong note, also for Seri', () => {
    let m = createMatch();
    m = recordHand(m, 'xi', true, 5, Date.now(), { winMethod: 'tsumo' }, kongs);
    m = recordHand(m, null, false, 0, Date.now(), undefined, [zhong]);
    const html = renderToStaticMarkup(createElement(MatchStandingsModal, { match: m, onMenu: noop, onPlayAgain: noop }));
    expect(html).toContain(`Bot Seberang Hu 5 Tay · +25 koin · Kong Kamu ${MINUS}1, Bot Kanan +11`);
    expect(html).toContain('Seri · Kong Bot Kanan +12');
    expect(html).not.toContain('Seri · 0 koin');
    expect(recordDeltas(m.hands[1]!)).toEqual({ dong: -4, nan: 12, xi: -4, bei: -4 });
  });

  it('history: winner koin includes Kong and the row names the Kong', () => {
    const rs = roundScore('xi', 6, { winMethod: 'tsumo' });
    const rec: MatchHistoryRecord = {
      id: 'k', timestamp: 1, winner: 'xi', winningHand: [keyToTile('1T')], winningTile: keyToTile('1T'), scoringBreakdown: [], totalTay: 6,
      roundScore: rs, kongPayments: [zhong], gameDeltas: gameDeltas(rs, [zhong]), koin: 32, isWithKim: false, winMethod: 'tsumo', durationSeconds: 1, flowers: [], melds: [],
    };
    expect(tayKoinText(rec)).toBe('6 Tay · +32 koin');
    expect(gameDeltasOf({ roundScore: rs, kongPayments: [zhong] }).xi).toBe(32);
    const html = renderToStaticMarkup(createElement(HistoryModal, { history: [rec], onDelete: noop, onClear: noop, onClose: noop }));
    expect(html).toContain('6 Tay · +32 koin · Kong Bot Kanan +12');
  });


});
