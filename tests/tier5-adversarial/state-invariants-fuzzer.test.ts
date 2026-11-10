import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/core/game-engine';
import { Wall, createMulberry32 } from '@/core/wall';
import { Tile } from '@/core/types';
import { SEAT_ORDER } from '@/core/tiles';

interface InvariantCheckResult {
  valid: boolean;
  errors: string[];
  totalTiles: number;
}

/**
 * Validates universe tile invariants:
 * 1. Total physical tiles across all 4 hands, melds, flowers, discards, wall (and discardPending if in CLAIM_WINDOW) === 148.
 * 2. Zero duplicated tile IDs anywhere in the entire universe.
 */
function checkUniverseTileInvariants(engine: GameEngine, stepDesc: string): InvariantCheckResult {
  const state = engine.getState();
  const errors: string[] = [];
  const seenTileIds = new Map<string, string>();

  function trackTile(tile: Tile, location: string) {
    if (!tile || !tile.id) {
      errors.push(`Encountered null/undefined tile or missing id at ${location}`);
      return;
    }
    if (seenTileIds.has(tile.id)) {
      errors.push(`DUPLICATE TILE ID "${tile.id}" found in ${location} and already seen in ${seenTileIds.get(tile.id)}`);
    } else {
      seenTileIds.set(tile.id, location);
    }
  }

  // 1. All 4 players' hands, melds, flowers, discards
  for (const seat of SEAT_ORDER) {
    const player = state.players[seat];
    player.hand.forEach((t, i) => trackTile(t, `player[${seat}].hand[${i}]`));
    player.melds.forEach((m, mIdx) => {
      m.tiles.forEach((t, tIdx) => trackTile(t, `player[${seat}].melds[${mIdx}].tiles[${tIdx}]`));
    });
    player.flowers.forEach((t, i) => trackTile(t, `player[${seat}].flowers[${i}]`));
    player.discards.forEach((t, i) => trackTile(t, `player[${seat}].discards[${i}]`));
  }

  // 2. Wall tiles (remaining between headIndex and tailIndex)
  const wallAny = state.wall as any;
  const remainingWallTiles: Tile[] = wallAny.tiles.slice(wallAny.headIndex, wallAny.tailIndex + 1);
  remainingWallTiles.forEach((t, i) => trackTile(t, `wall[${i}]`));

  // 3. Pending discard (in CLAIM_WINDOW, or if dangling)
  if (state.phase === 'CLAIM_WINDOW' && state.discardPending) {
    trackTile(state.discardPending.tile, 'state.discardPending.tile');
  } else if (state.discardPending && state.phase !== 'CLAIM_WINDOW') {
    trackTile(state.discardPending.tile, `state.discardPending.tile (dangling in phase ${state.phase})`);
  }

  const totalTiles = seenTileIds.size;
  if (totalTiles !== 148) {
    errors.push(`Tile universe count mismatch at [${stepDesc}]: expected 148, got ${totalTiles} (wall remaining: ${state.wall.remainingCount})`);
  }

  return {
    valid: errors.length === 0,
    errors,
    totalTiles,
  };
}

/**
 * Computes effective hand size: hand.length + melds.length * 3.
 * For any legal Mahjong hand, active player before discard has 14 effective tiles,
 * and inactive players have 13 effective tiles.
 */
function getEffectiveHandSize(player: { hand: Tile[]; melds: any[] }): number {
  return player.hand.length + player.melds.length * 3;
}

