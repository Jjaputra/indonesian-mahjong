/**
 * Independent cross-model stress suite for Milestone 1.
 * Deterministic multi-seed simulations plus wall, deal, flower-exhaustion,
 * and claim-arbitration edges. Contract probes use it.fails: they stay green
 * while the engine still deviates, and go red once that deviation is fixed.
 */
import { describe, expect, it } from 'vitest';
import { GameEngine, canFormWinningHand, getTurnDistance } from '@/core/game-engine';
import {
  SEAT_ORDER,
  createCompleteTileSet,
  isBonus,
  isKim,
  keyToTile,
  parseTileHand,
} from '@/core/tiles';
import { Wall, createMulberry32 } from '@/core/wall';
import type { Meld, Seat, Tile } from '@/core/types';

const PASS_SEEDS = Array.from({ length: 16 }, (_, i) => i);
const CLAIM_SEEDS = Array.from({ length: 12 }, (_, i) => 1000 + i);
const DEAL_SEEDS = Array.from({ length: 24 }, (_, i) => i);

function must<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw new Error(label);
  return value;
}

let normalSeq = 0;

function normalTile(tag = 'n'): Tile {
  normalSeq += 1;
  const suits = ['tong', 'sok', 'ban'] as const;
  const type = must(suits[normalSeq % 3], 'suit');
  return {
    id: `${tag}-${normalSeq}`,
    type,
    value: (normalSeq % 9) + 1,
    isKim: false,
  };
}

function normals(count: number, tag = 'n'): Tile[] {
  return Array.from({ length: count }, () => normalTile(tag));
}

function filler(count: number, prefix: string): Tile[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    type: 'sok' as const,
    value: (i % 9) + 1,
    isKim: false,
  }));
}

function liveWall(wall: Wall): Tile[] {
  const state = wall.serialize();
  if (state.headIndex > state.tailIndex) return [];
  return state.tiles.slice(state.headIndex, state.tailIndex + 1);
}

function zoneTiles(engine: GameEngine): Tile[] {
  const state = engine.getState();
  const tiles: Tile[] = [];
  for (const seat of SEAT_ORDER) {
    const player = state.players[seat];
    tiles.push(...player.hand, ...player.flowers, ...player.discards);
    for (const meld of player.melds) tiles.push(...meld.tiles);
  }
  if (state.discardPending) tiles.push(state.discardPending.tile);
  tiles.push(...liveWall(state.wall));
  return tiles;
}

function assertUniverse(engine: GameEngine, label: string): void {
  const counts = new Map<string, number>();
  for (const tile of zoneTiles(engine)) {
    counts.set(tile.id, (counts.get(tile.id) ?? 0) + 1);
  }
  const dupes = [...counts.entries()].filter(([, count]) => count !== 1);
  if (dupes.length > 0 || counts.size !== 148) {
    throw new Error(
      `${label}: universe ${counts.size} unique, dupes ${JSON.stringify(dupes.slice(0, 6))}`
    );
  }
}

function locationsOf(engine: GameEngine, id: string): string[] {
  const state = engine.getState();
  const where: string[] = [];
  for (const seat of SEAT_ORDER) {
    const player = state.players[seat];
    if (player.hand.some((tile) => tile.id === id)) where.push(`${seat}.hand`);
    if (player.flowers.some((tile) => tile.id === id)) where.push(`${seat}.flowers`);
    if (player.discards.some((tile) => tile.id === id)) where.push(`${seat}.discards`);
    player.melds.forEach((meld, index) => {
      if (meld.tiles.some((tile) => tile.id === id)) where.push(`${seat}.meld${index}`);
    });
  }
  if (state.discardPending?.tile.id === id) where.push('discardPending');
  if (liveWall(state.wall).some((tile) => tile.id === id)) where.push('wall');
  return where;
}

function bonusInHands(engine: GameEngine): Tile[] {
  return SEAT_ORDER.flatMap((seat) => engine.getState().players[seat].hand.filter(isBonus));
}

function flowerRack(engine: GameEngine): Tile[] {
  return SEAT_ORDER.flatMap((seat) => engine.getState().players[seat].flowers);
}

function fingerprint(engine: GameEngine): string {
  const state = engine.getState();
  const wall = state.wall.serialize();
  const lines = [
    `${state.phase}|${state.currentTurn}|${state.winnerSeat ?? ''}|${state.winType ?? ''}|t${state.turnCount}`,
    `wall:${wall.headIndex}:${wall.tailIndex}`,
    `pending:${state.discardPending ? `${state.discardPending.tile.id}:${state.discardPending.isPromotedKong ? 'k' : 'd'}` : ''}`,
  ];
  for (const seat of SEAT_ORDER) {
    const player = state.players[seat];
    const melds = player.melds
      .map((meld) => `${meld.type}:${meld.tiles.map((tile) => tile.id).join('+')}`)
      .join(';');
    lines.push(
      [
        seat,
        player.hand.map((tile) => tile.id).join(','),
        player.flowers.map((tile) => tile.id).join(','),
        player.discards.map((tile) => tile.id).join(','),
        melds,
      ].join('#')
    );
  }
  return lines.join('\n');
}

