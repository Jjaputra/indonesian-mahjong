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

export const COACH_BOTS_TEXT = 'Nunggu giliran pemain lain.';
export const COACH_GAME_OVER_TEXT = 'Hasil game udah siap. Tekan Ke menu buat balik ke menu utama.';

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
    return { text: 'Buangan ini nggak bisa kamu klaim. Tekan Lew buat lewat.', emphasis: 'lew' };
  }
  const notes: string[] = [];
  if (c.canHu && (c.canKong || c.canPung)) notes.push('Hu didahulukan');
  if (canJia) notes.push('Jia cuma dari buangan pemain di kiri kamu');
  const note = notes.length ? ` (${notes.join('; ')})` : '';
  return {
    text: `Buangan ini bisa diklaim: ${joinOr(enabled.map((e) => e.label))}${note}. Atau tekan Lew buat lewat.`,
    emphasis: enabled[0]!.emphasis,
  };
}

function discardTail(input: PracticeCoachInput): string {
  return input.canDiscard ? ', atau angkat satu tile lalu Buang' : '';
}

export function practiceCoachLine(input: PracticeCoachInput): CoachLine {
  if (input.outcome) {
    const text = input.matchComplete === false
      ? 'Hasil game udah siap. Buka hasil, lalu tekan Lanjut buat main game berikutnya.'
      : input.matchComplete === true
        ? 'Match selesai. Buka hasil, tekan Lihat klasemen akhir, lalu pilih Main lagi atau Ke menu.'
        : COACH_GAME_OVER_TEXT;
    return { text, emphasis: 'none' };
  }
  if (input.claim) return claimLine(input.claim);
  if (input.canReplaceFlowers) {
    return { text: 'Ada Bunga di tangan. Tekan Ganti Bunga buat tukar dengan tile baru.', emphasis: 'flowers' };
  }
  if (input.canSelfDrawHu) {
    return { text: `Hand udah lengkap. Tekan Hu buat menang${discardTail(input)}.`, emphasis: 'hu' };
  }
  if (input.canDraw) return { text: 'Giliran kamu. Tekan Tarik buat ambil tile dari tembok.', emphasis: 'tarik' };
  if (input.canPaoChin) {
    return { text: `Hand bisa langsung Cin. Tekan Pao Chin buat deklarasi${discardTail(input)}.`, emphasis: 'pao-chin' };
  }
  if (input.ankongOptions.length > 0) {
    return { text: `Ada empat tile sama di tangan. Tekan Kong buat Kong tertutup${discardTail(input)}.`, emphasis: 'ankong' };
  }
  if (input.kakanOptions.length > 0) {
    return { text: `Tile ini melengkapi Pung terbuka kamu. Tekan Kong buat nambahin ke Pung itu${discardTail(input)}.`, emphasis: 'kakan' };
  }
  if (input.canDiscard) {
    const id = input.selectedTileId;
    if (id && input.discardableTileIds.includes(id)) {
      const label = input.selectedTileLabel || 'tile yang dipilih';
      return { text: `Tekan Buang buat buang ${label}, atau pilih tile lain.`, emphasis: 'buang' };
    }
    return { text: 'Angkat satu tile dari tangan, lalu tekan Buang.', emphasis: 'buang' };
  }
  return { text: COACH_BOTS_TEXT, emphasis: 'none' };
}
