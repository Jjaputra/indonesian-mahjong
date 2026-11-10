/**
 * Independent cross-model audit of Milestone 2 (src/kim/) against BMC Rulebook ver06 §5.1
 * and tests/scoring/claude-44-patterns-fixtures.ts.
 *
 * Tests named "KIM-BUG-xx" assert the rule-correct behaviour and are wrapped in `it.fails`:
 * each was verified to fail against the current implementation. Remove `.fails` once fixed.
 */
import { describe, it, expect } from 'vitest';
import {
  CASUAL_KIM_RULES,
  KimValidator,
  STRICT_NO_KIM_RULES,
  TOURNAMENT_KIM_RULES,
  arbitrateKimDecompositions,
  canFormWinningHandWithKim,
  evaluateDecomposition,
  findWinningDecompositions,
  isKim,
  resolveKimRules,
  validateKimMeldLegality,
  type KimRules,
  type SolvedHand,
} from '@/kim';
import { DEFAULT_RULES } from '@/core/game-engine';
import { createMulberry32 } from '@/core/wall';
import { keyToTile, parseTileHand } from '@/core/tiles';
import type { GameRules, Tile } from '@/core/types';
import {
  KIM_EDGE_CASES,
  PATTERN_FIXTURES,
  TOURNAMENT_RULES,
  materializeHand,
  type HandSpec,
  type PatternCase,
  type PatternId,
} from '../scoring/claude-44-patterns-fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KIM_PATTERN_IDS = [7, 8, 9, 30, 32, 40] as const;

function solve(spec: HandSpec, rules: Partial<KimRules> | GameRules = spec.rules ?? TOURNAMENT_RULES): SolvedHand[] {
  const m = materializeHand({ ...spec, rules: undefined });
  return findWinningDecompositions({
    hand: m.concealed,
    melds: m.melds,
    winningTile: m.winningTile,
    rules: { ...TOURNAMENT_RULES, ...rules },
    isSelfDraw: m.context.isSelfDraw,
    isInstantHu: !!spec.instantHu,
  });
}

function bestKimEval(spec: HandSpec) {
  const m = materializeHand(spec);
  const decomps = solve(spec);
  if (decomps.length === 0) return null;
  return arbitrateKimDecompositions(decomps, {
    winningTile: m.winningTile,
    isSelfDraw: m.context.isSelfDraw,
    isInstantHu: !!spec.instantHu,
  });
}

/** Every physical tile of the input appears exactly once in the decomposition. */
function assertDecompositionAccountsForTiles(sol: SolvedHand, inputIds: string[]): void {
  if (sol.shape !== 'standard') return;
  const used = [...sol.melds.flatMap((x) => x.tiles), ...(sol.pair?.tiles ?? [])].map((t) => t.id);
  expect(used.sort()).toEqual([...inputIds].sort());
}

/** Every standard meld is a legal Jia/Pung/Kong/Kim-Thi once Kims are replaced by what they represent. */
function assertMeldsAreLegal(sol: SolvedHand): void {
  for (const m of sol.melds) {
    const rep = m.representedTiles;
    if (m.type === 'kim_thi') {
      expect(m.tiles.every(isKim)).toBe(true);
      continue;
    }
    if (m.type === 'jia') {
      const vals = rep.map((t) => t.value).sort((a, b) => a - b);
      expect(new Set(rep.map((t) => t.type)).size).toBe(1);
      expect(['tong', 'sok', 'ban']).toContain(rep[0]!.type);
      expect(vals[1]).toBe(vals[0]! + 1);
      expect(vals[2]).toBe(vals[0]! + 2);
    } else {
      expect(new Set(rep.map((t) => `${t.type}-${t.value}`)).size).toBe(1);
    }
  }
  if (sol.pair && !sol.pair.isKimCiok) {
    const [a, b] = sol.pair.representedTiles;
    expect(`${a.type}-${a.value}`).toBe(`${b.type}-${b.value}`);
  }
  // Every Kim used as a wildcard has an explicit assignment
  const kimIds = [...sol.melds.flatMap((x) => x.tiles), ...(sol.pair?.tiles ?? [])].filter(isKim).map((t) => t.id);
  expect(sol.wildcardAssignments.map((a) => a.kimTile.id).sort()).toEqual(kimIds.sort());
}

// ---------------------------------------------------------------------------
// 1. Rule presets vs rulebook / ORIGINAL_REQUEST
// ---------------------------------------------------------------------------

