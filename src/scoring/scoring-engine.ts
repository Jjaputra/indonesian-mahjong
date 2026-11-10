import type { GameRules, Meld, Seat, Tile } from '../core/types';
import type { KimMode, SolvedHand } from '../kim/types';
import { findWinningDecompositions, isKim } from '../kim/wildcard-solver';
import { validateKimMeldLegality } from '../kim/kim-validator';
import {
  type HandFeatures,
  countConcealedTripletKinds,
  countKims,
  parseHandFeatures,
} from './hand-parser';
import { SUPERSEDES, baseTay, getPattern } from './patterns';
import type {
  DetectedPattern,
  IScoringEngine,
  LewFitReason,
  OverlapPolicy,
  ScoringOptions,
  ScoringResult,
  WinContext,
} from './types';

export const DEFAULT_SCORING_RULES: GameRules = {
  kimEnabled: true,
  kimDiscardAllowed: false,
  allowKimInMeldClaim: false,
  minHuTay: 5,
};

const SEAT_NUMBER: Record<Seat, number> = { dong: 1, nan: 2, xi: 3, bei: 4 };
const DRAGON_PATTERN: Record<number, number> = { 1: 27, 2: 28, 3: 29 };
const DRAGON_LABEL: Record<number, string> = { 1: 'Zhong', 2: 'Fat', 3: 'Pat' };

/** Everything a pattern detector may look at for one candidate decomposition. */
interface ScoringInput {
  readonly features: HandFeatures;
  readonly mode: KimMode;
  readonly flowers: readonly Tile[];
  readonly context: WinContext;
}

function isSuitedType(type: string): boolean {
  return type === 'tong' || type === 'sok' || type === 'ban';
}

function isHonorType(type: string): boolean {
  return type === 'wind' || type === 'dragon';
}

/** Builds a DetectedPattern, or null when the pattern has no value in this mode. */
function award(id: number, mode: KimMode, description: string, tayOverride?: number): DetectedPattern | null {
  const base = baseTay(id, mode);
  if (base === null) return null;
  return { id, name: getPattern(id).name, tay: tayOverride ?? base, description };
}

// ============================================================================
// Pattern detectors
// ============================================================================

function detectBonus({ mode, flowers, context }: ScoringInput): DetectedPattern[] {
  const out: (DetectedPattern | null)[] = [];
  const seatNo = SEAT_NUMBER[context.seatWind];
  const bunga = flowers.filter((t) => t.type === 'flower');
  const musim = flowers.filter((t) => t.type === 'season');

  if (bunga.length > 0) {
    const own = bunga.filter((t) => t.value === seatNo).length;
    out.push(award(1, mode, `${bunga.length} bunga (0 Tay/tile)${own ? `, ${own} sesuai posisi duduk (+1)` : ''}`, own));
  }
  if (musim.length > 0) {
    const own = musim.filter((t) => t.value === seatNo).length;
    out.push(award(2, mode, `${musim.length} musim (1 Tay/tile)${own ? `, ${own} sesuai posisi duduk (+1)` : ''}`, musim.length + own));
  }
  if (bunga.length === 4) out.push(award(4, mode, 'Memiliki keempat tile bunga'));
  if (musim.length === 4) out.push(award(5, mode, 'Memiliki keempat tile musim'));
  if (bunga.length + musim.length >= 7) out.push(award(6, mode, `${bunga.length + musim.length} tile bunga/musim dalam Hu lengkap`));
  return out.filter((p): p is DetectedPattern => p !== null);
}

function detectKim({ features, mode, context }: ScoringInput): DetectedPattern[] {
  const out: (DetectedPattern | null)[] = [];
  if (mode === 'NK') {
    out.push(award(8, mode, 'Tidak ada Kim di tangan (Bo KIM)'));
    return out.filter((p): p is DetectedPattern => p !== null);
  }
  out.push(award(7, mode, `${features.kimCount} tile Kim × 1 Tay`, features.kimCount));
  if (features.kimCount === 4) out.push(award(9, mode, 'Keempat Kim ada di tangan (Hu lengkap)'));
  if (features.triplets.some((t) => t.isKimThi)) out.push(award(30, mode, 'Tiga Kim dijadikan satu tris'));
  const pair = features.pair;
  if (pair && pair.kimCount === 2) out.push(award(32, mode, 'Dua Kim dijadikan pair (kaki)'));
  if (pair && pair.kimCount === 1 && context.isSelfDraw) {
    const natural = pair.tiles.find((t) => !isKim(t));
    const w = context.winningTile;
    if (natural && natural.type === w.type && natural.value === w.value) {
      out.push(award(40, mode, 'Tile terakhir dari tembok menjadi pasangan Kim'));
    }
  }
  return out.filter((p): p is DetectedPattern => p !== null);
}

