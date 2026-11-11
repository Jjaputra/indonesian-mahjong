import type { Seat, Wind } from '../core/types';
import { DEFAULT_SCORING_RULES, type OverlapPolicy as ScoringOverlapPolicy } from '../scoring';
import { buildWinContext, getScoringEngine, type FullRules, type HuCandidate, type WinFlags } from './win-context';

export interface HandReadingInput extends HuCandidate {
  seat: Seat;
  roundWind: Wind;
  flags: Pick<WinFlags, 'isSelfDraw'> & Partial<WinFlags>;
  minHuTay: number;
  /** Active match rules (Kim toggles); defaults to the scorer's default rules. `minHuTay` above always wins. */
  rules?: FullRules;
  /** Active overlap policy; defaults to additive. */
  overlapPolicy?: ScoringOverlapPolicy;
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
  const result = getScoringEngine(input.overlapPolicy ?? 'additive').evaluateHand(
    [...input.hand],
    [...input.melds],
    [...input.flowers],
    context,
    { ...(input.rules ?? DEFAULT_SCORING_RULES), minHuTay: input.minHuTay }
  );

  if (result.isValidHu) return `Hu dengan tile ini: ${result.totalTay} Tay.`;
  if (result.lewFitReason === 'below-minimum') {
    return `Bentuk sah, ${result.totalTay} Tay, kurang dari minimum ${input.minHuTay} Tay.`;
  }
  return 'Tile ini tidak membentuk Hu.';
}
