import { isKim } from './wildcard-solver';
import type { Tile } from '../core/types';
import type {
  DetectedKimPattern,
  KimEvaluationResult,
  KimMode,
  KimModeEvaluationResult,
  KimWinContext,
  SolvedHand,
  SolvedHandDecomposition,
} from './types';

// ============================================================================
// Tile and Hand Extraction Helpers
// ============================================================================

function getTotalKimCount(hand: SolvedHand | SolvedHandDecomposition): number {
  if ('totalKimCount' in hand && typeof hand.totalKimCount === 'number') {
    return hand.totalKimCount;
  }
  if ('totalKims' in hand && typeof hand.totalKims === 'number') {
    return hand.totalKims;
  }
  let count = 0;
  for (const m of hand.melds ?? []) {
    count += m.tiles.filter(isKim).length;
  }
  if (hand.pair) {
    count += hand.pair.tiles.filter(isKim).length;
  }
  return count;
}

function getWildcardKimCount(hand: SolvedHand | SolvedHandDecomposition): number {
  if ('wildcardKimCount' in hand && typeof hand.wildcardKimCount === 'number') {
    return hand.wildcardKimCount;
  }
  if ('wildcardAssignments' in hand && Array.isArray((hand as any).wildcardAssignments)) {
    return (hand as any).wildcardAssignments.length;
  }
  return getTotalKimCount(hand);
}

// ============================================================================
// Pattern 7: Tile KIM (1 Tay per Kim, K mode only)
// ============================================================================
export function evaluateTileKim(totalKimCount: number, mode: KimMode): DetectedKimPattern | null {
  if (mode !== 'K' || totalKimCount <= 0) {
    return null;
  }
  return {
    id: 7,
    name: 'Tile KIM',
    tay: totalKimCount * 1,
    description: `${totalKimCount} Kim tile(s) in hand (1 Tay per Kim in Ada Kim mode)`,
    mode: 'K',
  };
}

// ============================================================================
// Pattern 8: Bo KIM (3 Tay, NK mode only)
// ============================================================================
export function evaluateBoKim(mode: KimMode): DetectedKimPattern | null {
  if (mode !== 'NK') {
    return null;
  }
  return {
    id: 8,
    name: 'Bo KIM',
    tay: 3,
    description: 'Without Kim / Bo Kim bonus (+3 Tay for zero Kim wildcard usage)',
    mode: 'NK',
  };
}

// ============================================================================
// Pattern 9: Shi Kim (40 Tay complete hand, 10 Tay instant Hu, K mode only)
// ============================================================================
export function evaluateShiKim(
  totalKimCount: number,
  isInstantHu: boolean,
  mode: KimMode
): DetectedKimPattern | null {
  if (mode !== 'K' || totalKimCount !== 4) {
    return null;
  }
  const tay = isInstantHu ? 10 : 40;
  return {
    id: 9,
    name: 'Shi Kim',
    tay,
    description: isInstantHu
      ? 'All 4 Kim tiles declared as instant Hu without completed hand (10 Tay)'
      : 'All 4 Kim tiles held in completed winning hand (40 Tay)',
    mode: 'K',
  };
}

// ============================================================================
// Pattern 30: Kim Thi (30 Tay, pure KIM-KIM-KIM triplet, K mode only)
// ============================================================================
export function evaluateKimThi(
  hand: SolvedHand | SolvedHandDecomposition,
  mode: KimMode
): DetectedKimPattern | null {
  if (mode !== 'K') {
    return null;
  }
  const melds = hand.melds ?? [];
  const hasPureKimTriplet = melds.some(
    (m) =>
      m.tiles.length === 3 &&
      m.tiles.every((t) => isKim(t) || t.type === 'kim') &&
      (m.type === 'kim_thi' || m.type === 'pung')
  );
  if (!hasPureKimTriplet) {
    return null;
  }
  return {
    id: 30,
    name: 'Kim Thi',
    tay: 30,
    description: 'Three Kim tiles forming an independent triplet (KIM-KIM-KIM)',
    mode: 'K',
  };
}

// ============================================================================
// Pattern 32: Kim Ciok (20 Tay, pure KIM-KIM pair, K mode only)
// ============================================================================
export function evaluateKimCiok(
  hand: SolvedHand | SolvedHandDecomposition,
  mode: KimMode
): DetectedKimPattern | null {
  if (mode !== 'K' || !hand.pair) {
    return null;
  }
  const [t1, t2] = hand.pair.tiles;
  if (t1 && t2 && isKim(t1) && isKim(t2)) {
    return {
      id: 32,
      name: 'Kim Ciok',
      tay: 20,
      description: 'Two Kim tiles forming the pair/eye (kaki)',
      mode: 'K',
    };
  }
  return null;
}

