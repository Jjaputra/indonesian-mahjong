/**
 * Fixture catalog for the 44 ITM / YDSP Tay patterns (Bandung Mahjong Cup Rulebook ver06).
 *
 * Values and definitions are taken from "BANDUNG MAHJONG CUP RULEBOOK ver06.pdf", section 5.1
 * "DAFTAR TAY" (pp. 8–10), extracted with pypdf; the verbatim Indonesian "Keterangan" text of every
 * pattern is in RULEBOOK_VER06_TEXT. `null` means the K or NK column is blank in the rulebook:
 * the pattern does not exist in that mode (it is NOT 0 Tay).
 *
 * Every definition is `definitionConfidence: 'authoritative'`. Where the terse rulebook text still
 * leaves a reading choice, `interpretationNote` records the reading these fixtures commit to.
 *
 * Hand shorthand uses `parseTileHand` keys: 1T..9T (Tong), 1S..9S (Sok), 1B..9B (Ban),
 * WD WN WX WB (winds), DZ DF DP (dragons), F1..F4 (flowers), M1..M4 (seasons), KIM.
 * Every hand is the full 14-tile winning shape: `concealed` excludes `winningTile`,
 * and each meld counts as 3 toward the 14 (a Kong lists all 4 physical tiles; its 4th is
 * offset by the tail replacement draw).
 */
import { keyToTile } from '@/core/tiles';
import type { GameRules, Meld, MeldType, Seat, Tile, Wind } from '@/core/types';

// ============================================================================
// Types
// ============================================================================

export type PatternId =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20
  | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30
  | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40
  | 41 | 42 | 43 | 44;

export const ALL_PATTERN_IDS: readonly PatternId[] = Array.from(
  { length: 44 },
  (_, i) => (i + 1) as PatternId
);

/** K = Ada Kim (hand contains/uses Kim), NK = Tanpa Kim / Bo Kim. */
export type KimMode = 'K' | 'NK';

export type PatternCategory =
  | 'bonus'
  | 'kim'
  | 'first-turn'
  | 'hand-shape'
  | 'honors'
  | 'concealed-and-kim-melds'
  | 'kong-event'
  | 'special-finish';

export interface TayValues {
  /** Ada Kim value; null = "—" (pattern unavailable when the hand has Kim). */
  readonly K: number | null;
  /** Tanpa Kim value; null = "—" (pattern unavailable without Kim). */
  readonly NK: number | null;
  /** Extra Tay per bonus tile whose number matches the holder's seat (#1, #2). */
  readonly seatMatchBonus?: number;
  /** Tay awarded when the pattern triggers an immediate Hu without a complete hand (#6, #9, #34). */
  readonly instantHu?: number;
}

export interface MeldSpec {
  readonly type: MeldType;
  /** Space-separated keys, e.g. "5T 5T 5T" or "KIM 5T 5T". */
  readonly tiles: string;
  /** Present for claimed (exposed) melds; absent for concealed Ankong. */
  readonly claimedFrom?: Seat;
}

/** Mirror of the PROJECT.md `WinContext` contract, minus `winningTile` (derived from the hand). */
export interface FixtureWinContext {
  readonly isSelfDraw: boolean;
  readonly isDiscardWin: boolean;
  readonly isInitialDeal: boolean;
  readonly isPaoChin: boolean;
  readonly isRobbingKong: boolean;
  readonly isSelfRobbingKong: boolean;
  readonly isKongReplacement: boolean;
  readonly isDoubleKongReplacement: boolean;
  readonly seatWind: Seat;
  readonly roundWind: Wind;
  readonly discarderSeat?: Seat;
}

export interface HandSpec {
  readonly concealed: string;
  readonly winningTile: string;
  readonly melds?: readonly MeldSpec[];
  /** Exposed flowers/seasons rack. */
  readonly flowers?: string;
  readonly context?: Partial<FixtureWinContext>;
  /** True when the hand is evaluated as an instant Hu (no complete shape required). */
  readonly instantHu?: boolean;
  readonly rules?: Partial<GameRules>;
}

export interface PatternCase {
  readonly label: string;
  readonly mode: KimMode;
  readonly hand: HandSpec;
  /** Whether pattern `id` must appear in ScoringResult.patterns. */
  readonly expectDetected: boolean;
  /** Tay this pattern alone must contribute when detected. */
  readonly expectedTay?: number;
}

export interface PatternFixture {
  readonly id: PatternId;
  readonly name: string;
  readonly category: PatternCategory;
  readonly values: TayValues;
  readonly definition: string;
  readonly definitionConfidence: 'authoritative' | 'interpretation';
  readonly interpretationNote?: string;
  readonly positive: readonly PatternCase[];
  readonly negative: readonly PatternCase[];
}

// ============================================================================
// Verbatim rulebook text (BMC Rulebook ver06, 5.1 DAFTAR TAY, "Keterangan" column)
// ============================================================================

export const RULEBOOK_VER06_TEXT: Readonly<Record<PatternId, string>> = {
  1: 'Kembang hitam (sesuai posisi duduk +1)',
  2: 'Kembang merah (sesuai posisi duduk +1)',
  3: 'Tidak ada tile bunga, musim, angin, dan naga',
  4: 'Ada 4 tile bunga',
  5: 'Ada 4 tile musim',
  6: 'Ada 7 tile bunga dan musim (langsung hu tanpa diselesaikan = 10tay)',
  7: 'Joker, dapat menggantikan tiles apa saja.',
  8: 'Tidak ada Kim / Joker atau Kim dipakai untuk melengkapi set sesuai dengan nomer/jenis kim tersebut.',
  9: 'Ada 4 Kim di hand (langsung hu tanpa diselesaikan = 10tay)',
  10: 'Hand langsung Cin pada pembagian tile pertama, harus dideclare (putaran pertama lew bisa thi fu, tapi apabila tidak thi fu, pao chin tetap berlaku)',
  11: 'Hand pembagian pertama langsung Hu (hanya untuk posisi Dong)',
  12: 'Hu dari hasil lew atau discard pertama (diawali dengan declare Pao Chin)',
  13: 'Campuran urutan dan tris dalam 1 hand, tanpa membentuk pola yang lain',
  14: '4 set urutan + 1 pair (all sequence). Tidak berlaku apabila pairnya: naga, angin duduk, atau angin putaran.',
  15: '4 set tris + 1 pair (all triplets)',
  16: '7 set pair (7 pairs)',
  17: '1 suit + angin atau naga (half flush)',
  18: '1 suit',
  19: 'Hanya terdiri dari angka 1 dan 9 (tong/sok/ban)',
  20: '1tong, 9tong, 1sok, 9sok, 1ban, 9ban, dong, nan, xi, bei, Zhong, fat, pat + 1 tile (salah satu yang disebutkan)',
  21: '2 tris naga + 1 pair naga',
  22: '3 tris naga',
  23: '3 tris angin + 1 pair angin',
  24: '4 tris angin',
  25: 'Ada tris mata angin yang sesuai dengan posisi duduk (seat wind)',
  26: 'Ada tris mata angin yang sesuai dengan putaran (prevailing wind)',
  27: 'Ada tris zhong / naga merah',
  28: 'Ada tris fat / naga hijau',
  29: 'Ada tris pat / naga putih',
  30: 'Kim dijadikan tris',
  31: 'Angka 2 atau 8 (suit mana saja)',
  32: 'Kim dijadikan pair untuk kaki',
  33: '3 tris terbentuk tanpa pung (concealed)',
  34: '4 tris terbentuk tanpa pung (concealed) (langsung hu tanpa diselesaikan = 10tay)',
  35: 'Tile yang akan dipakai untuk Kong, dicuri oleh pemain lain untuk Hu',
  36: 'Ada pung dan kartu ke -4 dipakai untuk seri (seri harus ada di dalam) dan harus ce mo',
  37: 'Kong, ambil tiles dari ekor tembok dan Hu',
  38: 'Kong, ambil tile dari ekor tembok, Kong lagi, ambil tile dari ekor tembok dan Hu',
  39: 'Semua kartu berangka dalam 1 suit minimal berbeda 3 angka, tidak ada yang pair, tidak ada bunga atau musim, dan tidak ada kim',
  40: 'Tile terakhir merupakan pasangan Kim, diambil dari tembok.',
  41: 'Jia dan atau Pung terus hingga tersisa 1 tile on hand',
  42: 'Tile terakhir diambil dari tembok, sebelumnya sudah pernah pung atau jia (unconcealed)',
  43: 'Kondisi belum pernah pung atau jia (concealed), tiles terakhir dari buangan lawan',
  44: 'Tile terakhir diambil dari tembok, sebelumnya belum pernah pung atau jia (fully concealed)',
};

// ============================================================================
// Defaults & shared hands
// ============================================================================

