import { describe, expect, it } from 'vitest';
import type { GameEngineState } from '@/core/game-engine';
import type { Meld, Seat } from '@/core/types';
import { parseTileHand } from '@/core/tiles';
import { getPreset, MemoryStorage, loadGameHistory, saveGameRecord, HISTORY_STORAGE_KEY } from '@/storage';
import { GameController } from '@/ui/game-controller';
import { createMatch, roundScore, migrateMatchState, recordHand, standings } from '@/ui/match';

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

describe('controller koin integration for human and AI winners', () => {
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

  it.each(['dong', 'nan'] as const)('open self-draw by %s pays koin and persists raw Tay', winner => {
    const { c, s, storage } = controller(winner, [openJia], 3);
    s.phase = 'ACTION_DECISION'; s.currentTurn = winner; s.selfDrawSeat = winner;
    // Suppress opening special awards by giving another player a previous discard.
    s.players.bei.discards = parseTileHand('9T');
    if (winner === 'dong') c.humanSelfDrawHu();
    else c.step();
    expect(c.outcome?.kind).toBe('hu');
    if (c.outcome?.kind !== 'hu') throw new Error('expected Hu');
    expect(c.outcome.roundScore).toEqual(roundScore(winner, 4, { winMethod: 'tsumo' }));
    expect(c.match!.tayTotal[winner]).toBe(4);
    expect(c.match!.koinTotal[winner]).toBe(24);
    expect(loadGameHistory(storage)[0]).toMatchObject({ totalTay: 4, koin: 24 });
  });

  it('Ce Mo Pu Ciu Jen keeps its PDF Tay and uses raw Tay for koin', () => {
    const { c, s } = controller('dong', []);
    s.phase = 'ACTION_DECISION'; s.currentTurn = 'dong'; s.selfDrawSeat = 'dong';
    s.players.bei.discards = parseTileHand('9T');
    c.humanSelfDrawHu();
    if (c.outcome?.kind !== 'hu') throw new Error('expected Hu');
    expect(c.outcome.scoring.patterns.some(p => p.id === 44)).toBe(true);
    expect(c.outcome.roundScore).toEqual(roundScore('dong', c.outcome.scoring.totalTay, { winMethod: 'tsumo' }));
  });

  it.each(['dong', 'nan'] as const)('opening Thien Fu by %s pays koin even without Ce Mo row', winner => {
    const { c, s } = controller(winner, []);
    s.dealerSeat = winner;
    s.phase = 'ACTION_DECISION'; s.currentTurn = winner; s.selfDrawSeat = winner;
    if (winner === 'dong') c.humanSelfDrawHu(); else c.step();
    if (c.outcome?.kind !== 'hu') throw new Error('expected Hu');
    expect(c.outcome.scoring.patterns.some(p => p.id === 11)).toBe(true);
    expect(c.outcome.roundScore).toEqual(roundScore(winner, c.outcome.scoring.totalTay, { winMethod: 'tsumo' }));
  });

  for (const winner of ['dong', 'nan'] as const) {
    for (const robbing of [false, true]) {
      it.each([['open', [openJia]], ['concealed', []], ['concealed kong', [ankong]]] as const)(`${winner} ${robbing ? 'robbing kong' : 'discard'} win: %s`, (_label, melds) => {
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
        expect(c.outcome.roundScore).toEqual(roundScore(winner, c.outcome.scoring.totalTay, { winMethod: robbing ? 'chiong_kong' : 'ron', discarder: 'bei' }));
        expect(loadGameHistory(storage)[0]).toMatchObject({ roundScore: c.outcome.roundScore, koin: c.outcome.scoring.totalTay * 4 });
        expect(c.match!.tayTotal[winner]).toBe(c.outcome.scoring.totalTay);
        expect(c.match!.koinTotal.bei).toBe(-2 * c.outcome.scoring.totalTay);
      });
    }
  }
});