function firstDiscardable(engine: GameEngine, seat: Seat): string {
  const ids = engine.getLegalActions(seat).discardableTileIds.slice().sort();
  return must(ids[0], `${seat} has no discardable tile`);
}

function pullById(pool: Tile[], id: string): Tile {
  const index = pool.findIndex((tile) => tile.id === id);
  if (index < 0) throw new Error(`missing ${id}`);
  return must(pool.splice(index, 1)[0], id);
}

function pullNormal(pool: Tile[]): Tile {
  const index = pool.findIndex((tile) => !isBonus(tile) && !isKim(tile));
  if (index < 0) throw new Error('no normal tile left');
  return must(pool.splice(index, 1)[0], 'normal');
}

function engineOn(wall: Wall, dealer: Seat = 'dong'): GameEngine {
  return new GameEngine(undefined, wall, { dealerSeat: dealer });
}

type ClaimKind = 'hu' | 'kong' | 'pung' | 'jia';

function highestClaim(engine: GameEngine, seat: Seat): ClaimKind | null {
  const legal = engine.getLegalActions(seat);
  if (legal.canDiscardWinHu) return 'hu';
  if (legal.canKong) return 'kong';
  if (legal.canPung) return 'pung';
  if (legal.canJia) return 'jia';
  return null;
}

function simulate(seed: number, mode: 'pass' | 'claim'): string {
  const engine = engineOn(new Wall(undefined, seed));
  engine.startNewGame(true);
  assertUniverse(engine, `${mode} seed ${seed} opening`);
  const rng = createMulberry32(seed ^ 0x9e3779b9);
  let steps = 0;

  while (steps < 500) {
    const state = engine.getState();
    if (state.phase === 'DRAW_SERI' || state.phase === 'RESOLVED_HU') {
      assertUniverse(engine, `${mode} seed ${seed} final`);
      return fingerprint(engine);
    }

    steps += 1;
    if (state.phase === 'ACTION_DECISION') {
      const seat = state.currentTurn;
      const legal = engine.getLegalActions(seat);
      if (mode === 'claim' && legal.canSelfDrawHu && rng() < 0.45) {
        engine.declareSelfDrawHu(seat);
      } else if (
        mode === 'claim' &&
        legal.canAnkong &&
        state.wall.remainingCount >= 9 &&
        rng() < 0.3
      ) {
        engine.declareAnkong(seat, must(legal.ankongOptions[0], 'ankong'));
      } else if (
        mode === 'claim' &&
        legal.canKakan &&
        state.wall.remainingCount >= 9 &&
        rng() < 0.3
      ) {
        const kakan = must(legal.kakanOptions[0], 'kakan');
        engine.declareKakan(seat, kakan.tile.id, kakan.meldIndex);
      } else if (legal.discardableTileIds.length === 0) {
        throw new Error(
          `stuck ${mode} seed ${seed} seat ${seat} canDiscard=${legal.canDiscard} hand=${state.players[seat].hand.length} melds=${state.players[seat].melds.length}`
        );
      } else {
        engine.discard(seat, firstDiscardable(engine, seat));
      }
    } else if (state.phase === 'CLAIM_WINDOW') {
      const pending = must(state.discardPending, 'pending');
      const submitted: { seat: Seat; action: ClaimKind }[] = [];
      if (mode === 'claim') {
        for (const seat of SEAT_ORDER) {
          if (seat === pending.discarder) continue;
          const action = highestClaim(engine, seat);
          if (!action) continue;
          if (rng() >= 0.7) continue;
          const legal = engine.getLegalActions(seat);
          engine.submitClaim({
            seat,
            action,
            meldTiles:
              action === 'jia'
                ? must(legal.jiaOptions[0], 'jia tiles')
                : action === 'pung'
                  ? legal.pungTiles
                  : action === 'kong'
                    ? legal.kongTiles
                    : undefined,
          });
          submitted.push({ seat, action });
        }
      }
      const result = engine.resolveClaimWindow();
      if (submitted.some((claim) => claim.action === 'hu')) {
        const discarder = pending.discarder;
        const expected = submitted
          .filter((claim) => claim.action === 'hu')
          .sort(
            (a, b) => getTurnDistance(discarder, a.seat) - getTurnDistance(discarder, b.seat)
          )[0];
        if (result.winningAction !== 'hu' || result.winnerSeat !== must(expected, 'hu seat').seat) {
          throw new Error(`${mode} seed ${seed}: Hu priority lost to ${result.winningAction}`);
        }
      } else if (submitted.some((claim) => claim.action === 'kong')) {
        const firstKong = must(
          submitted.find((claim) => claim.action === 'kong'),
          'kong'
        );
        if (result.winningAction !== 'kong' || result.nextTurn !== firstKong.seat) {
          throw new Error(`${mode} seed ${seed}: Kong lost to ${result.winningAction}`);
        }
      } else if (submitted.some((claim) => claim.action === 'pung')) {
        const firstPung = must(
          submitted.find((claim) => claim.action === 'pung'),
          'pung'
        );
        // Pung/Kong/Jia results identify the claimant through nextTurn. winnerSeat is set for Hu only.
        if (result.winningAction !== 'pung' || result.nextTurn !== firstPung.seat) {
          throw new Error(`${mode} seed ${seed}: Pung arbitration mismatch`);
        }
      } else if (submitted.some((claim) => claim.action === 'jia')) {
        const jia = must(
          submitted.find((claim) => claim.action === 'jia'),
          'jia'
        );
        if (result.winningAction !== 'jia' || result.nextTurn !== jia.seat) {
          throw new Error(`${mode} seed ${seed}: Jia lost to ${result.winningAction}`);
        }
      }
    } else {
      throw new Error(`${mode} seed ${seed}: unexpected phase ${state.phase}`);
    }
    assertUniverse(engine, `${mode} seed ${seed} step ${steps}`);
  }

  throw new Error(`${mode} seed ${seed} did not finish in 500 steps`);
}