/** Non-dealer South seat, East round, ordinary Ron from West: no event patterns fire. */
export const DEFAULT_CONTEXT: FixtureWinContext = {
  isSelfDraw: false,
  isDiscardWin: true,
  isInitialDeal: false,
  isPaoChin: false,
  isRobbingKong: false,
  isSelfRobbingKong: false,
  isKongReplacement: false,
  isDoubleKongReplacement: false,
  seatWind: 'nan',
  roundWind: 'dong',
  discarderSeat: 'xi',
};

export const SELF_DRAW: Partial<FixtureWinContext> = {
  isSelfDraw: true,
  isDiscardWin: false,
  discarderSeat: undefined,
};

/** Mixed, concealed, NK: 123T 345T 456S 789B + WX pair. Win on 5T. */
const BASE: HandSpec = {
  concealed: '1T 2T 3T 3T 4T 4S 5S 6S 7B 8B 9B WX WX',
  winningTile: '5T',
  flowers: 'F1',
};

/** BASE with one exposed Pung so concealment-based patterns (#43, #44) do not fire. */
const BASE_OPEN: HandSpec = {
  concealed: '1T 2T 3T 3T 4T 4S 5S 6S WX WX',
  winningTile: '5T',
  melds: [{ type: 'pung', tiles: '9B 9B 9B', claimedFrom: 'dong' }],
  flowers: 'F1',
};

/** Mixed K hand: Kim fills a Jia gap (1T KIM 3T). */
const BASE_K: HandSpec = {
  concealed: '1T KIM 3T 3T 4T 4S 5S 6S 7B 8B 9B WX WX',
  winningTile: '5T',
  flowers: 'F1',
};

function withCtx(hand: HandSpec, context: Partial<FixtureWinContext>): HandSpec {
  return { ...hand, context: { ...hand.context, ...context } };
}

function withFlowers(hand: HandSpec, flowers: string): HandSpec {
  return { ...hand, flowers };
}

// ============================================================================
// Catalog
// ============================================================================

