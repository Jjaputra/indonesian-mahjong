import type { MeldType, Seat, Tile, Wind } from '../core/types';
import type { AIDifficulty, AnimationSpeed, WinMethod } from '../storage';

/** Bahasa Indonesia seat labels, e.g. "Timur (Dong)". */
export const SEAT_LABEL: Record<Seat, string> = {
  dong: 'Timur (Dong)',
  nan: 'Selatan (Nan)',
  xi: 'Barat (Xi)',
  bei: 'Utara (Bei)',
};

export const SEAT_SHORT: Record<Seat, string> = { dong: 'Timur', nan: 'Selatan', xi: 'Barat', bei: 'Utara' };

/** Chinese character for a wind badge. */
export const WIND_GLYPH: Record<Wind, string> = { dong: '東', nan: '南', xi: '西', bei: '北' };

/**
 * Player names by chair, relative to the human at the bottom. Seat winds rotate during a match,
 * so a name never names a wind (see seatWindOf in win-context.ts).
 */
export const PLAYER_NAME: Record<Seat, string> = {
  dong: 'Anda',
  nan: 'Bot Kanan',
  xi: 'Bot Seberang',
  bei: 'Bot Kiri',
};

export const MELD_LABEL: Record<MeldType, string> = {
  jia: 'Jia',
  pung: 'Pung',
  kong: 'Kong',
  ankong: 'Ankong',
};

export const WIN_METHOD_LABEL: Record<WinMethod, string> = {
  tsumo: 'Ce Mo (ambil sendiri dari tembok)',
  ron: 'Buangan (Ron dari buangan lawan)',
  chiong_kong: 'Chiong Kong (curi Kong lawan)',
  draw: 'Seri (tembok habis)',
};

export const DIFFICULTY_LABEL: Record<AIDifficulty, string> = { easy: 'Mudah', normal: 'Normal', hard: 'Sulit' };

/** Compact indicator for the fixed 16-game match. */
export function matchProgressLabel(hand: number, prevailingWind: Wind): string {
  return `Game ${hand}/16 · Angin putaran ${SEAT_SHORT[prevailingWind]}`;
}

export const ANIMATION_LABEL: Record<AnimationSpeed, string> = {
  off: 'Mati',
  slow: 'Lambat',
  normal: 'Normal',
  fast: 'Cepat',
};

/** Delay between automated AI steps, in milliseconds. */
export const ANIMATION_DELAY_MS: Record<AnimationSpeed, number> = { off: 60, slow: 1100, normal: 650, fast: 300 };

const DRAGON_FACE: Record<number, { glyph: string; name: string }> = {
  1: { glyph: '中', name: 'Zhong' },
  2: { glyph: '發', name: 'Fat' },
  3: { glyph: '白', name: 'Pat' },
};
const WIND_FACE: Record<number, { glyph: string; name: string }> = {
  1: { glyph: '東', name: 'Dong' },
  2: { glyph: '南', name: 'Nan' },
  3: { glyph: '西', name: 'Xi' },
  4: { glyph: '北', name: 'Bei' },
};
/** Bunga 1–4 in printed order (tiles.pdf p. 2): 梅 plum, 蘭 orchid, 竹 bamboo, 菊 chrysanthemum. */
export const FLOWER_FACE: Record<number, { glyph: string; name: string }> = {
  1: { glyph: '梅', name: 'Plum' },
  2: { glyph: '蘭', name: 'Anggrek' },
  3: { glyph: '竹', name: 'Bambu' },
  4: { glyph: '菊', name: 'Krisan' },
};
/** Musim 1–4: 春 semi, 夏 panas, 秋 gugur, 冬 dingin. */
export const SEASON_FACE: Record<number, { glyph: string; name: string }> = {
  1: { glyph: '春', name: 'Semi' },
  2: { glyph: '夏', name: 'Panas' },
  3: { glyph: '秋', name: 'Gugur' },
  4: { glyph: '冬', name: 'Dingin' },
};
/**
 * How to tell the two bonus families apart, per tiles rev2.pdf p. 2 and Bandung Mahjong Cup rulebook:
 * Musim = bunga merah (angka & huruf merah), Bunga = bunga hitam / biru (angka & huruf biru).
 */
