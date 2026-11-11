import { BonusType, Dragon, Seat, Suit, Tile, Wind } from './types';

export const SUITS: readonly Suit[] = ['tong', 'sok', 'ban'];
export const WINDS: readonly Wind[] = ['dong', 'nan', 'xi', 'bei'];
export const DRAGONS: readonly Dragon[] = ['zhong', 'fat', 'pat'];
export const BONUS_TYPES: readonly BonusType[] = ['flower', 'season'];
export const SEATS: readonly Seat[] = ['dong', 'nan', 'xi', 'bei'];

export const WIND_TO_VALUE: Record<Wind, number> = {
  dong: 1,
  nan: 2,
  xi: 3,
  bei: 4,
};

export const VALUE_TO_WIND: Record<number, Wind> = {
  1: 'dong',
  2: 'nan',
  3: 'xi',
  4: 'bei',
};

export const DRAGON_TO_VALUE: Record<Dragon, number> = {
  zhong: 1,
  fat: 2,
  pat: 3,
};

export const VALUE_TO_DRAGON: Record<number, Dragon> = {
  1: 'zhong',
  2: 'fat',
  3: 'pat',
};

export const SEAT_ORDER: readonly Seat[] = ['dong', 'nan', 'xi', 'bei'];

export const NEXT_SEAT: Record<Seat, Seat> = {
  dong: 'nan',
  nan: 'xi',
  xi: 'bei',
  bei: 'dong',
};

export const PREV_SEAT: Record<Seat, Seat> = {
  dong: 'bei',
  nan: 'dong',
  xi: 'nan',
  bei: 'xi',
};

/**
 * Creates the complete, authoritative 148-tile ITM / YDSP set.
 * Composition:
 * - 108 Suited tiles (36 Tong, 36 Sok, 36 Ban: ranks 1-9, 4 copies each)
 * - 28 Honor tiles (16 Winds: Dong, Nan, Xi, Bei x4; 12 Dragons: Zhong, Fat, Pat x4)
 * - 8 Bonus tiles (4 Flowers/Bunga 1-4, red numerals; 4 Seasons/Musim 1-4, blue numerals — tiles.pdf p. 2)
 * - 4 Kim Jokers
 */
export function createCompleteTileSet(): Tile[] {
  const tiles: Tile[] = [];

  // 1. Suited tiles: 3 suits * 9 values * 4 copies = 108 tiles
  for (const suit of SUITS) {
    for (let value = 1; value <= 9; value++) {
      for (let copy = 1; copy <= 4; copy++) {
        tiles.push({
          id: `${suit}-${value}-${copy}`,
          type: suit,
          value,
          isKim: false,
        });
      }
    }
  }

  // 2. Winds: 4 winds * 4 copies = 16 tiles
  for (const wind of WINDS) {
    const val = WIND_TO_VALUE[wind];
    for (let copy = 1; copy <= 4; copy++) {
      tiles.push({
        id: `wind-${wind}-${copy}`,
        type: 'wind',
        value: val,
        isKim: false,
      });
    }
  }

  // 3. Dragons: 3 dragons * 4 copies = 12 tiles
  for (const dragon of DRAGONS) {
    const val = DRAGON_TO_VALUE[dragon];
    for (let copy = 1; copy <= 4; copy++) {
      tiles.push({
        id: `dragon-${dragon}-${copy}`,
        type: 'dragon',
        value: val,
        isKim: false,
      });
    }
  }

  // 4. Flowers (Bunga): 4 tiles (1 copy each)
  for (let value = 1; value <= 4; value++) {
    tiles.push({
      id: `flower-${value}-1`,
      type: 'flower',
      value,
      isKim: false,
    });
  }

  // 5. Seasons (Red): 4 tiles (1 copy each)
  for (let value = 1; value <= 4; value++) {
    tiles.push({
      id: `season-${value}-1`,
      type: 'season',
      value,
      isKim: false,
    });
  }

  // 6. Kim (Jokers): 4 tiles
  for (let copy = 1; copy <= 4; copy++) {
    tiles.push({
      id: `kim-0-${copy}`,
      type: 'kim',
      value: 0,
      isKim: true,
    });
  }

  return tiles;
}

/**
 * Converts a Tile to a canonical compact key.
 */
