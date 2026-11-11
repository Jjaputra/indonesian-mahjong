import { describe, it, expect } from 'vitest';
import {
  createCompleteTileSet,
  tileToKey,
  keyToTile,
  parseTileHand,
  getTileIndonesianLabel,
  getTileUnicode,
  getTileSortWeight,
  compareTiles,
  sortTiles,
  isSameTile,
  isSameKind,
  isSuited,
  isHonor,
  isBonus,
  isKim,
  isTerminal,
  isYau,
  SUITS,
  WINDS,
  DRAGONS,
  SEATS,
  WIND_TO_VALUE,
  VALUE_TO_WIND,
  DRAGON_TO_VALUE,
  VALUE_TO_DRAGON,
  NEXT_SEAT,
  PREV_SEAT,
} from '@/core/tiles';

describe('Tile Domain Model (148-Tile Set)', () => {
  it('generates exactly 148 tiles', () => {
    const tiles = createCompleteTileSet();
    expect(tiles.length).toBe(148);
  });

  it('contains exactly 108 suited tiles (36 Tong, 36 Sok, 36 Ban) with 4 copies of 1-9 each', () => {
    const tiles = createCompleteTileSet();
    const tong = tiles.filter((t) => t.type === 'tong');
    const sok = tiles.filter((t) => t.type === 'sok');
    const ban = tiles.filter((t) => t.type === 'ban');

    expect(tong.length).toBe(36);
    expect(sok.length).toBe(36);
    expect(ban.length).toBe(36);

    for (let val = 1; val <= 9; val++) {
      expect(tong.filter((t) => t.value === val).length).toBe(4);
      expect(sok.filter((t) => t.value === val).length).toBe(4);
      expect(ban.filter((t) => t.value === val).length).toBe(4);
    }
  });

  it('contains exactly 28 honors (16 winds, 12 dragons)', () => {
    const tiles = createCompleteTileSet();
    const winds = tiles.filter((t) => t.type === 'wind');
    const dragons = tiles.filter((t) => t.type === 'dragon');

    expect(winds.length).toBe(16);
    expect(dragons.length).toBe(12);

    for (let val = 1; val <= 4; val++) {
      expect(winds.filter((t) => t.value === val).length).toBe(4);
    }
    for (let val = 1; val <= 3; val++) {
      expect(dragons.filter((t) => t.value === val).length).toBe(4);
    }
  });

  it('contains exactly 8 bonus tiles (4 Bunga, 4 Musim)', () => {
    const tiles = createCompleteTileSet();
    const flowers = tiles.filter((t) => t.type === 'flower');
    const seasons = tiles.filter((t) => t.type === 'season');

    expect(flowers.length).toBe(4);
    expect(seasons.length).toBe(4);

    for (let val = 1; val <= 4; val++) {
      expect(flowers.filter((t) => t.value === val).length).toBe(1);
      expect(seasons.filter((t) => t.value === val).length).toBe(1);
    }
  });

  it('contains exactly 4 Kim joker tiles', () => {
    const tiles = createCompleteTileSet();
    const kims = tiles.filter((t) => t.type === 'kim' || t.isKim);

    expect(kims.length).toBe(4);
    for (const k of kims) {
      expect(k.type).toBe('kim');
      expect(k.value).toBe(0);
      expect(k.isKim).toBe(true);
    }
  });

  it('guarantees 100% unique IDs across all 148 tiles', () => {
    const tiles = createCompleteTileSet();
    const idSet = new Set(tiles.map((t) => t.id));
    expect(idSet.size).toBe(148);
  });

  it('correctly maps tiles to compact shorthand keys and parses keys back to tiles', () => {
    const testCases = [
      '1T', '9T', '1S', '9S', '1B', '9B',
      'WD', 'WN', 'WX', 'WB',
      'DZ', 'DF', 'DP',
      'F1', 'F4', 'M1', 'M4',
      'KIM',
    ];

    for (const key of testCases) {
      const tile = keyToTile(key);
      const generatedKey = tileToKey(tile);
      expect(generatedKey).toBe(key);
    }
  });

  it('parses a multi-tile shorthand string into discrete tiles with distinct IDs', () => {
    const hand = parseTileHand('1T 2T 3T 5S 5S WD DZ F1 KIM KIM');
    expect(hand.length).toBe(10);
    expect(tileToKey(hand[0]!)).toBe('1T');
    expect(tileToKey(hand[3]!)).toBe('5S');
    expect(tileToKey(hand[4]!)).toBe('5S');
    expect(hand[3]!.id).not.toBe(hand[4]!.id);
    expect(hand[8]!.id).not.toBe(hand[9]!.id);
  });

  it('throws an error when keyToTile receives an invalid key', () => {
    expect(() => keyToTile('INVALID')).toThrow();
    expect(() => keyToTile('0T')).toThrow();
    expect(() => keyToTile('10S')).toThrow();
  });

  it('returns valid Indonesian terminology labels', () => {
    expect(getTileIndonesianLabel(keyToTile('1T'))).toBe('1 Tong');
    expect(getTileIndonesianLabel(keyToTile('5S'))).toBe('5 Sok');
    expect(getTileIndonesianLabel(keyToTile('9B'))).toBe('9 Ban');
    expect(getTileIndonesianLabel(keyToTile('WD'))).toContain('Dong');
    expect(getTileIndonesianLabel(keyToTile('DZ'))).toContain('Zhong');
    expect(getTileIndonesianLabel(keyToTile('F1'))).toContain('Bunga 1');
    expect(getTileIndonesianLabel(keyToTile('M2'))).toContain('Musim 2');
    expect(getTileIndonesianLabel(keyToTile('KIM'))).toContain('KIM');
  });

  it('returns correct Unicode glyphs for mahjong tiles', () => {
    expect(getTileUnicode(keyToTile('WD'))).toBe('🀀');
    expect(getTileUnicode(keyToTile('DZ'))).toBe('🀄');
    expect(getTileUnicode(keyToTile('1B'))).toBe('🀇');
    expect(getTileUnicode(keyToTile('1S'))).toBe('🀐');
    expect(getTileUnicode(keyToTile('1T'))).toBe('🀙');
    expect(getTileUnicode(keyToTile('M1'))).toBe('🀦');
    expect(getTileUnicode(keyToTile('F1'))).toBe('🀢');
    expect(getTileUnicode(keyToTile('KIM'))).toBe('🀫');
  });

  it('sorts tiles deterministically according to ITM order', () => {
    const t1 = keyToTile('1T');
    const t9 = keyToTile('9T');
    expect(getTileSortWeight(t1)).toBeLessThan(getTileSortWeight(t9));
    expect(compareTiles(t1, t9)).toBeLessThan(0);

    const unsorted = parseTileHand('M1 F1 KIM DP DZ WB WX WN WD 9B 1B 9S 1S 9T 1T');
    const sorted = sortTiles(unsorted);
    const sortedKeys = sorted.map(tileToKey);

    expect(sortedKeys).toEqual([
      '1T', '9T',
      '1S', '9S',
      '1B', '9B',
      'WD', 'WN', 'WX', 'WB',
      'DZ', 'DP',
      'KIM',
      'F1',
      'M1',
    ]);
  });

  it('evaluates tile domain predicates correctly', () => {
    const t1 = keyToTile('1T');
    const s5 = keyToTile('5S');
    const b9 = keyToTile('9B');
    const wd = keyToTile('WD');
    const dz = keyToTile('DZ');
    const f1 = keyToTile('F1');
    const m3 = keyToTile('M3');
    const kim = keyToTile('KIM');

    // isSuited
    expect(isSuited(t1)).toBe(true);
    expect(isSuited(s5)).toBe(true);
    expect(isSuited(b9)).toBe(true);
    expect(isSuited(wd)).toBe(false);
    expect(isSuited(kim)).toBe(false);

    // isHonor
    expect(isHonor(wd)).toBe(true);
    expect(isHonor(dz)).toBe(true);
    expect(isHonor(t1)).toBe(false);
    expect(isHonor(kim)).toBe(false);

    // isBonus
    expect(isBonus(f1)).toBe(true);
    expect(isBonus(m3)).toBe(true);
    expect(isBonus(wd)).toBe(false);

    // isKim
    expect(isKim(kim)).toBe(true);
    expect(isKim(t1)).toBe(false);

    // isTerminal
    expect(isTerminal(t1)).toBe(true);
    expect(isTerminal(b9)).toBe(true);
    expect(isTerminal(s5)).toBe(false);
    expect(isTerminal(wd)).toBe(false);

    // isYau (terminals + honors)
    expect(isYau(t1)).toBe(true);
    expect(isYau(b9)).toBe(true);
    expect(isYau(wd)).toBe(true);
    expect(isYau(dz)).toBe(true);
    expect(isYau(s5)).toBe(false);

    // isSameKind vs isSameTile
    const t1Copy1 = keyToTile('1T', 1);
    const t1Copy2 = keyToTile('1T', 2);
    expect(isSameKind(t1Copy1, t1Copy2)).toBe(true);
    expect(isSameTile(t1Copy1, t1Copy2)).toBe(false);
    expect(isSameTile(t1Copy1, t1Copy1)).toBe(true);
  });

  it('constants and seat rotation lookups are valid', () => {
    expect(SUITS).toEqual(['tong', 'sok', 'ban']);
    expect(WINDS).toEqual(['dong', 'nan', 'xi', 'bei']);
    expect(DRAGONS).toEqual(['zhong', 'fat', 'pat']);
    expect(SEATS).toEqual(['dong', 'nan', 'xi', 'bei']);

    expect(WIND_TO_VALUE.dong).toBe(1);
    expect(VALUE_TO_WIND[1]).toBe('dong');
    expect(DRAGON_TO_VALUE.zhong).toBe(1);
    expect(VALUE_TO_DRAGON[1]).toBe('zhong');

    expect(NEXT_SEAT.dong).toBe('nan');
    expect(NEXT_SEAT.nan).toBe('xi');
    expect(NEXT_SEAT.xi).toBe('bei');
    expect(NEXT_SEAT.bei).toBe('dong');

    expect(PREV_SEAT.dong).toBe('bei');
    expect(PREV_SEAT.nan).toBe('dong');
    expect(PREV_SEAT.xi).toBe('nan');
    expect(PREV_SEAT.bei).toBe('xi');
  });
});
