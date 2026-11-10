import type { GameRules, Meld, MeldType, Seat, Tile, TileType } from '../core/types';
import {
  DEFAULT_KIM_RULES,
  HandPatternShape,
  KimRules,
  resolveKimRules,
  SolvedHand,
  SolverHandInput,
  WildcardAssignment,
} from './types';

// ============================================================================
// Tile Ordering and Inspection Utilities
// ============================================================================

const SUIT_ORDER: Record<TileType, number> = {
  tong: 1,
  sok: 2,
  ban: 3,
  wind: 4,
  dragon: 5,
  flower: 6,
  season: 7,
  kim: 8,
};

export function isKim(tile: Tile): boolean {
  return tile.type === 'kim' || tile.isKim === true;
}

export function tileKind(tile: Tile): string {
  if (isKim(tile)) return 'kim-0';
  return `${tile.type}-${tile.value}`;
}

export function compareTiles(a: Tile, b: Tile): number {
  if (isKim(a) && !isKim(b)) return 1;
  if (!isKim(a) && isKim(b)) return -1;
  if (isKim(a) && isKim(b)) return 0;

  const orderA = SUIT_ORDER[a.type] ?? 99;
  const orderB = SUIT_ORDER[b.type] ?? 99;
  if (orderA !== orderB) return orderA - orderB;
  return a.value - b.value;
}

export function createRepresentedTile(kimTile: Tile, targetType: TileType, targetValue: number): Tile {
  return {
    id: kimTile.id,
    type: targetType,
    value: targetValue,
    isKim: true,
  };
}

// ============================================================================
// Internal Draft Structures
// ============================================================================

interface DraftMeld {
  type: MeldType | 'kim_thi';
  tiles: Tile[];
  representedTiles: Tile[];
  assignments: WildcardAssignment[];
  claimedFrom?: Seat;
  isOpen: boolean;
  kimCount: number;
}

interface DraftPair {
  tiles: [Tile, Tile];
  representedTiles: [Tile, Tile];
  assignments: WildcardAssignment[];
  kimCount: number;
  isKimCiok: boolean;
  isPyongPi?: boolean;
}

// ============================================================================
// Canonical Signatures (for Deduplication)
// ============================================================================

function canonicalMeldKey(m: DraftMeld): string {
  const repStr = m.representedTiles.map((t) => `${t.type}-${t.value}`).join(',');
  const openStr = m.isOpen ? 'O' : 'C';
  return `${m.type}:${openStr}:[${repStr}]:K${m.kimCount}`;
}

function canonicalPairKey(p: DraftPair): string {
  if (p.isKimCiok) return 'PAIR:KIM-KIM';
  const [t1, t2] = p.representedTiles;
  const k1 = `${t1.type}-${t1.value}`;
  const k2 = `${t2.type}-${t2.value}`;
  const sorted = [k1, k2].sort();
  return `PAIR:${sorted[0]}:${sorted[1]}:K${p.kimCount}`;
}

function createSignature(
  shape: HandPatternShape,
  melds: DraftMeld[],
  pair?: DraftPair,
  pairs?: DraftPair[]
): string {
  if (shape === 'seven_pairs' && pairs) {
    const sorted = pairs.map(canonicalPairKey).sort();
    return `7PAIRS:[${sorted.join('|')}]`;
  }
  if (shape === 'thirteen_orphans') {
    return `13ORPHANS:${pair ? canonicalPairKey(pair) : ''}`;
  }
  if (shape === 'shi_kim') {
    return 'SHI_KIM:INSTANT_HU';
  }
  if (shape === 'se_sam_pu_tat') {
    return 'SE_SAM_PU_TAT';
  }
  const sortedMelds = melds.map(canonicalMeldKey).sort();
  return `STD:[${sortedMelds.join('|')}]+[${pair ? canonicalPairKey(pair) : ''}]`;
}

// ============================================================================
// Seven Pairs Solver (Tjit Tuei, Pattern #16)
// ============================================================================