export function tileToKey(tile: Tile): string {
  if (tile.type === 'kim' || tile.isKim) return 'KIM';
  if (tile.type === 'tong') return `${tile.value}T`;
  if (tile.type === 'sok') return `${tile.value}S`;
  if (tile.type === 'ban') return `${tile.value}B`;
  if (tile.type === 'wind') {
    const windMap: Record<number, string> = { 1: 'WD', 2: 'WN', 3: 'WX', 4: 'WB' };
    return windMap[tile.value] ?? 'W?';
  }
  if (tile.type === 'dragon') {
    const dragonMap: Record<number, string> = { 1: 'DZ', 2: 'DF', 3: 'DP' };
    return dragonMap[tile.value] ?? 'D?';
  }
  if (tile.type === 'flower') return `F${tile.value}`;
  if (tile.type === 'season') return `M${tile.value}`;
  return 'UNKNOWN';
}

/**
 * Creates a synthetic Tile from a shorthand key (useful for test fixtures).
 */
export function keyToTile(key: string, copyIndex = 1): Tile {
  const upper = key.trim().toUpperCase();
  if (upper === 'KIM' || upper === 'K') {
    return { id: `kim-0-${copyIndex}`, type: 'kim', value: 0, isKim: true };
  }
  const matchSuit = upper.match(/^([1-9])([TSB])$/);
  if (matchSuit) {
    const val = parseInt(matchSuit[1]!, 10);
    const suitCode = matchSuit[2];
    const type: Suit = suitCode === 'T' ? 'tong' : suitCode === 'S' ? 'sok' : 'ban';
    return { id: `${type}-${val}-${copyIndex}`, type, value: val, isKim: false };
  }
  if (upper === 'WD' || upper === 'DONG' || upper === '1W') {
    return { id: `wind-dong-${copyIndex}`, type: 'wind', value: 1, isKim: false };
  }
  if (upper === 'WN' || upper === 'NAN' || upper === '2W') {
    return { id: `wind-nan-${copyIndex}`, type: 'wind', value: 2, isKim: false };
  }
  if (upper === 'WX' || upper === 'XI' || upper === '3W') {
    return { id: `wind-xi-${copyIndex}`, type: 'wind', value: 3, isKim: false };
  }
  if (upper === 'WB' || upper === 'BEI' || upper === '4W') {
    return { id: `wind-bei-${copyIndex}`, type: 'wind', value: 4, isKim: false };
  }
  if (upper === 'DZ' || upper === 'ZHONG' || upper === '1D') {
    return { id: `dragon-zhong-${copyIndex}`, type: 'dragon', value: 1, isKim: false };
  }
  if (upper === 'DF' || upper === 'FAT' || upper === '2D') {
    return { id: `dragon-fat-${copyIndex}`, type: 'dragon', value: 2, isKim: false };
  }
  if (upper === 'DP' || upper === 'PAT' || upper === '3D') {
    return { id: `dragon-pat-${copyIndex}`, type: 'dragon', value: 3, isKim: false };
  }
  const matchFlower = upper.match(/^F([1-4])$/);
  if (matchFlower) {
    const val = parseInt(matchFlower[1]!, 10);
    return { id: `flower-${val}-${copyIndex}`, type: 'flower', value: val, isKim: false };
  }
  const matchSeason = upper.match(/^M([1-4])$/);
  if (matchSeason) {
    const val = parseInt(matchSeason[1]!, 10);
    return { id: `season-${val}-${copyIndex}`, type: 'season', value: val, isKim: false };
  }
  throw new Error(`Invalid tile key: "${key}"`);
}

/**
 * Parses a space-separated shorthand hand string into an array of Tiles.
 * Example: parseTileHand("1T 2T 3T 5S 5S 5S WD WD WD DZ DZ DZ KIM KIM")
 */
export function parseTileHand(handStr: string): Tile[] {
  const tokens = handStr.trim().split(/\s+/).filter(Boolean);
  const counts: Record<string, number> = {};
  return tokens.map((k) => {
    counts[k] = (counts[k] || 0) + 1;
    return keyToTile(k, counts[k]);
  });
}

/**
 * Returns Indonesian terminology label for the tile.
 */