function detectFirstTurn({ mode, context }: ScoringInput): DetectedPattern[] {
  const out: (DetectedPattern | null)[] = [];
  const isThienFu = context.isInitialDeal && context.isSelfDraw && context.seatWind === 'dong';
  if (context.isPaoChin) out.push(award(10, mode, 'Pao Chin dideklarasikan pada pembagian pertama'));
  if (isThienFu) out.push(award(11, mode, 'Dong langsung Hu dari pembagian pertama'));
  if (context.isInitialDeal && context.isPaoChin && !isThienFu) {
    out.push(award(12, mode, 'Hu dari lew/discard pertama setelah declare Pao Chin'));
  }
  return out.filter((p): p is DetectedPattern => p !== null);
}

function detectShape({ features, mode, context, flowers }: ScoringInput): DetectedPattern[] {
  const out: (DetectedPattern | null)[] = [];
  const tiles = features.representedTiles.filter((t) => t.type !== 'kim');
  const suits = new Set(tiles.filter((t) => isSuitedType(t.type)).map((t) => t.type));
  const hasHonor = tiles.some((t) => isHonorType(t.type));

  // Hand-shape family (#14–#24, #16, #20, #39) — used to decide Chicken Hand
  const shapeIds: number[] = [];
  const push = (p: DetectedPattern | null) => {
    if (p) {
      out.push(p);
      shapeIds.push(p.id);
    }
  };

  if (features.shape === 'seven_pairs') push(award(16, mode, '7 pasang (Tjit Tuei)'));
  if (features.shape === 'thirteen_orphans') push(award(20, mode, '13 tile terminal & honor + 1 pasangan'));
  if (features.shape === 'se_sam_pu_tat' && flowers.length === 0) {
    push(award(39, mode, 'Semua kartu tidak berhubungan (beda ≥3), tanpa pair, bunga/musim, atau Kim'));
  }

  if (features.shape === 'standard') {
    const pair = features.pair;
    const pairKind = pair?.representedTiles.find((t) => t.type !== 'kim');
    const seatNo = SEAT_NUMBER[context.seatWind];
    const roundNo = SEAT_NUMBER[context.roundWind];
    const isValuePair =
      !!pairKind &&
      (pairKind.type === 'dragon' ||
        (pairKind.type === 'wind' && (pairKind.value === seatNo || pairKind.value === roundNo)));
    if (features.sequenceCount === 4 && !isValuePair) push(award(14, mode, '4 urutan + pair bukan naga/angin duduk/angin putaran'));
    if (features.triplets.length === 4) push(award(15, mode, '4 tris + 1 pair'));
  }

  if (features.shape !== 'thirteen_orphans' && features.shape !== 'se_sam_pu_tat') {
    if (suits.size === 1 && hasHonor) push(award(17, mode, `Satu suit (${[...suits][0]}) + angin/naga`));
    if (suits.size === 1 && !hasHonor) push(award(18, mode, `Hanya satu suit (${[...suits][0]})`));
    if (tiles.length > 0 && tiles.every((t) => isSuitedType(t.type) && (t.value === 1 || t.value === 9))) {
      push(award(19, mode, 'Hanya angka 1 dan 9'));
    }
  }

  if (features.shape === 'standard') {
    const dragonTrips = features.triplets.filter((t) => t.kind.type === 'dragon').length;
    const windTrips = features.triplets.filter((t) => t.kind.type === 'wind').length;
    const pairKind = features.pair?.representedTiles.find((t) => t.type !== 'kim');
    if (dragonTrips === 2 && pairKind?.type === 'dragon') push(award(21, mode, '2 tris naga + pair naga'));
    if (dragonTrips === 3) push(award(22, mode, '3 tris naga'));
    if (windTrips === 3 && pairKind?.type === 'wind') push(award(23, mode, '3 tris angin + pair angin'));
    if (windTrips === 4) push(award(24, mode, '4 tris angin'));

    if (features.sequenceCount > 0 && features.triplets.length > 0 && shapeIds.length === 0) {
      out.push(award(13, mode, 'Campuran urutan dan tris tanpa pola tangan lain'));
    }
  }
  return out.filter((p): p is DetectedPattern => p !== null);
}

