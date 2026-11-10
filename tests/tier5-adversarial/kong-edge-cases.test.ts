import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/core/game-engine';
import { Wall } from '@/core/wall';
import { keyToTile, parseTileHand } from '@/core/tiles';

describe('Adversarial Kong Edge Cases & Tail Recursion Verification', () => {
  it('Kakan: Promoted Kong draws replacement from tail, triggers recursive flower replacements, and gives active player the turn', () => {
    const dealTiles = Array.from({ length: 53 }, (_, i) => keyToTile('1T', i + 1));
    const midHeadTiles = Array.from({ length: 10 }, (_, i) => keyToTile('2T', i + 1));
    
    // Tail draws in reverse order from end of array:
    // 1st tail draw is F1, 2nd tail draw is F2, 3rd tail draw is 9S (normal)
    const normalTailTile = keyToTile('9S', 1);
    const flowerTailTile2 = keyToTile('F2', 1);
    const flowerTailTile1 = keyToTile('F1', 1);
    
    const wall = new Wall([
      ...dealTiles,
      ...midHeadTiles,
      normalTailTile,
      flowerTailTile2,
      flowerTailTile1,
    ], null);

    const engine = new GameEngine(undefined, wall);
    engine.startNewGame(false);

    const west = engine.getState().players.xi;
    const f1 = keyToTile('DF', 1);
    const f2 = keyToTile('DF', 2);
    const f3 = keyToTile('DF', 3);
    const f4 = keyToTile('DF', 4);

    west.melds = [{ type: 'pung', tiles: [f1, f2, f3], claimedFrom: 'dong' }];
    west.hand = [f4, ...parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 1S')];

    (engine.getState() as any).currentTurn = 'xi';
    (engine.getState() as any).phase = 'ACTION_DECISION';

    const kakanRes = engine.declareKakan('xi', f4.id, 0);
    expect(kakanRes.kongType).toBe('kakan');
    expect(engine.getState().phase).toBe('CLAIM_WINDOW');
    expect(engine.getState().discardPending?.isPromotedKong).toBe(true);
    expect(engine.getState().discardPending?.tile.id).toBe(f4.id);

    // Opponents pass on Chiong Kong
    engine.submitClaim({ seat: 'dong', action: 'pass' });
    engine.submitClaim({ seat: 'nan', action: 'pass' });
    engine.submitClaim({ seat: 'bei', action: 'pass' });

    const resolveRes = engine.resolveClaimWindow();

    // 1. Verify Pung was upgraded to Kong
    expect(west.melds.length).toBe(1);
    expect(west.melds[0]?.type).toBe('kong');
    expect(west.melds[0]?.tiles.length).toBe(4);
    expect(west.melds[0]?.tiles.some((t) => t.id === f4.id)).toBe(true);

    // 2. Verify recursive flower check on tail draws
    expect(west.flowers.length).toBe(2);
    expect(west.flowers.map((t) => t.id)).toEqual(['flower-1-1', 'flower-2-1']);

    // 3. Verify final replacement tile drawn into hand from tail is normal tile (9S)
    expect(west.hand.some((t) => t.id === normalTailTile.id)).toBe(true);

    // 4. Verify turn is given to active player (West) in ACTION_DECISION
    expect(resolveRes.nextTurn).toBe('xi');
    expect(resolveRes.nextPhase).toBe('ACTION_DECISION');
    expect(engine.getState().currentTurn).toBe('xi');
    expect(engine.getState().phase).toBe('ACTION_DECISION');
    expect(engine.getState().discardPending).toBeNull();
  });

  it('Ankong: Concealed Kong moves 4 tiles to meld, draws from tail, triggers recursive flower check, and gives active player the turn', () => {
    const dealTiles = Array.from({ length: 53 }, (_, i) => keyToTile('1T', i + 1));
    const midHeadTiles = Array.from({ length: 10 }, (_, i) => keyToTile('2T', i + 1));
    
    // Tail draws: F3 then F4 then 8S
    const normalTailTile = keyToTile('8S', 1);
    const flowerTailTile2 = keyToTile('F4', 1);
    const flowerTailTile1 = keyToTile('F3', 1);
    
    const wall = new Wall([
      ...dealTiles,
      ...midHeadTiles,
      normalTailTile,
      flowerTailTile2,
      flowerTailTile1,
    ], null);

    const engine = new GameEngine(undefined, wall);
    engine.startNewGame(false);

    const south = engine.getState().players.nan;
    const z1 = keyToTile('DZ', 1);
    const z2 = keyToTile('DZ', 2);
    const z3 = keyToTile('DZ', 3);
    const z4 = keyToTile('DZ', 4);
    south.hand = [z1, z2, z3, z4, ...parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 1S')];

    (engine.getState() as any).currentTurn = 'nan';
    (engine.getState() as any).phase = 'ACTION_DECISION';

    const initialHandLen = south.hand.length; // 14
    const kongRes = engine.declareAnkong('nan', [z1, z2, z3, z4]);

    // 1. Verify 4 tiles moved to meld
    expect(kongRes.kongType).toBe('ankong');
    expect(south.melds.length).toBe(1);
    expect(south.melds[0]?.type).toBe('ankong');
    expect(south.melds[0]?.tiles.length).toBe(4);
    expect(south.melds[0]?.tiles.map((t) => t.id)).toEqual([z1.id, z2.id, z3.id, z4.id]);
    expect(south.hand.some((t) => t.id === z1.id || t.id === z2.id)).toBe(false);

    // 2. Verify recursive flower handling
    expect(kongRes.exposedFlowers.length).toBe(2);
    expect(south.flowers.length).toBe(2);
    expect(south.flowers.map((t) => t.id)).toEqual(['flower-3-1', 'flower-4-1']);

    // 3. Verify final replacement drawn from tail
    expect(kongRes.replacementTile?.id).toBe(normalTailTile.id);
    expect(south.hand.some((t) => t.id === normalTailTile.id)).toBe(true);

    // 4. Verify hand size: 14 - 4 (melded) + 1 (replacement) = 11 concealed tiles
    expect(south.hand.length).toBe(initialHandLen - 4 + 1);

    // 5. Verify turn remains with South in ACTION_DECISION
    expect(engine.getState().currentTurn).toBe('nan');
    expect(engine.getState().phase).toBe('ACTION_DECISION');
  });

  it('Chiong Kong: Opponent claims Hu on Kakan -> wins via Chiong Kong, Pung is not upgraded', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);

    const west = engine.getState().players.xi;
    const f1 = keyToTile('DF', 1);
    const f2 = keyToTile('DF', 2);
    const f3 = keyToTile('DF', 3);
    const f4 = keyToTile('DF', 4);

    west.melds = [{ type: 'pung', tiles: [f1, f2, f3], claimedFrom: 'dong' }];
    west.hand = [f4, ...parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 1S')];

    const north = engine.getState().players.bei;
    north.hand = parseTileHand('DF 1T 2T 3T 4S 5S 6S 7B 8B 9B 1S 2S 3S');

    (engine.getState() as any).currentTurn = 'xi';
    (engine.getState() as any).phase = 'ACTION_DECISION';

    engine.declareKakan('xi', f4.id, 0);
    engine.submitClaim({ seat: 'bei', action: 'hu' });
    const res = engine.resolveClaimWindow();

    expect(res.winningAction).toBe('hu');
    expect(res.winnerSeat).toBe('bei');
    expect(engine.getState().winType).toBe('chiong_kong');
    expect(west.melds[0]?.type).toBe('pung'); // Remains Pung
    expect(north.hand.some((t) => t.id === f4.id)).toBe(true);
  });

  it('VULNERABILITY: Ron / Chiong Kong Hu fails to clear state.discardPending, duplicating winning tile in universe', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);

    const east = engine.getState().players.dong;
    const discardTile = keyToTile('3T', 1);
    east.hand.push(discardTile);

    const north = engine.getState().players.bei;
    north.hand = parseTileHand('1T 2T 4S 4S 4S 5B 5B 5B DZ DZ DZ 9B 9B');

    engine.discard('dong', discardTile.id);
    expect(engine.getState().phase).toBe('CLAIM_WINDOW');

    engine.submitClaim({ seat: 'bei', action: 'hu' });
    engine.resolveClaimWindow();

    expect(engine.getState().phase).toBe('RESOLVED_HU');
    // Winning tile was added to winner's hand:
    expect(north.hand.some((t) => t.id === discardTile.id)).toBe(true);

    // BUG: discardPending was NOT reset to null, so it still holds the winning tile!
    // This assertion PROVES the leak:
    expect(engine.getState().discardPending).toBeNull();
  });

  it('VULNERABILITY: Kakan with empty wall on replacement draw fails to clear state.discardPending', () => {
    // Construct wall with 53 deal tiles + 0 extra tiles
    const dealTiles = Array.from({ length: 53 }, (_, i) => keyToTile('1T', i + 1));
    const wall = new Wall(dealTiles, null);

    const engine = new GameEngine(undefined, wall);
    engine.startNewGame(false);

    const west = engine.getState().players.xi;
    const f1 = keyToTile('DF', 1);
    const f2 = keyToTile('DF', 2);
    const f3 = keyToTile('DF', 3);
    const f4 = keyToTile('DF', 4);

    west.melds = [{ type: 'pung', tiles: [f1, f2, f3], claimedFrom: 'dong' }];
    west.hand = [f4, ...parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 1S')];

    (engine.getState() as any).currentTurn = 'xi';
    (engine.getState() as any).phase = 'ACTION_DECISION';

    engine.declareKakan('xi', f4.id, 0);

    // Opponents pass
    engine.submitClaim({ seat: 'dong', action: 'pass' });
    engine.submitClaim({ seat: 'nan', action: 'pass' });
    engine.submitClaim({ seat: 'bei', action: 'pass' });

    // resolveClaimWindow triggers DRAW_SERI because wall is empty
    const res = engine.resolveClaimWindow();
    expect(res.nextPhase).toBe('DRAW_SERI');
    expect(engine.getState().phase).toBe('DRAW_SERI');

    // Tile was added to Pung meld (now Kong meld)
    expect(west.melds[0]?.tiles.some((t) => t.id === f4.id)).toBe(true);

    // BUG: discardPending was NOT set to null, causing duplicate tile ID!
    expect(engine.getState().discardPending).toBeNull();
  });

  it('VULNERABILITY: Open Kong claim with empty wall on replacement draw fails to clear state.discardPending', () => {
    const dealTiles = Array.from({ length: 53 }, (_, i) => keyToTile('1T', i + 1));
    const wall = new Wall(dealTiles, null);

    const engine = new GameEngine(undefined, wall);
    engine.startNewGame(false);

    const east = engine.getState().players.dong;
    const discardTile = keyToTile('8B', 1);
    east.hand.push(discardTile);

    const north = engine.getState().players.bei;
    const n1 = keyToTile('8B', 2);
    const n2 = keyToTile('8B', 3);
    const n3 = keyToTile('8B', 4);
    north.hand.push(n1, n2, n3);

    (engine.getState() as any).currentTurn = 'dong';
    (engine.getState() as any).phase = 'ACTION_DECISION';

    engine.discard('dong', discardTile.id);
    engine.submitClaim({ seat: 'bei', action: 'kong', meldTiles: [n1, n2, n3] });

    const res = engine.resolveClaimWindow();
    expect(res.nextPhase).toBe('DRAW_SERI');
    expect(engine.getState().phase).toBe('DRAW_SERI');

    // Tile was added to North melds
    expect(north.melds[0]?.tiles.some((t) => t.id === discardTile.id)).toBe(true);

    // BUG: discardPending was NOT set to null!
    expect(engine.getState().discardPending).toBeNull();
  });
});