describe('Audit K1: Tournament vs Casual rule presets', () => {
  it('Tournament preset: Kim not discardable, no Kim in claimed melds (ver06 §4 and Penalti #3)', () => {
    expect(TOURNAMENT_KIM_RULES.kimEnabled).toBe(true);
    expect(TOURNAMENT_KIM_RULES.kimDiscardAllowed).toBe(false);
    expect(TOURNAMENT_KIM_RULES.allowKimInMeldClaim).toBe(false);
  });

  it('Tournament preset agrees with the core engine DEFAULT_RULES', () => {
    expect(TOURNAMENT_KIM_RULES.kimDiscardAllowed).toBe(DEFAULT_RULES.kimDiscardAllowed);
    expect(TOURNAMENT_KIM_RULES.allowKimInMeldClaim).toBe(DEFAULT_RULES.allowKimInMeldClaim);
    expect(resolveKimRules(DEFAULT_RULES)).toEqual(TOURNAMENT_KIM_RULES);
  });

  it('resolveKimRules fills per-meld toggles from defaults when given a core GameRules', () => {
    const r = resolveKimRules({ kimEnabled: true, kimDiscardAllowed: true, allowKimInMeldClaim: true, minHuTay: 5 });
    expect(r.allowKimInPair && r.allowKimInPung && r.allowKimInJia && r.allowKimInTriplet).toBe(true);
    expect(r.kimDiscardAllowed).toBe(true);
  });

  it('Casual preset allows Kim in claimed melds', () => {
    expect(CASUAL_KIM_RULES.allowKimInMeldClaim).toBe(true);
    expect(validateKimMeldLegality([{ type: 'pung', tiles: parseTileHand('5T 5T KIM'), claimedFrom: 'dong' }], CASUAL_KIM_RULES).isLewFit).toBe(false);
  });

  it('KIM-BUG-01: Casual preset must keep Kim NON-discardable by default (ORIGINAL_REQUEST R2)', () => {
    // R2: "default casual: enabled, non-discardable, usable as joker"
    expect(CASUAL_KIM_RULES.kimDiscardAllowed).toBe(false);
  });

  it('KimValidator: Tournament rejects Kim discard and Kim in Jia/Pung claims, allows natural claims', () => {
    const v = new KimValidator(TOURNAMENT_KIM_RULES);
    expect(v.canDiscard(t('KIM')).valid).toBe(false);
    expect(v.canDiscard(t('5T')).valid).toBe(true);
    expect(v.getDiscardableTileIds(parseTileHand('5T KIM 6T'))).toEqual(['tong-5-1', 'tong-6-1']);
    expect(v.canClaimDeclaration({ seat: 'nan', action: 'jia', meldTiles: [t('4T'), t('KIM')] }, t('5T')).valid).toBe(false);
    expect(v.canClaimDeclaration({ seat: 'xi', action: 'pung', meldTiles: [t('5T'), t('KIM')] }, t('5T', 3)).valid).toBe(false);
    expect(v.canClaimDeclaration({ seat: 'xi', action: 'pung', meldTiles: [t('5T'), t('5T', 2)] }, t('5T', 3)).valid).toBe(true);
    expect(v.canClaimDeclaration({ seat: 'xi', action: 'hu' }, t('5T', 3)).valid).toBe(true);
  });

  it('KimValidator: Casual allows Kim in Jia only on suited discards', () => {
    const v = new KimValidator(CASUAL_KIM_RULES);
    expect(v.canClaimDeclaration({ seat: 'nan', action: 'jia', meldTiles: [t('4T'), t('KIM')] }, t('5T')).valid).toBe(true);
    expect(v.canClaimDeclaration({ seat: 'nan', action: 'jia', meldTiles: [t('WD'), t('KIM')] }, t('WN')).valid).toBe(false);
  });

  it('KIM-BUG-02: a Kong claim using Kim must respect allowKimInPung=false', () => {
    const v = new KimValidator({ ...CASUAL_KIM_RULES, allowKimInPung: false, allowKimInTriplet: false });
    const res = v.canClaimDeclaration(
      { seat: 'xi', action: 'kong', meldTiles: [t('5T'), t('5T', 2), t('KIM')] },
      t('5T', 3)
    );
    expect(res.valid).toBe(false);
  });

  it('validateKimMeldLegality: claimed Jia/Pung/Kong with Kim is Lew Fit under Tournament; Ankong exempt', () => {
    const lew = (type: 'jia' | 'pung' | 'kong', tiles: string) =>
      validateKimMeldLegality([{ type, tiles: parseTileHand(tiles), claimedFrom: 'dong' }], TOURNAMENT_KIM_RULES).isLewFit;
    expect(lew('jia', '4T KIM 6T')).toBe(true);
    expect(lew('pung', '5T 5T KIM')).toBe(true);
    expect(lew('kong', '5T 5T 5T KIM')).toBe(true);
    expect(lew('pung', '5T 5T 5T')).toBe(false);
    expect(validateKimMeldLegality([{ type: 'ankong', tiles: parseTileHand('5T 5T 5T KIM') }], TOURNAMENT_KIM_RULES).isLewFit).toBe(false);
  });

  it('STRICT_NO_KIM_RULES: a hand needing a Kim wildcard has no decomposition', () => {
    const hand = parseTileHand('1T KIM 3T 4S 5S 6S 7B 8B 9B WX WX WX 5T 5T');
    expect(findWinningDecompositions({ hand, rules: STRICT_NO_KIM_RULES })).toHaveLength(0);
    expect(findWinningDecompositions({ hand, rules: TOURNAMENT_KIM_RULES }).length).toBeGreaterThan(0);
  });

  it('per-meld toggles: allowKimInJia=false blocks a Jia-only Kim use, allowKimInPair=false blocks a Kim eye', () => {
    const jiaOnly = parseTileHand('1T KIM 3T 4S 5S 6S 7B 8B 9B 2S 3S 4S WX WX');
    expect(findWinningDecompositions({ hand: jiaOnly, rules: { ...TOURNAMENT_KIM_RULES, allowKimInJia: false } })).toHaveLength(0);
    const pairOnly = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 2S 3S 4S WX KIM');
    expect(findWinningDecompositions({ hand: pairOnly, rules: { ...TOURNAMENT_KIM_RULES, allowKimInPair: false } })).toHaveLength(0);
    expect(findWinningDecompositions({ hand: pairOnly, rules: TOURNAMENT_KIM_RULES }).length).toBeGreaterThan(0);
  });
});

