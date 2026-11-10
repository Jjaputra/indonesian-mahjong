import { describe, it, expect } from 'vitest';
import { GameEngine, canFormWinningHand } from '@/core/game-engine';
import { Wall } from '@/core/wall';
import { keyToTile, parseTileHand } from '@/core/tiles';

describe('Defensive Claim Validation & Error Handling (CV-01 to CV-10)', () => {
  it('CV-01: Illegal Seat Jia Rejected (West claiming East discard)', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);
    const eastTile = engine.getState().players.dong.hand[0]!;
    engine.discard('dong', eastTile.id);

    expect(() => {
      engine.submitClaim({ seat: 'xi', action: 'jia', meldTiles: [] });
    }).toThrowError(/Jia is allowed only from the player to your left/i);
  });

  it('CV-02: North Jia on East Discard Rejected', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);
    const eastTile = engine.getState().players.dong.hand[0]!;
    engine.discard('dong', eastTile.id);

    expect(() => {
      engine.submitClaim({ seat: 'bei', action: 'jia', meldTiles: [] });
    }).toThrowError(/Jia is allowed only from the player to your left/i);
  });

  it('CV-03: False Discard Hu Rejected on Non-Winning Hand', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);
    const eastTile = engine.getState().players.dong.hand[0]!;
    engine.discard('dong', eastTile.id);

    expect(() => {
      engine.submitClaim({ seat: 'nan', action: 'hu' });
    }).toThrowError(/hand does not form a legal winning Hu pattern/i);
  });

  it('CV-04: Pung with 0 or 1 Matching Tile Rejected', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);
    const east = engine.getState().players.dong;
    const discard = keyToTile('5S', 1);
    east.hand.push(discard);

    // West holds 0 of 5S
    const west = engine.getState().players.xi;
    west.hand = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 1B 2B 3B 4B');

    engine.discard('dong', discard.id);
    expect(() => {
      engine.submitClaim({ seat: 'xi', action: 'pung' });
    }).toThrowError(/requires at least 2 matching tiles/i);
  });

  it('CV-05: Kong with < 3 Matching Tiles Rejected', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);
    const east = engine.getState().players.dong;
    const discard = keyToTile('5S', 1);
    east.hand.push(discard);

    // North holds only 2 of 5S
    const north = engine.getState().players.bei;
    north.hand = [keyToTile('5S', 2), keyToTile('5S', 3), ...parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 1B 2B')];

    engine.discard('dong', discard.id);
    expect(() => {
      engine.submitClaim({ seat: 'bei', action: 'kong' });
    }).toThrowError(/requires at least 3 matching tiles/i);
  });

  it('CV-06: Jia with Non-Existent Hand Tiles Rejected', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);
    const east = engine.getState().players.dong;
    const discard = keyToTile('3T', 1);
    east.hand.push(discard);

    const south = engine.getState().players.nan;
    south.hand = parseTileHand('1S 2S 3S 4S 5S 6S 7S 8S 9S 1B 2B 3B 4B');

    engine.discard('dong', discard.id);
    expect(() => {
      engine.submitClaim({
        seat: 'nan',
        action: 'jia',
        meldTiles: [keyToTile('1T', 1), keyToTile('2T', 1)],
      });
    }).toThrowError(/not found in hand/i);
  });

  it('CV-07: Jia with Non-Consecutive Suited Tiles Rejected', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);
    const east = engine.getState().players.dong;
    const discard = keyToTile('3T', 1);
    east.hand.push(discard);

    const south = engine.getState().players.nan;
    const t1 = keyToTile('1T', 1);
    const t8 = keyToTile('8T', 1);
    south.hand.push(t1, t8);

    engine.discard('dong', discard.id);
    expect(() => {
      engine.submitClaim({
        seat: 'nan',
        action: 'jia',
        meldTiles: [t1, t8],
      });
    }).toThrowError(/cannot form a valid sequence|do not form a consecutive sequence/i);
  });

  it('CV-08: Discarder Cannot Claim Own Discard', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);
    const eastTile = engine.getState().players.dong.hand[0]!;
    engine.discard('dong', eastTile.id);

    expect(() => {
      engine.submitClaim({ seat: 'dong', action: 'hu' });
    }).toThrowError(/cannot claim their own discarded tile/i);
  });

  it('CV-09: resolveClaimWindow Defensive Guard Rejects Direct Injection of False Hu', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);
    const eastTile = engine.getState().players.dong.hand[0]!;
    engine.discard('dong', eastTile.id);

    // Bypass submitClaim via direct pendingClaims injection
    (engine.getState() as any).pendingClaims.nan = { seat: 'nan', action: 'hu' };

    expect(() => {
      engine.resolveClaimWindow();
    }).toThrowError(/does not hold a winning hand/i);
  });

  it('CV-10: State Invariant - discardPending is null after Hu resolution', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);

    const east = engine.getState().players.dong;
    const discard = keyToTile('3T', 1);
    east.hand.push(discard);

    const south = engine.getState().players.nan;
    // South holds waiting hand for 3T
    south.hand = parseTileHand('1T 2T 4S 4S 4S 5B 5B 5B DZ DZ DZ 9B 9B');

    engine.discard('dong', discard.id);
    engine.submitClaim({ seat: 'nan', action: 'hu' });
    engine.resolveClaimWindow();

    expect(engine.getState().phase).toBe('RESOLVED_HU');
    expect(engine.getState().winnerSeat).toBe('nan');
    expect(engine.getState().discardPending).toBeNull();
  });
});

