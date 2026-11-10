/**
 * Self-consistency checks for claude-44-patterns-fixtures.ts. These validate the fixtures,
 * not the (not yet written) scoring engine.
 */
import { describe, it, expect } from 'vitest';
import { canFormWinningHand } from '@/core/game-engine';
import {
  ALL_PATTERN_IDS,
  KIM_EDGE_CASES,
  PATTERN_FIXTURES,
  RULEBOOK_VER06_TEXT,
  type HandSpec,
  handHasKim,
  materializeHand,
  normalizedHandSize,
  tallyKeys,
} from './claude-44-patterns-fixtures';

/** BMC Rulebook ver06 §5.1 DAFTAR TAY (PDF pp. 8–10); matches indonesian_mahjong_casual_v0_1.zip. */
const RULEBOOK_TABLE: ReadonlyArray<[number, string, number | null, number | null]> = [
  [1, 'Tile Bunga', 0, 0], [2, 'Tile Musim', 1, 1], [3, 'Bo Hua Zi', 3, 3], [4, '4 Tiles Bunga', 10, 10],
  [5, '4 Tiles Musim', 20, 20], [6, '7 Tiles Bunga/Musim', 30, 30], [7, 'Tile KIM', 1, null], [8, 'Bo KIM', null, 3],
  [9, 'Shi Kim', 40, null], [10, 'Pao Chin', 20, 30], [11, 'Thien Fu', 40, 60], [12, 'Thi Fu', 40, 60],
  [13, 'Chicken Hand', 0, 0], [14, 'Ping Fu', 3, 3], [15, 'Tuei Tuei', 5, 10], [16, 'Tjit Tuei', 10, 20],
  [17, 'Chao It', 5, 10], [18, 'It Set', 20, 30], [19, 'Yau Kiu', 30, 40], [20, 'Cap Sa Yau Kiu', 40, 60],
  [21, 'Siau San Yen', 10, 20], [22, 'Ta San Yen', 30, 40], [23, 'Siau Se Si', 30, 40], [24, 'Ta Se Si', 50, 60],
  [25, 'Tris Angin Duduk', 1, 1], [26, 'Tris Angin Putaran', 1, 1], [27, 'Tris Zhong', 2, 2], [28, 'Tris Fat', 1, 1],
  [29, 'Tris Pat', 1, 1], [30, 'Kim Thi', 30, null], [31, 'Ji Pa Ciok', 1, 1], [32, 'Kim Ciok', 20, null],
  [33, 'Sam Am Kang', 5, 5], [34, 'Si Am Kang', 20, 30], [35, 'Chiong Kong', 5, 5], [36, 'Ce Chiong Kong', 5, 5],
  [37, 'Kong Song Hu/Mo', 5, 5], [38, 'Kong Kong Hu', 30, 30], [39, 'Se Sam Pu Tat', null, 40],
  [40, 'Pyong Pi', 5, null], [41, 'Tan Tiau', 5, 5], [42, 'Ce Mo', 1, 1], [43, 'Mun', 1, 1], [44, 'Ce Mo Pu Ciu Jen', 5, 5],
];

/** Shapes the engine's 4-melds+pair / 7-pairs validator cannot recognise. */
const SPECIAL_SHAPE_PATTERNS = new Set([20, 39]);

/**
 * Valid hands that src/core/game-engine.ts canFormWinningHand currently rejects (it.fails until fixed):
 * - ENGINE-SHAPE-02: a Kim can only extend a sequence upward from the lowest natural tile, so
 *   KIM-8S-9S (Kim as 7S) is never found.
 */
const KNOWN_ENGINE_SHAPE_FALSE_NEGATIVES = new Set<string>([]);

function assertPhysicallyLegal(hand: HandSpec): void {
  expect(normalizedHandSize(hand)).toBe(14);
  for (const [key, n] of tallyKeys(hand)) {
    const cap = /^[FM][1-4]$/.test(key) ? 1 : 4;
    expect(n, `${key} appears ${n} times`).toBeLessThanOrEqual(cap);
  }
  const m = materializeHand(hand);
  const ids = [...m.concealed, ...m.melds.flatMap((x) => x.tiles), ...m.flowers, m.winningTile].map((t) => t.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const meld of hand.melds ?? []) {
    const n = meld.tiles.trim().split(/\s+/).length;
    expect(n).toBe(meld.type === 'kong' || meld.type === 'ankong' ? 4 : 3);
  }
}

function isShapeWinnable(hand: HandSpec): boolean {
  const m = materializeHand(hand);
  return canFormWinningHand([...m.concealed, m.winningTile], true);
}

