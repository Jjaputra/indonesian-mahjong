import type { Seat, Wind } from '../core/types';
import { DEFAULT_SCORING_RULES, scoringEngine } from '../scoring';
import { buildWinContext, type HuCandidate, type WinFlags } from './win-context';

export interface HandReadingInput extends HuCandidate {
  seat: Seat;
  roundWind: Wind;
  flags: Pick<WinFlags, 'isSelfDraw'> & Partial<WinFlags>;
  minHuTay: number;
}

/** Read a selected winning tile; `hand` excludes that physical tile. */
export function handReadingLine(input: HandReadingInput): string {
  const context = buildWinContext(input.seat, input.roundWind, input.winningTile, {
    isRobbingKong: false,
    consecutiveKongs: 0,
    isFirstGoAround: false,
    isPaoChin: false,
    ...input.flags,
  });
  const result = scoringEngine.evaluateHand(
    [...input.hand],
    [...input.melds],
    [...input.flowers],
    context,
    { ...DEFAULT_SCORING_RULES, minHuTay: input.minHuTay }
  );

  if (result.isValidHu) return `Hu dengan tile ini: ${result.totalTay} Tay.`;
  if (result.lewFitReason === 'below-minimum') {
    return `Bentuk sah, ${result.totalTay} Tay, kurang dari minimum ${input.minHuTay} Tay.`;
  }
  return 'Tile ini tidak membentuk Hu.';
}