export function solveSevenPairs(
  concealedTiles: readonly Tile[],
  openMelds: readonly Meld[] = [],
  rules?: KimRules
): SolvedHand[] {
  if (openMelds.length > 0 || concealedTiles.length !== 14) return [];

  const r = rules ?? DEFAULT_KIM_RULES;
  const naturalTiles: Tile[] = [];
  const kims: Tile[] = [];

  for (const t of concealedTiles) {
    if (isKim(t)) kims.push(t);
    else naturalTiles.push(t);
  }

  // If Kim is disabled or pair claims with Kim are forbidden and Kims are present
  if (kims.length > 0 && (!r.kimEnabled || !r.allowKimInPair)) {
    return [];
  }

  const kindMap = new Map<string, Tile[]>();
  for (const t of naturalTiles) {
    const k = tileKind(t);
    const arr = kindMap.get(k) ?? [];
    arr.push(t);
    kindMap.set(k, arr);
  }

  const naturalPairs: DraftPair[] = [];
  const singletons: Tile[] = [];

  for (const tiles of kindMap.values()) {
    let i = 0;
    while (i + 1 < tiles.length) {
      naturalPairs.push({
        tiles: [tiles[i]!, tiles[i + 1]!],
        representedTiles: [tiles[i]!, tiles[i + 1]!],
        assignments: [],
        kimCount: 0,
        isKimCiok: false,
      });
      i += 2;
    }
    if (i < tiles.length) {
      singletons.push(tiles[i]!);
    }
  }

  if (kims.length < singletons.length) return [];
  const remainingKims = kims.length - singletons.length;
  if (remainingKims % 2 !== 0) return [];

  const pairs: DraftPair[] = [...naturalPairs];
  const assignments: WildcardAssignment[] = [];
  let kimIdx = 0;

  // Pair each singleton with 1 Kim
  for (const s of singletons) {
    const kTile = kims[kimIdx++]!;
    const repTile = createRepresentedTile(kTile, s.type, s.value);
    const assign: WildcardAssignment = {
      kimTile: kTile,
      representedTile: repTile,
      role: 'pair',
    };
    assignments.push(assign);
    pairs.push({
      tiles: [s, kTile],
      representedTiles: [s, repTile],
      assignments: [assign],
      kimCount: 1,
      isKimCiok: false,
    });
  }

  // Pair remaining Kims into Kim-Kim pairs (Kim Ciok)
  while (kimIdx + 1 < kims.length) {
    const k1 = kims[kimIdx++]!;
    const k2 = kims[kimIdx++]!;
    const rep1 = createRepresentedTile(k1, 'kim', 0);
    const rep2 = createRepresentedTile(k2, 'kim', 0);
    const assign1: WildcardAssignment = { kimTile: k1, representedTile: rep1, role: 'pair' };
    const assign2: WildcardAssignment = { kimTile: k2, representedTile: rep2, role: 'pair' };
    assignments.push(assign1, assign2);
    pairs.push({
      tiles: [k1, k2],
      representedTiles: [rep1, rep2],
      assignments: [assign1, assign2],
      kimCount: 2,
      isKimCiok: true,
    });
  }

  const sig = createSignature('seven_pairs', [], undefined, pairs);
  return [
    {
      shape: 'seven_pairs',
      melds: [],
      pairs: pairs.map((p) => ({
        tiles: p.tiles,
        representedTiles: p.representedTiles,
        kimCount: p.kimCount,
        isKimCiok: p.isKimCiok,
      })),
      wildcardAssignments: assignments,
      totalKims: kims.length,
      totalKimCount: kims.length,
      wildcardKimCount: assignments.length,
      mode: kims.length > 0 ? 'K' : 'NK',
      signature: sig,
    },
  ];
}

// ============================================================================
// Thirteen Orphans Solver (Cap Sa Yau Kiu, Pattern #20)
// ============================================================================

const ORPHAN_KEYS: readonly string[] = [
  'tong-1', 'tong-9',
  'sok-1', 'sok-9',
  'ban-1', 'ban-9',
  'wind-1', 'wind-2', 'wind-3', 'wind-4',
  'dragon-1', 'dragon-2', 'dragon-3',
];