describe('44-pattern fixture catalog', () => {
  it('covers ids 1..44 exactly once, keyed by id', () => {
    expect(Object.keys(PATTERN_FIXTURES).map(Number).sort((a, b) => a - b)).toEqual([...ALL_PATTERN_IDS]);
    for (const id of ALL_PATTERN_IDS) expect(PATTERN_FIXTURES[id].id).toBe(id);
  });

  it('every pattern has verbatim ver06 text and an authoritative definition', () => {
    for (const id of ALL_PATTERN_IDS) {
      expect(RULEBOOK_VER06_TEXT[id].length, `#${id}`).toBeGreaterThan(0);
      expect(PATTERN_FIXTURES[id].definitionConfidence, `#${id}`).toBe('authoritative');
    }
  });

  it.each(RULEBOOK_TABLE)('#%i %s has K=%s NK=%s', (id, name, k, nk) => {
    const fx = PATTERN_FIXTURES[id as keyof typeof PATTERN_FIXTURES];
    expect(fx.name).toBe(name);
    expect(fx.values.K).toBe(k);
    expect(fx.values.NK).toBe(nk);
  });

  it('instant-Hu values exist only on #6, #9, #34 and equal 10', () => {
    const withInstant = ALL_PATTERN_IDS.filter((id) => PATTERN_FIXTURES[id].values.instantHu !== undefined);
    expect(withInstant).toEqual([6, 9, 34]);
    for (const id of withInstant) expect(PATTERN_FIXTURES[id].values.instantHu).toBe(10);
  });

  for (const id of ALL_PATTERN_IDS) {
    const fx = PATTERN_FIXTURES[id];
    describe(`#${id} ${fx.name}`, () => {
      it('has at least one positive and one negative case', () => {
        expect(fx.positive.length).toBeGreaterThanOrEqual(1);
        expect(fx.negative.length).toBeGreaterThanOrEqual(1);
        expect(fx.positive.every((c) => c.expectDetected)).toBe(true);
        expect(fx.negative.every((c) => !c.expectDetected)).toBe(true);
      });

      it('interpretation-based definitions carry a note', () => {
        if (fx.definitionConfidence === 'interpretation') expect(fx.interpretationNote).toBeTruthy();
      });

      for (const c of [...fx.positive, ...fx.negative]) {
        it(`${c.expectDetected ? '+' : '-'} ${c.label}: physically legal, mode matches Kim presence`, () => {
          assertPhysicallyLegal(c.hand);
          expect(handHasKim(c.hand)).toBe(c.mode === 'K');
        });

        if (!c.hand.instantHu && !SPECIAL_SHAPE_PATTERNS.has(id)) {
          const shapeIt = KNOWN_ENGINE_SHAPE_FALSE_NEGATIVES.has(c.label) ? it.fails : it;
          shapeIt(`${c.expectDetected ? '+' : '-'} ${c.label}: is a complete winning shape`, () => {
            expect(isShapeWinnable(c.hand)).toBe(true);
          });
        }
      }

      for (const c of fx.positive) {
        it(`+ ${c.label}: expectedTay is consistent with the rulebook value`, () => {
          const base = fx.values[c.mode];
          expect(base, 'positive case in a mode where the pattern is "—"').not.toBeNull();
          if (c.hand.instantHu) {
            expect(c.expectedTay).toBe(fx.values.instantHu);
          } else if (fx.values.seatMatchBonus !== undefined) {
            expect([base, base! + fx.values.seatMatchBonus]).toContain(c.expectedTay);
          } else if (id === 7) {
            expect(c.expectedTay! % base!).toBe(0); // 1 Tay per Kim
          } else {
            expect(c.expectedTay).toBe(base);
          }
        });
      }
    });
  }
});

describe('Kim edge cases', () => {
  it('covers Pung, Jia, Pair, Shi Kim, Bo Kim, Kim Thi, Kim Ciok and Pyong Pi', () => {
    const foci = new Set(KIM_EDGE_CASES.map((c) => c.focus));
    for (const f of ['pung', 'jia', 'pair', 'shi-kim', 'bo-kim', 'kim-thi', 'kim-ciok', 'pyong-pi'] as const) {
      expect(foci.has(f), f).toBe(true);
    }
  });

  for (const c of KIM_EDGE_CASES) {
    it(`${c.label}: physically legal and mode matches Kim presence`, () => {
      assertPhysicallyLegal(c.hand);
      if (c.expectedMode) expect(handHasKim(c.hand)).toBe(c.expectedMode === 'K');
    });

    if (c.hand.instantHu || c.patternExpectations?.[20] || c.patternExpectations?.[39] === false) continue;
    const shapeIt = KNOWN_ENGINE_SHAPE_FALSE_NEGATIVES.has(c.label) ? it.fails : it;
    shapeIt(`${c.label}: shape agrees with expected outcome`, () => {
      expect(isShapeWinnable(c.hand)).toBe(c.expectedOutcome !== 'not-hu');
    });
  }
});
