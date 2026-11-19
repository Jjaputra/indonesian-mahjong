import { describe, expect, it } from 'vitest';
import { parseTileHand, sortTiles } from '@/core/tiles';
import { applyHandOrder, isNewHand, mergeHandOrder, moveInOrder } from '@/ui/hand-order';
import { loadAutoArrange, saveAutoArrange } from '@/storage';
import { botStepDelay } from '@/ui/practice-pace';

const hand = parseTileHand('1T 5S 3B 7T 2T');
const ids = hand.map((t) => t.id);

describe('hand order (manual arrange)', () => {
  it('starts sorted for an empty previous order or a brand-new hand', () => {
    const order = mergeHandOrder([], hand);
    expect(order).toHaveLength(5);
    expect(mergeHandOrder(['gone-1', 'gone-2'], hand)).toEqual(order);
  });

  it('keeps the previous order, drops removed tiles, appends new ones at the right', () => {
    const prev = [ids[3]!, ids[0]!, ids[4]!, ids[1]!, ids[2]!];
    const afterDiscard = hand.filter((t) => t.id !== ids[4]);
    expect(mergeHandOrder(prev, afterDiscard)).toEqual([ids[3], ids[0], ids[1], ids[2]]);
    const [fresh] = parseTileHand('9B');
    expect(mergeHandOrder(prev, [...hand, fresh!])).toEqual([...prev, fresh!.id]);
  });

  it('applyHandOrder lays tiles out by id and puts unknown ones last', () => {
    const out = applyHandOrder([ids[2]!, ids[0]!], hand);
    expect(out.map((t) => t.id)).toEqual([ids[2], ids[0], ids[1], ids[3], ids[4]]);
  });

  it('moveInOrder moves one id to an index (clamped)', () => {
    expect(moveInOrder(['a', 'b', 'c', 'd'], 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveInOrder(['a', 'b', 'c', 'd'], 'd', 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'a', 99)).toEqual(['b', 'c', 'a']);
  });
});

describe('auto-arrange preference', () => {
  it('defaults on and remembers the choice', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    expect(loadAutoArrange(storage)).toBe(true);
    saveAutoArrange(false, storage);
    expect(loadAutoArrange(storage)).toBe(false);
  });
});

describe('bot step delay', () => {
  it('discard 1.5-3 s, claim steps 0.6-1 s, with variation; fast/off unchanged', () => {
    expect(botStepDelay('learn', 'ACTION_DECISION', () => 0)).toBe(1500);
    expect(botStepDelay('learn', 'TURN_DRAW', () => 1)).toBe(3000);
    expect(botStepDelay('normal', 'ACTION_DECISION', () => 0.5)).toBe(2250);
    expect(botStepDelay('learn', 'CLAIM_WINDOW', () => 0)).toBe(600);
    expect(botStepDelay('learn', 'CLAIM_WINDOW', () => 1)).toBe(1000);
    expect(botStepDelay('learn', 'FLOWER_REPLACEMENT')).toBe(1800);
    expect(botStepDelay('fast', 'ACTION_DECISION')).toBe(300);
    expect(botStepDelay('off', 'CLAIM_WINDOW')).toBe(60);
  });
});

describe('new hand detection (ids repeat every hand)', () => {
  it('flags a changed match hand or an emptied pool, not normal play', () => {
    expect(isNewHand({ key: 0, trail: 5 }, { key: 0, trail: 6 })).toBe(false);
    expect(isNewHand({ key: 0, trail: 5 }, { key: 0, trail: 5 })).toBe(false);
    expect(isNewHand({ key: 0, trail: 30 }, { key: 1, trail: 30 })).toBe(true);
    expect(isNewHand({ key: 0, trail: 30 }, { key: 0, trail: 0 })).toBe(true);
  });

  it('a reused-id hand restarts sorted when the order is reset', () => {
    const prev = [ids[3]!, ids[0]!, ids[4]!, ids[1]!, ids[2]!];
    expect(mergeHandOrder(prev, hand)).toEqual(prev);
    expect(mergeHandOrder([], hand)).toEqual(sortTiles(hand).map((t) => t.id));
  });
});
