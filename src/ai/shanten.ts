import type { Tile } from '../core/types';
import { isBonus, isKim } from '../core/tiles';

const KIND_COUNT = 34;
const KIM_KIND = 34;
const STEP_CAP = 20000;

export interface Ukeire {
  /** Distinct kinds that reduce shanten. Kim counts as one kind. */
  readonly kinds: number;
  /** Unseen copies of those kinds still available outside hidden hands. */
  readonly copies: number;
}

interface BlockCount {
  pairs: number;
  protos: number;
  singles: number;
}

const EMPTY_BLOCKS: BlockCount = { pairs: 0, protos: 0, singles: 0 };

function shaped(melds: number, partials: number, eye: number, target: number): number {
  let m = melds;
  let t = partials;
  if (m > target) m = target;
  if (m < 0) m = 0;
  if (t < 0) t = 0;
  const room = target - m;
  if (t > room) t = Math.max(0, room);
  return target * 2 - m * 2 - t - (eye ? 1 : 0);
}

/**
 * Spend a Kim budget on natural pair-blocks, protos, and singles.
 * A floating Kim is only a taatsu: two Kim alone make a pair, three make a pung.
 */
function scoreBlocks(
  melds0: number,
  proto0: number,
  pairs0: number,
  singles0: number,
  kim0: number,
  target: number,
): number {
  let best = 99;
  const upProtoMax = Math.min(proto0, kim0);
  const upPairMax = Math.min(pairs0, kim0);
  const singleMeldMax = Math.min(singles0, Math.floor(kim0 / 2));
  const kimMeldMax = Math.floor(kim0 / 3);

  for (let kimMeld = 0; kimMeld <= kimMeldMax; kimMeld++) {
    for (let upProto = 0; upProto <= upProtoMax; upProto++) {
      for (let upPair = 0; upPair <= upPairMax; upPair++) {
        for (let singleMeld = 0; singleMeld <= singleMeldMax; singleMeld++) {
          const spent = kimMeld * 3 + upProto + upPair + singleMeld * 2;
          if (spent > kim0) continue;
          const singlesLeft = singles0 - singleMeld;
          const kimLeft = kim0 - spent;
          const attachMax = Math.min(singlesLeft, kimLeft);
          for (let attach = 0; attach <= attachMax; attach++) {
            const afterAttach = kimLeft - attach;
            const kimPairMax = Math.floor(afterAttach / 2);
            for (let kimPairs = 0; kimPairs <= kimPairMax; kimPairs++) {
              const floating = afterAttach - kimPairs * 2;
              const pairBlocks = pairs0 - upPair + attach + kimPairs;
              const protos = proto0 - upProto + floating;
              const melds = melds0 + kimMeld + upProto + upPair + singleMeld;
              const eye = pairBlocks > 0 ? 1 : 0;
              const partials = protos + Math.max(0, pairBlocks - eye);
              const score = shaped(melds, partials, eye, target);
              if (score < best) best = score;
            }
          }
        }
      }
    }
  }
  return best;
}

function addBlocks(a: BlockCount, b: BlockCount): BlockCount {
  return {
    pairs: a.pairs + b.pairs,
    protos: a.protos + b.protos,
    singles: a.singles + b.singles,
  };
}

/** Prefer pairs (they can be the eye), then protos, then fewer isolated tiles. */
function betterBlocks(a: BlockCount, b: BlockCount): BlockCount {
  if (a.pairs !== b.pairs) return a.pairs > b.pairs ? a : b;
  if (a.protos !== b.protos) return a.protos > b.protos ? a : b;
  return a.singles <= b.singles ? a : b;
}

