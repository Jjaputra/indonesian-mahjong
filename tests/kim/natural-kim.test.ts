import { describe, it, expect } from 'vitest';

import { createGameWall } from '../../src/core/wall';

import { createCompleteTileSet } from '../../src/core/tiles';

import { GameEngine } from '../../src/core/game-engine';

import type { Tile } from '../../src/core/types';

import { KimValidator } from '../../src/kim/kim-validator';

import { findWinningDecompositions, isKim } from '../../src/kim/wildcard-solver';

import { ScoringEngine } from '../../src/scoring';
import { scoreDecomposition } from '../../src/scoring/scoring-engine';
import { parseHandFeatures } from '../../src/scoring/hand-parser';

import { buildWinContext, toFullRules } from '../../src/ui/win-context';

import { PLAYER_NAME, SEAT_LABEL } from '../../src/ui/labels';
import { buildHuReceipt } from '../../src/ui/tay-calculator';
import { buildObservation, chooseDiscard } from '../../src/ui/ai-controller';

import { getPreset, sanitizeSettings, MemoryStorage, saveSettings, loadSettings } from '../../src/storage';



const rules = { ...toFullRules(getPreset('tournament')), kimMode: 'natural' as const, scoringBasis: 'match_table' as const };

function hand(kimValue: number, missing: number): Tile[] {

  return [['tong', 1], ['tong', 2], ['tong', missing], ['sok', 1], ['sok', 2], ['sok', 3],

    ['ban', 4], ['ban', 5], ['ban', 6], ['wind', 1], ['wind', 1], ['wind', 1], ['dragon', 2], ['dragon', 2]]

    .map(([type, value], i) => i === 2 ? { id: `k${i}`, type: 'tong', value: kimValue, isKim: true } : { id: `t${i}`, type, value }) as Tile[];

}

const score = (tiles: Tile[]) => new ScoringEngine().evaluateHand(tiles, [], [], buildWinContext('nan', 'dong', tiles[13]!, {

  isSelfDraw: true, isRobbingKong: false, consecutiveKongs: 0, isFirstGoAround: false, isPaoChin: false,

}), rules);



