import type { PairComposition } from '../kim/types';
import type { TileKind } from './hand-parser';

/** Player feedback 2026-11-12: naga and surat means all dragons and all four winds. */
export const DISALLOWED_PAIR_HONORS: readonly TileKind[] = [
  { type: 'dragon', value: 1 }, { type: 'dragon', value: 2 }, { type: 'dragon', value: 3 },
  { type: 'wind', value: 1 }, { type: 'wind', value: 2 },
  { type: 'wind', value: 3 }, { type: 'wind', value: 4 },
];

/** #14/#15 use the interpreted pair face, including an honor supplied by Kim substitution. */
export function isDisallowedHonorPair(pair: PairComposition | undefined): boolean {
  return pair?.representedTiles.some((tile) =>
    DISALLOWED_PAIR_HONORS.some((honor) => honor.type === tile.type && honor.value === tile.value)
  ) ?? false;
}