describe('wall stress: determinism, dual ends, exhaustion', () => {
  it('repeats a Mulberry32 shuffle and folds negative seeds into uint32', () => {
    const seeds = [0, 1, 42, -1, 0xffffffff, 2 ** 31 - 1];
    const orders = seeds.map((seed) =>
      new Wall(undefined, seed).serialize().tiles.map((tile) => tile.id).join(',')
    );
    for (const seed of seeds) {
      const again = new Wall(undefined, seed).serialize().tiles.map((tile) => tile.id).join(',');
      expect(again).toBe(orders[seeds.indexOf(seed)]);
    }
    expect(new Set(orders).size).toBe(seeds.length - 1);
    expect(orders[seeds.indexOf(-1)]).toBe(orders[seeds.indexOf(0xffffffff)]);
  });

  it('alternating head and tail draws across 40 seeds emit each of the 148 ids once', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const wall = new Wall(undefined, seed);
      const rng = createMulberry32(seed + 17);
      const seen = new Set<string>();
      while (!wall.isEmpty) {
        const tile = must(rng() < 0.5 ? wall.drawHead() : wall.drawTail(), `seed ${seed} hole`);
        expect(seen.has(tile.id)).toBe(false);
        seen.add(tile.id);
      }
      expect(seen.size).toBe(148);
      const frozen = wall.serialize();
      expect(wall.drawHead()).toBeNull();
      expect(wall.drawTail()).toBeNull();
      expect(wall.peekHead()).toBeNull();
      expect(wall.peekTail()).toBeNull();
      expect(wall.serialize()).toEqual(frozen);
    }
  });

  it('one live tile is visible from both ends and a failed draw does not move the cursors', () => {
    const only = keyToTile('9B', 1);
    const wall = new Wall([only], null);
    expect(wall.peekHead()?.id).toBe(only.id);
    expect(wall.peekTail()?.id).toBe(only.id);
    const before = wall.serialize();
    expect(wall.drawTail()?.id).toBe(only.id);
    expect(wall.isEmpty).toBe(true);
    expect(wall.drawHead()).toBeNull();
    expect(wall.drawTail()).toBeNull();
    const after = wall.serialize();
    expect(after.headIndex).toBe(before.headIndex);
    expect(after.tailIndex).toBe(before.tailIndex - 1);
    expect(wall.serialize()).toEqual(after);
  });

  it('clone and deserialize keep an independent dual-ended cursor', () => {
    const original = new Wall(undefined, 99);
    for (let i = 0; i < 6; i += 1) original.drawHead();
    for (let i = 0; i < 4; i += 1) original.drawTail();
    const cloned = original.clone();
    expect(cloned.remainingCount).toBe(original.remainingCount);
    expect(cloned.drawHead()?.id).toBe(original.peekHead()?.id);
    expect(original.remainingCount).toBe(cloned.remainingCount + 1);

    const restored = Wall.deserialize(original.serialize());
    const fromOriginal: string[] = [];
    const fromRestored: string[] = [];
    while (!original.isEmpty) {
      fromOriginal.push(must(original.drawHead(), 'head').id);
      if (!original.isEmpty) fromOriginal.push(must(original.drawTail(), 'tail').id);
    }
    while (!restored.isEmpty) {
      fromRestored.push(must(restored.drawHead(), 'head').id);
      if (!restored.isEmpty) fromRestored.push(must(restored.drawTail(), 'tail').id);
    }
    expect(fromRestored).toEqual(fromOriginal);
  });
});

