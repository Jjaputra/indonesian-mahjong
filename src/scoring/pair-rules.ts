import type { PairComposition } from '../kim/types';
import type { WinContext } from './types';

const WIND_NUMBER = { dong: 1, nan: 2, xi: 3, bei: 4 } as const;

/** Player answers 2026-11-12: dragons and valued winds disqualify Ping Fu (#14) only.
 * Player answer B: Tuei Tuei (#15) has no pair restriction.
 * Use the interpreted face (including Kim), and this hand's rotated winds.
 */
export function isDisallowedHonorPair(pair: PairComposition | undefined, context: Pick<WinContext, 'seatWind' | 'roundWind'>): boolean {
  return pair?.representedTiles.some(tile => tile.type === 'dragon' ||
    (tile.type === 'wind' && (tile.value === WIND_NUMBER[context.seatWind] || tile.value === WIND_NUMBER[context.roundWind]))) ?? false;
}
