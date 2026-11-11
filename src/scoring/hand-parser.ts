import type { Meld, Tile } from '../core/types';
import { isKim } from '../kim/wildcard-solver';
import type { MeldComposition, PairComposition, SolvedHand } from '../kim/types';

/** A tile kind as represented after Kim substitution; 'kim' means an unsubstituted Kim (Kim Thi / Kim Ciok). */
export interface TileKind {
  readonly type: Tile['type'];
  readonly value: number;
}

export interface TripletInfo {
  readonly kind: TileKind;
  /** Formed without calling Pung (concealed Pung found in hand, or Ankong) */
  readonly concealed: boolean;
  /** Pure KIM-KIM-KIM set */
  readonly isKimThi: boolean;
}

/**
 * Pattern-relevant facts about one winning decomposition, independent of Tay values.
 */
export interface HandFeatures {
  readonly shape: SolvedHand['shape'];
  /** All tiles as represented after Kim substitution (unsubstituted Kims keep type 'kim') */
  readonly representedTiles: readonly TileKind[];
  readonly triplets: readonly TripletInfo[];
  readonly sequenceCount: number;
  readonly pair?: PairComposition;
  /** Jia/Pung/Kong claimed from discards (Ankong excluded) */
  readonly claimedMeldCount: number;
  readonly kimCount: number;
  readonly isBoKim?: boolean;
}

function kindOf(t: Tile): TileKind {
  return { type: t.type, value: t.value };
}

function isTripletMeld(m: MeldComposition): boolean {
  return m.type === 'pung' || m.type === 'kong' || m.type === 'ankong' || m.type === 'kim_thi';
}

export function countClaimedMelds(melds: readonly Meld[]): number {
  return melds.filter((m) => m.type !== 'ankong').length;
}

export function countKims(tiles: readonly Tile[]): number {
  return tiles.filter(isKim).length;
}

export function parseHandFeatures(
  solved: SolvedHand,
  rawConcealed: readonly Tile[],
  openMelds: readonly Meld[]
): HandFeatures {
  let representedTiles: TileKind[];
  switch (solved.shape) {
    case 'standard':
      representedTiles = [
        ...solved.melds.flatMap((m) => m.representedTiles.map(kindOf)),
        ...(solved.pair ? solved.pair.representedTiles.map(kindOf) : []),
      ];
      break;
    case 'seven_pairs':
      representedTiles = (solved.pairs ?? []).flatMap((p) => p.representedTiles.map(kindOf));
      break;
    case 'thirteen_orphans':
      representedTiles = (solved.orphanTiles ?? []).map(kindOf);
      break;
    default:
      representedTiles = [...rawConcealed, ...openMelds.flatMap((m) => m.tiles)].map(kindOf);
  }

  const triplets: TripletInfo[] = [];
  let sequenceCount = 0;
  if (solved.shape === 'standard') {
    for (const m of solved.melds) {
      if (m.type === 'jia') {
        sequenceCount++;
      } else if (isTripletMeld(m)) {
        const isKimThi = m.type === 'kim_thi' || (m.kimCount === 3 && m.tiles.every(isKim));
        const natural = m.representedTiles.find((t) => t.type !== 'kim') ?? m.representedTiles[0]!;
        triplets.push({ kind: kindOf(natural), concealed: !m.isOpen, isKimThi });
      }
    }
  }

  return {
    shape: solved.shape,
    representedTiles,
    triplets,
    sequenceCount,
    pair: solved.shape === 'standard' ? solved.pair : undefined,
    claimedMeldCount: countClaimedMelds(openMelds),
    kimCount: solved.totalKims,
    isBoKim: solved.mode === 'NK',
  };
}

/**
 * Number of distinct kinds held as a concealed triplet before completing the hand:
 * natural kinds with >= 3 copies among concealed tiles, plus declared Ankongs (Si Am Kang instant check).
 */
export function countConcealedTripletKinds(concealed: readonly Tile[], openMelds: readonly Meld[]): number {
  const counts = new Map<string, number>();
  for (const t of concealed) {
    if (isKim(t)) continue;
    const k = `${t.type}-${t.value}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const inHand = [...counts.values()].filter((n) => n >= 3).length;
  return inHand + openMelds.filter((m) => m.type === 'ankong').length;
}