describe('M1 Iteration 2 Hand Size, Wall Reset & Sequence Evaluation Tests', () => {
  describe('Hand size precondition in discard()', () => {
    it('allows discard when player holds 14 effective tiles (0 melds, 14 hand tiles)', () => {
      const engine = new GameEngine();
      engine.startNewGame(true);
      const east = engine.getState().players.dong;
      expect(east.hand.length).toBe(14);
      expect(east.melds.length).toBe(0);

      const discardTile = east.hand.find((t) => !t.isKim)!;
      expect(() => engine.discard('dong', discardTile.id)).not.toThrow();
    });

    it('throws "Player cannot discard with 13 tiles; draw required" when active player has 13 tiles', () => {
      const engine = new GameEngine();
      engine.startNewGame(true);
      const east = engine.getState().players.dong;

      // Simulate missing draw or corrupted 13-tile active hand
      east.hand.pop();
      expect(east.hand.length).toBe(13);
      expect(east.melds.length).toBe(0);

      expect(() => engine.discard('dong', east.hand[0]!.id)).toThrow(
        'Player cannot discard with 13 tiles; draw required'
      );
    });

    it('throws "Player cannot discard with 13 tiles; draw required" when player has 1 meld and 10 hand tiles', () => {
      const engine = new GameEngine();
      engine.startNewGame(true);
      const east = engine.getState().players.dong;

      // Simulate 1 meld (3 tiles) and 10 hand tiles -> 10 + 3 = 13
      east.melds.push({
        type: 'pung',
        tiles: [east.hand.pop()!, east.hand.pop()!, east.hand.pop()!],
      });
      east.hand.pop(); // remove one tile so hand is 10, total equivalent = 10 + 3 = 13
      expect(east.hand.length + east.melds.length * 3).toBe(13);

      expect(() => engine.discard('dong', east.hand[0]!.id)).toThrow(
        'Player cannot discard with 13 tiles; draw required'
      );
    });

    it('throws invalid hand size error when player has 12 effective tiles', () => {
      const engine = new GameEngine();
      engine.startNewGame(true);
      const east = engine.getState().players.dong;
      east.hand.pop();
      east.hand.pop();
      expect(east.hand.length).toBe(12);

      expect(() => engine.discard('dong', east.hand[0]!.id)).toThrow(
        /Illegal hand size for discard: expected 14 tiles/
      );
    });

    it('reflects canDiscard = false in getLegalActions when hand size is not 14', () => {
      const engine = new GameEngine();
      engine.startNewGame(true);
      const east = engine.getState().players.dong;
      east.hand.pop(); // reduce to 13
      const actions = engine.getLegalActions('dong');
      expect(actions.canDiscard).toBe(false);
      expect(actions.discardableTileIds).toEqual([]);
    });
  });

  describe('Order-independent winning hand evaluation in canFormWinningHand()', () => {
    it('evaluates sequences correctly regardless of tile insertion order (forward, reverse, random)', () => {
      // Standard hand: 1T-2T-3T, 4S-5S-6S, 7B-8B-9B, Dong-Dong-Dong, Zhong-Zhong
      const standardTiles = [
        keyToTile('1T', 1), keyToTile('2T', 1), keyToTile('3T', 1),
        keyToTile('4S', 1), keyToTile('5S', 1), keyToTile('6S', 1),
        keyToTile('7B', 1), keyToTile('8B', 1), keyToTile('9B', 1),
        keyToTile('1W', 1), keyToTile('1W', 2), keyToTile('1W', 3),
        keyToTile('1D', 1), keyToTile('1D', 2),
      ];

      // 1. Sorted order
      expect(canFormWinningHand(standardTiles)).toBe(true);

      // 2. Reverse order: 3T before 1T, 9B before 7B, etc.
      const reverseTiles = [...standardTiles].reverse();
      expect(canFormWinningHand(reverseTiles)).toBe(true);

      // 3. 50 random shuffles must all evaluate to true (100% pass rate)
      for (let i = 0; i < 50; i++) {
        const shuffled = [...standardTiles].sort(() => Math.random() - 0.5);
        expect(canFormWinningHand(shuffled)).toBe(true);
      }
    });

    it('evaluates hands with Kim wildcards order-independently', () => {
      const kim1 = keyToTile('KIM', 1);
      const kim2 = keyToTile('KIM', 2);
      const handWithKim = [
        keyToTile('3T', 1), keyToTile('1T', 1), kim1, // 1T-?-3T
        keyToTile('6S', 1), keyToTile('4S', 1), kim2, // 4S-?-6S
        keyToTile('7B', 1), keyToTile('8B', 1), keyToTile('9B', 1),
        keyToTile('1W', 1), keyToTile('1W', 2), keyToTile('1W', 3),
        keyToTile('1D', 1), keyToTile('1D', 2),
      ];

      for (let i = 0; i < 20; i++) {
        const shuffled = [...handWithKim].sort(() => Math.random() - 0.5);
        expect(canFormWinningHand(shuffled)).toBe(true);
      }
    });

    it('evaluates Kim filling edge of sequence (KIM + 8S + 9S) - ENGINE-SHAPE-02', () => {
      const kim1 = keyToTile('KIM', 1);
      const handWithEdgeKim = [
        kim1, keyToTile('8S', 1), keyToTile('9S', 1), // Kim as 7S
        keyToTile('1T', 1), keyToTile('2T', 1), keyToTile('3T', 1),
        keyToTile('4B', 1), keyToTile('5B', 1), keyToTile('6B', 1),
        keyToTile('1W', 1), keyToTile('1W', 2), keyToTile('1W', 3),
        keyToTile('1D', 1), keyToTile('1D', 2),
      ];
      expect(canFormWinningHand(handWithEdgeKim)).toBe(true);
    });
  });

  describe('Fresh wall initialization on startNewGame()', () => {
    it('initializes a fresh wall on repeated startNewGame() calls without depleting', () => {
      const engine = new GameEngine();

      for (let game = 1; game <= 5; game++) {
        engine.startNewGame(true);
        const wall = engine.getState().wall;
        expect(wall.remainingCount).toBeGreaterThanOrEqual(80);
        expect(wall.drawnCount).toBeLessThanOrEqual(68);
      }
    });

    it('preserves constructor custom wall on initial game', () => {
      const dealTiles = Array.from({ length: 53 }, (_, i) => keyToTile('1T', i + 1));
      const customWall = new Wall(dealTiles, null);
      const engine = new GameEngine(undefined, customWall);

      engine.startNewGame(false);
      expect(engine.getState().players.dong.hand[0]!.id).toBe('tong-1-1');
    });

    it('allows passing customWall explicitly to startNewGame()', () => {
      const engine = new GameEngine();
      engine.startNewGame(true); // Game 1 with normal wall

      const customDeal = Array.from({ length: 53 }, (_, i) => keyToTile('9B', i + 1));
      const customWall = new Wall(customDeal, null);

      engine.startNewGame(false, customWall); // Game 2 with custom wall
      expect(engine.getState().players.dong.hand[0]!.id).toBe('ban-9-1');
    });
  });
});
