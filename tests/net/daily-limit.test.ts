import { describe, expect, it } from 'vitest';
import { MemoryStorage, type StorageLike } from '../../src/storage';
import { countHostedMatch, identifyHostedMatch, remainingMatches, wibDay } from '../../src/net/daily-limit';

const now = Date.parse('2026-11-21T10:00:00Z');
describe('daily online match limit', () => {
  it.each([
    ['2026-11-20T16:59:00Z', '2026-11-20'], // 23:59 WIB
    ['2026-11-20T17:00:00Z', '2026-11-21'], // 00:00 WIB, before UTC midnight
    ['2026-11-20T23:59:00Z', '2026-11-21'],
    ['2026-11-21T00:00:00Z', '2026-11-21'], // UTC midnight does not reset WIB
    ['2026-11-21T16:59:00Z', '2026-11-21'],
    ['2026-11-21T17:00:00Z', '2026-11-22'],
  ])('uses WIB day for %s', (time, day) => expect(wibDay(Date.parse(time))).toBe(day));

  it('allows five starts and never returns a negative remaining count', () => {
    const storage = new MemoryStorage();
    for (let i = 0; i < 6; i++) {
      expect(remainingMatches(now, storage)).toBe(Math.max(0, 5 - i));
      countHostedMatch('ABC234', i, now, storage);
    }
    expect(remainingMatches(now, storage)).toBe(0);
  });
  it('dedupes by room and match identity, including seating and subsequent views', () => {
    const storage = new MemoryStorage();
    countHostedMatch('ABC234', 'seating:15000', now, storage);
    countHostedMatch('ABC234', 'seating:15000', now, storage);
    identifyHostedMatch('ABC234', 123, now, storage);
    countHostedMatch('ABC234', 123, now, storage);
    expect(remainingMatches(now, storage)).toBe(4);
    countHostedMatch('XYZ234', 123, now, storage);
    expect(remainingMatches(now, storage)).toBe(3);
  });
  it('expires old days, including a seating identity resolved the following day', () => {
    const storage = new MemoryStorage();
    const before = Date.parse('2026-11-21T16:59:00Z'), after = Date.parse('2026-11-21T17:00:00Z');
    countHostedMatch('ABC234', 'seating:1', before, storage);
    expect(remainingMatches(before, storage)).toBe(4);
    identifyHostedMatch('ABC234', 123, after, storage);
    expect(remainingMatches(after, storage)).toBe(5);
    countHostedMatch('ABC234', 456, after, storage);
    expect(storage.getItem('itm.mp.daily-matches.v1')).not.toContain('seating:1');
  });
  it.each(['2026-11-20', '2026-11-21'])('makes remaining-count reads pure for stored day %s', day => {
    let writes = 0;
    const storage: StorageLike = {
      getItem: () => JSON.stringify({ day, matches: ['old'] }),
      setItem: () => { writes++; }, removeItem: () => { writes++; },
    };
    for (let i = 0; i < 10; i++) expect(remainingMatches(now, storage)).toBe(day === '2026-11-20' ? 5 : 4);
    expect(writes).toBe(0);
  });
  it.each(['count', 'identify'])('merges a competing tab update immediately before %s writes', operation => {
    const base = new MemoryStorage();
    countHostedMatch('ABC234', 'seating:15000', now, base);
    let reads = 0;
    const storage: StorageLike = {
      getItem: key => {
        const value = base.getItem(key);
        if (++reads === 1) countHostedMatch('XYZ234', 789, now, base);
        return value;
      },
      setItem: (key, value) => base.setItem(key, value), removeItem: key => base.removeItem(key),
    };
    if (operation === 'count') countHostedMatch('DEF234', 456, now, storage);
    else identifyHostedMatch('ABC234', 123, now, storage);
    expect(remainingMatches(now, base)).toBe(operation === 'count' ? 2 : 3);
    expect(base.getItem('itm.mp.daily-matches.v1')).toContain('XYZ234');
  });
  it('keeps provisional aliases while merging counts and identifies later rematches', () => {
    const storage = new MemoryStorage();
    countHostedMatch('ABC234', 'seating:1', now, storage);
    identifyHostedMatch('ABC234', 123, now, storage);
    countHostedMatch('ABC234', 'seating:1', now, storage);
    countHostedMatch('ABC234', 'seating:2', now, storage);
    identifyHostedMatch('ABC234', 456, now, storage);
    countHostedMatch('ABC234', 456, now, storage);
    expect(remainingMatches(now, storage)).toBe(3);
  });
  it.each(['read', 'write', 'malformed'])('allows play with %s storage failure', failure => {
    const storage: StorageLike = {
      getItem: () => { if (failure === 'read') throw new Error('blocked'); return failure === 'malformed' ? '{broken' : JSON.stringify({ day: wibDay(now), matches: ['1', '2', '3', '4', '5'] }); },
      setItem: () => { throw new Error('blocked'); }, removeItem: () => {},
    };
    expect(() => countHostedMatch('ABC234', 1, now, storage)).not.toThrow();
    expect(remainingMatches(now, storage)).toBe(5);
  });
});