// ============================================================================
// Pattern 40: Pyong Pi (5 Tay, self-drawn tile pairs lone Kim, K mode only)
// ============================================================================
export function evaluatePyongPi(
  hand: SolvedHand | SolvedHandDecomposition,
  context: KimWinContext,
  mode: KimMode
): DetectedKimPattern | null {
  if (mode !== 'K' || !context.isSelfDraw) {
    return null;
  }
  // Any pair qualifies: the standard eye or one of the seven Tjit Tuei pairs.
  const pairs = 'pairs' in hand && hand.pairs ? hand.pairs : hand.pair ? [hand.pair] : [];
  const qualifies = pairs.some((pair) => {
    const pairTiles = pair.tiles;
    if (!pairTiles || pairTiles.length !== 2) return false;
    // Exactly 1 Kim in pair (2 Kims is Kim Ciok #32)
    if (pairTiles.filter(isKim).length !== 1) return false;
    const naturalTile = pairTiles.find((t) => !isKim(t));
    // The natural tile must match the winning tile drawn from the wall
    return !!naturalTile && (naturalTile.id === context.winningTile.id
      || (naturalTile.type === context.winningTile.type && naturalTile.value === context.winningTile.value));
  });
  if (!qualifies) {
    return null;
  }

  return {
    id: 40,
    name: 'Pyong Pi',
    tay: 5,
    description: 'Winning tile drawn from the wall pairs with a single Kim in hand as the eye',
    mode: 'K',
  };
}

// ============================================================================
// Mode Evaluator for a Single Decomposition
// ============================================================================
export function evaluateDecomposition(
  decomposition: SolvedHand | SolvedHandDecomposition,
  context: KimWinContext
): KimEvaluationResult {
  const totalKimCount = getTotalKimCount(decomposition);
  const wildcardKimCount = getWildcardKimCount(decomposition);

  // K mode if totalKimCount > 0 and not all Kims are natural nominal matches
  const isKMode = totalKimCount > 0 && (context.isInstantHu || !('mode' in decomposition) || decomposition.mode !== 'NK');
  const mode: KimMode = isKMode ? 'K' : 'NK';
  const isInstantHu = !!context.isInstantHu;

  const patterns: DetectedKimPattern[] = [];

  let hasKimThi = false;
  let hasKimCiok = false;
  let hasShiKim = false;
  let hasPyongPi = false;

  if (mode === 'NK') {
    const boKim = evaluateBoKim('NK');
    if (boKim) patterns.push(boKim);
  } else {
    // 1. Evaluate Shi Kim (#9)
    if (totalKimCount === 4) {
      const shiKim = evaluateShiKim(totalKimCount, isInstantHu, 'K');
      if (shiKim) {
        patterns.push(shiKim);
        hasShiKim = true;
      }
    }

    // 2. Evaluate Kim Thi (#30)
    const kimThi = evaluateKimThi(decomposition, 'K');
    if (kimThi) {
      patterns.push(kimThi);
      hasKimThi = true;
    }

    // 3. Evaluate Kim Ciok (#32)
    const kimCiok = evaluateKimCiok(decomposition, 'K');
    if (kimCiok) {
      patterns.push(kimCiok);
      hasKimCiok = true;
    }

    // 4. Evaluate Pyong Pi (#40)
    const pyongPi = evaluatePyongPi(decomposition, context, 'K');
    if (pyongPi) {
      patterns.push(pyongPi);
      hasPyongPi = true;
    }

    // 5. Evaluate Tile KIM (#7) - awards 1 Tay per Kim in completed K hands
    if (!isInstantHu) {
      const tileKim = evaluateTileKim(totalKimCount, 'K');
      if (tileKim) patterns.push(tileKim);
    }
  }

  const kimTay = patterns.reduce((sum, p) => sum + p.tay, 0);

  return {
    mode,
    totalKimCount,
    wildcardKimCount,
    naturalNominalCount: Math.max(0, totalKimCount - wildcardKimCount),
    isBoKimEligible: mode === 'NK',
    patterns,
    kimTay,
    chosenHand: 'signature' in decomposition ? (decomposition as SolvedHand) : undefined,
    chosenDecomposition: decomposition,
    isBoKim: mode === 'NK',
    hasKimThi,
    hasKimCiok,
    hasShiKim,
    hasPyongPi,
  };
}

/**
 * Alias for evaluateDecomposition
 */
export function evaluateKimMode(
  hand: SolvedHand | SolvedHandDecomposition,
  context: KimWinContext
): KimEvaluationResult {
  return evaluateDecomposition(hand, context);
}

// ============================================================================
// Multi-Solution Arbitration (Optimal Tay Maximization)
// ============================================================================
export function arbitrateKimDecompositions(
  decompositions: (SolvedHand | SolvedHandDecomposition)[],
  context: KimWinContext
): KimModeEvaluationResult {
  if (decompositions.length === 0) {
    throw new Error('Arbitration requires at least one decomposition');
  }

  let bestResult: KimEvaluationResult | null = null;

  for (const decomp of decompositions) {
    const result = evaluateDecomposition(decomp, context);
    if (!bestResult || result.kimTay > bestResult.kimTay) {
      bestResult = result;
    }
  }

  return bestResult!;
}

// ============================================================================
// Instant Hu Evaluator (#9 Shi Kim 10 Tay)
// ============================================================================
export function evaluateInstantHu(
  tiles: readonly Tile[],
  context: KimWinContext
): KimEvaluationResult {
  const kimCount = tiles.filter(isKim).length;
  if (kimCount === 4 && context.isInstantHu) {
    const shiKim = evaluateShiKim(4, true, 'K')!;
    return {
      mode: 'K',
      totalKimCount: 4,
      wildcardKimCount: 0,
      naturalNominalCount: 0,
      isBoKimEligible: false,
      patterns: [shiKim],
      kimTay: 10,
      isBoKim: false,
      hasKimThi: false,
      hasKimCiok: false,
      hasShiKim: true,
      hasPyongPi: false,
    };
  }
  throw new Error('Invalid instant Hu declaration: requires exactly 4 Kim tiles');
}