describe('Natural Kim', () => {

  it('conserves 143 in-play physical tiles plus an indicator including eight bonuses and marks exactly four copies of one face', () => {

    for (let seed = 1; seed <= 40; seed++) {

      const { wall, kimFace, kimIndicator } = createGameWall('natural', seed);

      const tiles = wall.serialize().tiles;

      expect(tiles).toHaveLength(143);

      expect(new Set(tiles.map(t => t.id)).size).toBe(143);

      expect(tiles.filter(t => t.type === 'flower' || t.type === 'season')).toHaveLength(8);

      expect(tiles.filter(isKim)).toHaveLength(4);

      expect(tiles.filter(isKim).every(t => t.type === kimFace!.type && t.value === kimFace!.value)).toBe(true);

      const removed = createCompleteTileSet().filter(t => t.type !== 'kim' && !tiles.some(x => x.id === t.id));
      expect(removed).toHaveLength(1);
      expect(removed[0]).toMatchObject(kimIndicator!);
      expect(tiles.filter(t => t.type === kimIndicator!.type && t.value === kimIndicator!.value)).toHaveLength(3);

    }

  });

  it('seeds both shuffle and face deterministically', () => {

    expect(createGameWall('natural', 92)).toEqual(createGameWall('natural', 92));

    expect(new Set(Array.from({ length: 20 }, (_, seed) => JSON.stringify(createGameWall('natural', seed).kimFace))).size).toBeGreaterThan(1);

  });

  it('preserves dedicated/off and boolean compatibility', () => {

    expect(createGameWall('dedicated', 1).wall.totalCount).toBe(148);

    expect(createGameWall('off', 1).wall.serialize().tiles.some(isKim)).toBe(false);

    expect(createGameWall(true, 1).totalCount).toBe(148);

    expect(createGameWall(false, 1).totalCount).toBe(144);

  });

  it('awards Bo KIM and NK column for nominal use even in a Kim match', () => {

    const r = score(hand(3, 3));

    expect(r.isValidHu).toBe(true);

    expect(r.mode).toBe('NK');

    expect(r.isWithKim).toBe(false);

    expect(r.handKimCount).toBe(1);

    expect(r.patterns.find(p => p.id === 8)?.tay).toBe(3);

    expect(r.patterns.some(p => [7, 9, 30, 32, 40].includes(p.id))).toBe(false);

    expect(r.decomposition?.wildcardKimCount).toBe(0);

  });

  it('does not award Bo KIM when a Kim must act as joker', () => {

    const r = score(hand(9, 3));

    expect(r.isValidHu).toBe(true);

    expect(r.mode).toBe('K');

    expect(r.patterns.some(p => p.id === 8)).toBe(false);

    expect(r.decomposition?.wildcardKimCount).toBe(1);

  });

  it('selects the maximum Tay over natural and wildcard interpretations', () => {

    const tiles = hand(3, 3);

    expect(findWinningDecompositions({ hand: tiles, rules }).some(s => s.mode === 'NK')).toBe(true);

    expect(score(tiles).candidateCount).toBeGreaterThan(0);

    const k = tiles[2]!;

    expect(new KimValidator(rules).isNaturalKim(k, { ...k, isKim: false })).toBe(true);

  });

  it('arbitrates four-Kim natural and joker readings, and keeps instant Shi Kim available', () => {
    const faces: [Tile['type'], number][] = [['tong',3],['tong',3],['tong',3],['tong',3],['tong',1],['tong',2],['sok',4],['sok',5],['sok',6],['ban',7],['ban',8],['ban',9],['dragon',2],['dragon',2]];
    const tiles = faces.map(([type, value], i) => ({ id: `four-${i}`, type, value, isKim: i < 4 }));
    const context = buildWinContext('nan', 'dong', tiles[13]!, { isSelfDraw: true, isRobbingKong: false, consecutiveKongs: 0, isFirstGoAround: false, isPaoChin: false });
    const candidates = findWinningDecompositions({ hand: tiles, rules });
    const totals = candidates.map(solved => {
      const patterns = scoreDecomposition({ features: parseHandFeatures(solved, tiles, []), mode: solved.mode, flowers: [], context });
      if (solved.mode === 'NK') {
        expect(patterns.some(p => p.id === 8)).toBe(true);
        expect(patterns.some(p => [7,9,30,32,40].includes(p.id))).toBe(false);
      }
      return patterns.reduce((n, p) => n + p.tay, 0);
    });
    expect(candidates.some(s => s.mode === 'NK')).toBe(true);
    expect(score(tiles).totalTay).toBe(Math.max(...totals));
    expect(score(tiles).patterns.some(p => p.id === 9)).toBe(true);
    const instant = new ScoringEngine().evaluateHand(tiles, [], [], { ...context, isInstantHu: true }, rules);
    expect(instant.patterns.find(p => p.id === 9)?.tay).toBe(10);
  });
  it('never allows human or bots to discard natural Kim, or claim with it', () => {

    for (let seed = 0; seed < 20; seed++) {

      const { wall } = createGameWall('natural', seed);

      const engine = new GameEngine({ ...rules, kimDiscardAllowed: true, allowKimInMeldClaim: true }, wall);

      engine.startNewGame(true);

      const state = engine.getState();

      const legal = engine.getLegalActions('dong');

      const obs = buildObservation(state, 'dong', legal, 'hard', rules, 'supersede');

      const chosen = chooseDiscard(obs, () => 0.5);

      expect(state.players.dong.hand.find(t => t.id === chosen)?.isKim).not.toBe(true);

      for (const tile of state.players.dong.hand.filter(isKim)) {

        expect(legal.discardableTileIds).not.toContain(tile.id);

        expect(() => engine.discard('dong', tile.id)).toThrow();

        expect(new KimValidator(state.rules).canClaimDeclaration({ seat: 'dong', action: 'pung', meldTiles: [tile] }, { id: 'd', type: 'ban', value: 1 }).valid).toBe(false);

      }

      expect(state.players.dong.discards.some(isKim)).toBe(false);

    }

  });

  it('receipts use the rotated seat wind captured by seatWindOf at Hu time', () => {
    const tiles = hand(3, 3);
    const receipt = buildHuReceipt({ kind: 'hu', winner: 'nan', seatWind: 'dong', winningTile: tiles[13]!, winMethod: 'tsumo', hand: tiles, melds: [], flowers: [], scoring: score(tiles), roundScore: null, kongPayments: [], gameDeltas: { dong: 0, nan: 0, xi: 0, bei: 0 }, durationSeconds: 1 });
    expect(receipt).toContain(`Pemenang      : ${PLAYER_NAME.nan} — ${SEAT_LABEL.dong}`);
    expect(receipt).toContain('#8 Bo KIM: 3 Tay');
  });
  it('defaults fresh settings to natural and migrates explicit legacy settings', () => {

    expect(loadSettings(new MemoryStorage()).kimMode).toBe('natural');

    expect(sanitizeSettings({ kimEnabled: true }).kimMode).toBe('natural');

    expect(sanitizeSettings({ kimEnabled: false }).kimMode).toBe('off');

    expect(sanitizeSettings({ kimMode: 'invalid' }).kimMode).toBe('natural');

    const store = new MemoryStorage();

    saveSettings({ ...getPreset('tournament'), kimMode: 'dedicated' }, store);

    expect(loadSettings(store).kimMode).toBe('dedicated');

  });

});