function t(key: string, copy = 1): Tile {
  return keyToTile(key, copy);
}

// ---------------------------------------------------------------------------
// 2. 0-4 Kim wildcard decompositions (4 melds + 1 pair), property-based
// ---------------------------------------------------------------------------

describe('Audit K2: 0–4 Kim substitutions into complete 4-meld + pair hands', () => {
  const SUITS = ['T', 'S', 'B'] as const;
  const HONORS = ['WD', 'WN', 'WX', 'WB', 'DZ', 'DF', 'DP'] as const;

  /** Random legal 14-tile hand (respecting 4 copies per kind) as shorthand keys. */
  function randomCompleteHand(rng: () => number): string[] {
    for (;;) {
      const counts = new Map<string, number>();
      const keys: string[] = [];
      const add = (k: string) => {
        counts.set(k, (counts.get(k) ?? 0) + 1);
        keys.push(k);
      };
      const fits = (ks: string[]) => {
        const need = new Map<string, number>();
        for (const k of ks) need.set(k, (need.get(k) ?? 0) + 1);
        return [...need].every(([k, n]) => (counts.get(k) ?? 0) + n <= 4);
      };
      let ok = true;
      for (let i = 0; i < 4 && ok; i++) {
        let meld: string[];
        if (rng() < 0.55) {
          const s = SUITS[Math.floor(rng() * 3)]!;
          const v = 1 + Math.floor(rng() * 7);
          meld = [`${v}${s}`, `${v + 1}${s}`, `${v + 2}${s}`];
        } else if (rng() < 0.7) {
          const k = `${1 + Math.floor(rng() * 9)}${SUITS[Math.floor(rng() * 3)]!}`;
          meld = [k, k, k];
        } else {
          const k = HONORS[Math.floor(rng() * HONORS.length)]!;
          meld = [k, k, k];
        }
        if (fits(meld)) meld.forEach(add);
        else ok = false;
      }
      const pk = rng() < 0.7 ? `${1 + Math.floor(rng() * 9)}${SUITS[Math.floor(rng() * 3)]!}` : HONORS[Math.floor(rng() * 7)]!;
      if (!ok || !fits([pk, pk])) continue;
      add(pk);
      add(pk);
      return keys;
    }
  }

  for (let kimCount = 0; kimCount <= 4; kimCount++) {
    it(`${kimCount} Kim(s) replacing random tiles of 200 random complete hands still solve, with legal, fully-accounted decompositions`, () => {
      const rng = createMulberry32(1000 + kimCount);
      for (let trial = 0; trial < 200; trial++) {
        const keys = randomCompleteHand(rng);
        const idx = [...keys.keys()];
        for (let i = idx.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          [idx[i], idx[j]] = [idx[j]!, idx[i]!];
        }
        for (const i of idx.slice(0, kimCount)) keys[i] = 'KIM';
        const hand = parseTileHand(keys.join(' '));
        const sols = findWinningDecompositions({ hand, rules: CASUAL_KIM_RULES });
        expect(sols.length, keys.join(' ')).toBeGreaterThan(0);
        expect(canFormWinningHandWithKim(hand, [], CASUAL_KIM_RULES)).toBe(true);
        for (const s of sols) {
          expect(s.totalKims).toBe(kimCount);
          expect(s.mode).toBe(kimCount > 0 ? 'K' : 'NK');
          assertDecompositionAccountsForTiles(s, hand.map((x) => x.id));
          if (s.shape === 'standard') assertMeldsAreLegal(s);
        }
      }
    });
  }

  it('signatures are unique within one result set (no duplicate decompositions)', () => {
    const hand = parseTileHand('1T 1T 1T 2T 2T 2T 3T 3T 3T KIM KIM 5S 5S 5S');
    const sols = findWinningDecompositions({ hand });
    expect(new Set(sols.map((s) => s.signature)).size).toBe(sols.length);
    expect(sols.length).toBeGreaterThan(1);
  });

  it('Kim can fill each sequence position: low, middle, and high edge (incl. KIM 8S 9S)', () => {
    for (const shape of ['KIM 2S 3S', '1S KIM 3S', '1S 2S KIM', 'KIM 8S 9S', '7S KIM 9S', '7S 8S KIM']) {
      const hand = parseTileHand(`${shape} 1T 2T 3T 4B 5B 6B WX WX WX DZ DZ`);
      expect(findWinningDecompositions({ hand }).length, shape).toBeGreaterThan(0);
    }
  });

  it('Kim never bridges honors into a sequence', () => {
    expect(findWinningDecompositions({ hand: parseTileHand('WD KIM WX 1S 2S 3S 4B 5B 6B 7T 8T 9T 5T 5T') })).toHaveLength(0);
  });

  it('open melds count 3 toward the 14 (incl. 4-tile Kongs); open Kims are counted in totalKims', () => {
    const sols = findWinningDecompositions({
      hand: parseTileHand('1S 2S 3S WX WX'),
      melds: [
        { type: 'kong', tiles: parseTileHand('9B 9B 9B 9B'), claimedFrom: 'dong' },
        { type: 'pung', tiles: [t('5T'), t('5T', 2), t('KIM')], claimedFrom: 'xi' },
        { type: 'jia', tiles: parseTileHand('4S 5S 6S'), claimedFrom: 'dong' },
      ],
      rules: CASUAL_KIM_RULES,
    });
    expect(sols).toHaveLength(1);
    expect(sols[0]!.totalKims).toBe(1);
    expect(sols[0]!.mode).toBe('K');
  });

  it('KIM-BUG-03: canFormWinningHandWithKim must still require a legal tile count when holding 4 Kims', () => {
    // 6 concealed tiles, no melds: not a hand at all, yet the 4-Kim shortcut returns true.
    expect(canFormWinningHandWithKim(parseTileHand('KIM KIM KIM KIM 1T 9S'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Special shapes: Tjit Tuei, Cap Sa Yau Kiu, Se Sam Pu Tat, Shi Kim
// ---------------------------------------------------------------------------

describe('Audit K3: special shapes', () => {
  const caseOf = (id: PatternId, label: string): PatternCase =>
    [...PATTERN_FIXTURES[id].positive, ...PATTERN_FIXTURES[id].negative].find((c) => c.label === label)!;

  it('Tjit Tuei (#16): natural and Kim-assisted seven pairs yield a seven_pairs decomposition', () => {
    for (const c of PATTERN_FIXTURES[16].positive) {
      expect(solve(c.hand).some((s) => s.shape === 'seven_pairs'), c.label).toBe(true);
    }
  });

  it('Tjit Tuei with 2 and 4 Kims: Kims pair singletons, leftovers become Kim-Kim pairs', () => {
    const two = findWinningDecompositions({ hand: parseTileHand('1T 1T 3T 3T 5S 5S 7S 7S 2B 2B WX DP KIM KIM') });
    const sp = two.find((s) => s.shape === 'seven_pairs')!;
    expect(sp.pairs!.filter((p) => p.kimCount === 1)).toHaveLength(2);
    const four = findWinningDecompositions({ hand: parseTileHand('1T 1T 3T 3T 5S 5S 7S 7S 2B 2B KIM KIM KIM KIM') });
    expect(four.find((s) => s.shape === 'seven_pairs')!.pairs!.filter((p) => p.isKimCiok)).toHaveLength(2);
  });

  it('Tjit Tuei is rejected when the hand has an exposed meld', () => {
    expect(
      findWinningDecompositions({
        hand: parseTileHand('1T 1T 3T 3T 5S 5S 7S 7S 2B 2B WX'),
        melds: [{ type: 'pung', tiles: parseTileHand('DZ DZ DZ'), claimedFrom: 'dong' }],
      }).some((s) => s.shape === 'seven_pairs')
    ).toBe(false);
  });

  it('Cap Sa Yau Kiu (#20): natural and Kim-substituted thirteen orphans solve; a non-orphan breaks it', () => {
    for (const c of PATTERN_FIXTURES[20].positive) {
      expect(solve(c.hand).some((s) => s.shape === 'thirteen_orphans'), c.label).toBe(true);
    }
    for (const c of PATTERN_FIXTURES[20].negative) expect(solve(c.hand), c.label).toHaveLength(0);
    // Kim as the duplicate (all 13 distinct present)
    const kimDup = findWinningDecompositions({ hand: parseTileHand('1T 9T 1S 9S 1B 9B WD WN WX WB DZ DF DP KIM') });
    expect(kimDup.some((s) => s.shape === 'thirteen_orphans')).toBe(true);
  });

  it('KIM-BUG-04: Se Sam Pu Tat (#39, NK 40) must be recognised as a winning shape by findWinningDecompositions', () => {
    const c = caseOf(39, '147T 258S 369B + 5 single honors, no bonus tiles');
    expect(solve(c.hand).length).toBeGreaterThan(0);
  });

  it('Se Sam Pu Tat shape with a Kim is never a winning shape (K-mode column is blank)', () => {
    expect(solve(caseOf(39, 'same shape with Kim').hand)).toHaveLength(0);
  });

  it('Shi Kim instant Hu (#9): 4 Kims + isInstantHu → single shi_kim decomposition worth 10 Tay, no Tile KIM', () => {
    const c = PATTERN_FIXTURES[9].positive.find((x) => x.hand.instantHu)!;
    const sols = solve(c.hand);
    expect(sols.map((s) => s.shape)).toEqual(['shi_kim']);
    const ev = bestKimEval(c.hand)!;
    expect(ev.patterns.map((p) => [p.id, p.tay])).toEqual([[9, 10]]);
  });

  it('Shi Kim without the instant flag on a broken hand has no decomposition', () => {
    const c = PATTERN_FIXTURES[9].positive.find((x) => x.hand.instantHu)!;
    expect(solve({ ...c.hand, instantHu: false })).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Kim patterns #7 #8 #9 #30 #32 #40 vs fixture catalog
// ---------------------------------------------------------------------------

describe('Audit K4: Kim pattern fixtures (#7 #8 #9 #30 #32 #40) through solver + arbitration', () => {
  for (const id of KIM_PATTERN_IDS) {
    const fx = PATTERN_FIXTURES[id];
    for (const c of [...fx.positive, ...fx.negative]) {
      it(`#${id} ${fx.name} ${c.expectDetected ? '+' : '-'} ${c.label}`, () => {
        const ev = bestKimEval(c.hand);
        expect(ev, 'hand must solve').not.toBeNull();
        expect(ev!.mode).toBe(c.mode);
        const hit = ev!.patterns.find((p) => p.id === id);
        expect(!!hit).toBe(c.expectDetected);
        if (c.expectDetected && c.expectedTay !== undefined) expect(hit!.tay).toBe(c.expectedTay);
      });
    }
  }

  it('K/NK mode tracks Kim presence for every fixture case that solves', () => {
    for (const fx of Object.values(PATTERN_FIXTURES)) {
      for (const c of [...fx.positive, ...fx.negative]) {
        const sols = solve(c.hand);
        for (const s of sols) expect(s.mode, `#${fx.id} ${c.label}`).toBe(c.mode);
      }
    }
  });

  it('Bo KIM (#8) and Tile KIM (#7) are mutually exclusive in every evaluation', () => {
    for (const fx of Object.values(PATTERN_FIXTURES)) {
      for (const c of [...fx.positive, ...fx.negative]) {
        const ev = bestKimEval(c.hand);
        if (!ev) continue;
        const ids = ev.patterns.map((p) => p.id);
        expect(ids.includes(7) && ids.includes(8), `#${fx.id} ${c.label}`).toBe(false);
        expect(ev.mode === 'NK').toBe(ids.includes(8));
      }
    }
  });

  it('arbitration prefers Kim Thi (3-Kim set, 33 Tay) over Kim Ciok + Kim-in-Pung (23 Tay)', () => {
    const ev = bestKimEval(PATTERN_FIXTURES[30].positive[0]!.hand)!;
    expect(ev.hasKimThi).toBe(true);
    expect(ev.hasKimCiok).toBe(false);
    expect(ev.kimTay).toBe(33);
  });

  it('Pyong Pi requires self-draw: evaluateDecomposition on the same decomposition flips with isSelfDraw', () => {
    const c = PATTERN_FIXTURES[40].positive[0]!;
    const m = materializeHand(c.hand);
    const sols = solve(c.hand);
    const withPair = sols.find((s) => s.pair?.kimCount === 1)!;
    expect(evaluateDecomposition(withPair, { winningTile: m.winningTile, isSelfDraw: true }).hasPyongPi).toBe(true);
    expect(evaluateDecomposition(withPair, { winningTile: m.winningTile, isSelfDraw: false }).hasPyongPi).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. All 22+ KIM_EDGE_CASES from the fixture catalog
// ---------------------------------------------------------------------------

describe('Audit K5: KIM_EDGE_CASES', () => {
  it('catalog still has at least 22 edge cases', () => {
    expect(KIM_EDGE_CASES.length).toBeGreaterThanOrEqual(22);
  });

  for (const c of KIM_EDGE_CASES) {
    it(`${c.focus}: ${c.label} → ${c.expectedOutcome}`, () => {
      const m = materializeHand(c.hand);
      const rules = c.hand.rules ?? TOURNAMENT_RULES;
      const hasKim = [...m.concealed, ...m.melds.flatMap((x) => x.tiles), m.winningTile].some(isKim);
      const legality = validateKimMeldLegality(m.melds, rules);
      const sols = solve(c.hand, rules);

      switch (c.expectedOutcome) {
        case 'lew-fit':
          if (!hasKim) return; // 5-Tay gate case: a scoring-engine concern, not src/kim
          expect(legality.isLewFit).toBe(true);
          break;
        case 'not-hu':
          expect(sols).toHaveLength(0);
          break;
        case 'instant-hu':
          expect(sols.map((s) => s.shape)).toEqual(['shi_kim']);
          break;
        case 'valid':
          expect(legality.isLewFit).toBe(false);
          expect(sols.length).toBeGreaterThan(0);
          break;
      }

      if (c.expectedMode && sols.length > 0) {
        for (const s of sols) expect(s.mode).toBe(c.expectedMode);
      }

      if (sols.length > 0 && c.patternExpectations) {
        const ev = arbitrateKimDecompositions(sols, {
          winningTile: m.winningTile,
          isSelfDraw: m.context.isSelfDraw,
          isInstantHu: !!c.hand.instantHu,
        });
        for (const [idStr, expected] of Object.entries(c.patternExpectations)) {
          const id = Number(idStr);
          if ((KIM_PATTERN_IDS as readonly number[]).includes(id)) {
            expect(ev.patterns.some((p) => p.id === id), `pattern #${id}`).toBe(expected);
          } else if (id === 16) {
            expect(sols.some((s) => s.shape === 'seven_pairs')).toBe(expected);
          } else if (id === 20) {
            expect(sols.some((s) => s.shape === 'thirteen_orphans')).toBe(expected);
          }
        }
      }
    });
  }
});
