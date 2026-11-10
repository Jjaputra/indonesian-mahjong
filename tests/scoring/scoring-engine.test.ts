/**
 * Runs every positive and negative fixture of the 44-pattern catalog (and the Kim edge cases)
 * through scoringEngine.evaluateHand.
 */
import { describe, it, expect } from 'vitest';
import {
  PATTERNS,
  ScoringEngine,
  scoringEngine,
  type ScoringResult,
  type WinContext,
} from '@/scoring';
import { parseTileHand, keyToTile } from '@/core/tiles';
import {
  ALL_PATTERN_IDS,
  KIM_EDGE_CASES,
  PATTERN_FIXTURES,
  TOURNAMENT_RULES,
  materializeHand,
  type HandSpec,
} from './claude-44-patterns-fixtures';

function evaluate(spec: HandSpec, engine = scoringEngine): ScoringResult {
  const m = materializeHand(spec);
  const context: WinContext = {
    ...m.context,
    winningTile: m.winningTile,
    isInstantHu: !!spec.instantHu,
  };
  return engine.evaluateHand(m.concealed, m.melds, m.flowers, context, { ...TOURNAMENT_RULES, ...spec.rules });
}

const tayOf = (r: ScoringResult, id: number) => r.patterns.find((p) => p.id === id)?.tay;

describe('Pattern table matches the fixture catalog', () => {
  it.each(ALL_PATTERN_IDS.map((id) => [id]))('#%i values', (id) => {
    const def = PATTERNS.get(id)!;
    const fx = PATTERN_FIXTURES[id];
    expect(def.name).toBe(fx.name);
    expect(def.K).toBe(fx.values.K);
    expect(def.NK).toBe(fx.values.NK);
    expect(def.instantHu).toBe(fx.values.instantHu);
    expect(def.seatMatchBonus).toBe(fx.values.seatMatchBonus);
  });
});

describe('All 44 patterns: positive and negative fixtures', () => {
  for (const id of ALL_PATTERN_IDS) {
    const fx = PATTERN_FIXTURES[id];
    describe(`#${id} ${fx.name}`, () => {
      for (const c of fx.positive) {
        it(`+ ${c.label}`, () => {
          const r = evaluate(c.hand);
          expect(r.lewFitReason, r.rejectionReason).not.toBe('structure');
          expect(r.lewFitReason).not.toBe('kim-claim');
          expect(r.mode).toBe(c.mode);
          expect(r.isWithKim).toBe(c.mode === 'K');
          expect(tayOf(r, id), JSON.stringify(r.patterns.map((p) => [p.id, p.tay]))).toBe(c.expectedTay);
          expect(r.totalTay).toBe(r.patterns.reduce((s, p) => s + p.tay, 0));
          expect(r.isValidHu).toBe(r.totalTay >= 5);
          expect(r.isLewFit).toBe(!r.isValidHu);
        });
      }
      for (const c of fx.negative) {
        it(`- ${c.label}`, () => {
          const r = evaluate(c.hand);
          expect(r.patterns.some((p) => p.id === id), JSON.stringify(r.patterns.map((p) => p.id))).toBe(false);
        });
      }
    });
  }
});

describe('Kim edge cases', () => {
  for (const c of KIM_EDGE_CASES) {
    it(`${c.focus}: ${c.label} → ${c.expectedOutcome}`, () => {
      const r = evaluate(c.hand);
      switch (c.expectedOutcome) {
        case 'valid':
          expect(['structure', 'kim-claim', 'instant-invalid']).not.toContain(r.lewFitReason);
          break;
        case 'lew-fit':
          expect(r.isLewFit).toBe(true);
          expect(['kim-claim', 'below-minimum']).toContain(r.lewFitReason);
          break;
        case 'not-hu':
          expect(r.lewFitReason).toBe('structure');
          break;
        case 'instant-hu':
          expect(r.isValidHu).toBe(true);
          expect(r.isInstantHu).toBe(true);
          break;
      }
      if (c.expectedMode && c.expectedOutcome !== 'not-hu') expect(r.mode).toBe(c.expectedMode);
      for (const [idStr, expected] of Object.entries(c.patternExpectations ?? {})) {
        expect(r.patterns.some((p) => p.id === Number(idStr)), `#${idStr}`).toBe(expected);
      }
    });
  }
});