function suitBlocks(source: Uint8Array, base: number): BlockCount {
  const c = new Uint8Array(9);
  for (let r = 0; r < 9; r++) c[r] = source[base + r] ?? 0;
  const memo = new Map<string, BlockCount>();

  function rec(index: number): BlockCount {
    let i = index;
    while (i < 9 && c[i] === 0) i++;
    if (i >= 9) return EMPTY_BLOCKS;
    const key = `${i}:${c.join('')}`;
    const hit = memo.get(key);
    if (hit) return hit;

    const n = c[i] ?? 0;
    let best = EMPTY_BLOCKS;
    let seen = false;
    const consider = (block: BlockCount, next: number) => {
      const combined = addBlocks(block, rec(next));
      best = seen ? betterBlocks(best, combined) : combined;
      seen = true;
    };

    if (n >= 2) {
      c[i] = n - 2;
      consider({ pairs: 1, protos: 0, singles: 0 }, i);
      c[i] = n;
    }
    if (i + 1 < 9 && (c[i + 1] ?? 0) > 0) {
      c[i] = n - 1;
      c[i + 1] = (c[i + 1] ?? 0) - 1;
      consider({ pairs: 0, protos: 1, singles: 0 }, i);
      c[i] = n;
      c[i + 1] = (c[i + 1] ?? 0) + 1;
    }
    if (i + 2 < 9 && (c[i + 2] ?? 0) > 0) {
      c[i] = n - 1;
      c[i + 2] = (c[i + 2] ?? 0) - 1;
      consider({ pairs: 0, protos: 1, singles: 0 }, i);
      c[i] = n;
      c[i + 2] = (c[i + 2] ?? 0) + 1;
    }
    c[i] = n - 1;
    consider({ pairs: 0, protos: 0, singles: 1 }, i);
    c[i] = n;

    memo.set(key, best);
    return best;
  }

  return rec(0);
}

function honorBlocks(counts: Uint8Array): BlockCount {
  let pairs = 0;
  let singles = 0;
  for (let i = 27; i < KIND_COUNT; i++) {
    const n = counts[i] ?? 0;
    pairs += Math.floor(n / 2);
    if (n % 2 === 1) singles += 1;
  }
  return { pairs, protos: 0, singles };
}

function remainderBlocks(counts: Uint8Array): BlockCount {
  let total = honorBlocks(counts);
  for (let suit = 0; suit < 3; suit++) {
    total = addBlocks(total, suitBlocks(counts, suit * 9));
  }
  return total;
}

function kindIndex(tile: Tile): number | null {
  if (isKim(tile)) return KIM_KIND;
  if (isBonus(tile)) return null;
  if (tile.type === 'tong' || tile.type === 'sok' || tile.type === 'ban') {
    const suit = tile.type === 'tong' ? 0 : tile.type === 'sok' ? 1 : 2;
    return suit * 9 + tile.value - 1;
  }
  if (tile.type === 'wind') return 27 + tile.value - 1;
  if (tile.type === 'dragon') return 31 + tile.value - 1;
  return null;
}

export function toCounts(tiles: readonly Tile[]): { counts: Uint8Array; kim: number } {
  const counts = new Uint8Array(KIND_COUNT);
  let kim = 0;
  for (const tile of tiles) {
    const index = kindIndex(tile);
    if (index === null) continue;
    if (index === KIM_KIND) kim += 1;
    else counts[index] = (counts[index] ?? 0) + 1;
  }
  return { counts, kim };
}

/** Seven-pair distance. 6 pairs → 0, 7 pairs → -1. Disabled conceptually when melds are open. */
export function sevenPairShanten(counts: Uint8Array, kim: number): number {
  let pairs = 0;
  let singles = 0;
  for (let i = 0; i < KIND_COUNT; i++) {
    const n = counts[i] ?? 0;
    pairs += Math.floor(n / 2);
    if (n % 2 === 1) singles += 1;
  }
  const filled = Math.min(kim, singles);
  pairs += filled;
  pairs += Math.floor((kim - filled) / 2);
  if (pairs > 7) pairs = 7;
  return 6 - pairs;
}

function canChow(index: number): boolean {
  if (index >= 27) return false;
  return index % 9 <= 6;
}

/**
 * Shanten toward 4 melds + a pair, minus exposed melds.
 * -1 is a complete hand, 0 is tenpai. Kim fills pairs, protos, and pungs.
 */
