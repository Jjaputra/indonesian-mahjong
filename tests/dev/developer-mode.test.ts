import { describe, it, expect } from 'vitest';
import { parseHandCode, formatHandCode, devHandFromOutcome, type DevHand } from '@/dev/hand-code';
import { evaluateDevHand } from '@/dev/sandbox';
import { GameController } from '@/ui/game-controller';
import { getPreset, MemoryStorage, loadDevMode, saveDevMode, loadGameHistory } from '@/storage';
import { SEAT_ORDER } from '@/core/tiles';
import type { GameEngineState } from '@/core/game-engine';
import type { Tile, TileFace } from '@/core/types';
const settings = { ...getPreset('tournament'), kimEnabled: false, kimMode: 'off' as const, startingSeatWind: 'dong' as const, minHuTay: 0 };
function parse(code: string): DevHand { const result = parseHandCode(code); if (!result.ok) throw new Error(result.error); return result.hand; }
const base = '123m456p789s EEE Zh | win Zh ce_mo';
const face = (t: TileFace): TileFace => ({ type: t.type, value: t.value });
function inventory(c: GameController) {
  const s = c.getState(), w = s.wall.serialize();
  const tiles = [...w.tiles.slice(w.headIndex, w.tailIndex + 1), ...SEAT_ORDER.flatMap(seat => { const p = s.players[seat]; return [...p.hand, ...p.flowers, ...p.discards, ...p.melds.flatMap(m => m.tiles)]; }), ...(s.discardPending ? [s.discardPending.tile] : [])];
  return tiles.map(t => `${t.id}:${t.type}:${t.value}:${!!t.isKim}`).sort();
}
function controller(seed = 1) { return new GameController({ settings, seed, devMode: true, storage: new MemoryStorage() }); }
function setFixture(c: GameController, code: string) {
  const hand = parse(code), s = c.getState() as GameEngineState;
  let id = 0; const tile = (f: TileFace): Tile => ({ ...f, id: `fixture-${id++}`, isKim: f.type === 'kim' || (!!hand.kimFace && f.type === hand.kimFace.type && f.value === hand.kimFace.value) });
  const p = s.players.dong;
  p.hand = hand.concealed.map(tile); p.flowers = [...hand.bonus.bunga.map(value => tile({ type: 'flower', value })), ...hand.bonus.musim.map(value => tile({ type: 'season', value }))];
  p.melds = hand.melds.map(m => ({ type: m.type, tiles: m.faces.map(tile) }));
  p.isPaoChin = !!hand.flags.paoChin;
  s.kimFace = hand.kimFace; s.consecutiveKongs = hand.flags.consecutiveKongs ?? 0;
  s.turnCount = hand.flags.initialDealtHand ? 1 : 5;
  if (!hand.flags.firstGoAround) s.players.bei.discards = [{ id: 'old-discard', type: 'tong', value: 9 }, { id: 'old-discard2', type: 'tong', value: 8 }];
  if (hand.win.method === 'tsumo') { p.hand.push(tile(hand.winningTile)); s.phase = 'ACTION_DECISION'; s.selfDrawSeat = 'dong'; }
  else { s.phase = 'CLAIM_WINDOW'; s.discardPending = { tile: tile(hand.winningTile), discarder: hand.win.discarder!, isPromotedKong: hand.win.method === 'chiong_kong' }; }
}
describe('developer hand codes', () => {
  for (const method of ['ce_mo','buangan:S','chiong_kong:W']) it(`round trips ${method}, all melds, bonus and Kim`, () => {
    const code = `K | pung 555s | kong 7777p | ankong NNNN | jia 234s | bunga 1 3 | musim 2 | win K ${method} | kim 3m | seat E | round S | flags first,paochin,kong1,initial`;
    const h = parse(code); expect(parse(formatHandCode(h))).toEqual(h);
  });
  for (const code of [base.replace('123m','12x'), base.replace('EEE','EEEEE'), base.replace('EEE','EE'), base + ' | wat 3', base + ' | bunga 1 1', base.replace('ce_mo','buangan:Q'), base + ' | jia 111m', base + ' | flags what']) it(`rejects ${code}`, () => { const r = parseHandCode(code); expect(r.ok).toBe(false); if (!r.ok) expect(r.error).toMatch(/Token|tile/i); });
  it('requires win and reports the bad token', () => { expect(parseHandCode('123x')).toEqual({ ok: false, error: 'Token tidak valid: "123x".' }); expect(parseHandCode('123m')).toEqual({ ok: false, error: 'Token wajib belum ada: "win".' }); });
});
describe('live outcome sandbox parity', () => {
  const fixtures = [
    ['Ce Mo', base],
    ['Buangan', base.replace('ce_mo','buangan:S')],
    ['Chiong Kong', base.replace('ce_mo','chiong_kong:S')],
    ['Pao Chin first draw', base + ' | flags first,paochin'],
    ['opening deal', base + ' | flags first,initial'],
    ['Kim pair', '123m456p789s EEE K | win K ce_mo'],
    ['flowers', base + ' | bunga 1 3 | musim 1 2 4'],
    ['kong replacement', '123m456p789s Zh | ankong NNNN | win Zh ce_mo | flags kong2'],
    ['natural Kim', '123m456p789s EEE 3m | win 3m ce_mo | kim 3m'],
  ];
  for (const [name, code] of fixtures) it(`${name}: real controller outcome round trips with identical scoring and Round Score`, () => {
    const cfg = name === 'Kim pair' ? { ...settings, kimEnabled: true, kimMode: 'dedicated' as const } : name === 'natural Kim' ? { ...settings, kimEnabled: true, kimMode: 'natural' as const } : settings;
    const c = new GameController({ settings: cfg, seed: 1, devMode: true, storage: new MemoryStorage() });
    setFixture(c, code!);
    if (c.getState().phase === 'CLAIM_WINDOW') { c.humanClaim('hu'); c.runUntilHuman(); }
    else c.humanSelfDrawHu();
    expect(c.outcome?.kind).toBe('hu');
    if (c.outcome?.kind !== 'hu') throw new Error('no Hu');
    const hand = parse(formatHandCode(devHandFromOutcome(c.outcome, c.getState())));
    const evaluated = evaluateDevHand(hand, cfg);
    const withoutIds = (value: unknown) => JSON.parse(JSON.stringify(value, (key, v) => key === 'id' ? undefined : v));
    expect(withoutIds(evaluated.scoring)).toEqual(withoutIds(c.outcome.scoring));
    expect(evaluated.roundScore).toEqual(c.outcome.roundScore);
    expect(evaluated.seats).toEqual({ dong: 'dong', nan: 'nan', xi: 'xi', bei: 'bei' });
  });
});
describe('developer rig and records', () => {
  it('persists independently of settings and defaults off', () => { const storage = new MemoryStorage(); expect(loadDevMode(storage)).toBe(false); expect(saveDevMode(true, storage)).toBe(true); expect(loadDevMode(storage)).toBe(true); const c = new GameController({ settings, storage }); expect(c.devMode).toBe(true); c.setDevMode(false); expect(loadDevMode(storage)).toBe(false); });
  it('refuses both rigs when disabled', () => { const c = new GameController({ settings, devMode: false }); expect(() => c.devSetHand([])).toThrow(/developer/); expect(() => c.devSetNextDraw({ type: 'ban', value: 1 })).toThrow(/developer/); });
  for (const mode of ['off','dedicated','natural'] as const) it(`${mode}: preserves every physical tile and wall/indicator metadata`, () => {
    const c = new GameController({ settings: { ...settings, kimEnabled: mode !== 'off', kimMode: mode }, seed: 10, devMode: true, storage: new MemoryStorage() });
    const before = inventory(c), w = c.getState().wall.serialize();
    const pool = [...c.getState().players.dong.hand, ...w.tiles.slice(w.headIndex, w.tailIndex + 1)].filter(t => t.type !== 'flower' && t.type !== 'season');
    c.devSetHand(pool.slice(-c.getState().players.dong.hand.length).map(face));
    expect(inventory(c)).toEqual(before);
    const next = c.getState().wall.serialize(); const target = next.tiles[next.tailIndex]!;
    c.devSetNextDraw(target); expect(face(c.getState().wall.peekHead()!)).toEqual(face(target)); expect(inventory(c)).toEqual(before);
    expect(c.getState().wall.totalCount).toBe(mode === 'off' ? 144 : mode === 'dedicated' ? 148 : 143);
    expect(c.getState().wall.kimIndicator).toEqual(w.kimIndicator);
    expect(c.getState().wall.serialize().headIndex).toBe(w.headIndex);
    expect(c.getState().wall.serialize().tailIndex).toBe(w.tailIndex);
  });
  it('rejects impossible hand atomically', () => { const c = controller(); const before = inventory(c); expect(() => c.devSetHand(Array.from({ length: c.getState().players.dong.hand.length }, () => ({ type: 'ban', value: 1 })))).toThrow(/salinan/); expect(inventory(c)).toEqual(before); });
  it('marks matches dev, retains standings and suppresses history even after switching off', () => {
    const storage = new MemoryStorage(); const c = new GameController({ settings, seed: 1, devMode: true, storage }); c.startMatch();
    expect(c.match?.dev).toBe(true);
    const s = c.getState() as GameEngineState; s.dealerSeat = 'dong'; s.currentTurn = 'dong';
    setFixture(c, base); c.devSetHand(s.players.dong.hand.map(face)); c.setDevMode(false); c.humanSelfDrawHu();
    expect(c.outcome?.kind).toBe('hu'); expect(c.match?.hands).toHaveLength(1); expect(c.match?.huCount.dong).toBe(1); expect(loadGameHistory(storage)).toHaveLength(0);
  });
});