export const BONUS_INK_CUE = {
  season: 'Musim = bunga merah: angka & huruf merah',
  flower: 'Bunga = bunga hitam: angka & huruf biru',
} as const;
const SUIT_GLYPH: Record<string, string> = { tong: '筒', sok: '索', ban: '萬' };

export type TileTone = 'tong' | 'sok' | 'ban' | 'wind' | 'red' | 'green' | 'white' | 'flower' | 'season' | 'kim';

/** Everything needed to draw one tile face without images. */
export interface TileFace {
  /** Large main symbol (number or Chinese character) */
  main: string;
  /** Small caption below the symbol */
  sub: string;
  tone: TileTone;
  /** Accessible Indonesian name (canonical scoring name, used in logs and receipts) */
  title: string;
  /** Extra learner cue read with the tile, e.g. the seat a wind points at or the ink of a bonus number */
  hint?: string;
}

/** Indonesian direction and letter printed on wind tiles. */
export const WIND_CUE: Record<number, { letter: string; word: string }> = {
  1: { letter: 'T', word: 'Timur' },
  2: { letter: 'S', word: 'Selatan' },
  3: { letter: 'B', word: 'Barat' },
  4: { letter: 'U', word: 'Utara' },
};

/** Spoken tile name plus its learner cue. */
export function tileAccessibleLabel(face: TileFace): string {
  return face.hint ? `${face.title}, ${face.hint}` : face.title;
}

export function getTileFace(tile: Tile): TileFace {
  if (tile.type === 'kim') {
    return { main: '金', sub: 'KIM', tone: 'kim', title: 'KIM (Joker)', hint: 'tile Kim tetap, mode joker lama' };
  }
  if (tile.isKim) {
    // Natural Kim keeps its printed face; logs and receipts name both the face and the Kim role.
    const face = getTileFace({ ...tile, isKim: false });
    return { ...face, title: `${face.title} (Kim)`, hint: face.hint ? `${face.hint}, Kim natural` : 'Kim natural' };
  }
  switch (tile.type) {
    case 'tong':
    case 'sok':
    case 'ban': {
      const suit = tile.type.charAt(0).toUpperCase() + tile.type.slice(1);
      return { main: String(tile.value), sub: `${SUIT_GLYPH[tile.type]} ${suit}`, tone: tile.type, title: `${tile.value} ${suit}` };
    }
    case 'wind': {
      const f = WIND_FACE[tile.value] ?? { glyph: '?', name: '?' };
      return { main: f.glyph, sub: f.name, tone: 'wind', title: `Angin ${f.name}`, hint: WIND_CUE[tile.value]?.word };
    }
    case 'dragon': {
      const f = DRAGON_FACE[tile.value] ?? { glyph: '?', name: '?' };
      const tone: TileTone = tile.value === 1 ? 'red' : tile.value === 2 ? 'green' : 'white';
      const hint = tone === 'red' ? 'naga merah' : tone === 'green' ? 'naga hijau' : 'naga putih, bingkai kosong';
      return { main: f.glyph, sub: f.name, tone, title: `Naga ${f.name}`, hint };
    }
    case 'flower': {
      const f = FLOWER_FACE[tile.value];
      const hint = f ? `bunga hitam ${f.glyph} ${f.name}, angka & huruf biru` : 'bunga hitam, angka & huruf biru';
      return { main: f?.glyph ?? '花', sub: `Bunga ${tile.value}`, tone: 'flower', title: `Bunga ${tile.value}`, hint };
    }
    case 'season': {
      const f = SEASON_FACE[tile.value];
      const hint = f ? `bunga merah ${f.glyph} ${f.name}, angka & huruf merah` : 'bunga merah, angka & huruf merah';
      return { main: f?.glyph ?? '季', sub: `Musim ${tile.value}`, tone: 'season', title: `Musim ${tile.value}`, hint };
    }
    default:
      return { main: '?', sub: '', tone: 'white', title: 'Tile' };
  }
}

/** Short text label used in receipts and logs, e.g. "5 Tong", "Naga Zhong", "KIM". */
export function tileText(tile: Tile): string {
  return getTileFace(tile).title;
}