export function solveThirteenOrphans(
  concealedTiles: readonly Tile[],
  openMelds: readonly Meld[] = [],
  rules?: KimRules
): SolvedHand[] {
  if (openMelds.length > 0 || concealedTiles.length !== 14) return [];

  const r = rules ?? DEFAULT_KIM_RULES;
  const naturalTiles: Tile[] = [];
  const kims: Tile[] = [];

  for (const t of concealedTiles) {
    if (isKim(t)) kims.push(t);
    else naturalTiles.push(t);
  }

  if (kims.length > 0 && !r.kimEnabled) {
    return [];
  }

  // All natural tiles must be valid orphans
  for (const t of naturalTiles) {
    if (!ORPHAN_KEYS.includes(tileKind(t))) return [];
  }

  const presentKindMap = new Map<string, Tile[]>();
  for (const t of naturalTiles) {
    const k = tileKind(t);
    const arr = presentKindMap.get(k) ?? [];
    arr.push(t);
    presentKindMap.set(k, arr);
  }

  const missingKeys = ORPHAN_KEYS.filter((k) => !presentKindMap.has(k));
  if (kims.length < missingKeys.length) return [];

  // Need at least 1 pair among the 13 orphans
  let hasNaturalPair = false;
  let pairKind: string | null = null;
  for (const [k, arr] of presentKindMap.entries()) {
    if (arr.length >= 2) {
      hasNaturalPair = true;
      pairKind = k;
      break;
    }
  }

  const remainingKims = kims.length - missingKeys.length;
  if (!hasNaturalPair && remainingKims < 1) return [];

  // Create virtual substitutions for missing orphans
  const assignments: WildcardAssignment[] = [];
  let kimIdx = 0;
  const resolvedTiles: Tile[] = [...naturalTiles];

  for (const mk of missingKeys) {
    const kTile = kims[kimIdx++]!;
    const [type, valStr] = mk.split('-');
    const repTile = createRepresentedTile(kTile, type as TileType, parseInt(valStr!, 10));
    assignments.push({ kimTile: kTile, representedTile: repTile, role: 'orphan' });
    resolvedTiles.push(repTile);
  }

  let pairDraft: DraftPair;
  if (hasNaturalPair && pairKind) {
    const arr = presentKindMap.get(pairKind)!;
    pairDraft = {
      tiles: [arr[0]!, arr[1]!],
      representedTiles: [arr[0]!, arr[1]!],
      assignments: [],
      kimCount: 0,
      isKimCiok: false,
    };
  } else {
    // A Kim forms the pair with one of the orphans
    const kTile = kims[kimIdx++]!;
    const anchorTile = naturalTiles[0]!;
    const repTile = createRepresentedTile(kTile, anchorTile.type, anchorTile.value);
    const assign: WildcardAssignment = { kimTile: kTile, representedTile: repTile, role: 'pair' };
    assignments.push(assign);
    resolvedTiles.push(repTile);
    pairDraft = {
      tiles: [anchorTile, kTile],
      representedTiles: [anchorTile, repTile],
      assignments: [assign],
      kimCount: 1,
      isKimCiok: false,
    };
  }

  const sig = createSignature('thirteen_orphans', [], pairDraft);
  return [
    {
      shape: 'thirteen_orphans',
      melds: [],
      pair: {
        tiles: pairDraft.tiles,
        representedTiles: pairDraft.representedTiles,
        kimCount: pairDraft.kimCount,
        isKimCiok: pairDraft.isKimCiok,
      },
      orphanTiles: resolvedTiles,
      wildcardAssignments: assignments,
      totalKims: kims.length,
      totalKimCount: kims.length,
      wildcardKimCount: assignments.length,
      mode: kims.length > 0 ? 'K' : 'NK',
      signature: sig,
    },
  ];
}

// ============================================================================
// Se Sam Pu Tat Solver (Pattern #39, NK 40 Tay)
// ============================================================================

export function solveSeSamPuTat(
  concealedTiles: readonly Tile[],
  openMelds: readonly Meld[] = [],
  _rules?: KimRules
): SolvedHand[] {
  // Exactly 14 concealed tiles, 0 open melds
  if (openMelds.length > 0 || concealedTiles.length !== 14) return [];

  // Zero Kims (NK only - if any Kim is present, return [])
  if (concealedTiles.some(isKim)) return [];

  // No duplicate tiles across the hand (14 distinct tiles)
  const kindCounts = new Map<string, number>();
  for (const t of concealedTiles) {
    const k = tileKind(t);
    kindCounts.set(k, (kindCounts.get(k) ?? 0) + 1);
  }
  for (const count of kindCounts.values()) {
    if (count > 1) return []; // no pairs or duplicates allowed
  }

  // Suited tiles must be uncorrelated: in each suit (Tong, Sok, Ban),
  // any two tiles must differ in value by at least 3.
  const suitedMap: Record<'tong' | 'sok' | 'ban', number[]> = {
    tong: [],
    sok: [],
    ban: [],
  };

  for (const t of concealedTiles) {
    if (t.type === 'tong' || t.type === 'sok' || t.type === 'ban') {
      suitedMap[t.type].push(t.value);
    } else if (t.type !== 'wind' && t.type !== 'dragon') {
      // Flowers, seasons, or unknown types disqualify
      return [];
    }
  }

  for (const suit of ['tong', 'sok', 'ban'] as const) {
    const vals = suitedMap[suit].sort((a, b) => a - b);
    for (let i = 0; i < vals.length - 1; i++) {
      if (vals[i + 1]! - vals[i]! < 3) {
        return [];
      }
    }
  }

  const sig = createSignature('se_sam_pu_tat', [], undefined);
  return [
    {
      shape: 'se_sam_pu_tat',
      melds: [],
      wildcardAssignments: [],
      totalKims: 0,
      totalKimCount: 0,
      wildcardKimCount: 0,
      mode: 'NK',
      signature: sig,
    },
  ];
}

// ============================================================================
// Standard Solver (4 Melds + 1 Pair)
// ============================================================================