export const PATTERN_FIXTURES: Readonly<Record<PatternId, PatternFixture>> = {
  // ---------------------------------------------------------------- bonus 1-6
  1: {
    id: 1,
    name: 'Tile Bunga',
    category: 'bonus',
    values: { K: 0, NK: 0, seatMatchBonus: 1 },
    definition: 'Each exposed black Flower scores 0; a Flower whose number equals the seat number (Dong=1 … Bei=4) scores +1.',
    definitionConfidence: 'authoritative',
    positive: [
      { label: 'own-seat flower F2 for Nan', mode: 'NK', hand: withFlowers(BASE, 'F2'), expectDetected: true, expectedTay: 1 },
      { label: 'off-seat flower F1 for Nan', mode: 'NK', hand: withFlowers(BASE, 'F1'), expectDetected: true, expectedTay: 0 },
      { label: 'own-seat flower in K mode', mode: 'K', hand: withFlowers(BASE_K, 'F2'), expectDetected: true, expectedTay: 1 },
    ],
    negative: [
      { label: 'season only, no flower', mode: 'NK', hand: withFlowers(BASE, 'M3'), expectDetected: false },
    ],
  },
  2: {
    id: 2,
    name: 'Tile Musim',
    category: 'bonus',
    values: { K: 1, NK: 1, seatMatchBonus: 1 },
    definition: 'Each exposed red Season scores 1; a Season whose number equals the seat number scores +1 more.',
    definitionConfidence: 'authoritative',
    positive: [
      { label: 'off-seat season M3 for Nan', mode: 'NK', hand: withFlowers(BASE, 'M3'), expectDetected: true, expectedTay: 1 },
      { label: 'own-seat season M2 for Nan', mode: 'NK', hand: withFlowers(BASE, 'M2'), expectDetected: true, expectedTay: 2 },
    ],
    negative: [
      { label: 'flower only', mode: 'NK', hand: withFlowers(BASE, 'F3'), expectDetected: false },
    ],
  },
  3: {
    id: 3,
    name: 'Bo Hua Zi',
    category: 'bonus',
    values: { K: 3, NK: 3 },
    definition: 'Winning hand with no Flowers, no Seasons, and no wind or dragon tiles at all.',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: 'suited-only hand, empty bonus rack',
        mode: 'NK',
        hand: { concealed: '1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S', winningTile: '5S' },
        expectDetected: true,
        expectedTay: 3,
      },
      {
        label: 'suited-only hand with Kim, empty bonus rack',
        mode: 'K',
        hand: { concealed: '1T KIM 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S', winningTile: '5S' },
        expectDetected: true,
        expectedTay: 3,
      },
    ],
    negative: [
      {
        label: 'single 0-Tay flower still breaks Bo Hua Zi',
        mode: 'NK',
        hand: { concealed: '1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S', winningTile: '5S', flowers: 'F1' },
        expectDetected: false,
      },
      { label: 'no bonus tiles but a WX pair (honors break it)', mode: 'NK', hand: withFlowers(BASE, ''), expectDetected: false },
    ],
  },
  4: {
    id: 4,
    name: '4 Tiles Bunga',
    category: 'bonus',
    values: { K: 10, NK: 10 },
    definition: 'All four Flowers (F1–F4) held by the winner.',
    definitionConfidence: 'authoritative',
    positive: [
      { label: 'F1-F4', mode: 'NK', hand: withFlowers(BASE, 'F1 F2 F3 F4'), expectDetected: true, expectedTay: 10 },
    ],
    negative: [
      { label: '3 flowers + 1 season', mode: 'NK', hand: withFlowers(BASE, 'F1 F2 F3 M4'), expectDetected: false },
    ],
  },
  5: {
    id: 5,
    name: '4 Tiles Musim',
    category: 'bonus',
    values: { K: 20, NK: 20 },
    definition: 'All four Seasons (M1–M4) held by the winner.',
    definitionConfidence: 'authoritative',
    positive: [
      { label: 'M1-M4', mode: 'NK', hand: withFlowers(BASE, 'M1 M2 M3 M4'), expectDetected: true, expectedTay: 20 },
    ],
    negative: [
      { label: '3 seasons', mode: 'NK', hand: withFlowers(BASE, 'M1 M2 M3'), expectDetected: false },
    ],
  },
  6: {
    id: 6,
    name: '7 Tiles Bunga/Musim',
    category: 'bonus',
    values: { K: 30, NK: 30, instantHu: 10 },
    definition: 'Seven of the eight bonus tiles held: 30 Tay inside a completed Hu, or an immediate 10-Tay Hu without a complete hand.',
    definitionConfidence: 'authoritative',
    interpretationNote: 'PROJECT.md lists "30/10" — the calculator shows 30 in both K and NK; 10 is the instant-Hu value, not NK.',
    positive: [
      { label: '7 bonus inside complete Hu', mode: 'NK', hand: withFlowers(BASE, 'F1 F2 F3 F4 M1 M2 M3'), expectDetected: true, expectedTay: 30 },
      {
        label: '7 bonus instant Hu with an incomplete hand',
        mode: 'NK',
        hand: {
          concealed: '1T 5T 9T 2S 6S 1B 4B WD WN DZ DF DP 3S',
          winningTile: '8B',
          flowers: 'F1 F2 F3 F4 M1 M2 M4',
          instantHu: true,
          context: SELF_DRAW,
        },
        expectDetected: true,
        expectedTay: 10,
      },
    ],
    negative: [
      { label: '6 bonus tiles', mode: 'NK', hand: withFlowers(BASE, 'F1 F2 F3 F4 M1 M2'), expectDetected: false },
    ],
  },

  // ---------------------------------------------------------------- kim 7-9
  7: {
    id: 7,
    name: 'Tile KIM',
    category: 'kim',
    values: { K: 1, NK: null },
    definition: '1 Tay per Kim tile in the winning hand (K mode only).',
    definitionConfidence: 'authoritative',
    positive: [
      { label: 'one Kim in Jia', mode: 'K', hand: BASE_K, expectDetected: true, expectedTay: 1 },
      {
        label: 'two Kims (Jia gap + Pung)',
        mode: 'K',
        hand: { concealed: '1T 2T KIM 4S 5S 6S 7B 8B 9B WX WX 5T KIM', winningTile: '5T', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 2,
      },
    ],
    negative: [
      { label: 'no Kim (NK)', mode: 'NK', hand: BASE, expectDetected: false },
    ],
  },
  8: {
    id: 8,
    name: 'Bo KIM',
    category: 'kim',
    values: { K: null, NK: 3 },
    definition:
      'No Kim in the hand, OR every Kim is used only to complete a set as the tile its own face number/kind shows (i.e. not as a wildcard). NK only.',
    definitionConfidence: 'authoritative',
    interpretationNote:
      'The second clause implies physical Kim tiles carry a face identity. The current tile model gives Kim value 0 with no face, so only the "no Kim" clause is representable; the face-match clause needs a domain-model decision.',
    positive: [{ label: 'natural hand', mode: 'NK', hand: BASE, expectDetected: true, expectedTay: 3 }],
    negative: [{ label: 'hand with one Kim', mode: 'K', hand: BASE_K, expectDetected: false }],
  },
  9: {
    id: 9,
    name: 'Shi Kim',
    category: 'kim',
    values: { K: 40, NK: null, instantHu: 10 },
    definition: 'All four Kim tiles held: 40 Tay inside a completed Hu, or an immediate 10-Tay Hu.',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: '4 Kims in a complete hand',
        mode: 'K',
        hand: { concealed: '1T 2T KIM 4S KIM 6S 7B 8B 9B KIM KIM WX WX', winningTile: 'WX', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 40,
      },
      {
        label: '4 Kims instant Hu with incomplete hand',
        mode: 'K',
        hand: {
          concealed: '1T 5T 9T 2S 6S WD WN DZ DF KIM KIM KIM 3B',
          winningTile: 'KIM',
          flowers: 'F1',
          instantHu: true,
          context: SELF_DRAW,
        },
        expectDetected: true,
        expectedTay: 10,
      },
    ],
    negative: [
      {
        label: 'only 3 Kims',
        mode: 'K',
        hand: { concealed: '1T 2T KIM 4S KIM 6S 7B 8B 9B KIM WX WX WX', winningTile: '3B', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },

  // ---------------------------------------------------------------- first-turn 10-12
  10: {
    id: 10,
    name: 'Pao Chin',
    category: 'first-turn',
    values: { K: 20, NK: 30 },
    definition:
      'The initially dealt hand is already Cin (ready) and is declared; still counts if the first-round Thi Fu does not happen.',
    definitionConfidence: 'authoritative',
    positive: [
      { label: 'Pao Chin NK', mode: 'NK', hand: withCtx(BASE, { isPaoChin: true }), expectDetected: true, expectedTay: 30 },
      { label: 'Pao Chin K', mode: 'K', hand: withCtx(BASE_K, { isPaoChin: true }), expectDetected: true, expectedTay: 20 },
    ],
    negative: [{ label: 'not declared', mode: 'NK', hand: BASE, expectDetected: false }],
  },
  11: {
    id: 11,
    name: 'Thien Fu',
    category: 'first-turn',
    values: { K: 40, NK: 60 },
    definition: 'Dealer wins with the dealt 14-tile hand (after flower replacement), before any discard.',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: 'dealer heavenly hand',
        mode: 'NK',
        hand: withCtx(BASE, { ...SELF_DRAW, isInitialDeal: true, seatWind: 'dong' }),
        expectDetected: true,
        expectedTay: 60,
      },
      {
        label: 'dealer heavenly hand, K',
        mode: 'K',
        hand: withCtx(BASE_K, { ...SELF_DRAW, isInitialDeal: true, seatWind: 'dong' }),
        expectDetected: true,
        expectedTay: 40,
      },
    ],
    negative: [
      {
        label: 'non-dealer on first turn (that is Thi Fu)',
        mode: 'NK',
        hand: withCtx(BASE, { ...SELF_DRAW, isInitialDeal: true, seatWind: 'nan' }),
        expectDetected: false,
      },
      { label: 'dealer self-draw later in the game', mode: 'NK', hand: withCtx(BASE, { ...SELF_DRAW, seatWind: 'dong' }), expectDetected: false },
    ],
  },
  12: {
    id: 12,
    name: 'Thi Fu',
    category: 'first-turn',
    values: { K: 40, NK: 60 },
    definition: 'Hu on the first-round draw ("lew") or first discard, which must be preceded by a Pao Chin declaration.',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: 'Pao Chin declared, wins on first draw',
        mode: 'NK',
        hand: withCtx(BASE, { ...SELF_DRAW, isInitialDeal: true, isPaoChin: true }),
        expectDetected: true,
        expectedTay: 60,
      },
      {
        label: 'Pao Chin declared, Ron on the first discard',
        mode: 'K',
        hand: withCtx(BASE_K, { isInitialDeal: true, isPaoChin: true, discarderSeat: 'dong' }),
        expectDetected: true,
        expectedTay: 40,
      },
    ],
    negative: [
      {
        label: 'first-round win without a Pao Chin declaration',
        mode: 'NK',
        hand: withCtx(BASE, { ...SELF_DRAW, isInitialDeal: true }),
        expectDetected: false,
      },
      { label: 'Pao Chin declared but win is not first-round', mode: 'NK', hand: withCtx(BASE, { isPaoChin: true }), expectDetected: false },
    ],
  },

  // ---------------------------------------------------------------- hand shapes 13-20
  13: {
    id: 13,
    name: 'Chicken Hand',
    category: 'hand-shape',
    values: { K: 0, NK: 0 },
    definition: 'Legal 4 melds + pair with no other hand-shape pattern (mixed Jia/Pung, mixed suits, open).',
    definitionConfidence: 'authoritative',
    positive: [{ label: 'open mixed hand', mode: 'NK', hand: BASE_OPEN, expectDetected: true, expectedTay: 0 }],
    negative: [
      {
        label: 'all-Jia hand is Ping Fu, not Chicken',
        mode: 'NK',
        hand: { concealed: '1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S', winningTile: '5S', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },
  14: {
    id: 14,
    name: 'Ping Fu',
    category: 'hand-shape',
    values: { K: 3, NK: 3 },
    definition: 'Four Jia (sequences) and a non-value pair.',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: '4 Jia + 5S pair',
        mode: 'NK',
        hand: { concealed: '1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S', winningTile: '5S', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 3,
      },
    ],
    negative: [
      { label: 'contains a Pung', mode: 'NK', hand: BASE_OPEN, expectDetected: false },
      {
        label: 'pair is the seat wind (value pair)',
        mode: 'NK',
        hand: { concealed: '1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B WN', winningTile: 'WN', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },
  15: {
    id: 15,
    name: 'Tuei Tuei',
    category: 'hand-shape',
    values: { K: 5, NK: 10 },
    definition: 'Four Pung/Kong and a pair (all triplets).',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: 'all Pung NK',
        mode: 'NK',
        hand: { concealed: '2T 2T 2T 5S 5S 5S 8B 8B 8B WX WX WX 9T', winningTile: '9T', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 10,
      },
      {
        label: 'all Pung with Kim completing a Pung',
        mode: 'K',
        hand: { concealed: '2T 2T KIM 5S 5S 5S 8B 8B 8B WX WX WX 9T', winningTile: '9T', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 5,
      },
    ],
    negative: [{ label: 'one Jia', mode: 'NK', hand: BASE_OPEN, expectDetected: false }],
  },
  16: {
    id: 16,
    name: 'Tjit Tuei',
    category: 'hand-shape',
    values: { K: 10, NK: 20 },
    definition: 'Seven pairs (fully concealed).',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: '7 natural pairs',
        mode: 'NK',
        hand: { concealed: '1T 1T 3T 3T 5S 5S 7S 7S 2B 2B WX WX DP', winningTile: 'DP', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 20,
      },
      {
        label: 'Kim pairs with DP',
        mode: 'K',
        hand: { concealed: '1T 1T 3T 3T 5S 5S 7S 7S 2B 2B WX WX KIM', winningTile: 'DP', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 10,
      },
    ],
    negative: [{ label: 'standard 4 melds + pair', mode: 'NK', hand: BASE, expectDetected: false }],
  },
  17: {
    id: 17,
    name: 'Chao It',
    category: 'hand-shape',
    values: { K: 5, NK: 10 },
    definition: 'Half flush: one suit plus honors.',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: 'Tong + honors',
        mode: 'NK',
        hand: { concealed: '1T 2T 3T 5T 6T 7T 9T 9T 9T WX WX WX DP', winningTile: 'DP', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 10,
      },
    ],
    negative: [
      {
        label: 'Tong + honors + one Sok Jia',
        mode: 'NK',
        hand: { concealed: '1T 2T 3T 5S 6S 7S 9T 9T 9T WX WX WX DP', winningTile: 'DP', flowers: 'F1' },
        expectDetected: false,
      },
      { label: 'pure single suit is It Set, not Chao It', mode: 'NK', hand: { concealed: '1T 2T 3T 4T 5T 6T 7T 8T 9T 2T 3T 4T 5T', winningTile: '5T', flowers: 'F1' }, expectDetected: false },
    ],
  },
  18: {
    id: 18,
    name: 'It Set',
    category: 'hand-shape',
    values: { K: 20, NK: 30 },
    definition: 'Full flush: every tile from one suit, no honors.',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: 'pure Tong',
        mode: 'NK',
        hand: { concealed: '1T 2T 3T 4T 5T 6T 7T 8T 9T 2T 3T 4T 5T', winningTile: '5T', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 30,
      },
      {
        label: 'pure Tong with Kim',
        mode: 'K',
        hand: { concealed: '1T 2T 3T 4T 5T 6T 7T KIM 9T 2T 3T 4T 5T', winningTile: '5T', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 20,
      },
    ],
    negative: [
      {
        label: 'one honor pair (Chao It)',
        mode: 'NK',
        hand: { concealed: '1T 2T 3T 4T 5T 6T 7T 8T 9T 2T 3T 4T WX', winningTile: 'WX', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },
  19: {
    id: 19,
    name: 'Yau Kiu',
    category: 'hand-shape',
    values: { K: 30, NK: 40 },
    definition: 'Hand consists only of suited 1s and 9s (Tong/Sok/Ban): pure terminals, no honors.',
    definitionConfidence: 'authoritative',
    interpretationNote:
      'The rulebook says "only numbers 1 and 9", so winds/dragons disqualify (unlike the common "terminals and honors" variant). Since a Jia cannot be made from 1s and 9s alone, the hand is necessarily all Pungs + a terminal pair.',
    positive: [
      {
        label: 'all terminal Pungs + 9S pair',
        mode: 'NK',
        hand: { concealed: '1T 1T 1T 9T 9T 9T 1S 1S 1S 9B 9B 9B 9S', winningTile: '9S', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 40,
      },
      {
        label: 'Kim completes the 9B Pung',
        mode: 'K',
        hand: { concealed: '1T 1T 1T 9T 9T 9T 1S 1S 1S 9B 9B KIM 9S', winningTile: '9S', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 30,
      },
    ],
    negative: [
      {
        label: 'terminals plus honor sets (not allowed by ver06)',
        mode: 'NK',
        hand: { concealed: '1T 1T 1T 9S 9S 9S 1B 1B 1B WX WX WX DP', winningTile: 'DP', flowers: 'F1' },
        expectDetected: false,
      },
      {
        label: 'contains a 2T Pung',
        mode: 'NK',
        hand: { concealed: '2T 2T 2T 9T 9T 9T 1S 1S 1S 9B 9B 9B 9S', winningTile: '9S', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },
  20: {
    id: 20,
    name: 'Cap Sa Yau Kiu',
    category: 'hand-shape',
    values: { K: 40, NK: 60 },
    definition: 'Thirteen orphans: one of each terminal and honor plus a duplicate of any of them.',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: 'natural 13 orphans',
        mode: 'NK',
        hand: { concealed: '1T 9T 1S 9S 1B 9B WD WN WX WB DZ DF DP', winningTile: '1T', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 60,
      },
      {
        label: 'Kim substitutes DP',
        mode: 'K',
        hand: { concealed: '1T 9T 1S 9S 1B 9B WD WN WX WB DZ DF KIM', winningTile: '1T', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 40,
      },
    ],
    negative: [
      {
        label: 'DP replaced with 2T (not a Hu)',
        mode: 'NK',
        hand: { concealed: '1T 9T 1S 9S 1B 9B WD WN WX WB DZ DF 2T', winningTile: '1T', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },

  // ---------------------------------------------------------------- honors 21-29
  21: {
    id: 21,
    name: 'Siau San Yen',
    category: 'honors',
    values: { K: 10, NK: 20 },
    definition: 'Little three dragons: two dragon Pungs plus a pair of the third dragon.',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: 'DZ + DF Pungs, DP pair',
        mode: 'NK',
        hand: { concealed: 'DZ DZ DZ DF DF DF DP 1T 2T 3T 5S 6S 7S', winningTile: 'DP', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 20,
      },
    ],
    negative: [
      {
        label: 'three dragon Pungs (Ta San Yen)',
        mode: 'NK',
        hand: { concealed: 'DZ DZ DZ DF DF DF DP DP DP 1T 2T 3T 5S', winningTile: '5S', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },
  22: {
    id: 22,
    name: 'Ta San Yen',
    category: 'honors',
    values: { K: 30, NK: 40 },
    definition: 'Big three dragons: Pungs of all three dragons.',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: 'three dragon Pungs',
        mode: 'NK',
        hand: { concealed: 'DZ DZ DZ DF DF DF DP DP DP 1T 2T 3T 5S', winningTile: '5S', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 40,
      },
      {
        label: 'Kim completes the DP Pung',
        mode: 'K',
        hand: { concealed: 'DZ DZ DZ DF DF DF DP DP KIM 1T 2T 3T 5S', winningTile: '5S', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 30,
      },
    ],
    negative: [
      {
        label: 'little three dragons',
        mode: 'NK',
        hand: { concealed: 'DZ DZ DZ DF DF DF DP 1T 2T 3T 5S 6S 7S', winningTile: 'DP', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },
  23: {
    id: 23,
    name: 'Siau Se Si',
    category: 'honors',
    values: { K: 30, NK: 40 },
    definition: 'Little four winds: three wind Pungs plus a pair of the fourth wind.',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: 'WD WN WX Pungs, WB pair',
        mode: 'NK',
        hand: { concealed: 'WD WD WD WN WN WN WX WX WX WB 1T 2T 3T', winningTile: 'WB', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 40,
      },
    ],
    negative: [
      {
        label: 'four wind Pungs (Ta Se Si)',
        mode: 'NK',
        hand: { concealed: 'WD WD WD WN WN WN WX WX WX WB WB WB 5T', winningTile: '5T', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },
  24: {
    id: 24,
    name: 'Ta Se Si',
    category: 'honors',
    values: { K: 50, NK: 60 },
    definition: 'Big four winds: Pungs of all four winds.',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: 'four wind Pungs',
        mode: 'NK',
        hand: { concealed: 'WD WD WD WN WN WN WX WX WX WB WB WB 5T', winningTile: '5T', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 60,
      },
    ],
    negative: [
      {
        label: 'little four winds',
        mode: 'NK',
        hand: { concealed: 'WD WD WD WN WN WN WX WX WX WB 1T 2T 3T', winningTile: 'WB', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },
  25: {
    id: 25,
    name: 'Tris Angin Duduk',
    category: 'honors',
    values: { K: 1, NK: 1 },
    definition: 'Pung/Kong of the player\'s seat wind.',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: 'Nan seat with WN Pung',
        mode: 'NK',
        hand: { concealed: 'WN WN WN 1T 2T 3T 4S 5S 6S 7B 8B 9B 5T', winningTile: '5T', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 1,
      },
    ],
    negative: [
      {
        label: 'WX Pung for Nan seat',
        mode: 'NK',
        hand: { concealed: 'WX WX WX 1T 2T 3T 4S 5S 6S 7B 8B 9B 5T', winningTile: '5T', flowers: 'F1' },
        expectDetected: false,
      },
      {
        label: 'WN only as pair',
        mode: 'NK',
        hand: { concealed: 'WN WN 1T 2T 3T 4S 5S 6S 7B 8B 9B 5T 5T', winningTile: '5T', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },
  26: {
    id: 26,
    name: 'Tris Angin Putaran',
    category: 'honors',
    values: { K: 1, NK: 1 },
    definition: 'Pung/Kong of the prevailing round wind.',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: 'Dong round with WD Pung',
        mode: 'NK',
        hand: { concealed: 'WD WD WD 1T 2T 3T 4S 5S 6S 7B 8B 9B 5T', winningTile: '5T', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 1,
      },
    ],
    negative: [
      {
        label: 'WB Pung in Dong round',
        mode: 'NK',
        hand: { concealed: 'WB WB WB 1T 2T 3T 4S 5S 6S 7B 8B 9B 5T', winningTile: '5T', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },
  27: {
    id: 27,
    name: 'Tris Zhong',
    category: 'honors',
    values: { K: 2, NK: 2 },
    definition: 'Pung/Kong of Zhong (red dragon).',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: 'DZ Pung',
        mode: 'NK',
        hand: { concealed: 'DZ DZ DZ 1T 2T 3T 4S 5S 6S 7B 8B 9B 5T', winningTile: '5T', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 2,
      },
    ],
    negative: [
      {
        label: 'DZ pair only',
        mode: 'NK',
        hand: { concealed: 'DZ DZ 1T 2T 3T 4S 5S 6S 7B 8B 9B 5T 5T', winningTile: '5T', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },
  28: {
    id: 28,
    name: 'Tris Fat',
    category: 'honors',
    values: { K: 1, NK: 1 },
    definition: 'Pung/Kong of Fat (green dragon).',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: 'DF Pung',
        mode: 'NK',
        hand: { concealed: 'DF DF DF 1T 2T 3T 4S 5S 6S 7B 8B 9B 5T', winningTile: '5T', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 1,
      },
    ],
    negative: [
      {
        label: 'DF pair only',
        mode: 'NK',
        hand: { concealed: 'DF DF 1T 2T 3T 4S 5S 6S 7B 8B 9B 5T 5T', winningTile: '5T', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },
  29: {
    id: 29,
    name: 'Tris Pat',
    category: 'honors',
    values: { K: 1, NK: 1 },
    definition: 'Pung/Kong of Pat (white dragon).',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: 'DP Pung',
        mode: 'NK',
        hand: { concealed: 'DP DP DP 1T 2T 3T 4S 5S 6S 7B 8B 9B 5T', winningTile: '5T', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 1,
      },
    ],
    negative: [
      {
        label: 'DP pair only',
        mode: 'NK',
        hand: { concealed: 'DP DP 1T 2T 3T 4S 5S 6S 7B 8B 9B 5T 5T', winningTile: '5T', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },

  // ---------------------------------------------------------------- concealed & kim melds 30-34
  30: {
    id: 30,
    name: 'Kim Thi',
    category: 'concealed-and-kim-melds',
    values: { K: 30, NK: null },
    definition: 'Kim tiles are made into a tris (triplet): three Kims form one set on their own.',
    definitionConfidence: 'authoritative',
    interpretationNote:
      '"Kim dijadikan tris" is read as a triplet consisting of Kims (KIM KIM KIM), consistent with the 2-Kim eye of #32 (20) and 4 Kims of #9 (40), and with both Step-0 survey readings. A single Kim completing a natural Pung (5T 5T KIM) does NOT qualify.',
    positive: [
      {
        label: 'KIM KIM KIM as a set',
        mode: 'K',
        hand: { concealed: 'KIM KIM KIM 1T 2T 3T 4S 5S 6S 7B 8B 9B 2T', winningTile: '2T', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 30,
      },
    ],
    negative: [
      {
        label: 'three Kims spread across different sets',
        mode: 'K',
        hand: { concealed: '1T KIM 3T 4S KIM 6S 7B 8B KIM WX WX 5T 5T', winningTile: '5T', flowers: 'F1' },
        expectDetected: false,
      },
      { label: 'no Kim (NK)', mode: 'NK', hand: BASE, expectDetected: false },
      {
        label: 'single Kim completing a natural Pung',
        mode: 'K',
        hand: { concealed: '5T 5T KIM 1S 2S 3S 4B 5B 6B 7T 8T 9T WX', winningTile: 'WX', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },
  31: {
    id: 31,
    name: 'Ji Pa Ciok',
    category: 'concealed-and-kim-melds',
    values: { K: 1, NK: 1 },
    definition: 'The eye (pair) is a 2 or an 8, of any suit.',
    definitionConfidence: 'authoritative',
    interpretationNote:
      'Rulebook text is only "Angka 2 atau 8 (suit mana saja)"; "Ciok" is the eye, as in #32 "Kim dijadikan pair untuk kaki". Read as the pair being 2s or 8s. Whether a 2/8 + Kim eye qualifies is not stated.',
    positive: [
      {
        label: '8B pair',
        mode: 'NK',
        hand: { concealed: '1T 2T 3T 3T 4T 4S 5S 6S 7B 8B 9B 8B 8B', winningTile: '5T', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 1,
      },
    ],
    negative: [
      {
        label: '5B pair',
        mode: 'NK',
        hand: { concealed: '1T 2T 3T 3T 4T 4S 5S 6S 7B 8B 9B 5B 5B', winningTile: '5T', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },
  32: {
    id: 32,
    name: 'Kim Ciok',
    category: 'concealed-and-kim-melds',
    values: { K: 20, NK: null },
    definition: 'Kim tiles are made into the pair used as the eye ("kaki"): KIM + KIM eye.',
    definitionConfidence: 'authoritative',
    interpretationNote:
      '"Kim dijadikan pair untuk kaki". A single Kim pairing a natural tile is #40 Pyong Pi territory (5 Tay, self-drawn last tile), so #32 (20 Tay) is read as the two-Kim eye. When several decompositions exist, the scorer should pick the highest-scoring one.',
    positive: [
      {
        label: 'KIM KIM eye',
        mode: 'K',
        hand: { concealed: '1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX KIM KIM', winningTile: 'WX', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 20,
      },
    ],
    negative: [
      {
        label: 'Kim in Jia, natural 5T eye',
        mode: 'K',
        hand: { concealed: '1T 2T KIM 4S 5S 6S 7B 8B 9B WX WX WX 5T', winningTile: '5T', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },
  33: {
    id: 33,
    name: 'Sam Am Kang',
    category: 'concealed-and-kim-melds',
    values: { K: 5, NK: 5 },
    definition: 'Three triplets (tris) formed without calling Pung, i.e. concealed in hand (a concealed Ankong also counts).',
    definitionConfidence: 'authoritative',
    interpretationNote:
      '"3 tris terbentuk tanpa pung (concealed)": concealed triplets, NOT concealed Kongs. Fixtures avoid a triplet completed by the winning discard, whose concealed status the rulebook does not settle.',
    positive: [
      {
        label: '3 concealed triplets, Ron on the WX pair',
        mode: 'NK',
        hand: { concealed: '2T 2T 2T 5S 5S 5S 8B 8B 8B 1B 2B 3B WX', winningTile: 'WX', flowers: 'F1' },
        expectDetected: true,
        expectedTay: 5,
      },
      {
        label: '2 concealed triplets + 1 Ankong, self-draw',
        mode: 'NK',
        hand: {
          concealed: '2T 2T 2T 5S 5S 5S 1B 2B 3B WX',
          winningTile: 'WX',
          melds: [{ type: 'ankong', tiles: '8B 8B 8B 8B' }],
          flowers: 'F1',
          context: SELF_DRAW,
        },
        expectDetected: true,
        expectedTay: 5,
      },
    ],
    negative: [
      {
        label: '2 concealed triplets + 1 claimed Pung',
        mode: 'NK',
        hand: {
          concealed: '2T 2T 2T 5S 5S 5S 1B 2B 3B WX',
          winningTile: 'WX',
          melds: [{ type: 'pung', tiles: '8B 8B 8B', claimedFrom: 'dong' }],
          flowers: 'F1',
        },
        expectDetected: false,
      },
    ],
  },
  34: {
    id: 34,
    name: 'Si Am Kang',
    category: 'concealed-and-kim-melds',
    values: { K: 20, NK: 30, instantHu: 10 },
    definition:
      'Four triplets formed without calling Pung (concealed): 20/30 inside a completed Hu, or an immediate 10-Tay Hu without completing the hand.',
    definitionConfidence: 'authoritative',
    interpretationNote: 'Concealed triplets, NOT concealed Kongs (see #33). Supersedes #33.',
    positive: [
      {
        label: '4 concealed triplets + WX pair, self-draw',
        mode: 'NK',
        hand: { concealed: '2T 2T 2T 5S 5S 5S 8B 8B 8B DZ DZ DZ WX', winningTile: 'WX', flowers: 'F1', context: SELF_DRAW },
        expectDetected: true,
        expectedTay: 30,
      },
      {
        label: '4 concealed triplets with Kim completing one, K',
        mode: 'K',
        hand: { concealed: '2T 2T 2T 5S 5S 5S 8B 8B KIM DZ DZ DZ WX', winningTile: 'WX', flowers: 'F1', context: SELF_DRAW },
        expectDetected: true,
        expectedTay: 20,
      },
      {
        label: '4 concealed triplets instant Hu (eye incomplete)',
        mode: 'NK',
        hand: {
          concealed: '2T 2T 2T 5S 5S 5S 8B 8B 8B DZ DZ DZ WX',
          winningTile: '3S',
          flowers: 'F1',
          instantHu: true,
          context: SELF_DRAW,
        },
        expectDetected: true,
        expectedTay: 10,
      },
    ],
    negative: [
      {
        label: '3 concealed triplets + 1 claimed Pung',
        mode: 'NK',
        hand: {
          concealed: '2T 2T 2T 5S 5S 5S 8B 8B 8B WX',
          winningTile: 'WX',
          melds: [{ type: 'pung', tiles: 'DZ DZ DZ', claimedFrom: 'dong' }],
          flowers: 'F1',
          context: SELF_DRAW,
        },
        expectDetected: false,
      },
    ],
  },

  // ---------------------------------------------------------------- kong events 35-38
  35: {
    id: 35,
    name: 'Chiong Kong',
    category: 'kong-event',
    values: { K: 5, NK: 5 },
    definition: 'Win by robbing another player\'s promoted Kong (Kakan) tile.',
    definitionConfidence: 'authoritative',
    positive: [{ label: 'rob Kakan 5T', mode: 'NK', hand: withCtx(BASE, { isRobbingKong: true }), expectDetected: true, expectedTay: 5 }],
    negative: [{ label: 'ordinary Ron', mode: 'NK', hand: BASE, expectDetected: false }],
  },
  36: {
    id: 36,
    name: 'Ce Chiong Kong',
    category: 'kong-event',
    values: { K: 5, NK: 5 },
    definition:
      'Player has a Pung; the 4th tile of that kind is used in a sequence (seri) that sits in the concealed hand, and the win must be by self-draw (Ce Mo).',
    definitionConfidence: 'authoritative',
    interpretationNote:
      '"seri" here means a sequence (Jia), not a drawn game; "harus ada di dalam" = the sequence is concealed. Maps to WinContext.isSelfRobbingKong + isSelfDraw.',
    positive: [
      {
        label: 'draw 4th 5T, win with 4T-5T-6T',
        mode: 'NK',
        hand: {
          concealed: '4T 6T 4S 5S 6S 7B 8B 9B WX WX',
          winningTile: '5T',
          melds: [{ type: 'pung', tiles: '5T 5T 5T', claimedFrom: 'dong' }],
          flowers: 'F1',
          context: { ...SELF_DRAW, isSelfRobbingKong: true },
        },
        expectDetected: true,
        expectedTay: 5,
      },
    ],
    negative: [
      { label: 'ordinary self-draw', mode: 'NK', hand: withCtx(BASE, SELF_DRAW), expectDetected: false },
      {
        label: '4th 5T completes the concealed sequence but by Ron (must be Ce Mo)',
        mode: 'NK',
        hand: {
          concealed: '4T 6T 4S 5S 6S 7B 8B 9B WX WX',
          winningTile: '5T',
          melds: [{ type: 'pung', tiles: '5T 5T 5T', claimedFrom: 'dong' }],
          flowers: 'F1',
        },
        expectDetected: false,
      },
    ],
  },
  37: {
    id: 37,
    name: 'Kong Song Hu/Mo',
    category: 'kong-event',
    values: { K: 5, NK: 5 },
    definition: 'Win on the tail replacement tile drawn after a Kong.',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: 'replacement after 9S Kong',
        mode: 'NK',
        hand: {
          concealed: '1T 2T 3T 4S 5S 6S 7B 8B WX WX',
          winningTile: '9B',
          melds: [{ type: 'kong', tiles: '9S 9S 9S 9S', claimedFrom: 'dong' }],
          flowers: 'F1',
          context: { ...SELF_DRAW, isKongReplacement: true },
        },
        expectDetected: true,
        expectedTay: 5,
      },
    ],
    negative: [{ label: 'ordinary self-draw', mode: 'NK', hand: withCtx(BASE, SELF_DRAW), expectDetected: false }],
  },
  38: {
    id: 38,
    name: 'Kong Kong Hu',
    category: 'kong-event',
    values: { K: 30, NK: 30 },
    definition: 'Win on the replacement tile after two consecutive Kongs in the same turn.',
    definitionConfidence: 'authoritative',
    positive: [
      {
        label: 'Kong, replacement Kong, replacement wins',
        mode: 'NK',
        hand: {
          concealed: '1T 2T 3T 4S 5S 6S WX',
          winningTile: 'WX',
          melds: [
            { type: 'kong', tiles: '9S 9S 9S 9S', claimedFrom: 'dong' },
            { type: 'ankong', tiles: 'DP DP DP DP' },
          ],
          flowers: 'F1',
          context: { ...SELF_DRAW, isKongReplacement: true, isDoubleKongReplacement: true },
        },
        expectDetected: true,
        expectedTay: 30,
      },
    ],
    negative: [
      {
        label: 'single Kong replacement',
        mode: 'NK',
        hand: {
          concealed: '1T 2T 3T 4S 5S 6S 7B 8B WX WX',
          winningTile: '9B',
          melds: [{ type: 'kong', tiles: '9S 9S 9S 9S', claimedFrom: 'dong' }],
          flowers: 'F1',
          context: { ...SELF_DRAW, isKongReplacement: true },
        },
        expectDetected: false,
      },
    ],
  },

  // ---------------------------------------------------------------- special hands & finishes 39-44
  39: {
    id: 39,
    name: 'Se Sam Pu Tat',
    category: 'special-finish',
    values: { K: null, NK: 40 },
    definition:
      'All numbered tiles of the same suit are at least 3 apart, no pair anywhere, no Flowers or Seasons, and no Kim (NK only).',
    definitionConfidence: 'authoritative',
    interpretationNote:
      'Rulebook does not restrict honors beyond "no pair", so honors appear as singletons. "Minimal berbeda 3" is read as a rank gap of >= 3 (1-4-7 allowed, 1-3 not).',
    positive: [
      {
        label: '147T 258S 369B + 5 single honors, no bonus tiles',
        mode: 'NK',
        hand: { concealed: '1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB', winningTile: 'DZ', context: SELF_DRAW },
        expectDetected: true,
        expectedTay: 40,
      },
    ],
    negative: [
      {
        label: 'contains 4T-5T (gap 1)',
        mode: 'NK',
        hand: { concealed: '1T 4T 5T 2S 5S 8S 3B 6B 9B WD WN WX WB', winningTile: 'DZ', context: SELF_DRAW },
        expectDetected: false,
      },
      {
        label: 'contains an honor pair',
        mode: 'NK',
        hand: { concealed: '1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB', winningTile: 'WD', context: SELF_DRAW },
        expectDetected: false,
      },
      {
        label: 'valid spacing but a Flower is exposed',
        mode: 'NK',
        hand: { concealed: '1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX WB', winningTile: 'DZ', flowers: 'F1', context: SELF_DRAW },
        expectDetected: false,
      },
      {
        label: 'same shape with Kim',
        mode: 'K',
        hand: { concealed: '1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX KIM', winningTile: 'DZ', context: SELF_DRAW },
        expectDetected: false,
      },
    ],
  },
  40: {
    id: 40,
    name: 'Pyong Pi',
    category: 'special-finish',
    values: { K: 5, NK: null },
    definition: 'The last (winning) tile is the partner of a Kim, forming the Kim + tile eye, and is drawn from the wall (K only).',
    definitionConfidence: 'authoritative',
    interpretationNote:
      '"Tile terakhir merupakan pasangan Kim, diambil dari tembok". Read as a self-drawn winning tile pairing with a single Kim as the eye. Not stated: whether drawing the Kim itself to pair an already-held tile also qualifies.',
    positive: [
      {
        label: 'self-draw 9S pairs the held Kim',
        mode: 'K',
        hand: { concealed: '1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX WX KIM', winningTile: '9S', flowers: 'F1', context: SELF_DRAW },
        expectDetected: true,
        expectedTay: 5,
      },
    ],
    negative: [
      {
        label: '9S pairs the Kim but comes from a discard',
        mode: 'K',
        hand: { concealed: '1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX WX KIM', winningTile: '9S', flowers: 'F1' },
        expectDetected: false,
      },
      {
        label: 'Kim + 9S eye already held; self-drawn 3T completes a sequence',
        mode: 'K',
        hand: { concealed: '1T 2T 4S 5S 6S 7B 8B 9B WX WX WX KIM 9S', winningTile: '3T', flowers: 'F1', context: SELF_DRAW },
        expectDetected: false,
      },
      { label: 'no Kim (NK)', mode: 'NK', hand: withCtx(BASE, SELF_DRAW), expectDetected: false },
    ],
  },
  41: {
    id: 41,
    name: 'Tan Tiau',
    category: 'special-finish',
    values: { K: 5, NK: 5 },
    definition: 'Jia and/or Pung claimed repeatedly until only 1 tile is left in hand; the winning tile pairs that single tile.',
    definitionConfidence: 'authoritative',
    interpretationNote:
      'Not "all simples" (the common Chinese meaning): ver06 defines a single-tile wait after four claimed melds. Whether a claimed Kong counts toward the four is not stated.',
    positive: [
      {
        label: 'four claimed melds, Ron on the lone 5S',
        mode: 'NK',
        hand: {
          concealed: '5S',
          winningTile: '5S',
          melds: [
            { type: 'jia', tiles: '1T 2T 3T', claimedFrom: 'dong' },
            { type: 'jia', tiles: '4S 5S 6S', claimedFrom: 'dong' },
            { type: 'pung', tiles: 'WX WX WX', claimedFrom: 'xi' },
            { type: 'pung', tiles: '9B 9B 9B', claimedFrom: 'bei' },
          ],
          flowers: 'F1',
        },
        expectDetected: true,
        expectedTay: 5,
      },
      {
        label: 'four claimed melds, self-draw on the lone DZ',
        mode: 'NK',
        hand: {
          concealed: 'DZ',
          winningTile: 'DZ',
          melds: [
            { type: 'pung', tiles: '2T 2T 2T', claimedFrom: 'xi' },
            { type: 'jia', tiles: '4S 5S 6S', claimedFrom: 'dong' },
            { type: 'pung', tiles: 'WX WX WX', claimedFrom: 'xi' },
            { type: 'pung', tiles: '9B 9B 9B', claimedFrom: 'bei' },
          ],
          flowers: 'F1',
          context: SELF_DRAW,
        },
        expectDetected: true,
        expectedTay: 5,
      },
    ],
    negative: [
      { label: 'concealed hand', mode: 'NK', hand: BASE, expectDetected: false },
      { label: 'only one claimed meld', mode: 'NK', hand: BASE_OPEN, expectDetected: false },
      {
        label: 'all simples (2-8), concealed: the non-ver06 meaning',
        mode: 'NK',
        hand: { concealed: '2T 3T 4T 5S 5S 5S 6B 7B 8B 3S 4S 5S 8T', winningTile: '8T', flowers: 'F1' },
        expectDetected: false,
      },
    ],
  },
  42: {
    id: 42,
    name: 'Ce Mo',
    category: 'special-finish',
    values: { K: 1, NK: 1 },
    definition: 'Last tile drawn from the wall, after the player has already claimed a Pung or Jia (unconcealed).',
    definitionConfidence: 'authoritative',
    positive: [{ label: 'self-draw, open hand', mode: 'NK', hand: withCtx(BASE_OPEN, SELF_DRAW), expectDetected: true, expectedTay: 1 }],
    negative: [
      { label: 'Ron', mode: 'NK', hand: BASE_OPEN, expectDetected: false },
      { label: 'concealed self-draw (that is #44)', mode: 'NK', hand: withCtx(BASE, SELF_DRAW), expectDetected: false },
    ],
  },
  43: {
    id: 43,
    name: 'Mun',
    category: 'special-finish',
    values: { K: 1, NK: 1 },
    definition: 'Never claimed a Pung or Jia (concealed), and the last tile comes from an opponent discard.',
    definitionConfidence: 'authoritative',
    interpretationNote: 'Concealed self-draw is #44, not #43; an Ankong does not break concealment (it is not a Pung/Jia claim).',
    positive: [
      { label: 'concealed Ron', mode: 'NK', hand: BASE, expectDetected: true, expectedTay: 1 },
      { label: 'concealed Ron, K', mode: 'K', hand: BASE_K, expectDetected: true, expectedTay: 1 },
    ],
    negative: [
      { label: 'hand with an exposed Pung', mode: 'NK', hand: BASE_OPEN, expectDetected: false },
      { label: 'concealed self-draw', mode: 'NK', hand: withCtx(BASE, SELF_DRAW), expectDetected: false },
    ],
  },
  44: {
    id: 44,
    name: 'Ce Mo Pu Ciu Jen',
    category: 'special-finish',
    values: { K: 5, NK: 5 },
    definition: 'Last tile drawn from the wall, never having claimed a Pung or Jia (fully concealed).',
    definitionConfidence: 'authoritative',
    positive: [{ label: 'concealed self-draw', mode: 'NK', hand: withCtx(BASE, SELF_DRAW), expectDetected: true, expectedTay: 5 }],
    negative: [
      { label: 'self-draw with exposed Pung', mode: 'NK', hand: withCtx(BASE_OPEN, SELF_DRAW), expectDetected: false },
      { label: 'concealed Ron', mode: 'NK', hand: BASE, expectDetected: false },
    ],
  },
};

// ============================================================================
// Kim joker substitution edge cases
// ============================================================================

export type KimEdgeOutcome =
  /** Legal Hu shape; scoring proceeds in the stated mode. */
  | 'valid'
  /** Foul: Kim used where the rules forbid it, or below the Tay gate. */
  | 'lew-fit'
  /** Not a legal winning shape at all. */
  | 'not-hu'
  /** Immediate Hu regardless of shape. */
  | 'instant-hu';

export interface KimEdgeCase {
  readonly label: string;
  readonly focus: 'pung' | 'jia' | 'pair' | 'shi-kim' | 'bo-kim' | 'kim-thi' | 'kim-ciok' | 'pyong-pi' | 'mode';
  readonly hand: HandSpec;
  readonly expectedOutcome: KimEdgeOutcome;
  readonly expectedMode?: KimMode;
  /** Pattern ids that must (true) or must not (false) be detected. */
  readonly patternExpectations?: Partial<Record<PatternId, boolean>>;
  readonly note?: string;
}

/** Tournament (BMC06) Kim rules — the engine DEFAULT_RULES. */
export const TOURNAMENT_RULES: GameRules = {
  kimEnabled: true,
  kimDiscardAllowed: false,
  allowKimInMeldClaim: false,
  minHuTay: 5,
};

/** Casual preset: Kim may be used in claimed melds. */
export const CASUAL_RULES: GameRules = { ...TOURNAMENT_RULES, allowKimInMeldClaim: true };

export const KIM_EDGE_CASES: readonly KimEdgeCase[] = [
  // ---- Pung
  {
    label: 'Kim completes a concealed Pung',
    focus: 'pung',
    hand: { concealed: '5T 5T KIM 1S 2S 3S 4B 5B 6B 7T 8T 9T WX', winningTile: 'WX', flowers: 'F1' },
    expectedOutcome: 'valid',
    expectedMode: 'K',
    patternExpectations: { 7: true, 8: false },
  },
  {
    label: 'Kim inside a claimed (exposed) Pung under tournament rules',
    focus: 'pung',
    hand: {
      concealed: '1S 2S 3S 4B 5B 6B 7T 8T 9T WX',
      winningTile: 'WX',
      melds: [{ type: 'pung', tiles: '5T 5T KIM', claimedFrom: 'dong' }],
      flowers: 'F1',
      rules: TOURNAMENT_RULES,
    },
    expectedOutcome: 'lew-fit',
    note: 'allowKimInMeldClaim=false: using Kim in Jia/Pung/Kong claims triggers Lew Fit.',
  },
  {
    label: 'Kim inside a claimed Pung under casual rules',
    focus: 'pung',
    hand: {
      concealed: '1S 2S 3S 4B 5B 6B 7T 8T 9T WX',
      winningTile: 'WX',
      melds: [{ type: 'pung', tiles: '5T 5T KIM', claimedFrom: 'dong' }],
      flowers: 'F1',
      rules: CASUAL_RULES,
    },
    expectedOutcome: 'valid',
    expectedMode: 'K',
  },
  {
    label: 'Kim as the 4th tile of a concealed Kong (Ankong 5T 5T 5T KIM)',
    focus: 'pung',
    hand: {
      concealed: '1S 2S 3S 4B 5B 6B 7T 8T 9T WX',
      winningTile: 'WX',
      melds: [{ type: 'ankong', tiles: '5T 5T 5T KIM' }],
      flowers: 'F1',
      context: SELF_DRAW,
    },
    expectedOutcome: 'valid',
    expectedMode: 'K',
    note: 'UNVERIFIED: whether Kim may complete an Ankong; current engine getLegalActions excludes Kim from Ankong under tournament rules.',
  },
  // ---- Jia
  {
    label: 'Kim fills the middle of a concealed Jia (4T KIM 6T)',
    focus: 'jia',
    hand: { concealed: '4T KIM 6T 1S 2S 3S 4B 5B 6B 7T 8T 9T WX', winningTile: 'WX', flowers: 'F1' },
    expectedOutcome: 'valid',
    expectedMode: 'K',
    patternExpectations: { 7: true },
  },
  {
    label: 'Kim fills an edge of a concealed Jia (KIM 8S 9S)',
    focus: 'jia',
    hand: { concealed: 'KIM 8S 9S 1T 2T 3T 4B 5B 6B 7T 8T 9T WX', winningTile: 'WX', flowers: 'F1' },
    expectedOutcome: 'valid',
    expectedMode: 'K',
  },
  {
    label: 'Kim inside a claimed Jia under tournament rules',
    focus: 'jia',
    hand: {
      concealed: '1S 2S 3S 4B 5B 6B 7T 8T 9T WX',
      winningTile: 'WX',
      melds: [{ type: 'jia', tiles: '4T KIM 6T', claimedFrom: 'bei' }],
      flowers: 'F1',
      rules: TOURNAMENT_RULES,
    },
    expectedOutcome: 'lew-fit',
  },
  {
    label: 'Kim cannot bridge a Jia across honors (WD KIM WX is not a sequence)',
    focus: 'jia',
    hand: { concealed: 'WD KIM WX 1S 2S 3S 4B 5B 6B 7T 8T 9T 5T', winningTile: '6S', flowers: 'F1' },
    expectedOutcome: 'not-hu',
  },
  // ---- Pair
  {
    label: 'Kim pairs with a natural tile as the eye (9S KIM)',
    focus: 'pair',
    hand: { concealed: '1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX WX 9S', winningTile: 'KIM', flowers: 'F1', context: SELF_DRAW },
    expectedOutcome: 'valid',
    expectedMode: 'K',
    patternExpectations: { 32: false },
  },
  {
    label: 'Kim pairs in Tjit Tuei',
    focus: 'pair',
    hand: { concealed: '1T 1T 3T 3T 5S 5S 7S 7S 2B 2B WX WX KIM', winningTile: 'DP', flowers: 'F1' },
    expectedOutcome: 'valid',
    expectedMode: 'K',
    patternExpectations: { 16: true },
  },
  {
    label: 'Kim substitutes the missing orphan in Cap Sa Yau Kiu',
    focus: 'pair',
    hand: { concealed: '1T 9T 1S 9S 1B 9B WD WN WX WB DZ DF KIM', winningTile: '1T', flowers: 'F1' },
    expectedOutcome: 'valid',
    expectedMode: 'K',
    patternExpectations: { 20: true },
  },
  // ---- Kim Ciok / Kim Thi / Shi Kim
  {
    label: 'Kim Ciok: two Kims as the eye',
    focus: 'kim-ciok',
    hand: { concealed: '1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX KIM KIM', winningTile: 'WX', flowers: 'F1' },
    expectedOutcome: 'valid',
    expectedMode: 'K',
    patternExpectations: { 32: true, 7: true, 30: false, 9: false },
  },
  {
    label: 'Kim Thi: three Kims as a set',
    focus: 'kim-thi',
    hand: { concealed: 'KIM KIM KIM 1T 2T 3T 4S 5S 6S 7B 8B 9B 2T', winningTile: '2T', flowers: 'F1' },
    expectedOutcome: 'valid',
    expectedMode: 'K',
    patternExpectations: { 30: true, 32: false, 9: false },
  },
  {
    label: 'Shi Kim inside a complete hand (4 Kims)',
    focus: 'shi-kim',
    hand: { concealed: '1T 2T KIM 4S KIM 6S 7B 8B 9B KIM KIM WX WX', winningTile: 'WX', flowers: 'F1' },
    expectedOutcome: 'valid',
    expectedMode: 'K',
    patternExpectations: { 9: true },
  },
  {
    label: 'Shi Kim instant Hu on drawing the 4th Kim with a broken hand',
    focus: 'shi-kim',
    hand: {
      concealed: '1T 5T 9T 2S 6S WD WN DZ DF KIM KIM KIM 3B',
      winningTile: 'KIM',
      flowers: 'F1',
      instantHu: true,
      context: SELF_DRAW,
    },
    expectedOutcome: 'instant-hu',
    expectedMode: 'K',
    patternExpectations: { 9: true },
  },
  // ---- Bo Kim / mode
  {
    label: 'Bo Kim: no Kim anywhere → NK mode, +3',
    focus: 'bo-kim',
    hand: BASE,
    expectedOutcome: 'valid',
    expectedMode: 'NK',
    patternExpectations: { 8: true, 7: false },
  },
  {
    label: 'Self-drawn Kim pairs a held Kim: Kim Ciok eye, K mode',
    focus: 'mode',
    hand: { concealed: '1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX WX KIM', winningTile: 'KIM', flowers: 'F1', context: SELF_DRAW },
    expectedOutcome: 'valid',
    expectedMode: 'K',
    patternExpectations: { 8: false, 32: true },
    note: 'Whether #40 Pyong Pi also applies when the drawn tile is itself a Kim is not stated in ver06; left unasserted.',
  },
  {
    label: 'Bo KIM second clause: Kim used as its own face tile (not representable yet)',
    focus: 'bo-kim',
    hand: { concealed: '1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX WX KIM', winningTile: '9S', flowers: 'F1' },
    expectedOutcome: 'valid',
    expectedMode: 'K',
    note:
      'ver06 #8: "Kim dipakai untuk melengkapi set sesuai dengan nomer/jenis kim tersebut" also earns Bo KIM. If this Kim\'s printed face were 9S it would score NK + Bo KIM; the Tile model has no Kim face, so the scorer must treat it as K until that is modelled.',
  },
  {
    label: 'Se Sam Pu Tat shape with Kim is not Se Sam Pu Tat (NK-only)',
    focus: 'mode',
    hand: { concealed: '1T 4T 7T 2S 5S 8S 3B 6B 9B WD WN WX KIM', winningTile: 'DZ', flowers: 'F1', context: SELF_DRAW },
    expectedOutcome: 'not-hu',
    expectedMode: 'K',
    patternExpectations: { 39: false },
  },
  {
    label: 'Kim must stand in for a 5th copy (four 5T in hand, every decomposition needs Kim = 5T)',
    focus: 'mode',
    hand: { concealed: '5T 5T 5T 5T KIM 1S 2S 3S 4B 5B 6B WX WX', winningTile: 'WX', flowers: 'F1' },
    expectedOutcome: 'valid',
    expectedMode: 'K',
    note: 'UNVERIFIED: 5T5T+KIM Pung with 5T5T eye. Kim is normally an unrestricted wildcard; confirm the rulebook does not cap Kim at physically available copies.',
  },
  // ---- Pyong Pi
  {
    label: 'Pyong Pi: self-drawn last tile pairs the lone Kim',
    focus: 'pyong-pi',
    hand: { concealed: '1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX WX KIM', winningTile: '9S', flowers: 'F1', context: SELF_DRAW },
    expectedOutcome: 'valid',
    expectedMode: 'K',
    patternExpectations: { 40: true, 32: false, 8: false, 7: true },
  },
  {
    label: 'Pyong Pi absent: same pairing on a discard',
    focus: 'pyong-pi',
    hand: { concealed: '1T 2T 3T 4S 5S 6S 7B 8B 9B WX WX WX KIM', winningTile: '9S', flowers: 'F1' },
    expectedOutcome: 'valid',
    expectedMode: 'K',
    patternExpectations: { 40: false },
  },
  {
    label: 'Pyong Pi absent: Kim fills a Jia, self-drawn tile completes the natural eye',
    focus: 'pyong-pi',
    hand: { concealed: '1T KIM 3T 4S 5S 6S 7B 8B 9B 2T 3T 4T 6S', winningTile: '6S', flowers: 'F1', context: SELF_DRAW },
    expectedOutcome: 'valid',
    expectedMode: 'K',
    patternExpectations: { 40: false },
  },
  // ---- 5-Tay gate
  {
    label: 'Open Chicken Hand without bonus Tay falls below the 5-Tay gate',
    focus: 'mode',
    hand: BASE_OPEN,
    expectedOutcome: 'lew-fit',
    note: 'NK Chicken(0) + Bo KIM(3) + Tile Bunga F1 for Nan(0) = 3 < 5.',
  },
];

// ============================================================================
// Materialization helpers (fixture → engine-shaped tiles)
// ============================================================================

export interface MaterializedHand {
  readonly concealed: Tile[];
  readonly melds: Meld[];
  readonly flowers: Tile[];
  readonly winningTile: Tile;
  readonly context: FixtureWinContext;
}

function keysOf(s: string | undefined): string[] {
  return (s ?? '').trim().split(/\s+/).filter(Boolean);
}

/** Converts a HandSpec into Tiles with globally unique ids (copy index counted across all parts). */
export function materializeHand(spec: HandSpec): MaterializedHand {
  const counts = new Map<string, number>();
  const make = (key: string): Tile => {
    const k = key.toUpperCase();
    const n = (counts.get(k) ?? 0) + 1;
    counts.set(k, n);
    return keyToTile(k, n);
  };
  const melds: Meld[] = (spec.melds ?? []).map((m) => ({
    type: m.type,
    tiles: keysOf(m.tiles).map(make),
    ...(m.claimedFrom ? { claimedFrom: m.claimedFrom } : {}),
  }));
  return {
    concealed: keysOf(spec.concealed).map(make),
    melds,
    flowers: keysOf(spec.flowers).map(make),
    winningTile: make(spec.winningTile),
    context: { ...DEFAULT_CONTEXT, ...spec.context },
  };
}

/** Physical-tile tally of a hand (meld tiles as written, i.e. 3 per Kong). */
export function tallyKeys(spec: HandSpec): Map<string, number> {
  const all = [
    ...keysOf(spec.concealed),
    spec.winningTile,
    ...(spec.melds ?? []).flatMap((m) => keysOf(m.tiles)),
    ...keysOf(spec.flowers),
  ];
  const counts = new Map<string, number>();
  for (const k of all) counts.set(k.toUpperCase(), (counts.get(k.toUpperCase()) ?? 0) + 1);
  return counts;
}

/** 14 for every well-formed winning hand (melds count 3 each, including Kongs). */
export function normalizedHandSize(spec: HandSpec): number {
  return keysOf(spec.concealed).length + 1 + (spec.melds?.length ?? 0) * 3;
}

/** True when a hand contains at least one Kim tile anywhere. */
export function handHasKim(spec: HandSpec): boolean {
  return (tallyKeys(spec).get('KIM') ?? 0) > 0;
}
