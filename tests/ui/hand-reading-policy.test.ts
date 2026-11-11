import { describe, expect, it } from 'vitest';
import { keyToTile, parseTileHand } from '@/core/tiles';
import { getPreset } from '@/storage';
import { handReadingLine, type HandReadingInput } from '@/ui/hand-reading';
import { scoreHu, toFullRules, type FullRules, type WinFlags } from '@/ui/win-context';
import type { OverlapPolicy } from '@/scoring';

/** Ping Fu hand winning on the first-round discard after Pao Chin: supersede drops Pao Chin (30 NK). */
const flags: WinFlags = {
  isSelfDraw: false,
  isRobbingKong: false,
  consecutiveKongs: 0,
  isFirstGoAround: true,
  isPaoChin: true,
  discarderSeat: 'dong',
};

function input(patch: Partial<HandReadingInput> = {}): HandReadingInput {
  return {
    hand: parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S'),
    winningTile: keyToTile('5S', 2),
    melds: [],
    flowers: [],
    seat: 'nan',
    roundWind: 'dong',
    flags,
    minHuTay: 5,
    ...patch,
  };
}

function expected(i: HandReadingInput, rules: FullRules, policy: OverlapPolicy): string {
  const r = scoreHu(i, i.seat, i.roundWind, flags, { ...rules, minHuTay: i.minHuTay }, policy);
  if (r.isValidHu) return `Hu dengan tile ini: ${r.totalTay} Tay.`;
  if (r.lewFitReason === 'below-minimum') return `Bentuk sah, ${r.totalTay} Tay, kurang dari minimum ${i.minHuTay} Tay.`;
  return 'Tile ini tidak membentuk Hu.';
}

describe('handReadingLine follows the selected rules and overlap policy', () => {
  const tournament = toFullRules(getPreset('tournament'));

  it('matches scoreHu under both overlap policies, and the policies really differ here', () => {
    const additive = handReadingLine(input({ rules: tournament, overlapPolicy: 'additive' }));
    const supersede = handReadingLine(input({ rules: tournament, overlapPolicy: 'supersede' }));
    expect(additive).toBe(expected(input(), tournament, 'additive'));
    expect(supersede).toBe(expected(input(), tournament, 'supersede'));
    expect(additive).not.toBe(supersede);
  });

  it('defaults to additive when no policy is given', () => {
    expect(handReadingLine(input())).toBe(handReadingLine(input({ overlapPolicy: 'additive' })));
  });

  it('applies the supplied Kim rules', () => {
    // Kim completing the pair: legal by default, rejected when Kim may not form a pair.
    const kimPair = input({
      hand: parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B KIM'),
      flags: { isSelfDraw: false },
    });
    const noKimPair: FullRules = { ...tournament, allowKimInPair: false };
    expect(handReadingLine({ ...kimPair, rules: tournament })).not.toBe('Tile ini tidak membentuk Hu.');
    expect(handReadingLine({ ...kimPair, rules: noKimPair })).toBe('Tile ini tidak membentuk Hu.');
  });

  it('input minHuTay overrides the rules minimum', () => {
    const line = handReadingLine(input({ rules: { ...tournament, minHuTay: 200 }, minHuTay: 5 }));
    expect(line.startsWith('Hu dengan tile ini')).toBe(true);
  });
});
