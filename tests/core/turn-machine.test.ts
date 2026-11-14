import { describe, it, expect } from 'vitest';
import { GameEngine, getTurnDistance, getNextSeat } from '@/core/game-engine';
import { Wall } from '@/core/wall';
import { keyToTile, parseTileHand, isBonus, isKim } from '@/core/tiles';

describe('Turn State Machine & Claim Arbitration (TM-01 to TM-20 Matrix)', () => {
  it('TM-01: Initial Deal & Seating: Deal gives 14 tiles to East, 13 to S/W/N. Wall count = 95', () => {
    const engine = new GameEngine();
    engine.startNewGame(false); // autoReplaceFlowers = false to inspect post-deal state

    const state = engine.getState();
    expect(state.phase).toBe('FLOWER_REPLACEMENT');
    expect(state.dealerSeat).toBe('dong');
    expect(state.currentTurn).toBe('dong');
    expect(state.players.dong.hand.length).toBe(14);
    expect(state.players.nan.hand.length).toBe(13);
    expect(state.players.xi.hand.length).toBe(13);
    expect(state.players.bei.hand.length).toBe(13);
    expect(state.wall.remainingCount).toBe(95);
  });

  it('TM-02: Flower Single Replacement: East dealt 1 flower, tail drawn non-flower', () => {
    // Seeded wall: seed 1's tail tile is a suited tile, so the single replacement cannot be
    // another flower (an unseeded wall made this test fail ~7% of runs).
    const engine = new GameEngine(undefined, new Wall(undefined, 1));
    engine.startNewGame(false);

    // Setup East with 13 suited + 1 flower
    const east = engine.getState().players.dong;
    east.hand = [
      ...parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 1S 2S 3S 4S'),
      keyToTile('F1', 1),
    ];

    const records = engine.performInitialFlowerReplacements();
    expect(east.hand.length).toBe(14);
    expect(east.flowers.length).toBe(1);
    expect(east.flowers[0]?.id).toBe('flower-1-1');
    expect(records.find((r) => r.seat === 'dong')?.flowers.length).toBe(1);
    expect(engine.getState().phase).toBe('ACTION_DECISION');
  });

  it('TM-03: Flower Recursive Replacement: Player dealt 2 flowers; 1st replacement is flower; 2nd & 3rd normal', () => {
    // Construct custom wall where tail has [normal, normal, flower]
    // Tail draws: first tail drawn is flower, next tails are normal
    const headTiles = Array.from({ length: 55 }, (_, i) => keyToTile('1T', i + 1));
    const tailTiles = [
      keyToTile('9S', 1),
      keyToTile('8S', 1),
      keyToTile('F3', 1), // 1st tail draw
    ];
    const customWall = new Wall([...headTiles, ...tailTiles], null);

    const engine = new GameEngine(undefined, customWall);
    engine.startNewGame(false);

    const east = engine.getState().players.dong;
    east.hand = [
      ...parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 1S 2S 3S'),
      keyToTile('F1', 1),
      keyToTile('F2', 1),
    ];

    engine.performInitialFlowerReplacements();

    expect(east.hand.length).toBe(14);
    expect(east.flowers.length).toBe(3); // F1, F2 + F3 replacement
    expect(east.hand.every((t) => !engine.isBonusTile(t))).toBe(true);
  });

  it('TM-04: Turn Draw Flower Replacement: in-game turn draw is a flower; draws tail replacement', () => {
    const dealTiles = Array.from({ length: 53 }, (_, i) => keyToTile('1T', i + 1));
    const nextTurnDraw = keyToTile('F1', 1);
    const midTiles = Array.from({ length: 10 }, (_, i) => keyToTile('2T', i + 1));
    const tailTile = keyToTile('9B', 1);
    const wall = new Wall([...dealTiles, nextTurnDraw, ...midTiles, tailTile], null);

    const engine = new GameEngine(undefined, wall);
    engine.startNewGame(true);

    const nan = engine.getState().players.nan;
    const initialHandLen = nan.hand.length; // 13

    // East discards and turn advances to South in TURN_DRAW
    const east = engine.getState().players.dong;
    const discardTile = east.hand.find((t) => !isBonus(t) && !isKim(t))!;
    engine.discard('dong', discardTile.id);
    (engine.getState() as any).phase = 'TURN_DRAW';
    (engine.getState() as any).currentTurn = 'nan';
    (engine.getState() as any).discardPending = null;

    const drawRes = engine.startTurnDraw('nan');
    expect(drawRes.exposedFlowers.length).toBe(1);
    expect(drawRes.drawnTile?.id).toBe('ban-9-1');
    expect(nan.hand.length).toBe(initialHandLen + 1);
    expect(nan.flowers.length).toBeGreaterThanOrEqual(1);
    expect(engine.getState().phase).toBe('ACTION_DECISION');
    expect(engine.getState().currentTurn).toBe('nan');
  });

  it('TM-05: Standard Discard & Turn Advance: East discards; S/W/N pass -> South enters turn with 14 tiles', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);

    const east = engine.getState().players.dong;
    const discardTile = east.hand.find((t) => !isBonus(t) && !isKim(t))!;

    engine.discard('dong', discardTile.id);
    expect(engine.getState().phase).toBe('CLAIM_WINDOW');

    // All opponents pass
    engine.submitClaim({ seat: 'nan', action: 'pass' });
    engine.submitClaim({ seat: 'xi', action: 'pass' });
    engine.submitClaim({ seat: 'bei', action: 'pass' });

    const res = engine.resolveClaimWindow();
    expect(res.winningAction).toBe('pass');
    expect(res.nextTurn).toBe('nan');
    expect(engine.getState().currentTurn).toBe('nan');
    expect(engine.getState().phase).toBe('ACTION_DECISION');
    expect(engine.getState().players.nan.hand.length).toBe(14);
    expect(east.discards[east.discards.length - 1]?.id).toBe(discardTile.id);
  });

  it('TM-06: Counter-Clockwise Rotation: 4 consecutive discards with all passes', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);

    const sequence: string[] = [];

    for (let round = 0; round < 4; round++) {
      const activeSeat = engine.getState().currentTurn;
      sequence.push(activeSeat);
      const activePlayer = engine.getState().players[activeSeat];
      const discardTile = activePlayer.hand.find((t) => !isBonus(t) && !isKim(t))!;

      engine.discard(activeSeat, discardTile.id);
      // All other 3 seats pass
      for (const seat of ['dong', 'nan', 'xi', 'bei'] as const) {
        if (seat !== activeSeat) {
          engine.submitClaim({ seat, action: 'pass' });
        }
      }
      engine.resolveClaimWindow();
    }

    expect(sequence).toEqual(['dong', 'nan', 'xi', 'bei']);
    expect(engine.getState().currentTurn).toBe('dong');
  });

  it('TM-07: Jia Eligibility (Next Seat Only): East discards 3T; South holds 1T, 2T -> South canJia=true; West & North canJia=false', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);

    const east = engine.getState().players.dong;
    const discardTile = keyToTile('3T', 1);
    east.hand.push(discardTile);

    const south = engine.getState().players.nan;
    south.hand.push(keyToTile('1T', 1), keyToTile('2T', 1));

    const west = engine.getState().players.xi;
    west.hand.push(keyToTile('1T', 2), keyToTile('2T', 2));

    const north = engine.getState().players.bei;
    north.hand.push(keyToTile('1T', 3), keyToTile('2T', 3));

    engine.discard('dong', discardTile.id);

    const southActions = engine.getLegalActions('nan');
    const westActions = engine.getLegalActions('xi');
    const northActions = engine.getLegalActions('bei');

    expect(southActions.canJia).toBe(true);
    expect(southActions.jiaOptions.length).toBeGreaterThan(0);
    expect(westActions.canJia).toBe(false);
    expect(northActions.canJia).toBe(false);
  });

  it('TM-08: Jia Claim Execution: South claims Jia on East discard -> melds sequence, turn becomes South', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);

    const east = engine.getState().players.dong;
    const discardTile = keyToTile('3T', 1);
    east.hand.push(discardTile);

    const south = engine.getState().players.nan;
    const t1 = keyToTile('1T', 1);
    const t2 = keyToTile('2T', 1);
    south.hand.push(t1, t2);

    engine.discard('dong', discardTile.id);
    engine.submitClaim({
      seat: 'nan',
      action: 'jia',
      meldTiles: [t1, t2],
    });

    const res = engine.resolveClaimWindow();
    expect(res.winningAction).toBe('jia');
    expect(res.nextTurn).toBe('nan');
    expect(engine.getState().currentTurn).toBe('nan');
    expect(engine.getState().phase).toBe('ACTION_DECISION');

    const southMelds = south.melds;
    expect(southMelds.length).toBe(1);
    expect(southMelds[0]?.type).toBe('jia');
    expect(southMelds[0]?.tiles.map((t) => t.id)).toEqual(['tong-1-1', 'tong-2-1', 'tong-3-1']);
  });

  it('TM-09: Pung Eligibility (Any Seat): East discards 5S; West holds two 5S -> West canPung=true', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);

    const east = engine.getState().players.dong;
    const discardTile = keyToTile('5S', 1);
    east.hand.push(discardTile);

    const west = engine.getState().players.xi;
    west.hand.push(keyToTile('5S', 2), keyToTile('5S', 3));

    engine.discard('dong', discardTile.id);

    const westActions = engine.getLegalActions('xi');
    expect(westActions.canPung).toBe(true);
    expect(westActions.pungTiles?.length).toBe(2);
  });

  it('TM-10: Pung Pre-empts Jia: South claims Jia, West claims Pung -> West wins claim, turn jumps to West', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);

    const east = engine.getState().players.dong;
    const discardTile = keyToTile('3T', 1);
    east.hand.push(discardTile);

    const south = engine.getState().players.nan;
    const s1 = keyToTile('1T', 1);
    const s2 = keyToTile('2T', 1);
    south.hand.push(s1, s2);

    const west = engine.getState().players.xi;
    const w1 = keyToTile('3T', 2);
    const w2 = keyToTile('3T', 3);
    west.hand.push(w1, w2);

    engine.discard('dong', discardTile.id);
    engine.submitClaim({ seat: 'nan', action: 'jia', meldTiles: [s1, s2] });
    engine.submitClaim({ seat: 'xi', action: 'pung', meldTiles: [w1, w2] });

    const res = engine.resolveClaimWindow();
    expect(res.winningAction).toBe('pung');
    expect(res.winnerSeat).toBeUndefined(); // pung action, claimant is nextTurn
    expect(res.nextTurn).toBe('xi');
    expect(res.displacedClaims.some((c) => c.seat === 'nan' && c.action === 'jia')).toBe(true);
    expect(engine.getState().currentTurn).toBe('xi');
    expect(engine.getState().phase).toBe('ACTION_DECISION');
    expect(west.melds.length).toBe(1);
    expect(west.melds[0]?.type).toBe('pung');
    expect(south.melds.length).toBe(0);
  });

  it('TM-11: Open Kong Claim Execution: East discards 8B, North holds three 8B -> North claims Kong, draws tail replacement, turn jumps to North', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);

    const east = engine.getState().players.dong;
    const discardTile = keyToTile('8B', 1);
    east.hand.push(discardTile);

    const north = engine.getState().players.bei;
    const n1 = keyToTile('8B', 2);
    const n2 = keyToTile('8B', 3);
    const n3 = keyToTile('8B', 4);
    north.hand.push(n1, n2, n3);

    engine.discard('dong', discardTile.id);
    engine.submitClaim({ seat: 'bei', action: 'kong', meldTiles: [n1, n2, n3] });

    const res = engine.resolveClaimWindow();
    expect(res.winningAction).toBe('kong');
    expect(res.nextTurn).toBe('bei');
    expect(engine.getState().currentTurn).toBe('bei');
    expect(engine.getState().phase).toBe('ACTION_DECISION');

    expect(north.melds.length).toBe(1);
    expect(north.melds[0]?.type).toBe('kong');
    expect(north.melds[0]?.tiles.length).toBe(4);
    expect(engine.getState().consecutiveKongs).toBe(1);
  });

  it('TM-12: Hu Pre-empts Pung and Jia: South claims Jia, West claims Pung, North declares Hu -> North wins', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);

    const east = engine.getState().players.dong;
    const discardTile = keyToTile('3T', 1);
    east.hand.push(discardTile);

    const south = engine.getState().players.nan;
    south.hand.push(keyToTile('1T', 1), keyToTile('2T', 1));

    const west = engine.getState().players.xi;
    west.hand.push(keyToTile('3T', 2), keyToTile('3T', 3));

    // North has a ready hand waiting for 3T (1T 2T + 444S + 555B + DZ DZ DZ + 9B 9B)
    const north = engine.getState().players.bei;
    north.hand = parseTileHand('1T 2T 4S 4S 4S 5B 5B 5B DZ DZ DZ 9B 9B');

    engine.discard('dong', discardTile.id);
    engine.submitClaim({ seat: 'nan', action: 'jia' });
    engine.submitClaim({ seat: 'xi', action: 'pung' });
    engine.submitClaim({ seat: 'bei', action: 'hu' });

    const res = engine.resolveClaimWindow();
    expect(res.winningAction).toBe('hu');
    expect(res.winnerSeat).toBe('bei');
    expect(engine.getState().phase).toBe('RESOLVED_HU');
    expect(engine.getState().winnerSeat).toBe('bei');
    expect(engine.getState().winType).toBe('ron');
    expect(res.displacedClaims.length).toBe(2);
  });

  it('TM-13: Double-Hu Tie-Breaker (Kam-Hu): East discards; both South and West declare Hu -> South wins (dist 1 < dist 2)', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);

    const east = engine.getState().players.dong;
    const discardTile = keyToTile('3T', 1);
    east.hand.push(discardTile);

    const south = engine.getState().players.nan;
    south.hand = parseTileHand('1T 2T 4S 4S 4S 5B 5B 5B DZ DZ DZ 9B 9B');

    const west = engine.getState().players.xi;
    west.hand = parseTileHand('3T 3T 1S 2S 3S 6B 7B 8B DF DF DF 8S 8S');

    engine.discard('dong', discardTile.id);
    engine.submitClaim({ seat: 'nan', action: 'hu' });
    engine.submitClaim({ seat: 'xi', action: 'hu' });

    const res = engine.resolveClaimWindow();
    expect(res.winningAction).toBe('hu');
    expect(res.winnerSeat).toBe('nan'); // Turn distance 1 wins over turn distance 2
    expect(engine.getState().winnerSeat).toBe('nan');
    expect(res.displacedClaims.some((c) => c.seat === 'xi' && c.action === 'hu')).toBe(true);
  });

  it('TM-14: Multi-Hu West vs North: East discards; West (dist 2) and North (dist 3) declare Hu -> West wins', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);

    const east = engine.getState().players.dong;
    const discardTile = keyToTile('3T', 1);
    east.hand.push(discardTile);

    const west = engine.getState().players.xi;
    west.hand = parseTileHand('1T 2T 4S 4S 4S 5B 5B 5B DZ DZ DZ 9B 9B');

    const north = engine.getState().players.bei;
    north.hand = parseTileHand('3T 3T 1S 2S 3S 6B 7B 8B DF DF DF 8S 8S');

    engine.discard('dong', discardTile.id);
    engine.submitClaim({ seat: 'xi', action: 'hu' });
    engine.submitClaim({ seat: 'bei', action: 'hu' });

    const res = engine.resolveClaimWindow();
    expect(res.winningAction).toBe('hu');
    expect(res.winnerSeat).toBe('xi'); // Dist 2 wins over dist 3
    expect(engine.getState().winnerSeat).toBe('xi');
  });

  it('TM-15: Concealed Kong (Ankong): South holds four zhong, declares Ankong on turn -> draws tail replacement, retains turn', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);

    const south = engine.getState().players.nan;
    const z1 = keyToTile('DZ', 1);
    const z2 = keyToTile('DZ', 2);
    const z3 = keyToTile('DZ', 3);
    const z4 = keyToTile('DZ', 4);
    south.hand = [z1, z2, z3, z4, ...parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 1S')];

    // Set turn to South
    (engine.getState() as any).currentTurn = 'nan';
    (engine.getState() as any).phase = 'ACTION_DECISION';

    const kongRes = engine.declareAnkong('nan', [z1, z2, z3, z4]);
    expect(kongRes.kongType).toBe('ankong');
    expect(south.melds.length).toBe(1);
    expect(south.melds[0]?.type).toBe('ankong');
    expect(south.melds[0]?.tiles.length).toBe(4);
    expect(engine.getState().currentTurn).toBe('nan');
    expect(engine.getState().phase).toBe('ACTION_DECISION');
    expect(engine.getState().consecutiveKongs).toBe(1);
  });

  it('TM-16: Promoted Kong (Kakan) - No Rob: West has Pung of fat, draws 4th fat, declares Kakan, opponents pass -> upgraded to Kong', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);

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

    // Opponents pass on Chiong Kong
    engine.submitClaim({ seat: 'dong', action: 'pass' });
    engine.submitClaim({ seat: 'nan', action: 'pass' });
    engine.submitClaim({ seat: 'bei', action: 'pass' });

    engine.resolveClaimWindow();
    expect(west.melds[0]?.type).toBe('kong');
    expect(west.melds[0]?.tiles.length).toBe(4);
    expect(engine.getState().currentTurn).toBe('xi');
    expect(engine.getState().phase).toBe('ACTION_DECISION');
  });

  it('TM-17: Chiong Kong (Robbing the Kong): West declares Kakan with 4th fat; North waiting for fat -> North wins via Chiong Kong', () => {
    const engine = new GameEngine();
    engine.startNewGame(true);

    const west = engine.getState().players.xi;
    const f1 = keyToTile('DF', 1);
    const f2 = keyToTile('DF', 2);
    const f3 = keyToTile('DF', 3);
    const f4 = keyToTile('DF', 4);

    west.melds = [{ type: 'pung', tiles: [f1, f2, f3], claimedFrom: 'dong' }];
    west.hand = [f4, ...parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B 1S')];

    // North is waiting on DF (pair wait or meld wait)
    const north = engine.getState().players.bei;
    north.hand = parseTileHand('DF 1T 2T 3T 4S 5S 6S 7B 8B 9B 1S 2S 3S');

    (engine.getState() as any).currentTurn = 'xi';
    (engine.getState() as any).phase = 'ACTION_DECISION';

    engine.declareKakan('xi', f4.id, 0);
    expect(engine.getState().phase).toBe('CLAIM_WINDOW');

    const northActions = engine.getLegalActions('bei');
    expect(northActions.canDiscardWinHu).toBe(true);
    expect(northActions.canJia).toBe(false);
    expect(northActions.canPung).toBe(false);

    engine.submitClaim({ seat: 'bei', action: 'hu' });
    const res = engine.resolveClaimWindow();

    expect(res.winningAction).toBe('hu');
    expect(res.winnerSeat).toBe('bei');
    expect(engine.getState().phase).toBe('RESOLVED_HU');
    expect(engine.getState().winnerSeat).toBe('bei');
    expect(engine.getState().winType).toBe('chiong_kong');
    expect(west.melds[0]?.type).toBe('pung'); // Kong upgrade was aborted!
  });

  it('TM-18: Prohibit Kim in Discard Claim: West holds 1T + Kim. East discards 2T -> Kim cannot be used for Jia claim', () => {
    const engine = new GameEngine({ allowKimInMeldClaim: false });
    engine.startNewGame(true);

    const east = engine.getState().players.dong;
    const discardTile = keyToTile('2T', 1);
    east.hand.push(discardTile);

    const south = engine.getState().players.nan;
    const t1 = keyToTile('1T', 1);
    const kim = keyToTile('KIM', 1);
    south.hand = [t1, kim, ...parseTileHand('4S 5S 6S 7B 8B 9B 1S 2S 3S 4S 5S')];

    engine.discard('dong', discardTile.id);
    const actions = engine.getLegalActions('nan');
    expect(actions.canJia).toBe(false);

    // Attempting to submit claim with Kim throws error
    expect(() =>
      engine.submitClaim({
        seat: 'nan',
        action: 'jia',
        meldTiles: [t1, kim],
      })
    ).toThrow('Using Kim in Jia/Pung/Kong claims is prohibited');
  });

  it('TM-19: Prohibit Kim Discard (BMC06): player attempts to discard Kim when kimDiscardAllowed === false -> throws error', () => {
    const engine = new GameEngine({ kimDiscardAllowed: false });
    engine.startNewGame(true);

    const east = engine.getState().players.dong;
    const kim = keyToTile('KIM', 1);
    east.hand.push(kim);

    expect(() => engine.discard('dong', kim.id)).toThrow('Discarding Kim is prohibited');
    expect(east.hand.some((t) => t.id === kim.id)).toBe(true);
  });

  it('TM-20: Wall Exhaustion to Seri: wall draws reach 0 tiles without Hu -> DRAW_SERI', () => {
    // Construct small wall with just 53 deal tiles + 1 draw tile
    const dealTiles = Array.from({ length: 53 }, (_, i) => keyToTile('1T', i + 1));
    const finalDrawTile = keyToTile('9S', 1);
    const wall = new Wall([...dealTiles, finalDrawTile], null);

    const engine = new GameEngine(undefined, wall);
    engine.startNewGame(true);

    expect(engine.getState().wall.remainingCount).toBe(1);

    const east = engine.getState().players.dong;
    const discardTile = east.hand[0]!;
    engine.discard('dong', discardTile.id);

    // Opponents pass -> advances to South who draws the 148th (last) tile
    engine.submitClaim({ seat: 'nan', action: 'pass' });
    engine.submitClaim({ seat: 'xi', action: 'pass' });
    engine.submitClaim({ seat: 'bei', action: 'pass' });
    engine.resolveClaimWindow();

    expect(engine.getState().wall.remainingCount).toBe(0);
    expect(engine.getState().currentTurn).toBe('nan');
    expect(engine.getState().phase).toBe('ACTION_DECISION');

    // South discards the last tile; all pass -> wall is exhausted -> DRAW_SERI!
    const south = engine.getState().players.nan;
    const southDiscard = south.hand.find((t) => !isKim(t))!;
    engine.discard('nan', southDiscard.id);

    engine.submitClaim({ seat: 'dong', action: 'pass' });
    engine.submitClaim({ seat: 'xi', action: 'pass' });
    engine.submitClaim({ seat: 'bei', action: 'pass' });

    const res = engine.resolveClaimWindow();
    expect(res.nextPhase).toBe('DRAW_SERI');
    expect(engine.getState().phase).toBe('DRAW_SERI');
  });

  it('helper tests: turn distance and seat helper rotation', () => {
    expect(getTurnDistance('dong', 'dong')).toBe(0);
    expect(getTurnDistance('dong', 'nan')).toBe(1);
    expect(getTurnDistance('dong', 'xi')).toBe(2);
    expect(getTurnDistance('dong', 'bei')).toBe(3);

    expect(getNextSeat('dong')).toBe('nan');
    expect(getNextSeat('nan')).toBe('xi');
    expect(getNextSeat('xi')).toBe('bei');
    expect(getNextSeat('bei')).toBe('dong');
  });
});