describe('dealing stress', () => {
  it('rejects a wall under 53 and deals a 53-tile wall down to empty for every dealer', () => {
    expect(() => new Wall([], null).dealInitialHands()).toThrow(/Insufficient tiles/);
    expect(() => new Wall(createCompleteTileSet().slice(0, 52), null).dealInitialHands()).toThrow(/< 53/);

    for (const dealer of SEAT_ORDER) {
      const wall = new Wall(createCompleteTileSet().slice(0, 53), null);
      const dealt = wall.dealInitialHands(dealer);
      expect(dealt.dealer).toBe(dealer);
      let total = 0;
      for (const seat of SEAT_ORDER) {
        const size = seat === dealer ? 14 : 13;
        expect(dealt.hands[seat]).toHaveLength(size);
        total += dealt.hands[seat].length;
      }
      expect(total).toBe(53);
      expect(wall.remainingCount).toBe(0);
      expect(wall.isEmpty).toBe(true);
    }
  });

  it('deals a deterministic head prefix for 24 seeds and every dealer seat', () => {
    const openingHands = new Set<string>();
    for (const seed of DEAL_SEEDS) {
      for (const dealer of SEAT_ORDER) {
        const wall = new Wall(undefined, seed);
        const prefix = wall.serialize().tiles.slice(0, 53).map((tile) => tile.id);
        const dealt = wall.dealInitialHands(dealer);
        const ids = SEAT_ORDER.flatMap((seat) => dealt.hands[seat].map((tile) => tile.id));
        expect(ids).toEqual(prefix);
        expect(new Set(ids).size).toBe(53);
        expect(wall.remainingCount).toBe(95);
        expect(wall.serialize().headIndex).toBe(53);
        expect(wall.serialize().tailIndex).toBe(147);
        expect(dealt.hands[dealer]).toHaveLength(14);
        openingHands.add(ids[0] ?? '');
      }
    }
    expect(openingHands.size).toBeGreaterThan(8);
  });

  it('restores 14/13 after flower replacement on 24 seeds and every dealer', () => {
    for (const seed of DEAL_SEEDS) {
      for (const dealer of SEAT_ORDER) {
        const engine = engineOn(new Wall(undefined, seed), dealer);
        engine.startNewGame(true);
        const state = engine.getState();
        expect(state.phase).toBe('ACTION_DECISION');
        expect(state.currentTurn).toBe(dealer);
        for (const seat of SEAT_ORDER) {
          const player = state.players[seat];
          expect(player.hand.some(isBonus)).toBe(false);
          expect(player.hand).toHaveLength(seat === dealer ? 14 : 13);
        }
        assertUniverse(engine, `deal seed ${seed} dealer ${dealer}`);
      }
    }
  });
});

describe('recursive flower replacement and wall exhaustion', () => {
  it('replaces a flower chain from the tail and starts at the dealer', () => {
    const pool = createCompleteTileSet();
    const flowerA = pullById(pool, 'flower-1-1');
    const flowerB = pullById(pool, 'flower-2-1');
    const flowerC = pullById(pool, 'flower-3-1');
    const replacement = pullNormal(pool);
    const dong = [flowerA, ...Array.from({ length: 13 }, () => pullNormal(pool))];
    const nan = Array.from({ length: 13 }, () => pullNormal(pool));
    const xi = Array.from({ length: 13 }, () => pullNormal(pool));
    const bei = Array.from({ length: 13 }, () => pullNormal(pool));
    const tail = [replacement, flowerC, flowerB];
    const wall = new Wall([...dong, ...nan, ...xi, ...bei, ...pool, ...tail], null);
    const engine = engineOn(wall);
    const records = engine.startNewGame(true);

    expect(records.map((record) => record.seat)).toEqual(['dong']);
    expect(flowerRack(engine).map((tile) => tile.id)).toEqual([
      flowerA.id,
      flowerB.id,
      flowerC.id,
    ]);
    expect(engine.getState().players.dong.hand.some((tile) => tile.id === replacement.id)).toBe(true);
    expect(bonusInHands(engine)).toEqual([]);
    expect(engine.getState().players.dong.hand).toHaveLength(14);
    expect(engine.getState().phase).toBe('ACTION_DECISION');
    assertUniverse(engine, 'flower chain');
  });

  it('exposes dealer flowers before a later seat when that dealer is West', () => {
    const pool = createCompleteTileSet();
    const westFlower = pullById(pool, 'flower-1-1');
    const eastFlower = pullById(pool, 'flower-2-1');
    const dong = [eastFlower, ...Array.from({ length: 12 }, () => pullNormal(pool))];
    const nan = Array.from({ length: 13 }, () => pullNormal(pool));
    const xi = [westFlower, ...Array.from({ length: 13 }, () => pullNormal(pool))];
    const bei = Array.from({ length: 13 }, () => pullNormal(pool));
    const wall = new Wall([...dong, ...nan, ...xi, ...bei, ...pool], null);
    const engine = engineOn(wall, 'xi');
    const records = engine.startNewGame(true);

    expect(records.map((record) => record.seat)).toEqual(['xi', 'dong']);
    expect(bonusInHands(engine)).toEqual([]);
    expect(engine.getState().players.xi.hand).toHaveLength(14);
    expect(engine.getState().players.dong.hand).toHaveLength(13);
    expect(engine.getState().currentTurn).toBe('xi');
  });

  it('lets the player act after a replacement consumes the last tile, then seris on an unclaimed discard', () => {
    const deal = normals(53, 'deal');
    const playable = normalTile('last');
    const wall = new Wall(
      [...deal, keyToTile('F1'), playable, keyToTile('F2'), keyToTile('F3')],
      null
    );
    const engine = engineOn(wall);
    engine.startNewGame(true);
    engine.discard('dong', firstDiscardable(engine, 'dong'));
    const resolved = engine.resolveClaimWindow();

    expect(resolved.nextPhase).toBe('ACTION_DECISION');
    expect(engine.getState().currentTurn).toBe('nan');
    expect(engine.getState().wall.isEmpty).toBe(true);
    expect(engine.getState().players.nan.flowers.map((tile) => tile.id)).toEqual([
      'flower-1-1',
      'flower-3-1',
      'flower-2-1',
    ]);
    expect(engine.getState().players.nan.hand.some((tile) => tile.id === playable.id)).toBe(true);
    expect(engine.getState().players.nan.hand).toHaveLength(14);

    engine.discard('nan', playable.id);
    const seri = engine.resolveClaimWindow();
    expect(seri.nextPhase).toBe('DRAW_SERI');
    expect(engine.getState().phase).toBe('DRAW_SERI');
    expect(engine.getState().players.nan.discards.map((tile) => tile.id)).toEqual([playable.id]);
  });

  it('ends a turn draw in DRAW_SERI when the last wall tiles are flowers and no replacement exists', () => {
    const wall = new Wall([...normals(53, 'bare'), keyToTile('F1'), keyToTile('M1')], null);
    const engine = engineOn(wall);
    engine.startNewGame(true);
    const southBefore = engine.getState().players.nan.hand.length;
    engine.discard('dong', firstDiscardable(engine, 'dong'));
    const resolved = engine.resolveClaimWindow();

    expect(resolved.nextPhase).toBe('DRAW_SERI');
    expect(engine.getState().players.nan.hand).toHaveLength(southBefore);
    expect(engine.getState().players.nan.flowers.map((tile) => tile.id)).toEqual([
      'flower-1-1',
      'season-1-1',
    ]);
    expect(engine.getState().wall.isEmpty).toBe(true);
  });

  it(
    'initial flower replacement at wall exhaustion must expose every bonus and include it in the result',
    () => {
      const flowerLow = keyToTile('F1');
      const flowerHigh = keyToTile('F2');
      const flowerSouth = keyToTile('F3');
      const dong = [flowerLow, ...normals(12, 'ex'), flowerHigh];
      const nan = [flowerSouth, ...normals(12, 'exs')];
      const wall = new Wall([...dong, ...nan, ...normals(13, 'xi'), ...normals(13, 'bei')], null);
      const engine = engineOn(wall);
      const records = engine.startNewGame(true);

      expect(engine.getState().phase).toBe('DRAW_SERI');
      expect(bonusInHands(engine)).toEqual([]);
      expect(records.flatMap((record) => record.flowers).map((tile) => tile.id).sort()).toEqual(
        flowerRack(engine).map((tile) => tile.id).sort()
      );
    }
  );
});