describe('M1 Challenger State Invariant Fuzzing Harness', () => {
  it('Fuzzer Run: 50 Full Automated Game Simulations with random legal calls (Jia/Pung/Kong/Pass/Hu)', () => {
    const totalSimulations = 50;
    let huCount = 0;
    let seriCount = 0;
    const allViolations: string[] = [];

    for (let sim = 1; sim <= totalSimulations; sim++) {
      const rng = createMulberry32(sim * 1000 + 7);
      const wall = new Wall(undefined, sim * 1000 + 7);
      const engine = new GameEngine(undefined, wall);
      engine.startNewGame(true);

      let turnsInSim = 0;
      const maxTurns = 250;

      while (
        engine.getState().phase !== 'RESOLVED_HU' &&
        engine.getState().phase !== 'DRAW_SERI' &&
        turnsInSim < maxTurns
      ) {
        turnsInSim++;
        const state = engine.getState();

        if (state.phase === 'ACTION_DECISION') {
          const activeSeat = state.currentTurn;
          const activePlayer = state.players[activeSeat];

          // --- State Invariant Assertions at Start of Turn ---
          // 1. Active player hand size is exactly 14 tiles (effective hand size)
          const activeEffectiveSize = getEffectiveHandSize(activePlayer);
          if (activeEffectiveSize !== 14) {
            allViolations.push(
              `[Sim ${sim} Turn ${turnsInSim}] Active player (${activeSeat}) effective hand size is ${activeEffectiveSize}, expected 14 (hand: ${activePlayer.hand.length}, melds: ${activePlayer.melds.length})`
            );
          }

          // 2. Inactive players' hand sizes are exactly 13 tiles (effective hand size)
          for (const seat of SEAT_ORDER) {
            if (seat !== activeSeat) {
              const inactivePlayer = state.players[seat];
              const inactiveEffectiveSize = getEffectiveHandSize(inactivePlayer);
              if (inactiveEffectiveSize !== 13) {
                allViolations.push(
                  `[Sim ${sim} Turn ${turnsInSim}] Inactive player (${seat}) effective hand size is ${inactiveEffectiveSize}, expected 13 (hand: ${inactivePlayer.hand.length}, melds: ${inactivePlayer.melds.length})`
                );
              }
            }
          }

          // 3 & 4. Total physical tiles across universe = 148, no duplicate IDs
          const universeCheck = checkUniverseTileInvariants(
            engine,
            `Sim ${sim} Turn ${turnsInSim} ACTION_DECISION (${activeSeat})`
          );
          if (!universeCheck.valid) {
            allViolations.push(...universeCheck.errors);
          }

          // --- Player Action Decision ---
          const legal = engine.getLegalActions(activeSeat);

          // Option A: Self-draw Hu (50% chance if available)
          if (legal.canSelfDrawHu && rng() < 0.8) {
            engine.declareSelfDrawHu(activeSeat);
            break;
          }

          // Option B: Ankong (40% chance if available)
          if (legal.canAnkong && legal.ankongOptions.length > 0 && rng() < 0.4) {
            const chosenKong = legal.ankongOptions[Math.floor(rng() * legal.ankongOptions.length)]!;
            engine.declareAnkong(activeSeat, chosenKong);
            // After Ankong, player remains in ACTION_DECISION, loop continues
            continue;
          }

          // Option C: Kakan (40% chance if available)
          if (legal.canKakan && legal.kakanOptions.length > 0 && rng() < 0.4) {
            const chosenKakan = legal.kakanOptions[Math.floor(rng() * legal.kakanOptions.length)]!;
            engine.declareKakan(activeSeat, chosenKakan.tile.id, chosenKakan.meldIndex);
            // Phase transitions to CLAIM_WINDOW (Chiong Kong intercept window)
          } else {
            // Option D: Normal Discard
            const discardable = legal.discardableTileIds;
            if (discardable.length === 0) {
              allViolations.push(`[Sim ${sim} Turn ${turnsInSim}] Player ${activeSeat} has 0 discardable tiles!`);
              break;
            }
            const chosenTileId = discardable[Math.floor(rng() * discardable.length)]!;
            engine.discard(activeSeat, chosenTileId);
          }
        }

        // --- Handle CLAIM_WINDOW if opened ---
        if (engine.getState().phase === 'CLAIM_WINDOW') {
          const discarder = engine.getState().discardPending!.discarder;

          // Invariant in CLAIM_WINDOW: discard is in-flight, so all 4 players have 13 effective tiles
          for (const seat of SEAT_ORDER) {
            const p = engine.getState().players[seat];
            const effSize = getEffectiveHandSize(p);
            if (effSize !== 13) {
              allViolations.push(
                `[Sim ${sim} Turn ${turnsInSim} CLAIM_WINDOW] Player ${seat} effective hand size is ${effSize}, expected 13`
              );
            }
          }

          const claimUniverseCheck = checkUniverseTileInvariants(
            engine,
            `Sim ${sim} Turn ${turnsInSim} CLAIM_WINDOW`
          );
          if (!claimUniverseCheck.valid) {
            allViolations.push(...claimUniverseCheck.errors);
          }

          // Other 3 seats make claim decisions
          for (const seat of SEAT_ORDER) {
            if (seat === discarder) continue;
            const seatActions = engine.getLegalActions(seat);

            // 1. Hu (Ron / Chiong Kong)
            if (seatActions.canDiscardWinHu && rng() < 0.8) {
              engine.submitClaim({ seat, action: 'hu' });
            }
            // 2. Kong (Open Kong from discard)
            else if (seatActions.canKong && seatActions.kongTiles && rng() < 0.3) {
              engine.submitClaim({ seat, action: 'kong', meldTiles: seatActions.kongTiles });
            }
            // 3. Pung
            else if (seatActions.canPung && seatActions.pungTiles && rng() < 0.3) {
              engine.submitClaim({ seat, action: 'pung', meldTiles: seatActions.pungTiles });
            }
            // 4. Jia (Chow)
            else if (seatActions.canJia && seatActions.jiaOptions.length > 0 && rng() < 0.3) {
              const opt = seatActions.jiaOptions[Math.floor(rng() * seatActions.jiaOptions.length)]!;
              engine.submitClaim({ seat, action: 'jia', meldTiles: opt });
            }
            // 5. Pass
            else {
              engine.submitClaim({ seat, action: 'pass' });
            }
          }

          engine.resolveClaimWindow();
        }
      }

      // Check final game outcome
      const finalState = engine.getState();
      if (finalState.phase === 'RESOLVED_HU') {
        huCount++;
      } else if (finalState.phase === 'DRAW_SERI') {
        seriCount++;
      }

      // Check terminal invariant
      const endUniverseCheck = checkUniverseTileInvariants(
        engine,
        `Sim ${sim} End Game (${finalState.phase})`
      );
      if (!endUniverseCheck.valid) {
        allViolations.push(...endUniverseCheck.errors);
      }
    }

    console.log(`Fuzzer Results: 50 Simulations Completed. Hu: ${huCount}, Seri: ${seriCount}. Total Violations: ${allViolations.length}`);
    if (allViolations.length > 0) {
      console.log('Sample violations:', allViolations.slice(0, 10));
    }

    expect(huCount + seriCount).toBe(50);
    expect(allViolations).toEqual([]);
  });

  it('Fuzzer Run (Pure Draw & Discard, All Pass): Asserts literal hand.length === 14 (active) and 13 (inactive) across 50 full simulations', () => {
    const totalSimulations = 50;
    let seriCount = 0;
    let huCount = 0;
    const allViolations: string[] = [];

    for (let sim = 1; sim <= totalSimulations; sim++) {
      const rng = createMulberry32(sim * 5000 + 13);
      const wall = new Wall(undefined, sim * 5000 + 13);
      const engine = new GameEngine(undefined, wall);
      engine.startNewGame(true);

      let turn = 0;
      while (
        engine.getState().phase !== 'RESOLVED_HU' &&
        engine.getState().phase !== 'DRAW_SERI' &&
        turn < 250
      ) {
        turn++;
        const state = engine.getState();
        const activeSeat = state.currentTurn;
        const activePlayer = state.players[activeSeat];

        // Assert literal hand.length === 14 for active
        if (activePlayer.hand.length !== 14) {
          allViolations.push(
            `[Sim ${sim} Turn ${turn}] Active ${activeSeat} literal hand.length is ${activePlayer.hand.length}, expected 14`
          );
        }

        // Assert literal hand.length === 13 for inactive
        for (const seat of SEAT_ORDER) {
          if (seat !== activeSeat) {
            const p = state.players[seat];
            if (p.hand.length !== 13) {
              allViolations.push(
                `[Sim ${sim} Turn ${turn}] Inactive ${seat} literal hand.length is ${p.hand.length}, expected 13`
              );
            }
          }
        }

        // Assert 148 tiles total
        const uCheck = checkUniverseTileInvariants(engine, `Pure Sim ${sim} Turn ${turn}`);
        if (!uCheck.valid) {
          allViolations.push(...uCheck.errors);
        }

        const legal = engine.getLegalActions(activeSeat);
        if (legal.canSelfDrawHu && rng() < 0.5) {
          engine.declareSelfDrawHu(activeSeat);
          break;
        }

        const discardable = legal.discardableTileIds;
        const chosenTileId = discardable[Math.floor(rng() * discardable.length)]!;
        engine.discard(activeSeat, chosenTileId);

        // All opponents pass
        for (const seat of SEAT_ORDER) {
          if (seat !== activeSeat) {
            engine.submitClaim({ seat, action: 'pass' });
          }
        }
        engine.resolveClaimWindow();
      }

      if (engine.getState().phase === 'RESOLVED_HU') huCount++;
      if (engine.getState().phase === 'DRAW_SERI') seriCount++;
    }

    console.log(`Pure Draw/Discard Fuzzer: Hu: ${huCount}, Seri: ${seriCount}, Violations: ${allViolations.length}`);
    if (allViolations.length > 0) {
      console.log('Sample violations:', allViolations.slice(0, 10));
    }
    expect(huCount + seriCount).toBe(50);
    expect(allViolations).toEqual([]);
  });
});
