/**
 * v0.5.4 points display: a valid Hu scores total Tay x2 for Ce Mo or Mun, else x1. The result
 * receipt, Tabel Total Poin, final standings and history show points next to the raw Tay.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { keyToTile } from '@/core/tiles';
import { getPreset, type GameSettings, type MatchHistoryRecord } from '@/storage';
import { HistoryModal } from '@/ui/components/HistoryModal';
import { HuResultModal } from '@/ui/components/HuResultModal';
import { MatchScoreboard, MatchStandingsModal, MatchResultNote } from '@/ui/components/MatchBoard';
import { outcomePoints, recordPoints, tayPointsText } from '@/ui/components/points';
import { GameController, type HuOutcome } from '@/ui/game-controller';
import { createMatch, handPoints, recordHand } from '@/ui/match';

const noop = () => undefined;
const settings = (patch: Partial<GameSettings> = {}): GameSettings => ({ ...getPreset('tournament'), soundEnabled: false, ...patch });

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

function withWin(o: HuOutcome, isSelfDraw: boolean, isConcealed: boolean): HuOutcome {
  return { ...o, winMethod: isSelfDraw ? 'tsumo' : 'ron', points: handPoints(o.scoring.totalTay, { isSelfDraw, isConcealed }) };
}

describe('v0.5.4 points display', () => {
  const base = validHu();
  const tay = base.scoring.totalTay;

  it('receipt keeps Total Tay, adds x2 (Ce Mo) and the doubled Poin as headline', () => {
    const html = renderToStaticMarkup(createElement(HuResultModal, { outcome: withWin(base, true, false), onClose: noop, onNewGame: noop }));
    expect(html).toContain('Total Tay');
    expect(html).toContain('x2 (Ce Mo)');
    expect(html).toMatch(new RegExp(`class="num points">${tay * 2}<`));
    expect(html).toContain(`${tay} Tay · ${tay * 2} Poin`);
  });

  it('receipt shows x2 (Mun) for a concealed hand won on a discard', () => {
    const html = renderToStaticMarkup(createElement(HuResultModal, { outcome: withWin(base, false, true), onClose: noop, onNewGame: noop }));
    expect(html).toContain('x2 (Mun)');
    expect(html).toMatch(new RegExp(`class="num points">${tay * 2}<`));
  });

  it('x1 receipt shows Poin equal to Tay without a multiplier row', () => {
    const html = renderToStaticMarkup(createElement(HuResultModal, { outcome: withWin(base, false, false), onClose: noop, onNewGame: noop }));
    expect(html).not.toContain('multiplier-row');
    expect(html).not.toMatch(/>x[24] \(/);
    expect(html).toMatch(new RegExp(`class="num points">${tay}<`));
  });

  it('Lew Fit scores 0 points and never doubles', () => {
    const lewFit: HuOutcome = { ...base, winMethod: 'tsumo', scoring: { ...base.scoring, isValidHu: false }, points: null };
    expect(outcomePoints(lewFit)).toMatchObject({ points: 0, multiplier: 1, reason: null });
    const html = renderToStaticMarkup(createElement(HuResultModal, { outcome: lewFit, onClose: noop, onNewGame: noop }));
    expect(html).not.toContain('multiplier-row');
    expect(html).toMatch(/class="num points">0</);
  });

  it('Tabel Total Poin sums points under a Poin header; final standings list Tay and Poin', () => {
    let m = createMatch();
    m = recordHand(m, 'nan', true, 7, Date.now(), { isSelfDraw: true, isConcealed: false });
    m = recordHand(m, 'xi', true, 9, Date.now(), { isSelfDraw: false, isConcealed: false });
    const board = renderToStaticMarkup(createElement(MatchScoreboard, { match: m, hand: 3, prevailingWind: 'dong', dealer: 'bei' }));
    expect(board).toContain('Tabel Total Poin');
    expect(board).toMatch(/<th scope="col" class="num">Poin<\/th><th scope="col" class="num">Hu<\/th>/);
    expect(board).not.toMatch(/class="num">Tay<\/th>/);
    expect(board).toContain('<b>14</b>');
    const note = renderToStaticMarkup(createElement(MatchResultNote, { match: m }));
    expect(note).toContain('Total Poin');
    expect(note).toContain('+9');
    const final = renderToStaticMarkup(createElement(MatchStandingsModal, { match: m, onMenu: noop, onPlayAgain: noop }));
    expect(final).toContain('Bot Kanan Hu 7 Tay · 14 Poin');
    expect(final).toContain('Bot Seberang Hu 9 Tay');
    expect(final).not.toContain('9 Tay · ');
  });

  it('history rows show points next to Tay when doubled', () => {
    const rec = (id: string, totalTay: number, multiplier: 1 | 2): MatchHistoryRecord => ({
      id, timestamp: 1, winner: 'xi', winningHand: [keyToTile('1T')], winningTile: keyToTile('1T'), scoringBreakdown: [], totalTay,
      multiplier, points: totalTay * multiplier, isWithKim: false, winMethod: multiplier === 2 ? 'tsumo' : 'ron', durationSeconds: 1, flowers: [], melds: [],
    });
    const html = renderToStaticMarkup(createElement(HistoryModal, { history: [rec('a', 6, 2), rec('b', 8, 1)], onDelete: noop, onClear: noop, onClose: noop }));
    expect(html).toContain('6 Tay · 12 Poin');
    expect(html).toContain('>8 Tay<');
    expect(tayPointsText(recordPoints({ totalTay: 5 }))).toBe('5 Tay');
  });
});
