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

export const PLAYER_NAME: Record<Seat, string> = {
  dong: 'Anda',
  nan: 'Bot Selatan',
  xi: 'Bot Barat',
  bei: 'Bot Utara',
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
const FLOWER_GLYPH: Record<number, string> = { 1: '梅', 2: '蘭', 3: '菊', 4: '竹' };
const SEASON_GLYPH: Record<number, string> = { 1: '春', 2: '夏', 3: '秋', 4: '冬' };
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
  if (tile.type === 'kim' || tile.isKim) {
    return { main: '金', sub: 'KIM', tone: 'kim', title: 'KIM (Joker)', hint: 'tile Kim tetap, mode joker lama' };
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
    case 'flower':
      return { main: FLOWER_GLYPH[tile.value] ?? '花', sub: `Bunga ${tile.value}`, tone: 'flower', title: `Bunga ${tile.value}`, hint: 'bunga hitam/biru, angka biru tua' };
    case 'season':
      return { main: SEASON_GLYPH[tile.value] ?? '季', sub: `Musim ${tile.value}`, tone: 'season', title: `Musim ${tile.value}`, hint: 'musim/kembang merah, angka merah' };
    default:
      return { main: '?', sub: '', tone: 'white', title: 'Tile' };
  }
}

/** Short text label used in receipts and logs, e.g. "5 Tong", "Naga Zhong", "KIM". */
export function tileText(tile: Tile): string {
  return getTileFace(tile).title;
}
