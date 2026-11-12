import type { ScoringBasis } from '../core/types';
import type { KimMode } from '../kim/types';

/**
 * Canonical 44-Tay table, BANDUNG MAHJONG CUP RULEBOOK ver06 §5.1 "DAFTAR TAY" (pp. 8–10).
 * `null` = the rulebook column is blank: the pattern does not exist in that mode.
 */
export interface PatternDefinition {
  readonly id: number;
  readonly name: string;
  readonly K: number | null;
  readonly NK: number | null;
  /** Extra Tay for a bonus tile whose number matches the seat (#1, #2) */
  readonly seatMatchBonus?: number;
  /** Tay for an immediate Hu without a completed hand (#6, #9, #34) */
  readonly instantHu?: number;
  /** Rulebook "Keterangan" text (Bahasa Indonesia) */
  readonly keterangan: string;
}

const defs: PatternDefinition[] = [
  { id: 1, name: 'Tile Bunga', K: 0, NK: 0, seatMatchBonus: 1, keterangan: 'Kembang hitam (sesuai posisi duduk +1)' },
  { id: 2, name: 'Tile Musim', K: 1, NK: 1, seatMatchBonus: 1, keterangan: 'Kembang merah (sesuai posisi duduk +1)' },
  { id: 3, name: 'Bo Hua Zi', K: 3, NK: 3, keterangan: 'Tidak ada tile bunga, musim, angin, dan naga' },
  { id: 4, name: '4 Tiles Bunga', K: 10, NK: 10, keterangan: 'Ada 4 tile bunga' },
  { id: 5, name: '4 Tiles Musim', K: 20, NK: 20, keterangan: 'Ada 4 tile musim' },
  { id: 6, name: '7 Tiles Bunga/Musim', K: 30, NK: 30, instantHu: 10, keterangan: 'Ada 7 tile bunga dan musim (langsung hu tanpa diselesaikan = 10tay)' },
  { id: 7, name: 'Tile KIM', K: 1, NK: null, keterangan: 'Joker, dapat menggantikan tiles apa saja.' },
  { id: 8, name: 'Bo KIM', K: null, NK: 3, keterangan: 'Tidak ada Kim / Joker atau Kim dipakai untuk melengkapi set sesuai dengan nomer/jenis kim tersebut.' },
  { id: 9, name: 'Shi Kim', K: 40, NK: null, instantHu: 10, keterangan: 'Ada 4 Kim di hand (langsung hu tanpa diselesaikan = 10tay)' },
  { id: 10, name: 'Pao Chin', K: 20, NK: 30, keterangan: 'Hand langsung Cin pada pembagian tile pertama, harus dideclare' },
  { id: 11, name: 'Thien Fu', K: 40, NK: 60, keterangan: 'Hand pembagian pertama langsung Hu (hanya untuk posisi Dong)' },
  { id: 12, name: 'Thi Fu', K: 40, NK: 60, keterangan: 'Hu dari hasil lew atau discard pertama (diawali dengan declare Pao Chin)' },
  { id: 13, name: 'Chicken Hand', K: 0, NK: 0, keterangan: 'Campuran urutan dan tris dalam 1 hand, tanpa membentuk pola yang lain' },
  { id: 14, name: 'Ping Fu', K: 3, NK: 3, keterangan: '4 set urutan + 1 pair (all sequence). Tidak berlaku apabila pairnya: naga, angin duduk, atau angin putaran.' },
  { id: 15, name: 'Tuei Tuei', K: 5, NK: 10, keterangan: '4 set tris + 1 pair (all triplets)' },
  { id: 16, name: 'Tjit Tuei', K: 10, NK: 20, keterangan: '7 set pair (7 pairs)' },
  { id: 17, name: 'Chao It', K: 5, NK: 10, keterangan: '1 suit + angin atau naga (half flush)' },
  { id: 18, name: 'It Set', K: 20, NK: 30, keterangan: '1 suit' },
  { id: 19, name: 'Yau Kiu', K: 30, NK: 40, keterangan: 'Hanya terdiri dari angka 1 dan 9 (tong/sok/ban)' },
  { id: 20, name: 'Cap Sa Yau Kiu', K: 40, NK: 60, keterangan: '1tong, 9tong, 1sok, 9sok, 1ban, 9ban, dong, nan, xi, bei, Zhong, fat, pat + 1 tile' },
  { id: 21, name: 'Siau San Yen', K: 10, NK: 20, keterangan: '2 tris naga + 1 pair naga' },
  { id: 22, name: 'Ta San Yen', K: 30, NK: 40, keterangan: '3 tris naga' },
  { id: 23, name: 'Siau Se Si', K: 30, NK: 40, keterangan: '3 tris angin + 1 pair angin' },
  { id: 24, name: 'Ta Se Si', K: 50, NK: 60, keterangan: '4 tris angin' },
  { id: 25, name: 'Tris Angin Duduk', K: 1, NK: 1, keterangan: 'Ada tris mata angin yang sesuai dengan posisi duduk (seat wind)' },
  { id: 26, name: 'Tris Angin Putaran', K: 1, NK: 1, keterangan: 'Ada tris mata angin yang sesuai dengan putaran (prevailing wind)' },
  { id: 27, name: 'Tris Zhong', K: 2, NK: 2, keterangan: 'Ada tris zhong / naga merah' },
  { id: 28, name: 'Tris Fat', K: 1, NK: 1, keterangan: 'Ada tris fat / naga hijau' },
  { id: 29, name: 'Tris Pat', K: 1, NK: 1, keterangan: 'Ada tris pat / naga putih' },
  { id: 30, name: 'Kim Thi', K: 30, NK: null, keterangan: 'Kim dijadikan tris' },
  { id: 31, name: 'Ji Pa Ciok', K: 1, NK: 1, keterangan: 'Angka 2 atau 8 (suit mana saja)' },
  { id: 32, name: 'Kim Ciok', K: 20, NK: null, keterangan: 'Kim dijadikan pair untuk kaki' },
  { id: 33, name: 'Sam Am Kang', K: 5, NK: 5, keterangan: '3 tris terbentuk tanpa pung (concealed)' },
  { id: 34, name: 'Si Am Kang', K: 20, NK: 30, instantHu: 10, keterangan: '4 tris terbentuk tanpa pung (concealed) (langsung hu tanpa diselesaikan = 10tay)' },
  { id: 35, name: 'Chiong Kong', K: 5, NK: 5, keterangan: 'Tile yang akan dipakai untuk Kong, dicuri oleh pemain lain untuk Hu' },
  { id: 36, name: 'Ce Chiong Kong', K: 5, NK: 5, keterangan: 'Ada pung dan kartu ke -4 dipakai untuk seri (seri harus ada di dalam) dan harus ce mo' },
  { id: 37, name: 'Kong Song Hu/Mo', K: 5, NK: 5, keterangan: 'Kong, ambil tiles dari ekor tembok dan Hu' },
  { id: 38, name: 'Kong Kong Hu', K: 30, NK: 30, keterangan: 'Kong, ambil tile dari ekor tembok, Kong lagi, ambil tile dari ekor tembok dan Hu' },
  { id: 39, name: 'Se Sam Pu Tat', K: null, NK: 40, keterangan: 'Semua kartu berangka dalam 1 suit minimal berbeda 3 angka, tidak ada yang pair, tidak ada bunga atau musim, dan tidak ada kim' },
  { id: 40, name: 'Pyong Pi', K: 5, NK: null, keterangan: 'Tile terakhir merupakan pasangan Kim, diambil dari tembok.' },
  { id: 41, name: 'Tan Tiau', K: 5, NK: 5, keterangan: 'Jia dan atau Pung terus hingga tersisa 1 tile on hand' },
  { id: 42, name: 'Ce Mo', K: 1, NK: 1, keterangan: 'Tile terakhir diambil dari tembok, sebelumnya sudah pernah pung atau jia (unconcealed)' },
  { id: 43, name: 'Mun', K: 1, NK: 1, keterangan: 'Kondisi belum pernah pung atau jia (concealed), tiles terakhir dari buangan lawan' },
  { id: 44, name: 'Ce Mo Pu Ciu Jen', K: 5, NK: 5, keterangan: 'Tile terakhir diambil dari tembok, sebelumnya belum pernah pung atau jia (fully concealed)' },
];