describe('Round Score house rule', () => {
  it('ce mo 5 Tay pays +30 / -10 / -10 / -10', () => {
    expect(roundScore('dong', 5, { winMethod: 'tsumo' })).toEqual({ kind: 'ce_mo', tay: 5, payer: null, deltas: { dong: 30, nan: -10, xi: -10, bei: -10 } });
  });
  it.each(['ron', 'chiong_kong'] as const)('%s charges the discarder or kong declarer twice', winMethod => {
    expect(roundScore('dong', 5, { winMethod, discarder: 'nan' })).toEqual({ kind: winMethod === 'ron' ? 'buangan' : 'chiong_kong', tay: 5, payer: 'nan', deltas: { dong: 20, nan: -10, xi: -5, bei: -5 } });
  });
  it('is kit-kit over every winner, payer, method and Tay from 5 to 80', () => {
    for (const winner of ['dong', 'nan', 'xi', 'bei'] as const) for (const discarder of ['dong', 'nan', 'xi', 'bei'] as const) {
      if (winner === discarder) continue;
      for (const winMethod of ['tsumo', 'ron', 'chiong_kong'] as const) for (let tay = 5; tay <= 80; tay++) {
        expect(Object.values(roundScore(winner, tay, { winMethod, discarder }).deltas).reduce((a, b) => a + b, 0)).toBe(0);
      }
    }
  });
  it('requires a real opponent for discard wins', () => {
    expect(() => roundScore('dong', 5, { winMethod: 'ron' })).toThrow();
    expect(() => roundScore('dong', 5, { winMethod: 'ron', discarder: 'dong' })).toThrow();
  });
  it('Seri, invalid Hu and below-minimum Hu award zero koin and Hu', () => {
    for (const [winner, valid, tay] of [[null, false, 0], ['dong', false, 80], ['dong', true, 3]] as const) {
      const m = recordHand(createMatch(), winner, valid, tay, 0, { winMethod: 'tsumo' });
      expect(m.hands[0]!.roundScore).toBeNull();
      expect(Object.values(m.koinTotal)).toEqual([0, 0, 0, 0]);
      expect(m.huCount.dong).toBe(0);
    }
  });
  it('accumulates raw Tay separately and ranks by koin', () => {
    let m = recordHand(createMatch(), 'dong', true, 5, 0, { winMethod: 'ron', discarder: 'xi' });
    m = recordHand(m, 'nan', true, 5, 0, { winMethod: 'tsumo' });
    expect(m.tayTotal).toEqual({ dong: 5, nan: 5, xi: 0, bei: 0 });
    expect(m.koinTotal).toEqual({ dong: 10, nan: 25, xi: -20, bei: -15 });
    expect(standings(m).map(r => r.seat)).toEqual(['nan', 'dong', 'bei', 'xi']);
  });
  it('first to reach retains an earlier visit after a balance falls and returns', () => {
    let m = recordHand(createMatch(), 'dong', true, 5, 0, { winMethod: 'tsumo' });
    for (const winner of ['nan', 'xi', 'bei', 'dong'] as const) m = recordHand(m, winner, true, 5, 0, { winMethod: 'tsumo' });
    expect(m.koinTotal.dong).toBe(30);
    expect(m.reachedAt.dong).toBe(1);
  });
  it('ties use Hu, first to reach, then seat order', () => {
    const m = createMatch();
    m.koinTotal = { dong: 10, nan: 10, xi: 10, bei: 10 };
    m.huCount = { dong: 1, nan: 2, xi: 2, bei: 2 };
    m.reachedAt = { dong: 1, nan: 4, xi: 3, bei: 3 };
    expect(standings(m).map(r => r.seat)).toEqual(['xi', 'bei', 'nan', 'dong']);
  });
});

describe('v0.5.4 migration', () => {
  const legacy = { id: 'old', timestamp: 1, winner: 'dong', totalTay: 5, winMethod: 'tsumo', winningHand: [], scoringBreakdown: [], multiplier: 2, points: 10 };
  it('derives history koin from raw Tay and win facts, never old x2', () => {
    const store = new MemoryStorage();
    store.setItem(HISTORY_STORAGE_KEY, JSON.stringify([legacy, { ...legacy, id: 'ron', winMethod: 'ron', discarder: 'nan' }, { ...legacy, id: 'unknown', winMethod: 'ron' }]));
    const rows = loadGameHistory(store);
    expect(rows.find(r => r.id === 'old')).toMatchObject({ koin: 30, roundScore: { kind: 'ce_mo' } });
    expect(rows.find(r => r.id === 'ron')).toMatchObject({ koin: 20, roundScore: { payer: 'nan' } });
    expect(rows.find(r => r.id === 'unknown')).toMatchObject({ koin: 0, roundScore: null });
  });
  it('roundtrips koin and keeps an explicit Lew Fit null at zero', () => {
    const store = new MemoryStorage();
    const data = { winner: 'nan' as const, winningHand: [], winningTile: null, scoringBreakdown: [], totalTay: 5, isWithKim: false, winMethod: 'ron' as const, discarder: 'dong' as const, durationSeconds: 1 };
    const record = saveGameRecord({ ...data, roundScore: roundScore('nan', 5, data) }, store);
    expect(loadGameHistory(store)[0]).toMatchObject({ ...record!, koin: 20 });
    saveGameRecord({ ...data, roundScore: null }, store);
    expect(loadGameHistory(store)[0]).toMatchObject({ koin: 0, roundScore: null });
  });
  it('recomputes an in-progress snapshot and safely continues old hands with missing facts', () => {
    const raw = JSON.parse(JSON.stringify(createMatch()));
    delete raw.koinTotal;
    raw.tayTotal.dong = 10;
    raw.hands = [{ hand: 1, dealer: 'dong', prevailingWind: 'dong', winner: 'dong', totalTay: 5, multiplier: 2, points: 10, winMethod: 'tsumo' }, { hand: 2, dealer: 'nan', prevailingWind: 'dong', winner: 'nan', totalTay: 7, multiplier: 2, points: 14 }];
    const migrated = migrateMatchState(raw);
    expect(migrated.koinTotal).toEqual({ dong: 30, nan: -10, xi: -10, bei: -10 });
    expect(migrated.tayTotal).toEqual({ dong: 5, nan: 7, xi: 0, bei: 0 });
    expect(migrated.hands[1]!.roundScore).toBeNull();
    expect(recordHand(raw, null, false, 0).koinTotal).toEqual(migrated.koinTotal);
  });
});
