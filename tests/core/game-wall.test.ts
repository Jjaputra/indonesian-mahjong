import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/core/game-engine';
import { SEAT_ORDER, createCompleteTileSet, isBonus } from '@/core/tiles';
import type { Tile } from '@/core/types';
import { Wall, createGameWall } from '@/core/wall';

const isKimTile = (t: Tile) => t.type === 'kim' || t.isKim;

function drainWall(wall: Wall): Tile[] {
  const out: Tile[] = [];
  for (let t = wall.drawHead(); t; t = wall.drawHead()) out.push(t);
  return out;
}

/** Every tile the engine holds after a fresh deal: hands, exposed flowers and the rest of the wall. */
function tableTiles(engine: GameEngine): Tile[] {
  const s = engine.getState();
  const held = SEAT_ORDER.flatMap((seat) => [...s.players[seat].hand, ...s.players[seat].flowers]);
  return [...held, ...s.wall.serialize().tiles.slice(s.wall.serialize().headIndex, s.wall.serialize().tailIndex + 1)];
}

describe('createGameWall: legacy Kim set vs Kim disabled', () => {
  it('Kim enabled keeps the legacy 148-tile set, seeded exactly like new Wall(undefined, seed)', () => {
    const wall = createGameWall(true, 4242);
    expect(wall.totalCount).toBe(148);
    expect(wall.serialize().tiles.map((t) => t.id)).toEqual(new Wall(undefined, 4242).serialize().tiles.map((t) => t.id));
    const tiles = drainWall(wall);
    expect(tiles.filter(isKimTile)).toHaveLength(4);
    expect(tiles.filter(isBonus)).toHaveLength(8);
  });

  it('Kim enabled without a seed still shuffles the full legacy set', () => {
    const tiles = drainWall(createGameWall(true));
    expect(tiles).toHaveLength(148);
    expect(new Set(tiles.map((t) => t.id)).size).toBe(148);
    expect(tiles.filter(isKimTile)).toHaveLength(4);
  });

  it('Kim disabled removes the 4 dedicated Kim tiles and conserves every other tile (seeded)', () => {
    const wall = createGameWall(false, 4242);
    expect(wall.totalCount).toBe(144);
    const tiles = drainWall(wall);
    expect(tiles).toHaveLength(144);
    expect(tiles.some(isKimTile)).toBe(false);
    expect(tiles.filter(isBonus)).toHaveLength(8);
    const expected = createCompleteTileSet()
      .filter((t) => !isKimTile(t))
      .map((t) => t.id)
      .sort();
    expect(tiles.map((t) => t.id).sort()).toEqual(expected);
  });

  it('Kim disabled shuffles deterministically per seed and differently across seeds', () => {
    const ids = (seed: number) => createGameWall(false, seed).serialize().tiles.map((t) => t.id);
    expect(ids(77)).toEqual(ids(77));
    expect(ids(77)).not.toEqual(ids(78));
    // The shuffle really happened: the order is not the generation order.
    expect(ids(77)).not.toEqual(createCompleteTileSet().filter((t) => !isKimTile(t)).map((t) => t.id));
  });

  it('Kim disabled without a seed still shuffles 144 tiles with 8 bonus tiles and no Kim', () => {
    const tiles = drainWall(createGameWall(false));
    expect(tiles).toHaveLength(144);
    expect(new Set(tiles.map((t) => t.id)).size).toBe(144);
    expect(tiles.some(isKimTile)).toBe(false);
    expect(tiles.filter(isBonus)).toHaveLength(8);
  });

  it('both ends of a Kim-disabled wall stay Kim-free (tail replacements included)', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const wall = createGameWall(false, seed);
      const deal = wall.dealInitialHands('dong');
      expect(Object.values(deal.hands).flat().some(isKimTile)).toBe(false);
      for (let t = wall.drawTail(); t; t = wall.drawTail()) expect(isKimTile(t)).toBe(false);
    }
  });
});

describe('GameEngine default walls honour the Kim toggle', () => {
  it('kimEnabled: false deals a 144-tile Kim-free universe on every new hand', () => {
    const engine = new GameEngine({ kimEnabled: false });
    for (let hand = 0; hand < 5; hand++) {
      engine.startNewGame(true);
      const tiles = tableTiles(engine);
      expect(engine.getState().wall.totalCount).toBe(144);
      expect(tiles).toHaveLength(144);
      expect(new Set(tiles.map((t) => t.id)).size).toBe(144);
      expect(tiles.some(isKimTile)).toBe(false);
      expect(tiles.filter(isBonus)).toHaveLength(8);
    }
  });

  it('kimEnabled: true keeps the legacy 148-tile set with 4 Kim tiles', () => {
    const engine = new GameEngine({ kimEnabled: true });
    engine.startNewGame(true);
    const tiles = tableTiles(engine);
    expect(tiles).toHaveLength(148);
    expect(tiles.filter(isKimTile)).toHaveLength(4);
    expect(tiles.filter(isBonus)).toHaveLength(8);
  });

  it('an explicit custom wall is still used as given', () => {
    const custom = new Wall(undefined, 9);
    const engine = new GameEngine({ kimEnabled: false }, custom);
    engine.startNewGame(true);
    expect(engine.getState().wall).toBe(custom);
    expect(engine.getState().wall.totalCount).toBe(148);
  });
});