export const PATTERNS: ReadonlyMap<number, PatternDefinition> = new Map(defs.map((d) => [d.id, d]));

export function getPattern(id: number): PatternDefinition {
  const def = PATTERNS.get(id);
  if (!def) throw new Error(`Unknown Tay pattern #${id}`);
  return def;
}

/** Base Tay of a pattern in the given mode; null when the rulebook column is blank. */
export function baseTay(id: number, mode: KimMode): number | null {
  return getPattern(id)[mode];
}

/**
 * Cells where the stored hand-usage value differs from the printed PDF placement.
 * #39 Se Sam Pu Tat: printed 40 under Ada KIM, Tidak ada KIM blank (see RULES.md §2).
 * Under hand usage a Se Sam Pu Tat hand is always NK, so the value is moved there; under the
 * match table a Kim match scores the printed cell and the layout error is corrected to 40 in both columns.
 */
export const PRINTED_PLACEMENT: ReadonlyMap<number, { readonly K: number | null; readonly NK: number | null }> = new Map([
  [39, { K: 40, NK: null }],
]);

/** Effective Tay, including house-rule overrides; null when an unoverridden cell is blank. */
export function tableTay(id: number, column: KimMode, basis: ScoringBasis = 'hand_kim_usage'): number | null {
  // Player feedback 2026-11-12: Bo KIM is +3 in either column, overriding the PDF blank.
  if (id === 8) return 3;
  // #39 demands no joker use: the single printed value is a layout error.
  if (id === 39) return 40;
  const printed = basis === 'match_table' ? PRINTED_PLACEMENT.get(id) : undefined;
  return printed ? printed[column] : baseTay(id, column);
}

/**
 * Overlap policy "supersede": the key pattern removes the listed lower patterns.
 * Pao Chin is dropped once it turns into Thi Fu (rulebook #10: "apabila tidak thi fu, pao chin tetap berlaku").
 */
export const SUPERSEDES: ReadonlyMap<number, readonly number[]> = new Map([
  [12, [10]],
  [4, [1]],
  [5, [2]],
  [6, [1, 2, 4, 5]],
  [21, [27, 28, 29]],
  [22, [27, 28, 29]],
  [23, [25, 26]],
  [24, [25, 26]],
  [34, [33]],
  [38, [37]],
]);
