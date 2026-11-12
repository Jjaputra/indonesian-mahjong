import { describe, expect, it } from 'vitest';
import type { GameEngineState } from '@/core/game-engine';
import type { Meld, Seat } from '@/core/types';
import { parseTileHand } from '@/core/tiles';
import { getPreset, MemoryStorage, loadGameHistory, saveGameRecord, HISTORY_STORAGE_KEY } from '@/storage';
import { GameController } from '@/ui/game-controller';
import { createMatch, handPoints, recordHand, standings } from '@/ui/match';

describe('Ce Mo / Mun points house rule', () => {
  it.each([
    [false, false, 1, null],
    [true, false, 2, 'ce_mo'],
    [false, true, 2, 'mun'],
    [true, true, 2, 'ce_mo'],
  ] as const)('self-draw=%s concealed=%s gives x%s', (isSelfDraw, isConcealed, multiplier, reason) => {
    expect(handPoints(7, { isSelfDraw, isConcealed })).toEqual({ tay: 7, multiplier, reason, points: 7 * multiplier });
  });

  it('credits points cumulatively and ranks by points before Hu count', () => {
    let m = createMatch();
    m = recordHand(m, 'dong', true, 6); // 6 raw = 6 points
    m = recordHand(m, 'dong', true, 6); // 12 points, two Hu
    m = recordHand(m, 'nan', true, 7, 0, { isSelfDraw: false, isConcealed: true }); // 14 points, one Hu
    expect(m.tayTotal).toEqual({ dong: 12, nan: 14, xi: 0, bei: 0 });
    expect(standings(m)[0]).toMatchObject({ seat: 'nan', tay: 14, hu: 1 });
    expect(m.hands[2]).toMatchObject({ totalTay: 7, multiplier: 2, points: 14 });
  });

  it('3 raw Tay cannot become a valid 5-Tay Hu through multiplication', () => {
    const m = recordHand(createMatch(), 'dong', true, 3, 0, { isSelfDraw: true, isConcealed: false });
    expect(m.hands[0]).toMatchObject({ lewFit: true, winner: null, totalTay: 0, multiplier: 1, points: 0 });
    expect(m.tayTotal.dong).toBe(0);
    expect(m.huCount.dong).toBe(0);
  });
});

const openJia: Meld = { type: 'jia', tiles: parseTileHand('1T 2T 3T'), claimedFrom: 'xi' };
const ankong: Meld = { type: 'ankong', tiles: parseTileHand('1T 1T 1T 1T') };

function controller(winner: Seat, melds: Meld[], minHuTay = 5) {
  const storage = new MemoryStorage();
  const c = new GameController({ settings: { ...getPreset('tournament'), minHuTay, kimEnabled: false, kimMode: 'off', animationSpeed: 'off', soundEnabled: false }, seed: 4, autoStart: false, storage });
  c.startMatch();
  const s = c.getState() as GameEngineState;
  const p = s.players[winner];
  p.melds = melds;
  p.flowers = [];
  p.hand = parseTileHand(melds.length ? '4T 5T 6T 7S 8S 9S 3W 3W 3W 2W 2W' : '1T 2T 3T 4T 5T 6T 7S 8S 9S 3W 3W 3W 2W 2W');
  return { c, s, p, storage };
}