export function getTileIndonesianLabel(tile: Tile): string {
  if (tile.type === 'kim' || tile.isKim) return 'KIM (Joker)';
  if (tile.type === 'tong') return `${tile.value} Tong`;
  if (tile.type === 'sok') return `${tile.value} Sok`;
  if (tile.type === 'ban') return `${tile.value} Ban`;
  if (tile.type === 'wind') {
    const map: Record<number, string> = {
      1: 'Angin Dong (Timur)',
      2: 'Angin Nan (Selatan)',
      3: 'Angin Xi (Barat)',
      4: 'Angin Bei (Utara)',
    };
    return map[tile.value] ?? 'Angin';
  }
  if (tile.type === 'dragon') {
    const map: Record<number, string> = {
      1: 'Naga Zhong (Merah)',
      2: 'Naga Fat (Hijau)',
      3: 'Naga Pat (Putih)',
    };
    return map[tile.value] ?? 'Naga';
  }
  if (tile.type === 'flower') {
    const map: Record<number, string> = {
      1: 'Bunga 1 (Plum / 梅)',
      2: 'Bunga 2 (Anggrek / 蘭)',
      3: 'Bunga 3 (Bambu / 竹)',
      4: 'Bunga 4 (Krisan / 菊)',
    };
    return map[tile.value] ?? `Bunga ${tile.value}`;
  }
  if (tile.type === 'season') {
    const map: Record<number, string> = {
      1: 'Musim 1 (Musim Semi / 春)',
      2: 'Musim 2 (Musim Panas / 夏)',
      3: 'Musim 3 (Musim Gugur / 秋)',
      4: 'Musim 4 (Musim Dingin / 冬)',
    };
    return map[tile.value] ?? `Musim ${tile.value}`;
  }
  return 'Tile Tidak Dikenal';
}

/**
 * Returns the Unicode Mahjong glyph (U+1F000..U+1F02B) or standard representation.
 */
export function getTileUnicode(tile: Tile): string {
  if (tile.type === 'kim' || tile.isKim) return '🀫';
  if (tile.type === 'wind') {
    // 🀀 Dong, 🀁 Nan, 🀂 Xi, 🀃 Bei
    return String.fromCodePoint(0x1f000 + tile.value - 1);
  }
  if (tile.type === 'dragon') {
    // 🀄 Zhong, 🀅 Fat, 🀆 Pat
    return String.fromCodePoint(0x1f004 + tile.value - 1);
  }
  if (tile.type === 'ban') {
    // 🀇 1 Ban .. 🀏 9 Ban
    return String.fromCodePoint(0x1f007 + tile.value - 1);
  }
  if (tile.type === 'sok') {
    // 🀐 1 Sok .. 🀘 9 Sok
    return String.fromCodePoint(0x1f010 + tile.value - 1);
  }
  if (tile.type === 'tong') {
    // 🀙 1 Tong .. 🀡 9 Tong
    return String.fromCodePoint(0x1f019 + tile.value - 1);
  }
  if (tile.type === 'flower') {
    // 🀢 Plum, 🀣 Orchid, 🀤 Bamboo, 🀥 Chrysanthemum (same 1-4 order as the printed Bunga)
    return String.fromCodePoint(0x1f022 + tile.value - 1);
  }
  if (tile.type === 'season') {
    // 🀦 Spring, 🀧 Summer, 🀨 Autumn, 🀩 Winter
    return String.fromCodePoint(0x1f026 + tile.value - 1);
  }
  return '🀫';
}

export function getTileSortWeight(tile: Tile): number {
  if (tile.type === 'tong') return 100 + tile.value;
  if (tile.type === 'sok') return 200 + tile.value;
  if (tile.type === 'ban') return 300 + tile.value;
  if (tile.type === 'wind') return 400 + tile.value;
  if (tile.type === 'dragon') return 500 + tile.value;
  if (tile.type === 'kim' || tile.isKim) return 600;
  if (tile.type === 'flower') return 700 + tile.value;
  if (tile.type === 'season') return 800 + tile.value;
  return 999;
}

export function compareTiles(a: Tile, b: Tile): number {
  const weightDiff = getTileSortWeight(a) - getTileSortWeight(b);
  if (weightDiff !== 0) return weightDiff;
  return a.id.localeCompare(b.id);
}

export function sortTiles(tiles: readonly Tile[]): Tile[] {
  return [...tiles].sort(compareTiles);
}

export function isSameTile(a: Tile, b: Tile): boolean {
  return a.id === b.id;
}

export function isSameKind(a: Tile, b: Tile): boolean {
  if ((a.type === 'kim' || a.isKim) && (b.type === 'kim' || b.isKim)) return true;
  return a.type === b.type && a.value === b.value;
}

export function isSuited(tile: Tile): boolean {
  return tile.type === 'tong' || tile.type === 'sok' || tile.type === 'ban';
}

export function isHonor(tile: Tile): boolean {
  return tile.type === 'wind' || tile.type === 'dragon';
}

export function isBonus(tile: Tile): boolean {
  return tile.type === 'flower' || tile.type === 'season';
}

export function isKim(tile: Tile): boolean {
  return tile.type === 'kim' || !!tile.isKim;
}

export function isTerminal(tile: Tile): boolean {
  return isSuited(tile) && (tile.value === 1 || tile.value === 9);
}

export function isYau(tile: Tile): boolean {
  return isTerminal(tile) || isHonor(tile);
}
