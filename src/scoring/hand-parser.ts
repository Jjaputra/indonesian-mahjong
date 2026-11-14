import { isConcealedSet } from '../core/melds';
import type { WinContext } from './types';
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
  /** Concealed triplet, Ankong, or discard Kong on a concealed triplet */
  readonly concealed: boolean;
  /** Pure KIM-KIM-KIM set */
  readonly isKimThi: boolean;
  readonly setType?: MeldComposition['type'];
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
  readonly isSelfRobbingKong?: boolean;
  readonly pair?: PairComposition;
  /** Every pair in the decomposition: the eye of a standard hand, or all seven of Tjit Tuei */
  readonly pairs: readonly PairComposition[];
  /** Jia/Pung/Kong claimed from discards (Ankong excluded) */
  readonly claimedMeldCount: number;
  /** Open sets for scoring, distinct from Tan Tiau claim count. */
  readonly openSetDescriptions?: readonly string[];
  readonly kimCount: number;
  readonly isBoKim?: boolean;
}

export function describeKind(t: TileKind): string {
  if (t.type === 'wind') return ['東', '南', '西', '北'][t.value - 1]!;
  if (t.type === 'dragon') return ['中', '發', '白'][t.value - 1]!;
  if (t.type === 'kim') return 'Kim';
  return `${t.value} ${{ ban: 'Ban', tong: 'Tong', sok: 'Sok' }[t.type as 'ban' | 'tong' | 'sok'] ?? t.type}`;
}

export function concealedTripletReason(features: Pick<HandFeatures, 'triplets'>): string {
  const trips = features.triplets.filter(t => t.concealed);
  return `${trips.length} tris tertutup: ${trips.map(t => `${describeKind(t.kind)} ${t.setType === 'kong' ? 'Kong' : t.setType === 'ankong' ? 'Ankong' : 'tris'}`).join(', ')}`;
}

function kindOf(t: Tile): TileKind {
  return { type: t.type, value: t.value };
}

function isTripletMeld(m: MeldComposition): boolean {
  return m.type === 'pung' || m.type === 'kong' || m.type === 'ankong' || m.type === 'kim_thi';
}

/** Sets that open the hand (#42 vs #43/#44). Tan Tiau counts claims separately, see claimedMeldCount. */
export function countOpenSets(melds: readonly Meld[]): number {
  return melds.filter((m) => !isConcealedSet(m)).length;
}

/** The face a declared set is named by: its lowest natural tile, so a Jia or a Kim-filled claim reads right. */
function meldKind(m: Meld): TileKind {
  const natural = m.tiles.filter((t) => !isKim(t)).sort((a, b) => a.value - b.value);
  return kindOf(natural[0] ?? m.tiles[0]!);
}

export function countKims(tiles: readonly Tile[]): number {
  return tiles.filter(isKim).length;
}

export function parseHandFeatures(
  solved: SolvedHand,
  rawConcealed: readonly Tile[],
  openMelds: readonly Meld[],
  context?: WinContext
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
        triplets.push({ kind: kindOf(natural), concealed: !m.isOpen, isKimThi, setType: m.type });
      }
    }
  }

  // Identical physical copies may exchange roles within a decomposition. Prefer a
  // pair/sequence completion over exposing a triplet: max-Tay arbitration.
  const matchesWin = (t: Tile) => !!context && t.type === context.winningTile.type
    && t.value === context.winningTile.value && isKim(t) === isKim(context.winningTile);
  const concealedSequences = solved.melds.filter(m => !m.isOpen && m.type === 'jia');
  const nonTripletCompletion = solved.pair?.tiles.some(matchesWin)
    || concealedSequences.some(m => m.tiles.some(matchesWin));
  if (context?.isDiscardWin && !context.isSelfDraw && !nonTripletCompletion) {
    const index = solved.melds.filter(isTripletMeld).findIndex(m => !m.isOpen
      && !isConcealedSet(m) && m.tiles.some(matchesWin));
    if (index >= 0) triplets[index] = { ...triplets[index]!, concealed: false };
  }
  const isSelfRobbingKong = !!context?.isSelfDraw
    && openMelds.some(m => m.type === 'pung' && m.tiles.every(matchesWin))
    && concealedSequences.some(m => m.tiles.some(matchesWin));

  return {
    isSelfRobbingKong,
    shape: solved.shape,
    representedTiles,
    triplets,
    sequenceCount,
    pair: solved.shape === 'standard' ? solved.pair : undefined,
    pairs: solved.shape === 'standard' ? (solved.pair ? [solved.pair] : [])
      : solved.shape === 'seven_pairs' ? (solved.pairs ?? []) : [],
    claimedMeldCount: openMelds.filter(m => m.type !== 'ankong').length,
    openSetDescriptions: openMelds.filter(m => !isConcealedSet(m)).map(m =>
      `${m.type === 'kong' ? 'Kong tambahan' : m.type === 'pung' ? 'Pung' : 'Jia'} ${describeKind(meldKind(m))} terbuka`),
    kimCount: solved.totalKims,
    isBoKim: solved.mode === 'NK',
  };
}

/**
 * Number of distinct kinds held as a concealed triplet before completing the hand:
 * natural kinds with >= 3 copies among concealed tiles, plus declared concealed sets (Si Am Kang instant check).
 */
export function instantConcealedTriplets(concealed: readonly Tile[], openMelds: readonly Meld[]): TripletInfo[] {
  const groups = new Map<string, Tile[]>();
  for (const t of concealed) {
    if (isKim(t)) continue;
    const k = `${t.type}-${t.value}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [
    ...[...groups.values()].filter(tiles => tiles.length >= 3).map(tiles => ({ kind: kindOf(tiles[0]!), concealed: true, isKimThi: false, setType: 'pung' as const })),
    ...openMelds.filter(isConcealedSet).map(m => ({ kind: meldKind(m), concealed: true, isKimThi: false, setType: m.type })),
  ];
}

export function countConcealedTripletKinds(concealed: readonly Tile[], openMelds: readonly Meld[]): number {
  return instantConcealedTriplets(concealed, openMelds).length;
}