function detectMelds({ features, mode, context }: ScoringInput): DetectedPattern[] {
  const out: (DetectedPattern | null)[] = [];
  if (features.shape !== 'standard') return [];
  const seatNo = SEAT_NUMBER[context.seatWind];
  const roundNo = SEAT_NUMBER[context.roundWind];
  const natural = features.triplets.filter((t) => !t.isKimThi);

  if (natural.some((t) => t.kind.type === 'wind' && t.kind.value === seatNo)) {
    out.push(award(25, mode, `Tris angin duduk (${context.seatWind})`));
  }
  if (natural.some((t) => t.kind.type === 'wind' && t.kind.value === roundNo)) {
    out.push(award(26, mode, `Tris angin putaran (${context.roundWind})`));
  }
  for (const value of [1, 2, 3]) {
    if (natural.some((t) => t.kind.type === 'dragon' && t.kind.value === value)) {
      out.push(award(DRAGON_PATTERN[value]!, mode, `Tris naga ${DRAGON_LABEL[value]}`));
    }
  }

  const pairKind = features.pair?.representedTiles.find((t) => t.type !== 'kim');
  if (pairKind && isSuitedType(pairKind.type) && (pairKind.value === 2 || pairKind.value === 8)) {
    out.push(award(31, mode, `Pair angka ${pairKind.value}`));
  }

  const concealedTrips = features.triplets.filter((t) => t.concealed).length;
  if (concealedTrips === 3) out.push(award(33, mode, '3 tris terbentuk tanpa pung'));
  if (concealedTrips === 4) out.push(award(34, mode, '4 tris terbentuk tanpa pung'));

  if (features.claimedMeldCount === 4) out.push(award(41, mode, '4 kali Jia/Pung hingga tersisa 1 tile'));
  return out.filter((p): p is DetectedPattern => p !== null);
}

function detectEvents({ features, mode, context }: ScoringInput): DetectedPattern[] {
  const out: (DetectedPattern | null)[] = [];
  if (context.isRobbingKong) out.push(award(35, mode, 'Hu dengan mencuri tile Kong lawan'));
  if (context.isSelfRobbingKong && context.isSelfDraw) out.push(award(36, mode, 'Kartu ke-4 dari pung dipakai untuk seri, ce mo'));
  if (context.isKongReplacement && !context.isDoubleKongReplacement) out.push(award(37, mode, 'Hu dari tile ekor tembok setelah Kong'));
  if (context.isDoubleKongReplacement) out.push(award(38, mode, 'Hu setelah dua Kong berturut-turut'));

  const concealed = features.claimedMeldCount === 0;
  if (context.isSelfDraw && !concealed) out.push(award(42, mode, 'Ce mo dengan tangan terbuka'));
  if (!context.isSelfDraw && concealed) out.push(award(43, mode, 'Tangan tertutup, Hu dari buangan lawan'));
  if (context.isSelfDraw && concealed) out.push(award(44, mode, 'Ce mo dengan tangan tertutup penuh'));
  return out.filter((p): p is DetectedPattern => p !== null);
}

function applyOverlapPolicy(patterns: DetectedPattern[], policy: OverlapPolicy): DetectedPattern[] {
  if (policy === 'additive') return patterns;
  const present = new Set(patterns.map((p) => p.id));
  const removed = new Set<number>();
  for (const [key, lower] of SUPERSEDES) {
    if (present.has(key)) lower.forEach((id) => removed.add(id));
  }
  return patterns.filter((p) => !removed.has(p.id));
}

export function scoreDecomposition(input: ScoringInput, policy: OverlapPolicy = 'additive'): DetectedPattern[] {
  const { features, mode, flowers } = input;
  const patterns: DetectedPattern[] = [
    ...detectBonus(input),
    ...detectKim(input),
    ...detectFirstTurn(input),
    ...detectShape(input),
    ...detectMelds(input),
    ...detectEvents(input),
  ];
  const hasHonor = features.representedTiles.some((t) => isHonorType(t.type));
  if (flowers.length === 0 && !hasHonor) {
    const p = award(3, mode, 'Tanpa bunga, musim, angin, dan naga');
    if (p) patterns.push(p);
  }
  patterns.sort((a, b) => a.id - b.id);
  return applyOverlapPolicy(patterns, policy);
}

// ============================================================================
// Engine
// ============================================================================

function sumTay(patterns: readonly DetectedPattern[]): number {
  return patterns.reduce((s, p) => s + p.tay, 0);
}

export class ScoringEngine implements IScoringEngine {
  private readonly overlapPolicy: OverlapPolicy;

  constructor(options: ScoringOptions = {}) {
    this.overlapPolicy = options.overlapPolicy ?? 'additive';
  }