function standardShanten(countsIn: Uint8Array, kim: number, target: number): number {
  const counts = countsIn.slice();
  let tileCount = kim;
  for (let i = 0; i < KIND_COUNT; i++) tileCount += counts[i] ?? 0;
  const need = target * 3 + 2;
  const lower = tileCount >= need ? -1 : 0;
  let best = scoreBlocks(0, 0, 0, tileCount, kim, target);
  let steps = 0;

  function consider(melds: number): void {
    const blocks = remainderBlocks(counts);
    const score = scoreBlocks(melds, blocks.protos, blocks.pairs, blocks.singles, kim, target);
    if (score < best) best = score;
  }

  function mentsu(start: number, melds: number): void {
    if (best === lower || steps >= STEP_CAP) return;
    steps += 1;
    let i = start;
    while (i < KIND_COUNT && (counts[i] ?? 0) === 0) i++;
    if (i >= KIND_COUNT) {
      consider(melds);
      return;
    }

    const c = counts[i] ?? 0;
    if (c >= 3 && melds < target) {
      counts[i] = c - 3;
      mentsu(i, melds + 1);
      counts[i] = c;
      if (best === lower) return;
    }
    if (canChow(i) && c >= 1 && (counts[i + 1] ?? 0) >= 1 && (counts[i + 2] ?? 0) >= 1 && melds < target) {
      counts[i] = c - 1;
      counts[i + 1] = (counts[i + 1] ?? 0) - 1;
      counts[i + 2] = (counts[i + 2] ?? 0) - 1;
      mentsu(i, melds + 1);
      counts[i] = c;
      counts[i + 1] = (counts[i + 1] ?? 0) + 1;
      counts[i + 2] = (counts[i + 2] ?? 0) + 1;
      if (best === lower) return;
    }
    mentsu(i + 1, melds);
  }

  mentsu(0, 0);
  return best;
}

const SHANTEN_CACHE = new Map<string, number>();

function cacheKey(counts: Uint8Array, kim: number, openMelds: number): string {
  let key = `${openMelds}|${kim}|`;
  for (let i = 0; i < KIND_COUNT; i++) key += String.fromCharCode(48 + (counts[i] ?? 0));
  return key;
}

/** Distance to a winning shape. Open melds reduce the number of concealed melds required. */
export function calculateShanten(tiles: readonly Tile[], openMelds = 0): number {
  const { counts, kim } = toCounts(tiles);
  const key = cacheKey(counts, kim, openMelds);
  const cached = SHANTEN_CACHE.get(key);
  if (cached !== undefined) return cached;

  const target = Math.max(0, 4 - openMelds);
  const pairs = openMelds === 0 ? sevenPairShanten(counts, kim) : 99;
  const standard = pairs === -1 ? 99 : standardShanten(counts, kim, target);
  const result = Math.min(standard, pairs);
  if (SHANTEN_CACHE.size > 4000) SHANTEN_CACHE.clear();
  SHANTEN_CACHE.set(key, result);
  return result;
}

function synthetic(kind: number): Tile {
  if (kind === KIM_KIND) return { id: `syn-kim-${kind}`, type: 'kim', value: 0, isKim: true };
  if (kind < 27) {
    const suit = kind < 9 ? 'tong' : kind < 18 ? 'sok' : 'ban';
    return { id: `syn-${kind}`, type: suit, value: (kind % 9) + 1, isKim: false };
  }
  if (kind < 31) return { id: `syn-${kind}`, type: 'wind', value: kind - 26, isKim: false };
  return { id: `syn-${kind}`, type: 'dragon', value: kind - 30, isKim: false };
}

/**
 * Kinds that would reduce shanten if drawn.
 * `visible` is every seen tile that is not part of `tiles` (discarded candidate, melds, discard pool).
 * Copies still in opponents' concealed hands are treated as available.
 */
export function countUkeire(tiles: readonly Tile[], openMelds: number, visible: readonly Tile[]): Ukeire {
  const base = calculateShanten(tiles, openMelds);
  const { counts, kim } = toCounts(tiles);
  const seen = toCounts(visible);
  let kinds = 0;
  let copies = 0;

  for (let kind = 0; kind <= KIM_KIND; kind++) {
    const inHand = kind === KIM_KIND ? kim : (counts[kind] ?? 0);
    const inView = kind === KIM_KIND ? seen.kim : (seen.counts[kind] ?? 0);
    const left = Math.max(0, 4 - inHand - inView);
    if (left === 0) continue;
    const next = calculateShanten([...tiles, synthetic(kind)], openMelds);
    if (next < base) {
      kinds += 1;
      copies += left;
    }
  }
  return { kinds, copies };
}