describe('turn and claim arbitration', () => {
  it('rotates four all-pass turns and blocks a draw from a non-adjacent seat', () => {
    const bonus = createCompleteTileSet().filter(isBonus);
    const rest = createCompleteTileSet().filter((tile) => !isBonus(tile));
    const engine = engineOn(new Wall([...rest, ...bonus], null));
    engine.startNewGame(true);
    const turns: Seat[] = [];
    for (let step = 0; step < 4; step += 1) {
      const seat = engine.getState().currentTurn;
      turns.push(seat);
      expect(engine.getState().players[seat].hand).toHaveLength(14);
      engine.discard(seat, firstDiscardable(engine, seat));
      engine.resolveClaimWindow();
    }
    expect(turns).toEqual(['dong', 'nan', 'xi', 'bei']);
    expect(engine.getState().currentTurn).toBe('dong');
    expect(engine.getState().wall.remainingCount).toBe(91);

    const fresh = engineOn(new Wall([...rest, ...bonus], null));
    fresh.startNewGame(true);
    const wallBefore = fresh.getState().wall.remainingCount;
    expect(() => fresh.startTurnDraw('xi')).toThrow(/out of turn/);
    expect(() => fresh.startTurnDraw('bei')).toThrow(/out of turn/);
    expect(fresh.getState().currentTurn).toBe('dong');
    expect(fresh.getState().wall.remainingCount).toBe(wallBefore);
  });

  it(
    'startTurnDraw must not take a tile for the next seat during ACTION_DECISION or FLOWER_REPLACEMENT',
    () => {
      const tiles = createCompleteTileSet();
      const duringAction = engineOn(new Wall(tiles, null));
      duringAction.startNewGame(true);
      expect(duringAction.getState().phase).toBe('ACTION_DECISION');
      expect(() => duringAction.startTurnDraw('nan')).toThrow();

      const duringFlowers = engineOn(new Wall(createCompleteTileSet(), null));
      duringFlowers.startNewGame(false);
      expect(duringFlowers.getState().phase).toBe('FLOWER_REPLACEMENT');
      expect(() => duringFlowers.startTurnDraw('nan')).toThrow();
    }
  );

  it(
    'performInitialFlowerReplacements must not rewind currentTurn after play has moved on',
    () => {
      const engine = engineOn(new Wall(createCompleteTileSet(), null));
      engine.startNewGame(true);
      engine.discard('dong', firstDiscardable(engine, 'dong'));
      engine.resolveClaimWindow();
      const seatAfterPass = engine.getState().currentTurn;
      expect(seatAfterPass).toBe('nan');
      engine.performInitialFlowerReplacements();
      expect(engine.getState().currentTurn).toBe(seatAfterPass);
    }
  );

  it('canDiscard is false when a 14-effective hand contains only undiscardable Kim', () => {
    const engine = engineOn(new Wall(createCompleteTileSet(), null));
    engine.startNewGame(true);
    const east = engine.getState().players.dong;
    east.hand = [keyToTile('KIM', 1), keyToTile('KIM', 2)];
    const kinds = ['WD', 'WN', 'WX', 'WB'];
    east.melds = kinds.map((kind, index) => ({
      type: 'pung' as const,
      tiles: [keyToTile(kind, 1), keyToTile(kind, 2), keyToTile(kind, 3)],
      claimedFrom: index % 2 === 0 ? 'nan' : 'xi',
    })) satisfies Meld[];
    const legal = engine.getLegalActions('dong');
    expect(legal.canDiscard && legal.discardableTileIds.length === 0).toBe(false);
  });

  it('rejects an Ankong that names a tile outside the hand without removing the other three', () => {
    const engine = engineOn(new Wall(filler(80, 'ank'), null));
    engine.startNewGame(true);
    const east = engine.getState().players.dong;
    const present = [keyToTile('WD', 1), keyToTile('WD', 2), keyToTile('WD', 3)];
    east.hand = [...present, ...filler(11, 'ankh')];
    const before = east.hand.map((tile) => tile.id);
    expect(() =>
      engine.declareAnkong('dong', [...present, keyToTile('WD', 4)])
    ).toThrow(/not found/);
    expect(east.hand.map((tile) => tile.id)).toEqual(before);
    expect(east.melds).toHaveLength(0);
  });

  it('rejects illegal Jia, short Pung, non-winning Hu, and a claim by the discarder', () => {
    const engine = engineOn(new Wall(filler(80, 'bad'), null));
    engine.startNewGame(true);
    const east = engine.getState().players.dong;
    const discard = keyToTile('5T', 4);
    east.hand = [discard, ...filler(13, 'badh')];
    engine.discard('dong', discard.id);

    expect(() =>
      engine.submitClaim({
        seat: 'xi',
        action: 'jia',
        meldTiles: [keyToTile('4T', 1), keyToTile('6T', 1)],
      })
    ).toThrow(/only from the player to your left/);
    expect(() => engine.submitClaim({ seat: 'xi', action: 'pung' })).toThrow(/requires at least 2/);
    expect(() => engine.submitClaim({ seat: 'bei', action: 'hu' })).toThrow(/legal winning Hu/);
    expect(() => engine.submitClaim({ seat: 'dong', action: 'pass' })).toThrow(/cannot claim their own/);

    engine.submitClaim({ seat: 'nan', action: 'pass' });
    engine.submitClaim({ seat: 'xi', action: 'pass' });
    engine.submitClaim({ seat: 'bei', action: 'pass' });
    const resolved = engine.resolveClaimWindow();
    expect(resolved.winningAction).toBe('pass');
    expect(resolved.nextTurn).toBe('nan');
    expect(() => engine.resolveClaimWindow()).toThrow(/no active discard/);
  });

  it('gives Jia only to the downstream seat, including the 1 and 9 boundaries', () => {
    const cases: { discard: string; yes: [string, string]; noEdge: string }[] = [
      { discard: '1T', yes: ['2T', '3T'], noEdge: '9T' },
      { discard: '9S', yes: ['7S', '8S'], noEdge: '1S' },
      { discard: '5B', yes: ['4B', '6B'], noEdge: 'WD' },
    ];
    for (const sample of cases) {
      const engine = engineOn(new Wall(filler(80, `jia-${sample.discard}`), null));
      engine.startNewGame(true);
      const discard = keyToTile(sample.discard, 4);
      engine.getState().players.dong.hand = [discard, ...filler(13, `dh-${sample.discard}`)];
      engine.discard('dong', discard.id);
      engine.getState().players.nan.hand = [
        keyToTile(sample.yes[0], 1),
        keyToTile(sample.yes[1], 1),
        ...filler(11, `nh-${sample.discard}`),
      ];
      const south = engine.getLegalActions('nan');
      const west = engine.getLegalActions('xi');
      if (sample.noEdge === 'WD') {
        expect(south.canJia).toBe(true);
        expect(west.canJia).toBe(false);
        engine.submitClaim({ seat: 'nan', action: 'jia', meldTiles: south.jiaOptions[0] });
        const resolved = engine.resolveClaimWindow();
        expect(resolved.winningAction).toBe('jia');
        expect(resolved.nextTurn).toBe('nan');
        expect(engine.getState().players.nan.melds[0]?.tiles).toHaveLength(3);
        expect(engine.getState().players.nan.hand).toHaveLength(11);
      } else {
        expect(south.canJia).toBe(true);
        expect(south.jiaOptions).toHaveLength(1);
        expect(west.canJia).toBe(false);
      }
    }
  });

  it('ranks Hu above Pung and Jia, Kong above Jia, and Pung above Jia', () => {
    const huHand = parseTileHand('1B 1B 2B 3B 4B 5B 6B 7B 2S 3S 4S 4T 6T');
    expect(canFormWinningHand([...huHand, keyToTile('5T', 4)])).toBe(true);

    const priority = engineOn(new Wall(filler(90, 'pri'), null));
    priority.startNewGame(true);
    const discarded = keyToTile('5T', 4);
    priority.getState().players.dong.hand = [discarded, ...filler(13, 'pri-d')];
    priority.getState().players.nan.hand = [keyToTile('4T', 2), keyToTile('6T', 2), ...filler(11, 'pri-n')];
    priority.getState().players.xi.hand = [keyToTile('5T', 2), keyToTile('5T', 3), ...filler(11, 'pri-x')];
    priority.getState().players.bei.hand = huHand.slice();
    priority.discard('dong', discarded.id);
    expect(priority.getLegalActions('bei').canDiscardWinHu).toBe(true);
    priority.submitClaim({ seat: 'nan', action: 'jia' });
    priority.submitClaim({ seat: 'xi', action: 'pung' });
    priority.submitClaim({ seat: 'bei', action: 'hu' });
    const huWon = priority.resolveClaimWindow();
    expect(huWon.winningAction).toBe('hu');
    expect(huWon.winnerSeat).toBe('bei');
    expect(huWon.displacedClaims.map((claim) => claim.action).sort()).toEqual(['jia', 'pung']);
    expect(locationsOf(priority, discarded.id)).toEqual(['bei.hand']);
    expect(priority.getState().discardPending).toBeNull();
    expect(priority.getState().players.xi.melds).toHaveLength(0);

    const kongOverJia = engineOn(new Wall(filler(90, 'koj'), null));
    kongOverJia.startNewGame(true);
    const kongDiscard = keyToTile('8B', 4);
    kongOverJia.getState().players.dong.hand = [kongDiscard, ...filler(13, 'koj-d')];
    kongOverJia.getState().players.nan.hand = [keyToTile('7B', 1), keyToTile('9B', 1), ...filler(11, 'koj-n')];
    kongOverJia.getState().players.bei.hand = [
      keyToTile('8B', 1),
      keyToTile('8B', 2),
      keyToTile('8B', 3),
      ...filler(10, 'koj-b'),
    ];
    kongOverJia.discard('dong', kongDiscard.id);
    kongOverJia.submitClaim({ seat: 'nan', action: 'jia' });
    kongOverJia.submitClaim({ seat: 'bei', action: 'kong' });
    const kongWon = kongOverJia.resolveClaimWindow();
    expect(kongWon.winningAction).toBe('kong');
    expect(kongWon.nextTurn).toBe('bei');
    expect(kongOverJia.getState().players.bei.melds[0]?.tiles).toHaveLength(4);
    expect(locationsOf(kongOverJia, kongDiscard.id)).toEqual(['bei.meld0']);

    const pungOverJia = engineOn(new Wall(filler(90, 'poj'), null));
    pungOverJia.startNewGame(true);
    const pungDiscard = keyToTile('5S', 4);
    pungOverJia.getState().players.dong.hand = [pungDiscard, ...filler(13, 'poj-d')];
    pungOverJia.getState().players.nan.hand = [keyToTile('4S', 1), keyToTile('6S', 1), ...filler(11, 'poj-n')];
    pungOverJia.getState().players.xi.hand = [keyToTile('5S', 1), keyToTile('5S', 2), ...filler(11, 'poj-x')];
    pungOverJia.discard('dong', pungDiscard.id);
    pungOverJia.submitClaim({ seat: 'nan', action: 'jia' });
    pungOverJia.submitClaim({ seat: 'xi', action: 'pung' });
    const pungWon = pungOverJia.resolveClaimWindow();
    expect(pungWon.winningAction).toBe('pung');
    expect(pungWon.nextTurn).toBe('xi');
    expect(pungOverJia.getState().players.nan.melds).toHaveLength(0);
  });

  it('breaks a multi-Hu tie by downstream distance, including a North discard that wraps to East', () => {
    const southWait = parseTileHand('1B 1B 2B 3B 4B 5B 6B 7B 2S 3S 4S 4T 6T');
    const westWait = [
      keyToTile('WD', 1), keyToTile('WD', 2), keyToTile('WD', 3),
      keyToTile('WN', 1), keyToTile('WN', 2), keyToTile('WN', 3),
      keyToTile('WX', 1), keyToTile('WX', 2), keyToTile('WX', 3),
      keyToTile('DZ', 1), keyToTile('DZ', 2), keyToTile('DZ', 3),
      keyToTile('5T', 1),
    ];
    const discard = keyToTile('5T', 4);
    expect(canFormWinningHand([...southWait, discard])).toBe(true);
    expect(canFormWinningHand([...westWait, discard])).toBe(true);

    const engine = engineOn(new Wall(filler(80, 'mh'), null));
    engine.startNewGame(true);
    engine.getState().players.dong.hand = [discard, ...filler(13, 'mh-d')];
    engine.getState().players.nan.hand = southWait.slice();
    engine.getState().players.xi.hand = westWait.slice();
    engine.discard('dong', discard.id);
    engine.submitClaim({ seat: 'xi', action: 'hu' });
    engine.submitClaim({ seat: 'nan', action: 'hu' });
    const nearest = engine.resolveClaimWindow();
    expect(nearest.winnerSeat).toBe('nan');
    expect(getTurnDistance('dong', 'nan')).toBeLessThan(getTurnDistance('dong', 'xi'));
    expect(nearest.displacedClaims.map((claim) => claim.seat)).toEqual(['xi']);

    const wrapped = engineOn(new Wall(filler(80, 'wrap'), null));
    wrapped.startNewGame(true);
    const state = wrapped.getState();
    (state as any).currentTurn = 'bei';
    const wrappedDiscard = keyToTile('9B', 4);
    state.players.bei.hand = [wrappedDiscard, ...filler(13, 'wrap-b')];
    state.players.dong.hand = parseTileHand('1T 1T 2T 3T 4T 5T 6T 7T 2S 3S 4S 7B 8B');
    state.players.xi.hand = [
      keyToTile('WD', 1), keyToTile('WD', 2), keyToTile('WD', 3),
      keyToTile('WN', 1), keyToTile('WN', 2), keyToTile('WN', 3),
      keyToTile('WX', 1), keyToTile('WX', 2), keyToTile('WX', 3),
      keyToTile('DF', 1), keyToTile('DF', 2), keyToTile('DF', 3),
      keyToTile('9B', 1),
    ];
    expect(canFormWinningHand([...state.players.dong.hand, wrappedDiscard])).toBe(true);
    wrapped.discard('bei', wrappedDiscard.id);
    wrapped.submitClaim({ seat: 'xi', action: 'hu' });
    wrapped.submitClaim({ seat: 'dong', action: 'hu' });
    const wrapResult = wrapped.resolveClaimWindow();
    expect(wrapResult.winnerSeat).toBe('dong');
    expect(wrapResult.winningAction).toBe('hu');
    expect(wrapped.getState().winType).toBe('ron');
  });

  it('robs a promoted Kong with Hu, leaves the Pung un-upgraded, and keeps a single copy of the tile', () => {
    const engine = engineOn(new Wall(filler(80, 'ck'), null));
    engine.startNewGame(true);
    const promoted = keyToTile('5T', 4);
    const east = engine.getState().players.dong;
    east.melds = [
      {
        type: 'pung',
        tiles: [keyToTile('5T', 1), keyToTile('5T', 2), keyToTile('5T', 3)],
        claimedFrom: 'nan',
      },
    ];
    east.hand = [...filler(10, 'ck-d'), promoted];
    const north = engine.getState().players.bei;
    north.hand = parseTileHand('1B 1B 2B 3B 4B 5B 6B 7B 2S 3S 4S 4T 6T');
    engine.declareKakan('dong', promoted.id, 0);
    expect(engine.getState().discardPending?.isPromotedKong).toBe(true);
    expect(engine.getLegalActions('bei').canDiscardWinHu).toBe(true);
    expect(engine.getLegalActions('nan').canPung).toBe(false);
    engine.submitClaim({ seat: 'bei', action: 'hu' });
    const robbed = engine.resolveClaimWindow();
    expect(robbed.winningAction).toBe('hu');
    expect(robbed.winnerSeat).toBe('bei');
    expect(engine.getState().winType).toBe('chiong_kong');
    expect(east.melds[0]?.type).toBe('pung');
    expect(east.melds[0]?.tiles).toHaveLength(3);
    expect(locationsOf(engine, promoted.id)).toEqual(['bei.hand']);
    expect(engine.getState().discardPending).toBeNull();
  });

  it('a promoted tile is not deleted when its Pung is gone before Kakan resolution', () => {
    const engine = engineOn(new Wall(filler(80, 'drop'), null));
    engine.startNewGame(true);
    const promoted: Tile = { id: 'kakan-probe', type: 'wind', value: 1, isKim: false };
    const east = engine.getState().players.dong;
    east.melds = [
      {
        type: 'pung',
        tiles: [1, 2, 3].map((copy) => ({
          id: `pung-probe-${copy}`,
          type: 'wind' as const,
          value: 1,
          isKim: false,
        })),
      },
    ];
    east.hand = [...filler(10, 'drop-d'), promoted];
    engine.declareKakan('dong', promoted.id, 0);
    east.melds = [];
    engine.resolveClaimWindow();
    expect(locationsOf(engine, promoted.id)).toHaveLength(1);
  });
});

describe('deterministic multi-seed simulations', () => {
  it(
    'replays 16 all-pass seeds to DRAW_SERI with a conserved 148-tile universe',
    { timeout: 60000 },
    () => {
      const endings = new Set<string>();
      for (const seed of PASS_SEEDS) {
        const first = simulate(seed, 'pass');
        const second = simulate(seed, 'pass');
        expect(second).toBe(first);
        expect(first.startsWith('DRAW_SERI')).toBe(true);
        endings.add(first);
      }
      expect(endings.size).toBe(PASS_SEEDS.length);
    }
  );

  it(
    'replays 12 claim-fuzz seeds without dropping tiles or breaking Hu > Kong > Pung > Jia',
    { timeout: 60000 },
    () => {
      for (const seed of CLAIM_SEEDS) {
        const first = simulate(seed, 'claim');
        const second = simulate(seed, 'claim');
        expect(second).toBe(first);
        expect(first.startsWith('DRAW_SERI') || first.startsWith('RESOLVED_HU')).toBe(true);
      }
    }
  );
});
