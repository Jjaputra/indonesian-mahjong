import { describe, it, expect } from 'vitest';
import { Wall, createMulberry32, shuffleTiles } from '@/core/wall';
import { keyToTile } from '@/core/tiles';

describe('Wall Engine (Dual-Ended & No-Dead-Wall)', () => {
  it('initializes a fresh wall with exactly 148 tiles', () => {
    const wall = new Wall();
    expect(wall.totalCount).toBe(148);
    expect(wall.remainingCount).toBe(148);
    expect(wall.drawnCount).toBe(0);
    expect(wall.isEmpty).toBe(false);
  });

  it('guarantees repeatable shuffling with identical Mulberry32 seeds', () => {
    const wall1 = new Wall(undefined, 424242);
    const wall2 = new Wall(undefined, 424242);
    const wall3 = new Wall(undefined, 999999);

    const tiles1 = [];
    const tiles2 = [];
    const tiles3 = [];

    for (let i = 0; i < 20; i++) {
      tiles1.push(wall1.drawHead()?.id);
      tiles2.push(wall2.drawHead()?.id);
      tiles3.push(wall3.drawHead()?.id);
    }

    expect(tiles1).toEqual(tiles2);
    expect(tiles1).not.toEqual(tiles3);
  });

  it('deals starting hands accurately: 14 to dealer, 13 to others, leaves 95 tiles', () => {
    const wall = new Wall();
    const deal = wall.dealInitialHands('dong');

    expect(deal.dealer).toBe('dong');
    expect(deal.hands.dong.length).toBe(14);
    expect(deal.hands.nan.length).toBe(13);
    expect(deal.hands.xi.length).toBe(13);
    expect(deal.hands.bei.length).toBe(13);

    const totalDealt =
      deal.hands.dong.length +
      deal.hands.nan.length +
      deal.hands.xi.length +
      deal.hands.bei.length;
    expect(totalDealt).toBe(53);
    expect(wall.remainingCount).toBe(95);
    expect(wall.drawnCount).toBe(53);
    expect(wall.isEmpty).toBe(false);
  });

  it('respects dealer parameter when non-East is dealer', () => {
    const wall = new Wall();
    const deal = wall.dealInitialHands('nan');

    expect(deal.dealer).toBe('nan');
    expect(deal.hands.dong.length).toBe(13);
    expect(deal.hands.nan.length).toBe(14);
    expect(deal.hands.xi.length).toBe(13);
    expect(deal.hands.bei.length).toBe(13);
  });

  it('throws an error if attempting to deal with fewer than 53 tiles in wall', () => {
    const smallTiles = [keyToTile('1T'), keyToTile('2T')];
    const smallWall = new Wall(smallTiles, null);
    expect(() => smallWall.dealInitialHands('dong')).toThrow('Insufficient tiles in wall to deal');
  });

  it('executes dual-ended draws from head and tail', () => {
    const customTiles = [
      keyToTile('1T', 1),
      keyToTile('2T', 1),
      keyToTile('3T', 1),
      keyToTile('4T', 1),
      keyToTile('5T', 1),
    ];
    const wall = new Wall(customTiles, null); // no shuffle

    expect(wall.remainingCount).toBe(5);

    const head1 = wall.drawHead();
    expect(head1?.id).toBe('tong-1-1');
    expect(wall.remainingCount).toBe(4);

    const tail1 = wall.drawTail();
    expect(tail1?.id).toBe('tong-5-1');
    expect(wall.remainingCount).toBe(3);

    const head2 = wall.drawHead();
    expect(head2?.id).toBe('tong-2-1');
    expect(wall.remainingCount).toBe(2);

    const tail2 = wall.drawTail();
    expect(tail2?.id).toBe('tong-4-1');
    expect(wall.remainingCount).toBe(1);

    const head3 = wall.drawHead();
    expect(head3?.id).toBe('tong-3-1');
    expect(wall.remainingCount).toBe(0);
    expect(wall.isEmpty).toBe(true);

    expect(wall.drawHead()).toBeNull();
    expect(wall.drawTail()).toBeNull();
  });

  it('strictly enforces no dead wall: all 95 remaining tiles after deal can be drawn until 0', () => {
    const wall = new Wall(undefined, 777);
    wall.dealInitialHands('dong');

    expect(wall.remainingCount).toBe(95);

    let drawsCount = 0;
    while (!wall.isEmpty) {
      if (drawsCount % 2 === 0) {
        expect(wall.drawHead()).not.toBeNull();
      } else {
        expect(wall.drawTail()).not.toBeNull();
      }
      drawsCount++;
    }

    expect(drawsCount).toBe(95);
    expect(wall.remainingCount).toBe(0);
    expect(wall.drawnCount).toBe(148);
    expect(wall.isEmpty).toBe(true);
    expect(wall.drawHead()).toBeNull();
    expect(wall.drawTail()).toBeNull();
  });

  it('allows peeking head and tail without mutating wall state', () => {
    const customTiles = [keyToTile('1T'), keyToTile('2T'), keyToTile('3T')];
    const wall = new Wall(customTiles, null);

    const peekH1 = wall.peekHead();
    const peekH2 = wall.peekHead();
    expect(peekH1?.id).toBe('tong-1-1');
    expect(peekH2?.id).toBe('tong-1-1');
    expect(wall.remainingCount).toBe(3);

    const peekT1 = wall.peekTail();
    const peekT2 = wall.peekTail();
    expect(peekT1?.id).toBe('tong-3-1');
    expect(peekT2?.id).toBe('tong-3-1');
    expect(wall.remainingCount).toBe(3);

    expect(wall.drawHead()?.id).toBe('tong-1-1');
    expect(wall.peekHead()?.id).toBe('tong-2-1');
  });

  it('clones wall independently without side effects on original', () => {
    const wall = new Wall(undefined, 123);
    wall.drawHead();
    wall.drawTail();

    const clone = wall.clone();
    expect(clone.remainingCount).toBe(wall.remainingCount);
    expect(clone.drawnCount).toBe(wall.drawnCount);

    clone.drawHead();
    clone.drawHead();
    expect(clone.remainingCount).toBe(wall.remainingCount - 2);
    expect(wall.remainingCount).toBe(146);
  });

  it('serializes and deserializes wall state with exact fidelity', () => {
    const wall = new Wall(undefined, 456);
    wall.drawHead();
    wall.drawTail();

    const serialized = wall.serialize();
    const restored = Wall.deserialize(serialized);

    expect(restored.remainingCount).toBe(wall.remainingCount);
    expect(restored.drawnCount).toBe(wall.drawnCount);
    expect(restored.drawHead()?.id).toBe(wall.drawHead()?.id);
    expect(restored.drawTail()?.id).toBe(wall.drawTail()?.id);
  });

  it('shuffles correctly using custom PRNG function', () => {
    const rng = createMulberry32(12345);
    expect(typeof rng()).toBe('number');

    const tiles = [keyToTile('1T'), keyToTile('2T'), keyToTile('3T')];
    const deterministicRng = () => 0.999; // Always picks last index
    const shuffled = shuffleTiles(tiles, deterministicRng);
    expect(shuffled.length).toBe(3);
  });
});
