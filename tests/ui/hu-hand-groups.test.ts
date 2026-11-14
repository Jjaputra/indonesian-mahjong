/** The Hu receipt lays the concealed hand out set by set, the way it was scored. */
import { describe, expect, it } from 'vitest';
import { keyToTile, parseTileHand, tileToKey } from '@/core/tiles';
import type { Tile } from '@/core/types';
import { scoringEngine, type WinContext } from '@/scoring';
import { scoredHandGroups } from '@/ui/components/HuResultModal';

function ctx(winningTile: Tile): WinContext {
  return {
    winningTile, isSelfDraw: true, isDiscardWin: false, isInitialDeal: false, isPaoChin: false, isRobbingKong: false,
    isSelfRobbingKong: false, isKongReplacement: false, isDoubleKongReplacement: false, seatWind: 'nan', roundWind: 'dong',
  };
}

const keys = (groups: Tile[][]) => groups.map((g) => g.map(tileToKey).join(' '));

describe('scoredHandGroups', () => {
  it('orders a shuffled hand into its sets, then the pair', () => {
    const win = keyToTile('5S', 9);
    const hand = [...parseTileHand('6B 2S 4T 1T 8B 3S 5T 2T 7B 6T 3T 4S 5S'), win];
    const r = scoringEngine.evaluateHand(hand, [], [], ctx(win), { kimEnabled: true, kimDiscardAllowed: false, allowKimInMeldClaim: false, minHuTay: 0 });
    expect(keys(scoredHandGroups(hand, r))).toEqual(['1T 2T 3T', '4T 5T 6T', '2S 3S 4S', '6B 7B 8B', '5S 5S']);
  });

  it('falls back to plain tile order without a decomposition', () => {
    const hand = parseTileHand('9B 1T 5S');
    expect(keys(scoredHandGroups(hand, {}))).toEqual(['1T 5S 9B']);
  });
});
