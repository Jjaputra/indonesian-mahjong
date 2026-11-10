import { createCompleteTileSet } from './tiles';
import { Seat, Tile } from './types';

export interface DealResult {
  readonly hands: Record<Seat, Tile[]>;
  readonly dealer: Seat;
}

export interface SerializedWall {
  readonly tiles: Tile[];
  readonly headIndex: number;
  readonly tailIndex: number;
  readonly initialCount: number;
}

/**
 * 32-bit Mulberry32 PRNG generator for deterministic shuffling.
 */
export function createMulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function (): number {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates shuffle algorithm.
 */
export function shuffleTiles(tiles: readonly Tile[], rng: () => number = Math.random): Tile[] {
  const result = [...tiles];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

export class Wall {
  private tiles: Tile[];
  private headIndex: number;
  private tailIndex: number;
  private readonly initialCount: number;

  /**
   * Initializes a new Wall.
   * @param tiles Optional predefined tile array (for testing/replay). If omitted, generates the complete 148 tiles.
   * @param seed Optional numeric seed for deterministic Mulberry32 shuffle. If null, tiles are not reshuffled.
   */
  constructor(tiles?: Tile[], seed?: number | null) {
    if (tiles) {
      this.tiles = [...tiles];
    } else {
      this.tiles = createCompleteTileSet();
    }

    if (seed !== null && seed !== undefined) {
      const rng = createMulberry32(seed);
      this.tiles = shuffleTiles(this.tiles, rng);
    } else if (seed === undefined && !tiles) {
      this.tiles = shuffleTiles(this.tiles, Math.random);
    }

    this.headIndex = 0;
    this.tailIndex = this.tiles.length - 1;
    this.initialCount = this.tiles.length;
  }

  /**
   * Current number of tiles remaining in the wall.
   */
  get remainingCount(): number {
    if (this.headIndex > this.tailIndex) return 0;
    return this.tailIndex - this.headIndex + 1;
  }

  /**
   * Total number of tiles originally in the wall (148 for standard set).
   */
  get totalCount(): number {
    return this.initialCount;
  }

  /**
   * Number of tiles drawn so far (head + tail).
   */
  get drawnCount(): number {
    return this.initialCount - this.remainingCount;
  }

  /**
   * True if no tiles remain in the wall.
   */
  get isEmpty(): boolean {
    return this.remainingCount === 0;
  }

  /**
   * Draws a regular turn tile from the head of the wall.
   * Returns null if the wall is exhausted.
   */
  drawHead(): Tile | null {
    if (this.isEmpty) return null;
    const tile = this.tiles[this.headIndex] ?? null;
    this.headIndex++;
    return tile;
  }

  /**
   * Draws a replacement tile from the tail of the wall (ekor tembok).
   * Used for flower/season replacements and Kong replacements.
   * Returns null if the wall is exhausted.
   */
  drawTail(): Tile | null {
    if (this.isEmpty) return null;
    const tile = this.tiles[this.tailIndex] ?? null;
    this.tailIndex--;
    return tile;
  }

  /**
   * Peeks at the next head tile without drawing it.
   */
  peekHead(): Tile | null {
    if (this.isEmpty) return null;
    return this.tiles[this.headIndex] ?? null;
  }

  /**
   * Peeks at the next tail tile without drawing it.
   */
  peekTail(): Tile | null {
    if (this.isEmpty) return null;
    return this.tiles[this.tailIndex] ?? null;
  }

  /**
   * Deals starting hands to 4 players according to ITM / YDSP rules:
   * - Dealer (East / Dong): 14 tiles
   * - South (Nan): 13 tiles
   * - West (Xi): 13 tiles
   * - North (Bei): 13 tiles
   * Total dealt: 53 tiles drawn from head.
   * Throws an Error if the wall has fewer than 53 tiles.
   */
  dealInitialHands(dealer: Seat = 'dong'): DealResult {
    if (this.remainingCount < 53) {
      throw new Error(`Insufficient tiles in wall to deal: ${this.remainingCount} < 53`);
    }

    const seats: Seat[] = ['dong', 'nan', 'xi', 'bei'];
    const hands: Record<Seat, Tile[]> = {
      dong: [],
      nan: [],
      xi: [],
      bei: [],
    };

    for (const seat of seats) {
      const handSize = seat === dealer ? 14 : 13;
      for (let i = 0; i < handSize; i++) {
        const tile = this.drawHead();
        if (!tile) throw new Error('Unexpected wall exhaustion during deal');
        hands[seat].push(tile);
      }
    }

    return { hands, dealer };
  }

  /**
   * Creates an independent deep clone of the wall state.
   */
  clone(): Wall {
    const cloned = new Wall(this.tiles, null);
    cloned.headIndex = this.headIndex;
    cloned.tailIndex = this.tailIndex;
    return cloned;
  }

  /**
   * Serializes current wall state for persistence or test snapshots.
   */
  serialize(): SerializedWall {
    return {
      tiles: [...this.tiles],
      headIndex: this.headIndex,
      tailIndex: this.tailIndex,
      initialCount: this.initialCount,
    };
  }

  /**
   * Restores a Wall instance from serialized state.
   */
  static deserialize(state: SerializedWall): Wall {
    const wall = new Wall(state.tiles, null);
    (wall as any).headIndex = state.headIndex;
    (wall as any).tailIndex = state.tailIndex;
    (wall as any).initialCount = state.initialCount;
    return wall;
  }
}
