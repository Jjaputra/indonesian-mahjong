import { describe, expect, it } from 'vitest';
import { keyToTile, parseTileHand } from '@/core/tiles';
import { handReadingLine, type HandReadingInput } from '@/ui/hand-reading';

function chickenInput(): HandReadingInput {
  return {
    hand: parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WN WN WN 4T'),
    winningTile: keyToTile('4T', 2),
    melds: [],
    flowers: [],
    seat: 'dong',
    roundWind: 'dong',
    flags: { isSelfDraw: false },
    minHuTay: 5,
  };
}

describe('handReadingLine', () => {
  it('reports a legal hand at the 5 Tay minimum', () => {
    expect(handReadingLine({ ...chickenInput(), flowers: [keyToTile('F1')] }))
      .toBe('Hu dengan tile ini: 5 Tay.');
  });

  it('distinguishes a real 4 Tay shape below the minimum', () => {
    expect(handReadingLine(chickenInput()))
      .toBe('Bentuk sah, 4 Tay, kurang dari minimum 5 Tay.');
  });

  it('uses the configured minimum', () => {
    expect(handReadingLine({ ...chickenInput(), minHuTay: 4 }))
      .toBe('Hu dengan tile ini: 4 Tay.');
  });

  it('uses the self-draw context', () => {
    expect(handReadingLine({ ...chickenInput(), flags: { isSelfDraw: true } }))
      .toBe('Hu dengan tile ini: 8 Tay.');
  });

  it('rejects a nonsense hand', () => {
    expect(handReadingLine({
      ...chickenInput(),
      hand: parseTileHand('1T 3T 5T 7T 9T 1S 3S 5S 7S 9S WD WN WX'),
      winningTile: keyToTile('DZ'),
    })).toBe('Tile ini tidak membentuk Hu.');
  });
});