  /**
   * Scores a declared Hu.
   * @param hand concealed tiles (with or without the winning tile; it is added when missing)
   * @param melds declared melds (claimed Jia/Pung/Kong and Ankong)
   * @param flowers exposed flowers/seasons
   */
  public evaluateHand(
    hand: Tile[],
    melds: Meld[],
    flowers: Tile[],
    context: WinContext,
    rules: Partial<GameRules> = DEFAULT_SCORING_RULES
  ): ScoringResult {
    const r: GameRules = { ...DEFAULT_SCORING_RULES, ...rules };
    const concealed = hand.some((t) => t.id === context.winningTile.id) ? [...hand] : [...hand, context.winningTile];
    const allTiles = [...concealed, ...melds.flatMap((m) => m.tiles)];
    const kimCount = countKims(allTiles);
    const rawMode: KimMode = kimCount > 0 ? 'K' : 'NK';
    const isInstantHu = !!context.isInstantHu;

    const base = {
      isWithKim: kimCount > 0,
      mode: rawMode,
      isInstantHu,
      minHuTay: r.minHuTay,
      candidateCount: 0,
    };
    const reject = (reason: LewFitReason, message: string, patterns: DetectedPattern[] = [], totalTay = 0): ScoringResult => ({
      ...base,
      isValidHu: false,
      isLewFit: true,
      totalTay,
      patterns,
      lewFitReason: reason,
      rejectionReason: message,
    });

    // Penalti #3: Kim in a claimed Jia/Pung/Kong
    const legality = validateKimMeldLegality(melds, r);
    if (legality.isLewFit) {
      return reject('kim-claim', 'Lew Fit: Jia/Pung/Kong menggunakan Kim tidak diperbolehkan (Penalti #3)');
    }

    if (isInstantHu) return this.evaluateInstantHu(concealed, melds, flowers, rawMode, base, reject);

    const candidates = findWinningDecompositions({
      hand: concealed,
      melds,
      winningTile: context.winningTile,
      rules: r,
      isSelfDraw: context.isSelfDraw,
    });
    if (candidates.length === 0) {
      return reject('structure', 'Lew Fit: susunan tile tidak membentuk Hu yang sah (Penalti #1/#2)');
    }

    const validCandidates = candidates.filter(
      (c) => !(c.shape === 'se_sam_pu_tat' && (flowers.length > 0 || c.mode === 'K'))
    );
    if (validCandidates.length === 0) {
      return reject('structure', 'Lew Fit: Se Sam Pu Tat tidak boleh memiliki bunga, musim, atau Kim');
    }

    // Arbitration: pick the Kim wildcard decomposition with the highest TOTAL Tay
    let best: { solved: SolvedHand; patterns: DetectedPattern[]; total: number } | null = null;
    for (const solved of validCandidates) {
      const features = parseHandFeatures(solved, concealed, melds);
      const patterns = scoreDecomposition({ features, mode: solved.mode, flowers, context }, this.overlapPolicy);
      const total = sumTay(patterns);
      if (!best || total > best.total) best = { solved, patterns, total };
    }
    const { solved, patterns, total } = best!;

    const result: ScoringResult = {
      ...base,
      mode: solved.mode,
      isValidHu: total >= r.minHuTay,
      isLewFit: total < r.minHuTay,
      totalTay: total,
      patterns,
      decomposition: solved,
      candidateCount: validCandidates.length,
    };
    if (total < r.minHuTay) {
      result.lewFitReason = 'below-minimum';
      result.rejectionReason = `Lew Fit: Hu kurang dari ${r.minHuTay} Tay (hanya ${total} Tay) (Penalti #4)`;
    }
    return result;
  }

  private evaluateInstantHu(
    concealed: Tile[],
    melds: Meld[],
    flowers: Tile[],
    mode: KimMode,
    base: Omit<ScoringResult, 'isValidHu' | 'isLewFit' | 'totalTay' | 'patterns'>,
    reject: (reason: LewFitReason, message: string, patterns?: DetectedPattern[], totalTay?: number) => ScoringResult
  ): ScoringResult {
    const patterns: DetectedPattern[] = [];
    const instant = (id: number, description: string) => {
      const def = getPattern(id);
      patterns.push({ id, name: def.name, tay: def.instantHu!, description: `${description} — langsung Hu tanpa diselesaikan` });
    };
    if (flowers.filter((t) => t.type === 'flower' || t.type === 'season').length >= 7) instant(6, '7 tile bunga/musim');
    if (countKims([...concealed, ...melds.flatMap((m) => m.tiles)]) === 4) instant(9, '4 Kim di tangan');
    if (countConcealedTripletKinds(concealed, melds) >= 4) instant(34, '4 tris tanpa pung');

    if (patterns.length === 0) {
      return reject('instant-invalid', 'Lew Fit: Hu langsung dideklarasikan tanpa syarat (7 bunga/musim, 4 Kim, atau 4 tris tertutup)');
    }
    const total = sumTay(patterns);
    const isValid = total >= base.minHuTay;
    if (!isValid) {
      return reject('below-minimum', `Lew Fit: Hu langsung kurang dari ${base.minHuTay} Tay (hanya ${total} Tay) (Penalti #4)`, patterns, total);
    }
    return { ...base, mode, isValidHu: true, isLewFit: false, totalTay: total, patterns };
  }
}

/** Shared default engine (additive overlap policy). */
export const scoringEngine = new ScoringEngine();