describe('controller points integration for human and AI winners', () => {
  it('keeps a below-minimum self-draw unavailable even though doubled points would exceed five', () => {
    const { c, s, storage } = controller('dong', [openJia]);
    s.phase = 'ACTION_DECISION'; s.currentTurn = 'dong'; s.selfDrawSeat = 'dong';
    s.players.bei.discards = parseTileHand('9T');
    expect(c.getHumanActions().selfHuScore?.totalTay).toBe(4);
    expect(c.getHumanActions().canSelfDrawHu).toBe(false);
    c.humanSelfDrawHu();
    expect(c.outcome).toBeNull();
    expect(c.match!.tayTotal.dong).toBe(0);
    expect(loadGameHistory(storage)).toEqual([]);
  });

  it.each(['dong', 'nan'] as const)('open self-draw by %s doubles and persists raw Tay and points', winner => {
    const { c, s, storage } = controller(winner, [openJia], 3);
    s.phase = 'ACTION_DECISION'; s.currentTurn = winner; s.selfDrawSeat = winner;
    // Suppress opening special awards by giving another player a previous discard.
    s.players.bei.discards = parseTileHand('9T');
    if (winner === 'dong') c.humanSelfDrawHu();
    else c.step();
    expect(c.outcome?.kind).toBe('hu');
    if (c.outcome?.kind !== 'hu') throw new Error('expected Hu');
    expect(c.outcome.points).toEqual({ tay: 4, multiplier: 2, reason: 'ce_mo', points: 8 });
    expect(c.match!.tayTotal[winner]).toBe(8);
    expect(loadGameHistory(storage)[0]).toMatchObject({ totalTay: 4, multiplier: 2, points: 8 });
  });

  it('Ce Mo Pu Ciu Jen keeps its PDF Tay and doubles once, never x4', () => {
    const { c, s } = controller('dong', []);
    s.phase = 'ACTION_DECISION'; s.currentTurn = 'dong'; s.selfDrawSeat = 'dong';
    s.players.bei.discards = parseTileHand('9T');
    c.humanSelfDrawHu();
    if (c.outcome?.kind !== 'hu') throw new Error('expected Hu');
    expect(c.outcome.scoring.patterns.some(p => p.id === 44)).toBe(true);
    expect(c.outcome.points).toMatchObject({ multiplier: 2, reason: 'ce_mo', points: c.outcome.scoring.totalTay * 2 });
  });

  it.each(['dong', 'nan'] as const)('opening Thien Fu by %s doubles even without Ce Mo row', winner => {
    const { c, s } = controller(winner, []);
    s.dealerSeat = winner;
    s.phase = 'ACTION_DECISION'; s.currentTurn = winner; s.selfDrawSeat = winner;
    if (winner === 'dong') c.humanSelfDrawHu(); else c.step();
    if (c.outcome?.kind !== 'hu') throw new Error('expected Hu');
    expect(c.outcome.scoring.patterns.some(p => p.id === 11)).toBe(true);
    expect(c.outcome.points).toMatchObject({ multiplier: 2, reason: 'ce_mo', points: c.outcome.scoring.totalTay * 2 });
  });

  for (const winner of ['dong', 'nan'] as const) {
    for (const robbing of [false, true]) {
      it.each([['open', [openJia], 1, null], ['concealed', [], 2, 'mun'], ['concealed kong', [ankong], 2, 'mun']] as const)(`${winner} ${robbing ? 'robbing kong' : 'discard'} win: %s`, (_label, melds, multiplier, reason) => {
        const { c, s, p, storage } = controller(winner, [...melds], 3);
        const tile = p.hand.pop()!;
        s.phase = 'CLAIM_WINDOW'; s.currentTurn = 'bei'; s.selfDrawSeat = null;
        s.discardPending = { tile, discarder: 'bei', ...(robbing ? { isPromotedKong: true, kongMeldIndex: 0 } : {}) };
        if (robbing) s.players.bei.melds = [{ type: 'pung', tiles: parseTileHand('2W 2W 2W'), claimedFrom: 'xi' }];
        s.pendingClaims = {};
        if (winner === 'dong') c.humanClaim('hu');
        // Collect AI claims and resolve after the human's decision.
        for (let i = 0; i < 4 && !c.outcome; i++) {
          const claim = c.getHumanActions().claim;
          if (claim) c.humanClaim('pass');
          c.step();
        }
        if (c.outcome?.kind !== 'hu') throw new Error('expected Hu');
        expect(c.outcome.winner).toBe(winner);
        expect(c.outcome.winMethod).toBe(robbing ? 'chiong_kong' : 'ron');
        expect(c.outcome.points).toEqual({ tay: c.outcome.scoring.totalTay, multiplier, reason, points: c.outcome.scoring.totalTay * multiplier });
        expect(loadGameHistory(storage)[0]).toMatchObject({ multiplier, points: c.outcome.points!.points });
        expect(c.match!.tayTotal[winner]).toBe(c.outcome.points!.points);
      });
    }
  }
});

describe('history points migration', () => {
  const legacy = { id: 'old', timestamp: 1, winner: 'dong', totalTay: 7, winMethod: 'tsumo', winningHand: [], scoringBreakdown: [] };
  it('loads old self-draw and concealed history at x1 without retroactive inference', () => {
    const store = new MemoryStorage();
    store.setItem(HISTORY_STORAGE_KEY, JSON.stringify([legacy, { ...legacy, id: 'old-ron', winMethod: 'ron' }]));
    for (const row of loadGameHistory(store)) expect(row).toMatchObject({ totalTay: 7, multiplier: 1, points: 7 });
  });
  it('roundtrips new points and repairs malformed multiplier/points defensively', () => {
    const store = new MemoryStorage();
    const record = saveGameRecord({ winner: 'nan', winningHand: [], winningTile: null, scoringBreakdown: [], totalTay: 7, multiplier: 2, points: 14, isWithKim: false, winMethod: 'ron', durationSeconds: 1 }, store);
    expect(loadGameHistory(store)[0]).toMatchObject({ ...record!, multiplier: 2, points: 14 });
    store.setItem(HISTORY_STORAGE_KEY, JSON.stringify([{ ...legacy, multiplier: 4, points: 'bad' }]));
    expect(loadGameHistory(store)[0]).toMatchObject({ multiplier: 1, points: 7 });
  });
});
