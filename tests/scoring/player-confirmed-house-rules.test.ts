import { describe, expect, it } from 'vitest';
import { ScoringEngine, isDisallowedHonorPair, parseHandFeatures, scoreDecomposition, tableTay } from '@/scoring';
import { findWinningDecompositions } from '@/kim/wildcard-solver';
import { calculateTay, isSelectable } from '@/ui/tay-calculator';
import { materializeHand, TOURNAMENT_RULES, type HandSpec } from './claude-44-patterns-fixtures';

const engine = new ScoringEngine();
const live: HandSpec = {
  concealed: '9S 9S 9S DZ DZ DP DP', winningTile: 'DZ', flowers: 'M3',
  melds: [
    { type: 'pung', tiles: '9T 9T 9T', claimedFrom: 'dong' },
    { type: 'pung', tiles: '1B 1B 1B', claimedFrom: 'xi' },
  ],
};
function evaluate(spec: HandSpec, basis: 'match_table' | 'hand_kim_usage' = 'match_table', kimEnabled = true) {
  const m = materializeHand(spec);
  return engine.evaluateHand(m.concealed, m.melds, m.flowers, { ...m.context, winningTile: m.winningTile },
    { ...TOURNAMENT_RULES, ...spec.rules, kimEnabled, scoringBasis: basis });
}
const tay = (r: ReturnType<typeof evaluate>, id: number) => r.patterns.find(p => p.id === id)?.tay;

describe('Player-confirmed house rules, 2026-11-12', () => {
  it('scores the reported Zhong-discard Hu as exactly 11 Tay (player answer B)', () => {
    const r = evaluate(live);
    expect(r.mode).toBe('K');
    expect(r.isValidHu).toBe(true);
    expect(r.patterns.map(p => [p.id, p.tay])).toEqual([[2, 1], [8, 3], [15, 5], [27, 2]]);
    expect(r.totalTay).toBe(11);
    const calc = calculateTay([2, 15, 27, 8], true, 5, {
      scoringBasis: 'match_table', bonus: { seasons: 1, seasonSeatMatches: 0 },
    });
    expect(calc.total).toBe(11);
    expect(calc.lines.map(p => [p.id, p.tay])).toEqual([[2, 1], [8, 3], [15, 5], [27, 2]]);
    expect(r.notes.join(' ')).toContain('+3 Tay');
  });

  for (const pair of ['DZ', 'DF', 'DP', 'WD', 'WN', 'WX', 'WB']) {
    it(`checks both shapes with a valued or non-valued honor pair: ${pair}`, () => {
      const trips = evaluate({ concealed: `1T 1T 1T 5S 5S 5S 9B 9B 9B 3T 3T 3T ${pair}`, winningTile: pair });
      const sequences = evaluate({ concealed: `1T 2T 3T 4S 5S 6S 7B 8B 9B 4T 5T 6T ${pair}`, winningTile: pair });
      const valued = ['DZ', 'DF', 'DP', 'WD', 'WN'].includes(pair); // Seat Nan, prevailing Dong.
      expect(tay(trips, 15)).toBe(5); // Answer B: all pairs qualify for Tuei Tuei.
      expect(tay(sequences, 14)).toBe(valued ? undefined : 3);
      expect(tay(trips, 34)).toBe(20); // Concealed-triplet eligibility is independent.
    });
  }

  it('still awards Tuei Tuei with a number pair', () => {
    expect(tay(evaluate({ ...live, concealed: '9S 9S 9S DZ DZ 5B 5B' }), 15)).toBe(5);
  });

  for (const basis of ['match_table', 'hand_kim_usage'] as const) {
    it(`all-natural Kim receives Bo KIM exactly once under ${basis}`, () => {
      const m = materializeHand({
        concealed: '1T 2T 3T 1S 2S 3S 4B 5B 6B WD WD WD DF', winningTile: 'DF',
      });
      const hand = m.concealed.map((t, i) => i === 2 ? { ...t, isKim: true } : t);
      const r = engine.evaluateHand(hand, m.melds, m.flowers, { ...m.context, winningTile: m.winningTile },
        { ...TOURNAMENT_RULES, kimMode: 'natural', scoringBasis: basis });
      expect(r.mode).toBe('NK');
      expect(r.handKimCount).toBe(1);
      expect(r.patterns.filter(p => p.id === 8).map(p => p.tay)).toEqual([3]);
      expect(r.patterns.some(p => [7, 9, 30, 32, 40].includes(p.id))).toBe(false);
      expect(r.decomposition?.wildcardKimCount).toBe(0);
    });
    for (const withKim of [true, false]) {
      it(`Bo KIM is awarded once for ${basis}, Kim match=${withKim}, including calculator`, () => {
        const r = evaluate(live, basis, withKim);
        expect(r.patterns.filter(p => p.id === 8)).toHaveLength(1);
        expect(tay(r, 8)).toBe(3);
        expect(tay(r, 7)).toBeUndefined();
        expect(tableTay(8, withKim ? 'K' : 'NK', basis)).toBe(3);
        expect(isSelectable(8, withKim, false, basis)).toBe(true);
        const calc = calculateTay([8, 8], withKim, 5, { scoringBasis: basis });
        expect(calc.lines).toEqual([{ id: 8, name: 'Bo KIM', tay: 3 }]);
        expect(calc.total).toBe(3);
      });
    }
  }

  it('uses substituted honor faces and maximizes only legally awarded patterns', () => {
    const spec: HandSpec = { ...live, concealed: '9S 9S 9S DZ DZ DP KIM' };
    const m = materializeHand(spec);
    const context = { ...m.context, winningTile: m.winningTile };
    const candidates = findWinningDecompositions({ hand: [...m.concealed, m.winningTile], melds: m.melds,
      winningTile: m.winningTile, rules: TOURNAMENT_RULES, isSelfDraw: false });
    const totals = candidates.map(solved => {
      const features = parseHandFeatures(solved, m.concealed, m.melds);
      const patterns = scoreDecomposition({ features, mode: 'K', flowers: m.flowers, context, basis: 'match_table' });
      if (isDisallowedHonorPair(solved.pair, context)) expect(patterns.some(p => p.id === 14)).toBe(false);
      return patterns.reduce((sum, p) => sum + p.tay, 0);
    });
    expect(candidates.some(s => s.pair?.kimCount === 1 && isDisallowedHonorPair(s.pair, context))).toBe(true);
    expect(evaluate(spec).totalTay).toBe(Math.max(...totals));
  });

  it('seven pairs can still include honor pairs', () => {
    const r = evaluate({ concealed: '1T 1T 3T 3T 5S 5S 7S 7S 2B 2B WX WX DP', winningTile: 'DP' });
    expect(tay(r, 16)).toBe(10);
  });
});
