import { describe, it, expect } from 'vitest';
import { kongPayment, createMatch, recordHand, migrateMatchState, roundScore } from '@/ui/match';
import { gameDeltas } from '@/core/round-score';
import { SEAT_ORDER, keyToTile, parseTileHand } from '@/core/tiles';
import type { Seat } from '@/core/types';
import type { GameEngineState } from '@/core/game-engine';
import { GameController } from '@/ui/game-controller';
import { MemoryStorage, getPreset, saveGameRecord, loadGameHistory } from '@/storage';
import { evaluateDevHand } from '@/dev/sandbox';
import { parseHandCode } from '@/dev/hand-code';

const settings = { ...getPreset('tournament'), kimEnabled: false, kimMode: 'off' as const, minHuTay: 0, startingSeatWind: 'dong' as const };
const zero = () => ({ dong: 0, nan: 0, xi: 0, bei: 0 });
const sum = (d: Record<Seat, number>) => Object.values(d).reduce((a, b) => a + b, 0);
function sandbox(code: string) { const p = parseHandCode(code); if (!p.ok) throw new Error(p.error); return evaluateDevHand(p.hand, settings); }
function fixture(owner: Seat = 'dong', storage = new MemoryStorage()) {
  const c = new GameController({ settings, seed: 17, storage, strategy: { decideClaim: o => ({ seat: o.seat, action: 'pass' }), decideTurnAction: () => ({ type: 'discard', tileId: 'unused' }) } });
  const s = c.getState() as GameEngineState;
  s.phase = 'ACTION_DECISION'; s.currentTurn = owner; s.selfDrawSeat = owner;
  s.pendingClaims = {}; s.discardPending = null;
  for (const seat of SEAT_ORDER) { s.players[seat].melds = []; s.players[seat].hand = []; }
  return { c, s, p: s.players[owner], storage };
}
describe('Kong instant koin', () => {
  for (const owner of SEAT_ORDER) for (const [face, concealed, kind, n] of [
    [{ type: 'tong', value: 5 }, true, 'ankong', 2],
    [{ type: 'wind', value: 1 }, false, 'kong', 1],
    [{ type: 'dragon', value: 1 }, true, 'ankong_zhong', 4],
    [{ type: 'dragon', value: 1 }, false, 'kong_zhong', 2],
    [{ type: 'dragon', value: 2 }, true, 'ankong', 2],
    [{ type: 'dragon', value: 3 }, false, 'kong', 1],
  ] as const) it(`${owner} ${kind} ${face.type}/${face.value}`, () => {
    const p = kongPayment(owner, face, concealed);
    expect(p.kind).toBe(kind); expect(p.perPlayer).toBe(n); expect(p.deltas[owner]).toBe(3 * n);
    for (const other of SEAT_ORDER.filter(s => s !== owner)) expect(p.deltas[other]).toBe(-n);
    expect(sum(p.deltas)).toBe(0);
  });
  it('keeps Kong balances on Seri and Lew Fit and accumulates Hu plus all Kongs', () => {
    const a = kongPayment('dong', { type: 'tong', value: 1 }, true), b = kongPayment('xi', { type: 'dragon', value: 1 }, false);
    let m = recordHand(createMatch(), null, false, 0, 1, undefined, [a]);
    m = recordHand(m, 'nan', false, 4, 2, undefined, [b]);
    m = recordHand(m, 'bei', true, 5, 3, { winMethod: 'ron', discarder: 'dong' }, [a, b]);
    expect(m.hands[0]!.gameDeltas).toEqual(a.deltas); expect(m.hands[1]!.lewFit).toBe(true);
    const expected = gameDeltas(roundScore('bei', 5, { winMethod: 'ron', discarder: 'dong' }), [a, b, a, b]);
    expect(m.koinTotal).toEqual(expected);
    for (const h of m.hands) expect(sum(h.gameDeltas)).toBe(0);
    expect(migrateMatchState(m).koinTotal).toEqual(m.koinTotal);
  });
  it('migrates legacy match and history without inferring Kongs from melds', () => {
    const m = recordHand(createMatch(), 'dong', true, 5, 1, { winMethod: 'tsumo' });
    const raw = JSON.parse(JSON.stringify(m)); delete raw.hands[0].gameDeltas; delete raw.hands[0].kongPayments;
    expect(migrateMatchState(raw).hands[0]).toMatchObject({ kongPayments: [], gameDeltas: m.hands[0]!.roundScore!.deltas });
    const storage = new MemoryStorage();
    saveGameRecord({ winner: 'dong', winningHand: [], winningTile: null, scoringBreakdown: [], totalTay: 5, isWithKim: false, winMethod: 'tsumo', durationSeconds: 0 }, storage);
    expect(loadGameHistory(storage)[0]).toMatchObject({ kongPayments: [], gameDeltas: m.hands[0]!.roundScore!.deltas });
  });
  it('persists Kong-only Seri and reconstructs amounts defensively', () => {
    const storage = new MemoryStorage(), p = kongPayment('nan', { type: 'dragon', value: 1 }, true);
    saveGameRecord({ winner: null, winningHand: [], winningTile: null, scoringBreakdown: [], totalTay: 0, isWithKim: false, winMethod: 'draw', durationSeconds: 0, kongPayments: [p], gameDeltas: zero() }, storage);
    expect(loadGameHistory(storage)[0]).toMatchObject({ kongPayments: [p], gameDeltas: p.deltas });
  });
  for (const owner of ['dong', 'xi'] as const) it(`${owner} completes Ankong immediately, retains payment on wall-out, resets next hand`, () => {
    const { c, s, p, storage } = fixture(owner); c.match = createMatch();
    const quad = [1, 2, 3, 4].map(i => keyToTile('DZ', i)); p.hand = [...quad, ...parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 1S')];
    while (!s.wall.isEmpty) s.wall.drawHead();
    if (owner === 'dong') c.humanAnkong(0);
    else (c as unknown as { ankongFor(s: Seat, t: typeof quad): void }).ankongFor(owner, quad);
    const payment = kongPayment(owner, quad[0]!, true);
    expect(c.currentKongPayments).toEqual([payment]); expect(c.outcome).toMatchObject({ kind: 'seri', kongPayments: [payment], gameDeltas: payment.deltas });
    expect(c.match.koinTotal).toEqual(payment.deltas); expect(loadGameHistory(storage)[0]!.gameDeltas).toEqual(payment.deltas);
    expect(c.log.some(l => l.text.includes('tiap pemain bayar 4 koin'))).toBe(true);
    c.newGame(); expect(c.currentKongPayments).toEqual([]);
  });
  for (const owner of ['dong', 'xi'] as const) it(`${owner} charges Kakan only after passes`, () => {
    const { c, s, p } = fixture(owner); const q = [1, 2, 3, 4].map(i => keyToTile('DF', i));
    p.melds = [{ type: 'pung', tiles: q.slice(0, 3), claimedFrom: 'nan' }]; p.hand = [q[3]!, ...parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 1S')];
    if (owner === 'dong') c.humanKakan(0); else (c as unknown as { kakanFor(s: Seat, id: string, i: number): void }).kakanFor(owner, q[3]!.id, 0);
    expect(c.currentKongPayments).toEqual([]);
    if (owner !== 'dong' && c.getHumanActions().claim) c.humanClaim('pass');
    c.step(); c.step();
    expect(p.melds[0]!.type).toBe('kong'); expect(p.melds[0]!.fromConcealedTriplet).toBeUndefined(); expect(c.currentKongPayments).toEqual([kongPayment(owner, q[0]!, false)]);
    expect(s.phase).toBe('ACTION_DECISION');
  });
  it('robbed Kakan has no payment and leaves the exposed Pung', () => {
    const { c, s, p } = fixture('xi'); const q = [1, 2, 3, 4].map(i => keyToTile('DF', i));
    p.melds = [{ type: 'pung', tiles: q.slice(0, 3), claimedFrom: 'nan' }]; p.hand = [q[3]!, ...parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 1S')];
    s.players.dong.hand = parseTileHand('DF 1T 2T 3T 4S 5S 6S 7B 8B 9B 1S 2S 3S');
    (c as unknown as { kakanFor(s: Seat, id: string, i: number): void }).kakanFor('xi', q[3]!.id, 0);
    expect(c.getHumanActions().claim?.canHu).toBe(true); c.humanClaim('hu'); c.step(); c.step();
    expect(c.outcome).toMatchObject({ kind: 'hu', winMethod: 'chiong_kong', kongPayments: [] });
    expect(c.currentKongPayments).toEqual([]); expect(p.melds[0]!.type).toBe('pung');
  });
  it('claimed Kong charges all opponents when resolution completes', () => {
    const { c, s, p } = fixture();
    p.hand = [...[1, 2, 3].map(i => keyToTile('DZ', i)), ...parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 1S')];
    s.phase = 'CLAIM_WINDOW'; s.discardPending = { discarder: 'nan', tile: keyToTile('DZ', 4) };
    c.humanClaim('kong'); expect(c.currentKongPayments).toEqual([]); c.step(); c.step();
    expect(p.melds[0]!.type).toBe('kong'); expect(p.melds[0]!.fromConcealedTriplet).toBe(true); expect(c.currentKongPayments).toEqual([kongPayment('dong', keyToTile('DZ'), false)]);
  });
  it('sandbox returns winner Kong payments without altering hand codes', () => {
    const r = sandbox('123m Zh | ankong NNNN | kong 7777p | kong 5555s | win Zh ce_mo | seat S');
    expect(r.kongPayments.map(p => p.perPlayer)).toEqual([2, 1, 1]);
    expect(r.kongPayments.every(p => p.owner === 'nan')).toBe(true);
    expect(r.gameDeltas).toEqual(gameDeltas(r.roundScore, r.kongPayments)); expect(sum(r.gameDeltas)).toBe(0);
  });
  it('natural Kim concealed Kong follows normal face table', () => {
    const parsed = parseHandCode('123m456p789s Zh | ankong NNNN | win Zh ce_mo | kim N'); if (!parsed.ok) throw new Error(parsed.error);
    const r = evaluateDevHand(parsed.hand, { ...settings, kimEnabled: true, kimMode: 'natural' });
    expect(r.kongPayments[0]!.perPlayer).toBe(2);
  });
  for (const [concealed, code, id] of [
    [true, '111m222p345s Zh | ankong NNNN | win Zh ce_mo', 33],
    [true, '111m222p333s Zh | ankong NNNN | win Zh ce_mo', 34],
    [false, '111m222p345s Zh | kakan NNNN | win Zh ce_mo', 33],
    [false, '111m222p333s Zh | kakan NNNN | win Zh ce_mo', 34],
  ] as const) it(`Am Kang #${id}: ${concealed ? 'Ankong counts' : 'exposed Kong excluded'}`, () => {
    const r = sandbox(code); expect(r.scoring.patterns.some(p => p.id === id)).toBe(concealed);
  });
});