describe('Natural Kim review regressions', () => {
  const settings = { ...getPreset('tournament'), kimMode: 'natural' as const, kimEnabled: true, soundEnabled: false };

  it('full natural-Kim games never discard, claim or meld a Kim and always finish', async () => {
    const { GameController } = await import('../../src/ui/game-controller');
    for (let seed = 1; seed <= 12; seed++) {
      const c = new GameController({ settings, seed: seed * 37, saveHistory: false });
      expect(c.getState().kimFace).toBeTruthy();
      let guard = 0;
      while (!c.outcome && guard++ < 5000) {
        c.runUntilHuman();
        if (c.outcome) break;
        const a = c.getHumanActions();
        expect(c.getState().players[c.humanSeat].hand.filter(isKim).every(t => !a.discardableTileIds.includes(t.id))).toBe(true);
        if (a.canReplaceFlowers) c.humanReplaceFlowers();
        else if (a.claim) c.humanClaim(a.claim.canHu ? 'hu' : a.claim.canPung ? 'pung' : 'pass');
        else if (a.canDraw) c.humanDraw();
        else if (a.canSelfDrawHu) c.humanSelfDrawHu();
        else if (a.canDiscard) c.humanDiscard(a.discardableTileIds[a.discardableTileIds.length - 1]!);
        else if (!c.step()) throw new Error(`stalled in ${c.getState().phase}`);
      }
      expect(c.outcome).not.toBeNull();
      const s = c.getState();
      for (const p of Object.values(s.players)) {
        expect(p.discards.some(isKim)).toBe(false);
        expect(p.melds.filter(m => m.type !== 'ankong').some(m => m.tiles.some(isKim))).toBe(false);
      }
    }
  });

  it('logs and receipts name a natural Kim by its printed face', async () => {
    const { getTileFace, tileText } = await import('../../src/ui/labels');
    const kim: Tile = { id: 'dragon-zhong-1', type: 'dragon', value: 1, isKim: true };
    expect(tileText(kim)).toBe('Naga Zhong (Kim)');
    expect(getTileFace(kim).tone).toBe('red');
    expect(tileText({ id: 'kim-0-1', type: 'kim', value: 0 })).toBe('KIM (Joker)');
  });

  it('an unreadable stored kimMode keeps an explicit Kim-off choice', () => {
    expect(sanitizeSettings({ kimEnabled: false, kimMode: 'bogus' } as never).kimMode).toBe('off');
    expect(sanitizeSettings({ kimEnabled: true, kimMode: 'bogus' } as never).kimMode).toBe('natural');
  });

  it('mixed nominal + joker use is never Bo KIM; an all-nominal honour triplet still reads Bo KIM when chosen', () => {
    const tiles = (spec: string, face: [string, number]) => spec.split(' ').map((k, i) => {
      const [v, s] = [Number(k[0]), k[1]];
      const type = ({ T: 'tong', S: 'sok', B: 'ban', D: 'dragon' } as Record<string, Tile['type']>)[s!]!;
      return { id: `x${i}`, type, value: v, ...(type === face[0] && v === face[1] ? { isKim: true } : {}) } as Tile;
    });
    const mixed = score(tiles('1T 2T 3T 4S 5S 6S 7B 8B 9B 5T 6T 7T 9S 5T', ['tong', 5]));
    expect(mixed.isValidHu).toBe(true);
    expect(mixed.mode).toBe('K');
    expect(mixed.patterns.some(p => p.id === 8)).toBe(false);
    const nominal = findWinningDecompositions({ hand: tiles('1T 2T 3T 4S 5S 6S 7B 8B 9B 9T 9T 1D 1D 1D', ['dragon', 1]), rules })
      .filter(s => s.mode === 'NK');
    expect(nominal.length).toBeGreaterThan(0);
    expect(nominal.every(s => s.melds.every(m => m.kimCount === 0))).toBe(true);
  });
});