export function solveStandardHand(
  concealedTiles: readonly Tile[],
  openMelds: readonly Meld[] = [],
  rules?: KimRules,
  winningTile?: Tile,
  isSelfDraw?: boolean
): SolvedHand[] {
  const openMeldsVirtualCount = openMelds.length * 3;
  const totalCount = concealedTiles.length + openMeldsVirtualCount;
  if (totalCount !== 14 || concealedTiles.length % 3 !== 2) return [];

  const meldsNeeded = (concealedTiles.length - 2) / 3;
  const r = rules ?? DEFAULT_KIM_RULES;

  const naturalTiles: Tile[] = [];
  const kims: Tile[] = [];
  for (const t of concealedTiles) {
    if (isKim(t)) kims.push(t);
    else naturalTiles.push(t);
  }

  // Pre-process open melds into MeldCompositions
  let openMeldsKimCount = 0;
  const openAssignments: WildcardAssignment[] = [];
  const convertedOpenMelds: DraftMeld[] = openMelds.map((m) => {
    const kCount = m.tiles.filter(isKim).length;
    openMeldsKimCount += kCount;
    // Map open meld Kims if present
    const assignments: WildcardAssignment[] = [];
    const repTiles = m.tiles.map((t) => {
      if (isKim(t)) {
        // Concrete identity from natural tiles in meld
        const naturalRef = m.tiles.find((x) => !isKim(x));
        const rep = naturalRef
          ? createRepresentedTile(t, naturalRef.type, naturalRef.value)
          : createRepresentedTile(t, 'kim', 0);
        const assign: WildcardAssignment = {
          kimTile: t,
          representedTile: rep,
          role: m.type === 'jia' ? 'jia' : m.type === 'kong' || m.type === 'ankong' ? 'kong' : 'pung',
        };
        assignments.push(assign);
        openAssignments.push(assign);
        return rep;
      }
      return t;
    });

    return {
      type: m.type,
      tiles: [...m.tiles],
      representedTiles: repTiles,
      assignments,
      claimedFrom: m.claimedFrom,
      isOpen: m.type !== 'ankong',
      kimCount: kCount,
    };
  });

  const totalKims = kims.length + openMeldsKimCount;
  const solutions: SolvedHand[] = [];
  const seenSignatures = new Set<string>();

  // Map natural tiles
  const kindMap = new Map<string, Tile[]>();
  for (const t of naturalTiles) {
    const k = tileKind(t);
    const arr = kindMap.get(k) ?? [];
    arr.push(t);
    kindMap.set(k, arr);
  }

  function getAvailableKinds(): string[] {
    return Array.from(kindMap.entries())
      .filter(([_, arr]) => arr.length > 0)
      .map(([k, _]) => k)
      .sort((a, b) => {
        const [ta, va] = a.split('-');
        const [tb, vb] = b.split('-');
        const diffSuit = (SUIT_ORDER[ta as TileType] ?? 99) - (SUIT_ORDER[tb as TileType] ?? 99);
        if (diffSuit !== 0) return diffSuit;
        return parseInt(va!, 10) - parseInt(vb!, 10);
      });
  }

  function takeTiles(kind: string, count: number): Tile[] {
    const arr = kindMap.get(kind)!;
    return arr.splice(0, count);
  }

  function returnTiles(kind: string, tiles: Tile[]): void {
    const arr = kindMap.get(kind) ?? [];
    arr.push(...tiles);
    kindMap.set(kind, arr);
  }

  // Helper to determine if pair qualifies as Pyong Pi (#40)
  function checkPyongPi(pTiles: [Tile, Tile]): boolean {
    if (!isSelfDraw || !winningTile) return false;
    const kimInPair = pTiles.filter(isKim).length;
    if (kimInPair !== 1) return false;
    const naturalTile = pTiles.find((t) => !isKim(t));
    if (!naturalTile) return false;
    return (
      naturalTile.id === winningTile.id ||
      (naturalTile.type === winningTile.type && naturalTile.value === winningTile.value)
    );
  }

  // --- Step 1: Pair Selection ---
  const distinctKinds = getAvailableKinds();

  // Option P1 & P2: Natural Pair and Natural + Kim Pair
  for (const kind of distinctKinds) {
    const available = kindMap.get(kind)!.length;

    // P1: Natural pair
    if (available >= 2) {
      const pairTiles = takeTiles(kind, 2);
      const isPyong = checkPyongPi([pairTiles[0]!, pairTiles[1]!]);
      const pairDraft: DraftPair = {
        tiles: [pairTiles[0]!, pairTiles[1]!],
        representedTiles: [pairTiles[0]!, pairTiles[1]!],
        assignments: [],
        kimCount: 0,
        isKimCiok: false,
        isPyongPi: isPyong,
      };
      searchMelds(pairDraft, [...kims], meldsNeeded, [...openAssignments]);
      returnTiles(kind, pairTiles);
    }

    // P2: Natural + Kim pair (requires r.allowKimInPair and r.kimEnabled)
    if (available >= 1 && kims.length >= 1 && r.kimEnabled && r.allowKimInPair) {
      const naturalTile = takeTiles(kind, 1)[0]!;
      const kimTile = kims[kims.length - 1]!;
      const remainingKims = kims.slice(0, kims.length - 1);

      const repTile = createRepresentedTile(kimTile, naturalTile.type, naturalTile.value);
      const assign: WildcardAssignment = {
        kimTile,
        representedTile: repTile,
        role: 'pair',
      };

      const isPyong = checkPyongPi([naturalTile, kimTile]);
      const pairDraft: DraftPair = {
        tiles: [naturalTile, kimTile],
        representedTiles: [naturalTile, repTile],
        assignments: [assign],
        kimCount: 1,
        isKimCiok: false,
        isPyongPi: isPyong,
      };

      searchMelds(pairDraft, remainingKims, meldsNeeded, [...openAssignments, assign]);
      returnTiles(kind, [naturalTile]);
    }
  }

  // Option P3: Kim Ciok Pair (KIM + KIM) (requires r.allowKimInPair and r.kimEnabled)
  if (kims.length >= 2 && r.kimEnabled && r.allowKimInPair) {
    const k1 = kims[kims.length - 2]!;
    const k2 = kims[kims.length - 1]!;
    const remainingKims = kims.slice(0, kims.length - 2);

    const rep1 = createRepresentedTile(k1, 'kim', 0);
    const rep2 = createRepresentedTile(k2, 'kim', 0);
    const assign1: WildcardAssignment = { kimTile: k1, representedTile: rep1, role: 'pair' };
    const assign2: WildcardAssignment = { kimTile: k2, representedTile: rep2, role: 'pair' };

    const pairDraft: DraftPair = {
      tiles: [k1, k2],
      representedTiles: [rep1, rep2],
      assignments: [assign1, assign2],
      kimCount: 2,
      isKimCiok: true,
      isPyongPi: false,
    };

    searchMelds(pairDraft, remainingKims, meldsNeeded, [...openAssignments, assign1, assign2]);
  }

  // --- Step 2: Recursive Meld Search ---
  function searchMelds(
    pair: DraftPair,
    availableKims: Tile[],
    needed: number,
    accAssignments: WildcardAssignment[],
    accMelds: DraftMeld[] = []
  ): void {
    if (needed === 0) {
      // Must consume all natural tiles and all Kims
      const remainingKinds = getAvailableKinds();
      if (remainingKinds.length > 0 || availableKims.length > 0) return;

      const allMelds = [...convertedOpenMelds, ...accMelds];
      const sig = createSignature('standard', allMelds, pair);
      if (seenSignatures.has(sig)) return;
      seenSignatures.add(sig);

      const wildcardKimCount = accAssignments.length;

      solutions.push({
        shape: 'standard',
        melds: allMelds.map((m) => ({
          type: m.type,
          tiles: m.tiles,
          representedTiles: m.representedTiles,
          claimedFrom: m.claimedFrom,
          isOpen: m.isOpen,
          kimCount: m.kimCount,
        })),
        pair: {
          tiles: pair.tiles,
          representedTiles: pair.representedTiles,
          kimCount: pair.kimCount,
          isKimCiok: pair.isKimCiok,
          isPyongPi: pair.isPyongPi,
        },
        wildcardAssignments: accAssignments,
        totalKims,
        totalKimCount: totalKims,
        wildcardKimCount,
        mode: totalKims > 0 ? 'K' : 'NK',
        signature: sig,
      });
      return;
    }

    const availableKinds = getAvailableKinds();

    // No natural tiles left: remaining melds must be formed purely of Kims (Kim Thi, Pattern #30)
    if (availableKinds.length === 0) {
      if (r.kimEnabled && r.allowKimInTriplet && availableKims.length === needed * 3) {
        const pureMelds: DraftMeld[] = [];
        const pureAssigns: WildcardAssignment[] = [];
        let kIdx = 0;
        for (let m = 0; m < needed; m++) {
          const k1 = availableKims[kIdx++]!;
          const k2 = availableKims[kIdx++]!;
          const k3 = availableKims[kIdx++]!;
          const rep1 = createRepresentedTile(k1, 'kim', 0);
          const rep2 = createRepresentedTile(k2, 'kim', 0);
          const rep3 = createRepresentedTile(k3, 'kim', 0);
          const a1: WildcardAssignment = { kimTile: k1, representedTile: rep1, role: 'pung' };
          const a2: WildcardAssignment = { kimTile: k2, representedTile: rep2, role: 'pung' };
          const a3: WildcardAssignment = { kimTile: k3, representedTile: rep3, role: 'pung' };
          pureAssigns.push(a1, a2, a3);
          pureMelds.push({
            type: 'kim_thi',
            tiles: [k1, k2, k3],
            representedTiles: [rep1, rep2, rep3],
            assignments: [a1, a2, a3],
            isOpen: false,
            kimCount: 3,
          });
        }
        searchMelds(pair, [], 0, [...accAssignments, ...pureAssigns], [...accMelds, ...pureMelds]);
      }
      return;
    }

    // Always pick lowest available natural tile
    const firstKind = availableKinds[0]!;
    const [firstType, firstValStr] = firstKind.split('-');
    const firstVal = parseInt(firstValStr!, 10);
    const count = kindMap.get(firstKind)!.length;

    // --- Choice M1: Triplet of firstKind ---
    // M1a: 3 natural tiles (0 Kim)
    if (count >= 3) {
      const taken = takeTiles(firstKind, 3);
      const draft: DraftMeld = {
        type: 'pung',
        tiles: taken,
        representedTiles: taken,
        assignments: [],
        isOpen: false,
        kimCount: 0,
      };
      searchMelds(pair, availableKims, needed - 1, accAssignments, [...accMelds, draft]);
      returnTiles(firstKind, taken);
    }

    // M1b: 2 natural + 1 Kim (requires r.allowKimInPung or r.allowKimInTriplet)
    if (count >= 2 && availableKims.length >= 1 && r.kimEnabled && (r.allowKimInPung || r.allowKimInTriplet)) {
      const taken = takeTiles(firstKind, 2);
      const kim = availableKims[availableKims.length - 1]!;
      const rep = createRepresentedTile(kim, firstType as TileType, firstVal);
      const assign: WildcardAssignment = { kimTile: kim, representedTile: rep, role: 'pung' };
      const draft: DraftMeld = {
        type: 'pung',
        tiles: [...taken, kim],
        representedTiles: [...taken, rep],
        assignments: [assign],
        isOpen: false,
        kimCount: 1,
      };
      searchMelds(pair, availableKims.slice(0, -1), needed - 1, [...accAssignments, assign], [...accMelds, draft]);
      returnTiles(firstKind, taken);
    }

    // M1c: 1 natural + 2 Kims
    if (count >= 1 && availableKims.length >= 2 && r.kimEnabled && (r.allowKimInPung || r.allowKimInTriplet)) {
      const taken = takeTiles(firstKind, 1);
      const k1 = availableKims[availableKims.length - 2]!;
      const k2 = availableKims[availableKims.length - 1]!;
      const rep1 = createRepresentedTile(k1, firstType as TileType, firstVal);
      const rep2 = createRepresentedTile(k2, firstType as TileType, firstVal);
      const a1: WildcardAssignment = { kimTile: k1, representedTile: rep1, role: 'pung' };
      const a2: WildcardAssignment = { kimTile: k2, representedTile: rep2, role: 'pung' };
      const draft: DraftMeld = {
        type: 'pung',
        tiles: [...taken, k1, k2],
        representedTiles: [...taken, rep1, rep2],
        assignments: [a1, a2],
        isOpen: false,
        kimCount: 2,
      };
      searchMelds(pair, availableKims.slice(0, -2), needed - 1, [...accAssignments, a1, a2], [...accMelds, draft]);
      returnTiles(firstKind, taken);
    }

    // --- Choice M2: Sequences (suited tiles only) ---
    const isSuited = firstType === 'tong' || firstType === 'sok' || firstType === 'ban';
    if (isSuited) {
      // M2a: firstKind is LOWEST in [v, v+1, v+2] (v <= 7)
      if (firstVal <= 7) {
        const k2 = `${firstType}-${firstVal + 1}`;
        const k3 = `${firstType}-${firstVal + 2}`;
        const has2 = (kindMap.get(k2)?.length ?? 0) > 0;
        const has3 = (kindMap.get(k3)?.length ?? 0) > 0;

        // M2a-1: All natural (0 Kims)
        if (has2 && has3) {
          const t1 = takeTiles(firstKind, 1)[0]!;
          const t2 = takeTiles(k2, 1)[0]!;
          const t3 = takeTiles(k3, 1)[0]!;
          const draft: DraftMeld = {
            type: 'jia',
            tiles: [t1, t2, t3],
            representedTiles: [t1, t2, t3],
            assignments: [],
            isOpen: false,
            kimCount: 0,
          };
          searchMelds(pair, availableKims, needed - 1, accAssignments, [...accMelds, draft]);
          returnTiles(firstKind, [t1]);
          returnTiles(k2, [t2]);
          returnTiles(k3, [t3]);
        }

        // M2a-2: nat2 + Kim3 (upper edge with 1 Kim)
        if (has2 && !has3 && availableKims.length >= 1 && r.kimEnabled && r.allowKimInJia) {
          const t1 = takeTiles(firstKind, 1)[0]!;
          const t2 = takeTiles(k2, 1)[0]!;
          const kim = availableKims[availableKims.length - 1]!;
          const rep = createRepresentedTile(kim, firstType as TileType, firstVal + 2);
          const assign: WildcardAssignment = { kimTile: kim, representedTile: rep, role: 'jia' };
          const draft: DraftMeld = {
            type: 'jia',
            tiles: [t1, t2, kim],
            representedTiles: [t1, t2, rep],
            assignments: [assign],
            isOpen: false,
            kimCount: 1,
          };
          searchMelds(pair, availableKims.slice(0, -1), needed - 1, [...accAssignments, assign], [...accMelds, draft]);
          returnTiles(firstKind, [t1]);
          returnTiles(k2, [t2]);
        }

        // M2a-3: Kim2 + nat3 (middle gap with 1 Kim)
        if (!has2 && has3 && availableKims.length >= 1 && r.kimEnabled && r.allowKimInJia) {
          const t1 = takeTiles(firstKind, 1)[0]!;
          const t3 = takeTiles(k3, 1)[0]!;
          const kim = availableKims[availableKims.length - 1]!;
          const rep = createRepresentedTile(kim, firstType as TileType, firstVal + 1);
          const assign: WildcardAssignment = { kimTile: kim, representedTile: rep, role: 'jia' };
          const draft: DraftMeld = {
            type: 'jia',
            tiles: [t1, kim, t3],
            representedTiles: [t1, rep, t3],
            assignments: [assign],
            isOpen: false,
            kimCount: 1,
          };
          searchMelds(pair, availableKims.slice(0, -1), needed - 1, [...accAssignments, assign], [...accMelds, draft]);
          returnTiles(firstKind, [t1]);
          returnTiles(k3, [t3]);
        }

        // M2a-4: Kim2 + Kim3 (1 natural + 2 Kims)
        if (!has2 && !has3 && availableKims.length >= 2 && r.kimEnabled && r.allowKimInJia) {
          const t1 = takeTiles(firstKind, 1)[0]!;
          const k1 = availableKims[availableKims.length - 2]!;
          const k2 = availableKims[availableKims.length - 1]!;
          const rep1 = createRepresentedTile(k1, firstType as TileType, firstVal + 1);
          const rep2 = createRepresentedTile(k2, firstType as TileType, firstVal + 2);
          const a1: WildcardAssignment = { kimTile: k1, representedTile: rep1, role: 'jia' };
          const a2: WildcardAssignment = { kimTile: k2, representedTile: rep2, role: 'jia' };
          const draft: DraftMeld = {
            type: 'jia',
            tiles: [t1, k1, k2],
            representedTiles: [t1, rep1, rep2],
            assignments: [a1, a2],
            isOpen: false,
            kimCount: 2,
          };
          searchMelds(pair, availableKims.slice(0, -2), needed - 1, [...accAssignments, a1, a2], [...accMelds, draft]);
          returnTiles(firstKind, [t1]);
        }
      }

      // M2b: firstKind is MIDDLE in [v-1 (Kim), v, v+1] (v in [2, 8], requires at least 1 Kim)
      if (firstVal >= 2 && firstVal <= 8 && availableKims.length >= 1 && r.kimEnabled && r.allowKimInJia) {
        const k3 = `${firstType}-${firstVal + 1}`;
        const has3 = (kindMap.get(k3)?.length ?? 0) > 0;

        // M2b-1: Kim(v-1) + nat(v) + nat(v+1)
        if (has3) {
          const t1 = takeTiles(firstKind, 1)[0]!;
          const t3 = takeTiles(k3, 1)[0]!;
          const kim = availableKims[availableKims.length - 1]!;
          const rep = createRepresentedTile(kim, firstType as TileType, firstVal - 1);
          const assign: WildcardAssignment = { kimTile: kim, representedTile: rep, role: 'jia' };
          const draft: DraftMeld = {
            type: 'jia',
            tiles: [kim, t1, t3],
            representedTiles: [rep, t1, t3],
            assignments: [assign],
            isOpen: false,
            kimCount: 1,
          };
          searchMelds(pair, availableKims.slice(0, -1), needed - 1, [...accAssignments, assign], [...accMelds, draft]);
          returnTiles(firstKind, [t1]);
          returnTiles(k3, [t3]);
        }

        // M2b-2: Kim(v-1) + nat(v) + Kim(v+1) (2 Kims)
        if (!has3 && availableKims.length >= 2) {
          const t1 = takeTiles(firstKind, 1)[0]!;
          const k1 = availableKims[availableKims.length - 2]!;
          const k2 = availableKims[availableKims.length - 1]!;
          const rep1 = createRepresentedTile(k1, firstType as TileType, firstVal - 1);
          const rep2 = createRepresentedTile(k2, firstType as TileType, firstVal + 1);
          const a1: WildcardAssignment = { kimTile: k1, representedTile: rep1, role: 'jia' };
          const a2: WildcardAssignment = { kimTile: k2, representedTile: rep2, role: 'jia' };
          const draft: DraftMeld = {
            type: 'jia',
            tiles: [k1, t1, k2],
            representedTiles: [rep1, t1, rep2],
            assignments: [a1, a2],
            isOpen: false,
            kimCount: 2,
          };
          searchMelds(pair, availableKims.slice(0, -2), needed - 1, [...accAssignments, a1, a2], [...accMelds, draft]);
          returnTiles(firstKind, [t1]);
        }
      }

      // M2c: firstKind is HIGHEST in [v-2 (Kim), v-1 (Kim), v] (v >= 3, requires at least 2 Kims)
      if (firstVal >= 3 && availableKims.length >= 2 && r.kimEnabled && r.allowKimInJia) {
        const t1 = takeTiles(firstKind, 1)[0]!;
        const k1 = availableKims[availableKims.length - 2]!;
        const k2 = availableKims[availableKims.length - 1]!;

        const rep1 = createRepresentedTile(k1, firstType as TileType, firstVal - 2);
        const rep2 = createRepresentedTile(k2, firstType as TileType, firstVal - 1);
        const a1: WildcardAssignment = { kimTile: k1, representedTile: rep1, role: 'jia' };
        const a2: WildcardAssignment = { kimTile: k2, representedTile: rep2, role: 'jia' };

        const draft: DraftMeld = {
          type: 'jia',
          tiles: [k1, k2, t1],
          representedTiles: [rep1, rep2, t1],
          assignments: [a1, a2],
          isOpen: false,
          kimCount: 2,
        };

        searchMelds(pair, availableKims.slice(0, -2), needed - 1, [...accAssignments, a1, a2], [...accMelds, draft]);
        returnTiles(firstKind, [t1]);
      }
    }
  }

  return solutions;
}

