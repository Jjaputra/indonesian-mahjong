import { describe, expect, it } from 'vitest';
import { isConcealedTripletForAmKang, keepsHandConcealed } from '@/core/melds';
import { canFormWinningHand } from '@/core/game-engine';
import { parseTileHand } from '@/core/tiles';

describe('Kong concealment', () => {
  it.each([
    { type: 'kong', fromConcealedTriplet: true, amKang: true, closed: false },
    { type: 'kong', amKang: false, closed: false },
    { type: 'ankong', amKang: true, closed: true },
    { type: 'pung', amKang: false, closed: false },
    { type: 'jia', amKang: false, closed: false },
  ] as const)('$type (concealed-triplet claim: $fromConcealedTriplet)', ({ amKang, closed, ...meld }) => {
    expect(isConcealedTripletForAmKang(meld)).toBe(amKang);
    expect(keepsHandConcealed(meld)).toBe(closed);
  });
});

it('accepts four undeclared identical tiles as two pairs in Tjit Tuei', () => {
  const tiles = parseTileHand('1B 1B 1B 1B 3T 3T 5T 5T 7S 7S 9S 9S DZ DZ');
  expect(canFormWinningHand(tiles, false)).toBe(true);
  expect(canFormWinningHand(tiles, true)).toBe(true);
});