describe('Natural Kim rule decisions (2026-11-11)', () => {
  const build = (spec: string, face: [Tile['type'], number]) => spec.split(' ').map((k, i) => {
    const type = ({ T: 'tong', S: 'sok', B: 'ban', W: 'wind', D: 'dragon' } as Record<string, Tile['type']>)[k[1]!]!;
    const value = Number(k[0]);
    return { id: `r${i}`, type, value, ...(type === face[0] && value === face[1] ? { isKim: true } : {}) } as Tile;
  });
  const evaluate = (tiles: Tile[], scoringBasis: 'match_table' | 'hand_kim_usage') =>
    new ScoringEngine().evaluateHand(tiles, [], [], buildWinContext('nan', 'dong', tiles[13]!, {
      isSelfDraw: true, isRobbingKong: false, consecutiveKongs: 0, isFirstGoAround: false, isPaoChin: false,
    }), { ...rules, scoringBasis });

  it('three natural Kim of one face form Kim Thi; two form Kim Ciok (max-Tay arbitration)', () => {
    const thi = evaluate(build('1T 2T 3T 4S 5S 6S 7B 8B 9B 9T 9T 1D 1D 1D', ['dragon', 1]), 'match_table');
    expect(thi.mode).toBe('K');
    expect(thi.patterns.find(p => p.id === 30)?.tay).toBe(30);
    expect(thi.patterns.some(p => p.id === 8)).toBe(false);
    const ciok = evaluate(build('1T 2T 3T 4S 5S 6S 7B 8B 9B 2T 3T 4T 1D 1D', ['dragon', 1]), 'match_table');
    expect(ciok.patterns.find(p => p.id === 32)?.tay).toBe(20);
  });

  it('#7 Tile KIM counts every physical Kim held in an Ada KIM hand', () => {
    // One 5T Kim completes 5-6-7 at its own face, the other stands in for 9S.
    const mixed = evaluate(build('1T 2T 3T 4S 5S 6S 7B 8B 9B 5T 6T 7T 9S 5T', ['tong', 5]), 'hand_kim_usage');
    expect(mixed.mode).toBe('K');
    expect(mixed.patterns.find(p => p.id === 7)?.tay).toBe(2);
  });

  it('Se Sam Pu Tat with every Kim at its own face scores 40 in both bases, like a Kim-free hand', () => {
    const spec = '1T 4T 7T 2S 5S 8S 3B 6B 9B 1W 2W 3W 4W 1D';
    for (const basis of ['match_table', 'hand_kim_usage'] as const) {
      const withKim = evaluate(build(spec, ['tong', 1]), basis);
      const kimFree = evaluate(build(spec, ['tong', 9]), basis);
      expect(kimFree.handKimCount).toBe(0);
      expect(withKim.handKimCount).toBe(1);
      expect(withKim.patterns.find(p => p.id === 39)?.tay).toBe(40);
      expect(kimFree.patterns.find(p => p.id === 39)?.tay).toBe(40);
      expect(withKim.mode).toBe(kimFree.mode);
      expect(withKim.totalTay).toBe(kimFree.totalTay);
    }
  });
});