describe('Gate, Lew Fit, instant Hu, arbitration and overlap policy', () => {
  const base: Omit<WinContext, 'winningTile'> = {
    isSelfDraw: false,
    isDiscardWin: true,
    isInitialDeal: false,
    isPaoChin: false,
    isRobbingKong: false,
    isSelfRobbingKong: false,
    isKongReplacement: false,
    isDoubleKongReplacement: false,
    seatWind: 'nan',
    roundWind: 'dong',
  };

  it('5-Tay gate: exactly 5 passes, 4 fails as below-minimum Lew Fit with an Indonesian reason', () => {
    // Ping Fu 3 + Bo KIM 3 + Mun 1 + F1 0 = 7  →  valid
    const ok = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S'),
      [],
      [keyToTile('F1')],
      { ...base, winningTile: keyToTile('5S', 2) },
      TOURNAMENT_RULES
    );
    expect(ok.totalTay).toBe(7);
    expect(ok.isValidHu).toBe(true);
    const strict = scoringEngine.evaluateHand(
      parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S'),
      [],
      [keyToTile('F1')],
      { ...base, winningTile: keyToTile('5S', 2) },
      { ...TOURNAMENT_RULES, minHuTay: 8 }
    );
    expect(strict.isLewFit).toBe(true);
    expect(strict.lewFitReason).toBe('below-minimum');
    expect(strict.rejectionReason).toMatch(/kurang dari 8 Tay/);
  });

  it('structurally invalid hand is Lew Fit with no patterns', () => {
    const r = scoringEngine.evaluateHand(
      parseTileHand('1T 3T 5T 7T 9T 1S 3S 5S 7S 9S WD WN WX'),
      [],
      [],
      { ...base, winningTile: keyToTile('DZ') },
      TOURNAMENT_RULES
    );
    expect(r.isLewFit).toBe(true);
    expect(r.lewFitReason).toBe('structure');
    expect(r.patterns).toHaveLength(0);
    expect(r.rejectionReason).toMatch(/tidak membentuk Hu/);
  });

  it('instant Hu declared without a trigger is Lew Fit', () => {
    const r = scoringEngine.evaluateHand(
      parseTileHand('1T 5T 9T 2S 6S 1B 4B WD WN DZ DF DP 3S'),
      [],
      [],
      { ...base, isSelfDraw: true, isDiscardWin: false, winningTile: keyToTile('8B'), isInstantHu: true },
      TOURNAMENT_RULES
    );
    expect(r.lewFitReason).toBe('instant-invalid');
  });

  it('arbitration maximises TOTAL Tay across Kim decompositions (Kim Thi over Kim Ciok)', () => {
    const r = evaluate(PATTERN_FIXTURES[30].positive[0]!.hand);
    expect(r.candidateCount).toBeGreaterThan(1);
    expect(tayOf(r, 30)).toBe(30);
    expect(tayOf(r, 32)).toBeUndefined();
  });

  it('every detected pattern carries a non-empty Bahasa Indonesia description', () => {
    for (const fx of Object.values(PATTERN_FIXTURES)) {
      for (const c of fx.positive) {
        for (const p of evaluate(c.hand).patterns) expect(p.description.length, `#${p.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('overlap policy: additive keeps Pao Chin with Thi Fu; supersede drops it', () => {
    const spec = PATTERN_FIXTURES[12].positive[0]!.hand;
    const additive = evaluate(spec);
    expect(additive.patterns.map((p) => p.id)).toEqual(expect.arrayContaining([10, 12]));
    const supersede = evaluate(spec, new ScoringEngine({ overlapPolicy: 'supersede' }));
    expect(supersede.patterns.map((p) => p.id)).toContain(12);
    expect(supersede.patterns.map((p) => p.id)).not.toContain(10);
    expect(supersede.totalTay).toBe(additive.totalTay - 30);
  });

  it('winning tile may be passed inside the hand or separately with identical results', () => {
    const hand = parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S');
    const win = keyToTile('5S', 2);
    const a = scoringEngine.evaluateHand(hand, [], [], { ...base, winningTile: win }, TOURNAMENT_RULES);
    const b = scoringEngine.evaluateHand([...hand, win], [], [], { ...base, winningTile: win }, TOURNAMENT_RULES);
    expect(b.totalTay).toBe(a.totalTay);
    expect(b.patterns).toEqual(a.patterns);
  });
});