describe('developer exports from seeded live games', () => {
  for (const mode of ['off', 'dedicated', 'natural'] as const) it(`${mode}: exports real wall/deal/claim/draw outcomes with rotated chairs`, () => {
    let hu = 0;
    const cfg = { ...settings, kimEnabled: mode !== 'off', kimMode: mode, startingSeatWind: 'nan' as const };
    for (let seed = 1; seed <= 4; seed++) {
      const storage = new MemoryStorage();
      const c = new GameController({ settings: cfg, seed, devMode: true, storage });
      for (let n = 0; n < 3000 && !c.outcome; n++) {
        c.runUntilHuman(); if (c.outcome) break;
        const a = c.getHumanActions();
        if (a.canReplaceFlowers) c.humanReplaceFlowers();
        else if (a.claim) c.humanClaim(a.claim.canHu ? 'hu' : 'pass');
        else if (a.canDraw) c.humanDraw();
        else if (a.canSelfDrawHu) c.humanSelfDrawHu();
        else if (a.canDiscard) c.humanDiscard(a.discardableTileIds.at(-1)!);
      }
      expect(c.outcome).not.toBeNull(); expect(loadGameHistory(storage)).toHaveLength(0);
      if (c.outcome?.kind !== 'hu') continue;
      hu++;
      const h = parse(formatHandCode(devHandFromOutcome(c.outcome, c.getState())));
      const result = evaluateDevHand(h, cfg);
      expect(result.scoring.totalTay).toBe(c.outcome.scoring.totalTay);
      expect(result.scoring.patterns).toEqual(c.outcome.scoring.patterns);
      expect(result.scoring.isValidHu).toBe(c.outcome.scoring.isValidHu);
      expect(result.roundScore === null).toBe(c.outcome.roundScore === null);
      if (result.roundScore && c.outcome.roundScore) {
        const offset = SEAT_ORDER.indexOf(c.getState().dealerSeat);
        for (const chair of SEAT_ORDER) {
          const wind = SEAT_ORDER[(SEAT_ORDER.indexOf(chair) - offset + 4) % 4]!;
          expect(result.roundScore.deltas[wind]).toBe(c.outcome.roundScore.deltas[chair]);
        }
      }
    }
    expect(hu).toBeGreaterThan(0);
  });
  it('allows the human starting hand before a different dealer plays, then restricts rigging to their turn', () => {
    const c = new GameController({ settings: { ...settings, startingSeatWind: 'nan' }, seed: 1, devMode: true, storage: new MemoryStorage() });
    c.devSetHand(c.getState().players.dong.hand.map(face));
    const state = c.getState() as GameEngineState; state.turnCount = 2;
    expect(() => c.devSetHand(state.players.dong.hand.map(face))).toThrow(/giliran/);
  });
});