// ============================================================================
// Normalization Helper
// ============================================================================

function normalizeConcealedTiles(input: SolverHandInput): Tile[] {
  const openCount = input.melds?.length ?? 0;
  const targetConcealedCount = 14 - openCount * 3;

  if (input.winningTile) {
    const alreadyIncludes = input.hand.some((t) => t.id === input.winningTile!.id);
    if (!alreadyIncludes) {
      if (input.hand.length === targetConcealedCount - 1) {
        return [...input.hand, input.winningTile];
      }
      if (input.hand.length === targetConcealedCount) {
        return [...input.hand];
      }
      return [...input.hand, input.winningTile];
    }
  }
  return [...input.hand];
}

// ============================================================================
// Master Wildcard Solver API
// ============================================================================

/**
 * Finds all valid distinct winning hand decompositions (standard 4 melds + 1 pair,
 * 7 pairs, 13 orphans, and Shi Kim instant Hu).
 */
export function findWinningDecompositions(input: SolverHandInput): SolvedHand[] {
  const allConcealed = normalizeConcealedTiles(input);
  const openMelds = input.melds ?? [];
  const rules = resolveKimRules(input.rules);
  const results: SolvedHand[] = [];
  const seenSignatures = new Set<string>();

  // Check Shi Kim Instant Hu (#9)
  const allTiles = [...allConcealed, ...openMelds.flatMap((m) => m.tiles)];
  const totalKims = allTiles.filter(isKim).length;
  const totalVirtualTiles = allConcealed.length + openMelds.length * 3;
  if (totalKims === 4 && input.isInstantHu && rules.kimEnabled && totalVirtualTiles === 14) {
    const instantHand: SolvedHand = {
      shape: 'shi_kim',
      melds: [],
      wildcardAssignments: [],
      totalKims: 4,
      totalKimCount: 4,
      wildcardKimCount: 0,
      mode: 'K',
      signature: 'SHI_KIM:INSTANT_HU',
    };
    return [instantHand];
  }

  // 1. Standard 4 melds + 1 pair
  const standardSolutions = solveStandardHand(
    allConcealed,
    openMelds,
    rules,
    input.winningTile,
    input.isSelfDraw
  );
  for (const sol of standardSolutions) {
    if (!seenSignatures.has(sol.signature)) {
      seenSignatures.add(sol.signature);
      results.push(sol);
    }
  }

  // 2. Special shapes (fully concealed 14-tile hands only)
  if (openMelds.length === 0 && allConcealed.length === 14) {
    const sevenPairs = solveSevenPairs(allConcealed, openMelds, rules);
    for (const sp of sevenPairs) {
      if (!seenSignatures.has(sp.signature)) {
        seenSignatures.add(sp.signature);
        results.push(sp);
      }
    }

    const thirteenOrphans = solveThirteenOrphans(allConcealed, openMelds, rules);
    for (const to of thirteenOrphans) {
      if (!seenSignatures.has(to.signature)) {
        seenSignatures.add(to.signature);
        results.push(to);
      }
    }

    const seSamPuTat = solveSeSamPuTat(allConcealed, openMelds, rules);
    for (const ss of seSamPuTat) {
      if (!seenSignatures.has(ss.signature)) {
        seenSignatures.add(ss.signature);
        results.push(ss);
      }
    }
  }

  return results;
}

/**
 * Alias for findWinningDecompositions
 */
export function findAllSolutions(input: SolverHandInput): SolvedHand[] {
  return findWinningDecompositions(input);
}

/**
 * Checks whether the given hand and exposed melds can form a winning hand under Kim rules.
 */
export function canFormWinningHandWithKim(
  hand: readonly Tile[],
  melds: readonly Meld[] = [],
  rules?: Partial<KimRules> | GameRules
): boolean {
  const r = resolveKimRules(rules);
  const kimsCount = hand.filter(isKim).length + melds.flatMap((m) => m.tiles).filter(isKim).length;
  const totalTiles = hand.length + melds.length * 3;

  // 4 Kims allows instant Hu under tournament/casual rules (requiring valid 14 or 13 tile count)
  if (kimsCount === 4 && r.kimEnabled && (totalTiles === 14 || totalTiles === 13)) {
    return true;
  }

  const solutions = findWinningDecompositions({
    hand,
    melds,
    rules: r,
  });

  return solutions.length > 0;
}
