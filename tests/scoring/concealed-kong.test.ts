import { describe, expect, it } from 'vitest';
import { parseHandCode, formatHandCode, devHandFromOutcome, type DevHand } from '@/dev/hand-code';
import { evaluateDevHand } from '@/dev/sandbox';
import { getPreset, MemoryStorage, saveGameRecord, loadGameHistory } from '@/storage';
import { countOpenSets, countConcealedTripletKinds } from '@/scoring/hand-parser';
import { scoringEngine, type ScoringResult } from '@/scoring';
import { GameController, type HuOutcome } from '@/ui/game-controller';
import { keyToTile, parseTileHand } from '@/core/tiles';
import type { Meld } from '@/core/types';

const settings = { ...getPreset('tournament'), kimEnabled: false, kimMode: 'off' as const, minHuTay: 0 };
const base = '111m222p333s Zh';
// Equivalent to the report: two Kim-assisted triplets and a Xi Kong; other faces were not supplied.
const kimBase = '11m9m22p9m333s Zh';
function parse(code: string): DevHand {
  const p = parseHandCode(code); if (!p.ok) throw new Error(p.error); return p.hand;
}
function evaluate(label: string, code: string) {
  const hand = parse(code);
  const r = evaluateDevHand(hand, { ...settings, kimEnabled: !!hand.kimFace, kimMode: hand.kimFace ? 'natural' : 'off' }).scoring;
  expect(r.isValidHu, r.rejectionReason).toBe(true);
  expect(r.notes.some(n => /tidak diberikan|perlu tepat/.test(n))).toBe(false);
  expect(r.rejected?.every(p => [33, 34, 42, 43, 44].includes(p.id))).toBe(true);
  for (const id of [33, 34, 42, 43, 44]) expect(r.rejected?.some(p => p.id === id)).toBe(!r.patterns.some(p => p.id === id));
  console.log(`${label}\n${r.patterns.map(p => `#${p.id} ${p.name}: ${p.tay} — ${p.description}`).join('\n')}\nRejected: ${r.rejected?.map(p => `#${p.id}: ${p.reason}`).join('; ')}`);
  return r;
}
function includes(r: ScoringResult, yes: number[], no: number[]) {
  for (const id of yes) expect(r.patterns.some(p => p.id === id), `missing #${id}`).toBe(true);
  for (const id of no) expect(r.patterns.some(p => p.id === id), `unexpected #${id}`).toBe(false);
}
const xiKong: Meld = { type: 'kong', tiles: [1, 2, 3, 4].map(i => keyToTile('WX', i)), claimedFrom: 'nan', fromConcealedTriplet: true };

describe('Kong on a concealed triplet house rule', () => {
  for (const withKim of [true, false]) it(`A: Xi Kong, three concealed triplets, Kim=${withKim}`, () => {
    const r = evaluate(`A ${withKim ? 'Kim' : 'no Kim'}`, `${withKim ? kimBase : base} | kong WWWW | win Zh ce_mo${withKim ? ' | kim 9m' : ''}`);
    includes(r, [34, 44], [33, 42]);
    expect(r.patterns.find(p => p.id === 34)?.tay).toBe(withKim ? 20 : 30);
    expect(r.patterns.find(p => p.id === 34)?.description).toContain('西 Kong');
    expect(r.patterns.find(p => p.id === 44)?.description).toContain('Kong dari buangan di atas tris tertutup');
  });
  for (const withKim of [true, false]) it(`A2: Ankong, Kim=${withKim}`, () => {
    const r = evaluate(`A2 ${withKim ? 'Kim' : 'no Kim'}`, `${withKim ? kimBase : base} | ankong WWWW | win Zh ce_mo${withKim ? ' | kim 9m' : ''}`);
    includes(r, [34, 44], [33, 42]);
    expect(r.patterns.find(p => p.id === 34)?.tay).toBe(withKim ? 20 : 30);
    expect(r.patterns.find(p => p.id === 44)?.description).not.toContain('Kong dari buangan');
  });
  it('B: two triplets, concealed Jia, claimed Kong', () => {
    const r = evaluate('B', '111m222p345s Zh | kong WWWW | win Zh ce_mo');
    includes(r, [33, 44], [34, 42]); expect(r.patterns.find(p => p.id === 33)?.tay).toBe(5);
  });
  it('C: discard completes the pair', () => {
    includes(evaluate('C', `${base} | kong WWWW | win Zh buangan:S`), [34, 43], [33, 42, 44]);
  });
  it('discard-completed triplet loses concealment while the declared Kong keeps it', () => {
    includes(evaluate('Discard triplet completion', '111m222p33s ZhZh | kong WWWW | win 3s buangan:S'), [33, 43], [34, 44]);
  });
  for (const set of ['pung 555m', 'jia 654m', 'kakan WWWW']) it(`D: ${set} opens the hand`, () => {
    const r = evaluate(`D ${set}`, `${base} | ${set} | win Zh ce_mo`);
    includes(r, [33, 42], [34, 43, 44]);
    expect(r.patterns.find(p => p.id === 42)?.description).toMatch(/terbuka: (Pung 5 Ban|Jia 4 Ban|Kong tambahan 西)/);
    const ron = evaluateDevHand(parse(`${base} | ${set} | win Zh buangan:S`), settings).scoring;
    includes(ron, [], [43, 44]);
  });
  it('keeps Tan Tiau counting a concealed-triplet Kong as a claim', () => {
    includes(evaluate('Tan Tiau', 'Zh | kong WWWW | pung 111m | pung 222p | jia 345s | win Zh ce_mo'), [41, 42], [43, 44]);
    expect(countOpenSets([xiKong])).toBe(0);
  });
  it('keeps claimed Kong and Zhong payments at 1 and 2', () => {
    for (const [face, amount] of [['WWWW', 1], ['ZhZhZhZh', 2]] as const) {
      const r = evaluateDevHand(parse(`111m222p333s E | kong ${face} | win E ce_mo`), settings);
      expect(r.kongPayments[0]?.perPlayer).toBe(amount);
      expect(r.kongPayments[0]?.kind).toBe(amount === 2 ? 'kong_zhong' : 'kong');
    }
  });
  it('persists marker through storage; legacy plain Kong remains open', () => {
    const storage = new MemoryStorage();
    saveGameRecord({ winner: 'dong', winningHand: [], melds: [xiKong, { ...xiKong, fromConcealedTriplet: undefined }], winningTile: null, scoringBreakdown: [], totalTay: 0, isWithKim: false, winMethod: 'tsumo', durationSeconds: 0 }, storage);
    const melds = loadGameHistory(storage)[0]!.melds!;
    expect(melds[0]).toMatchObject({ type: 'kong', claimedFrom: 'nan', fromConcealedTriplet: true });
    expect(melds[0]!.tiles.map(t => t.id)).toEqual(xiKong.tiles.map(t => t.id)); expect(melds[1]!.fromConcealedTriplet).toBeUndefined();
  });
  for (const type of ['kong', 'kakan'] as const) it(`round-trips ${type} in code and from outcome`, () => {
    const hand = parse(`${base} | ${type} WWWW | win Zh ce_mo`); expect(parse(formatHandCode(hand))).toEqual(hand);
    const controller = new GameController({ settings, seed: 1, devMode: true, storage: new MemoryStorage() });
    const meld = { ...xiKong, fromConcealedTriplet: type === 'kong' ? true as const : undefined };
    const win = keyToTile('DZ', 2);
    const outcome = { hand: [...parseTileHand('1B 1B 1B 2T 2T 2T 3S 3S 3S DZ'), win], winningTile: win, melds: [meld], flowers: [], winMethod: 'tsumo', winner: 'dong' } as unknown as HuOutcome;
    expect(devHandFromOutcome(outcome, controller.getState()).melds[0]?.type).toBe(type);
  });
  it('counts a claimed concealed-triplet Kong for instant Si Am Kang', () => {
    const tiles = parseTileHand('1B 1B 1B 2T 2T 2T 3S 3S 3S 5T');
    expect(countConcealedTripletKinds(tiles, [xiKong])).toBe(4);
    expect(countConcealedTripletKinds(tiles, [{ ...xiKong, fromConcealedTriplet: undefined }])).toBe(3);
    const r = scoringEngine.evaluateHand(tiles, [xiKong], [], { winningTile: tiles[9]!, isSelfDraw: true, isDiscardWin: false, isInitialDeal: false, isPaoChin: false, isRobbingKong: false, isSelfRobbingKong: false, isKongReplacement: false, isDoubleKongReplacement: false, seatWind: 'dong', roundWind: 'dong', isInstantHu: true }, { kimEnabled: false, minHuTay: 0 });
    includes(r, [34], []);
  });
});

