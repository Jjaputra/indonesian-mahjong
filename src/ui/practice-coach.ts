/**
 * Practice coach: one Bahasa Indonesia sentence about the action that is legal right now, plus
 * which HUD action it refers to. Pure function over the fields of GameController.getHumanActions(),
 * so the table can render it and tests can drive it without a DOM.
 */
import type { HumanActions } from './game-controller';

export type CoachEmphasis = 'tarik' | 'buang' | 'hu' | 'kong' | 'pung' | 'jia' | 'lew' | 'pao-chin' | 'ankong' | 'kakan' | 'flowers' | 'none';

type CoachClaim = Pick<NonNullable<HumanActions['claim']>, 'canHu' | 'canKong' | 'canPung'> & { jiaOptions: readonly unknown[] };

export interface PracticeCoachInput {
  canDraw: boolean;
  canDiscard: boolean;
  discardableTileIds: readonly string[];
  ankongOptions: readonly unknown[];
  kakanOptions: readonly unknown[];
  canSelfDrawHu: boolean;
  canPaoChin: boolean;
  canReplaceFlowers: boolean;
  claim: CoachClaim | null;
  /** Tile currently lifted in the human's hand */
  selectedTileId?: string | null;
  /** Readable name of the selected tile, e.g. tileText(tile) */
  selectedTileLabel?: string | null;
  /** controller.outcome: any non-null value means the hand is over */
  outcome?: unknown;
  /** Omitted for a standalone hand; false between match hands, true after the last. */
  matchComplete?: boolean;
  /** True while the bots are taking their turns */
  waiting?: boolean;
}

export interface CoachLine {
  text: string;
  emphasis: CoachEmphasis;
}

export const COACH_BOTS_TEXT = 'Pemain lain sedang mengambil giliran.';
export const COACH_GAME_OVER_TEXT = 'Hasil permainan sudah siap. Permainan Baru membawa Anda kembali ke menu utama.';

function joinOr(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} atau ${items[items.length - 1]}`;
}

function claimLine(c: CoachClaim): CoachLine {
  const canJia = c.jiaOptions.length > 0;
  const enabled: { label: string; emphasis: CoachEmphasis }[] = [];
  if (c.canHu) enabled.push({ label: 'Hu', emphasis: 'hu' });
  if (c.canKong) enabled.push({ label: 'Kong', emphasis: 'kong' });
  if (c.canPung) enabled.push({ label: 'Pung', emphasis: 'pung' });
  if (canJia) enabled.push({ label: 'Jia', emphasis: 'jia' });

  if (enabled.length === 0) {
    return { text: 'Buangan ini tidak bisa Anda klaim; tekan Lew untuk melewatkannya.', emphasis: 'lew' };
  }
  const notes: string[] = [];
  if (c.canHu && (c.canKong || c.canPung)) notes.push('Hu didahulukan');
  if (canJia) notes.push('Jia hanya dari pemain di kiri Anda');
  const note = notes.length ? ` (${notes.join('; ')})` : '';
  return {
    text: `Anda bisa klaim buangan ini dengan ${joinOr(enabled.map((e) => e.label))}${note}, atau tekan Lew untuk melewatkannya.`,
    emphasis: enabled[0]!.emphasis,
  };
}

function discardTail(input: PracticeCoachInput): string {
  return input.canDiscard ? ', atau angkat satu tile lalu Buang' : '';
}

export function practiceCoachLine(input: PracticeCoachInput): CoachLine {
  if (input.outcome) {
    const text = input.matchComplete === false
      ? 'Hasil game sudah siap. Buka hasil lalu pilih Lanjut ke game berikutnya untuk melanjutkan pertandingan.'
      : input.matchComplete === true
        ? 'Pertandingan selesai. Buka hasil lalu Lihat klasemen akhir; pilih Main lagi atau Kembali ke menu.'
        : COACH_GAME_OVER_TEXT;
    return { text, emphasis: 'none' };
  }
  if (input.claim) return claimLine(input.claim);
  if (input.canReplaceFlowers) {
    return { text: 'Anda memegang Bunga; tekan Ganti Bunga untuk menukarnya dengan tile baru.', emphasis: 'flowers' };
  }
  if (input.canSelfDrawHu) {
    return { text: `Hand Anda sudah lengkap; tekan Hu untuk menang${discardTail(input)}.`, emphasis: 'hu' };
  }
  if (input.canDraw) return { text: 'Giliran Anda: tekan Tarik untuk mengambil tile dari tembok.', emphasis: 'tarik' };
  if (input.canPaoChin) {
    return { text: `Hand Anda bisa langsung Cin; tekan Pao Chin untuk mendeklarasikannya${discardTail(input)}.`, emphasis: 'pao-chin' };
  }
  if (input.ankongOptions.length > 0) {
    return { text: `Anda memegang empat tile sama; tekan Ankong untuk Kong tertutup${discardTail(input)}.`, emphasis: 'ankong' };
  }
  if (input.kakanOptions.length > 0) {
    return { text: `Tile ini melengkapi Pung terbuka Anda; tekan Kakan untuk menjadikannya Kong${discardTail(input)}.`, emphasis: 'kakan' };
  }
  if (input.canDiscard) {
    const id = input.selectedTileId;
    if (id && input.discardableTileIds.includes(id)) {
      const label = input.selectedTileLabel || 'tile yang dipilih';
      return { text: `Tekan Buang untuk membuang ${label}, atau klik tile lain untuk mengganti pilihan.`, emphasis: 'buang' };
    }
    return { text: 'Angkat satu tile dari tangan Anda, lalu tekan Buang.', emphasis: 'buang' };
  }
  return { text: COACH_BOTS_TEXT, emphasis: 'none' };
}
