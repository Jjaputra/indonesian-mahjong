/**
 * Independent cross-model audit of Milestone 1 (core tile domain, wall, turn engine).
 *
 * Tests named "DISCREPANCY-xx" assert the rule-correct behaviour and are wrapped in
 * `it.fails`: they pass while the engine still deviates from the rule, and will start
 * failing (prompting removal of `.fails`) once the engine is fixed.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine, getTurnDistance } from '@/core/game-engine';
import { Wall } from '@/core/wall';
import {
  createCompleteTileSet,
  isBonus,
  isKim,
  isSuited,
  isHonor,
  keyToTile,
  parseTileHand,
  tileToKey,
} from '@/core/tiles';
import type { Seat, Tile } from '@/core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const t = (key: string, copy = 1): Tile => keyToTile(key, copy);

/** Filler tiles that are never bonus tiles, with unique ids. */
function filler(n: number, prefix = 'fill'): Tile[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`,
    type: 'ban' as const,
    value: (i % 9) + 1,
    isKim: false,
  }));
}

/**
 * Builds a wall where `head` tiles are drawn first from the head and `tail` tiles are
 * drawn first from the tail (tail[0] is the very last physical tile).
 */
function buildWall(head: Tile[], tail: Tile[], middle = 0): Wall {
  return new Wall([...head, ...filler(middle), ...[...tail].reverse()], null);
}

/** Engine already dealt, with phase forced to ACTION_DECISION for `seat`, and a custom wall. */
function engineAt(seat: Seat, wall: Wall): GameEngine {
  const engine = new GameEngine(undefined, new Wall(createCompleteTileSet(), null));
  engine.startNewGame(false);
  const state = engine.getState() as any;
  state.wall = wall;
  state.phase = 'ACTION_DECISION';
  state.currentTurn = seat;
  return engine;
}

/** Puts `discarder` into CLAIM_WINDOW for `tile` (tile is injected into their hand first). */
function openClaimWindow(engine: GameEngine, discarder: Seat, tile: Tile): void {
  const state = engine.getState() as any;
  state.phase = 'ACTION_DECISION';
  state.currentTurn = discarder;
  state.players[discarder].hand.push(tile);
  engine.discard(discarder, tile.id);
}

// ---------------------------------------------------------------------------
// 1. 148-tile inventory
// ---------------------------------------------------------------------------

describe('Audit 1: 148-tile inventory (BMC ver06)', () => {
  const set = createCompleteTileSet();

  it('has exactly 148 tiles with unique ids', () => {
    expect(set).toHaveLength(148);
    expect(new Set(set.map((x) => x.id)).size).toBe(148);
  });

  it('category totals: 108 suited, 16 winds, 12 dragons, 4 flowers, 4 seasons, 4 Kim', () => {
    const count = (p: (x: Tile) => boolean) => set.filter(p).length;
    expect(count(isSuited)).toBe(108);
    expect(count((x) => x.type === 'wind')).toBe(16);
    expect(count((x) => x.type === 'dragon')).toBe(12);
    expect(count(isHonor)).toBe(28);
    expect(count((x) => x.type === 'flower')).toBe(4);
    expect(count((x) => x.type === 'season')).toBe(4);
    expect(count(isBonus)).toBe(8);
    expect(count(isKim)).toBe(4);
  });

  it('every suited/honor kind appears exactly 4 times', () => {
    const counts = new Map<string, number>();
    for (const x of set) counts.set(tileToKey(x), (counts.get(tileToKey(x)) ?? 0) + 1);
    for (const suit of ['T', 'S', 'B']) {
      for (let v = 1; v <= 9; v++) expect(counts.get(`${v}${suit}`)).toBe(4);
    }
    for (const k of ['WD', 'WN', 'WX', 'WB', 'DZ', 'DF', 'DP']) expect(counts.get(k)).toBe(4);
  });

  it('flowers F1-F4 and seasons M1-M4 are each unique singletons', () => {
    const keys = set.filter(isBonus).map(tileToKey).sort();
    expect(keys).toEqual(['F1', 'F2', 'F3', 'F4', 'M1', 'M2', 'M3', 'M4']);
  });

  it('Kim tiles: value 0, isKim flag set, not bonus, not suited, not honor', () => {
    const kims = set.filter((x) => x.type === 'kim');
    expect(kims).toHaveLength(4);
    for (const k of kims) {
      expect(k.value).toBe(0);
      expect(k.isKim).toBe(true);
      expect(isBonus(k) || isSuited(k) || isHonor(k)).toBe(false);
    }
    // Only Kim carries the isKim flag
    expect(set.filter((x) => x.isKim)).toHaveLength(4);
  });

  it('value ranges per category match the domain contract', () => {
    for (const x of set) {
      if (isSuited(x)) expect(x.value).toBeGreaterThanOrEqual(1), expect(x.value).toBeLessThanOrEqual(9);
      if (x.type === 'wind' || isBonus(x)) expect([1, 2, 3, 4]).toContain(x.value);
      if (x.type === 'dragon') expect([1, 2, 3]).toContain(x.value);
    }
  });

  it('a seeded shuffle is a permutation of the same 148 tiles', () => {
    const wall = new Wall(undefined, 12345);
    const drawn: Tile[] = [];
    let x: Tile | null;
    while ((x = wall.drawHead())) drawn.push(x);
    expect(drawn.map((d) => d.id).sort()).toEqual(set.map((s) => s.id).sort());
  });
});

// ---------------------------------------------------------------------------
// 2. Dual-ended wall exhaustion (no dead wall)
// ---------------------------------------------------------------------------

describe('Audit 2: dual-ended wall, no dead wall', () => {
  it('deal leaves 95 tiles live; dealer 14, others 13', () => {
    const wall = new Wall(undefined, 7);
    const deal = wall.dealInitialHands('dong');
    expect(deal.hands.dong).toHaveLength(14);
    expect(deal.hands.nan).toHaveLength(13);
    expect(deal.hands.xi).toHaveLength(13);
    expect(deal.hands.bei).toHaveLength(13);
    expect(wall.remainingCount).toBe(95);
  });

  it('non-dong dealer receives the 14th tile', () => {
    const deal = new Wall(undefined, 7).dealInitialHands('xi');
    expect(deal.hands.xi).toHaveLength(14);
    expect(deal.hands.dong).toHaveLength(13);
  });

  it('every tile is drawable: alternating head/tail draws consume all 148 with no reserve', () => {
    const wall = new Wall(undefined, 99);
    const seen = new Set<string>();
    let i = 0;
    while (!wall.isEmpty) {
      const x = i++ % 2 === 0 ? wall.drawHead() : wall.drawTail();
      expect(x).not.toBeNull();
      seen.add(x!.id);
    }
    expect(seen.size).toBe(148);
    expect(wall.remainingCount).toBe(0);
    expect(wall.drawnCount).toBe(148);
    expect(wall.drawHead()).toBeNull();
    expect(wall.drawTail()).toBeNull();
  });

  it('head and tail meet: the last tile is obtainable from either end', () => {
    const a = new Wall([t('1T'), t('2T'), t('3T')], null);
    a.drawHead();
    a.drawTail();
    expect(a.peekHead()?.id).toBe(a.peekTail()?.id);
    expect(a.drawTail()?.id).toBe('tong-2-1');
    expect(a.isEmpty).toBe(true);
  });

  it('pure tail draws exhaust the wall in reverse order', () => {
    const wall = new Wall([t('1T'), t('2T'), t('3T')], null);
    expect([wall.drawTail(), wall.drawTail(), wall.drawTail()].map((x) => x!.id)).toEqual([
      'tong-3-1',
      'tong-2-1',
      'tong-1-1',
    ]);
    expect(wall.drawHead()).toBeNull();
  });

  it('dealing from a wall with fewer than 53 tiles throws', () => {
    expect(() => new Wall(filler(52), null).dealInitialHands()).toThrow();
  });

  it('engine: all-pass on the very last tile ends in DRAW_SERI (no dead wall reserve)', () => {
    const engine = engineAt('dong', new Wall([t('9S')], null));
    // Draw the last live tile then discard it
    const state = engine.getState() as any;
    state.wall.drawHead();
    expect(state.wall.isEmpty).toBe(true);
    openClaimWindow(engine, 'dong', t('5S', 4));
    const res = engine.resolveClaimWindow();
    expect(res.nextPhase).toBe('DRAW_SERI');
    expect(engine.getState().phase).toBe('DRAW_SERI');
  });

  it('engine: with exactly 1 tile left, the next player still draws it (game is not stopped early)', () => {
    const engine = engineAt('dong', new Wall([t('9S')], null));
    openClaimWindow(engine, 'dong', t('5S', 4));
    const res = engine.resolveClaimWindow();
    expect(res.nextTurn).toBe('nan');
    expect(res.nextPhase).toBe('ACTION_DECISION');
    expect(engine.getState().players.nan.hand.at(-1)?.id).toBe('sok-9-1');
    expect(engine.getState().wall.isEmpty).toBe(true);
  });

  it('serialize/deserialize and clone preserve both cursors', () => {
    const wall = new Wall(undefined, 3);
    wall.drawHead();
    wall.drawTail();
    wall.drawTail();
    const restored = Wall.deserialize(wall.serialize());
    const cloned = wall.clone();
    for (const w of [restored, cloned]) {
      expect(w.remainingCount).toBe(145);
      expect(w.peekHead()?.id).toBe(wall.peekHead()?.id);
      expect(w.peekTail()?.id).toBe(wall.peekTail()?.id);
    }
    cloned.drawTail();
    expect(wall.remainingCount).toBe(145);
  });
});

// ---------------------------------------------------------------------------
// 3. Recursive flower/season tail replacement
// ---------------------------------------------------------------------------

describe('Audit 3: recursive flower/season replacement from the wall tail', () => {
  it('turn draw: head flower -> tail season -> tail flower -> tail normal tile', () => {
    const wall = buildWall([t('F1')], [t('M1'), t('F2'), t('5T', 4)], 10);
    const engine = engineAt('nan', wall);
    const before = engine.getState().players.nan.hand.length;
    const res = engine.startTurnDraw('nan');

    expect(res.isSeri).toBe(false);
    expect(res.exposedFlowers.map(tileToKey)).toEqual(['F1', 'M1', 'F2']);
    expect(res.drawnTile?.id).toBe('tong-5-4');
    const p = engine.getState().players.nan;
    expect(p.hand).toHaveLength(before + 1);
    expect(p.hand.some(isBonus)).toBe(false);
    expect(p.flowers.map(tileToKey)).toEqual(['F1', 'M1', 'F2']);
    // Head advanced by 1, tail by 3
    expect(engine.getState().wall.remainingCount).toBe(10);
  });

  it('turn draw: replacement consumes the wall tail, not the head', () => {
    const wall = buildWall([t('F3'), t('1S', 4)], [t('9T', 4)], 5);
    const engine = engineAt('xi', wall);
    const res = engine.startTurnDraw('xi');
    expect(res.drawnTile?.id).toBe('tong-9-4');
    expect(engine.getState().wall.peekHead()?.id).toBe('sok-1-4');
  });

  it('turn draw: wall that runs out mid-replacement ends in DRAW_SERI and keeps exposed flowers', () => {
    const wall = new Wall([t('F1'), t('M2'), t('F4')], null);
    const engine = engineAt('bei', wall);
    const res = engine.startTurnDraw('bei');
    expect(res.isSeri).toBe(true);
    expect(res.drawnTile).toBeNull();
    expect(res.exposedFlowers).toHaveLength(3);
    expect(engine.getState().phase).toBe('DRAW_SERI');
    expect(engine.getState().players.bei.flowers).toHaveLength(3);
  });

  it('initial deal: replacement that is itself a bonus tile recurses until a playable tile', () => {
    const engine = new GameEngine(undefined, new Wall(createCompleteTileSet(), null));
    engine.startNewGame(false);
    const state = engine.getState() as any;
    for (const s of ['dong', 'nan', 'xi', 'bei'] as Seat[]) {
      state.players[s].hand = filler(s === 'dong' ? 14 : 13, s);
    }
    state.players.dong.hand[0] = t('F1');
    state.players.dong.hand[5] = t('M1');
    state.wall = buildWall([], [t('F2'), t('M2'), t('3T', 4), t('4T', 4)], 10);

    const records = engine.performInitialFlowerReplacements();
    const dong = state.players.dong;
    expect(dong.hand).toHaveLength(14);
    expect(dong.hand.some(isBonus)).toBe(false);
    expect(dong.flowers.map(tileToKey).sort()).toEqual(['F1', 'F2', 'M1', 'M2']);
    expect(records).toHaveLength(1);
    expect(records[0]!.replacements).toHaveLength(4);
    expect(engine.getState().phase).toBe('ACTION_DECISION');
    // Only the tail was consumed
    expect(state.wall.remainingCount).toBe(10);
  });

  it('initial deal: all 8 bonus tiles in one hand are all exposed and replaced', () => {
    const engine = new GameEngine(undefined, new Wall(createCompleteTileSet(), null));
    engine.startNewGame(false);
    const state = engine.getState() as any;
    for (const s of ['dong', 'nan', 'xi', 'bei'] as Seat[]) {
      state.players[s].hand = filler(s === 'dong' ? 14 : 13, s);
    }
    state.players.nan.hand.splice(0, 8, ...parseTileHand('F1 F2 F3 F4 M1 M2 M3 M4'));
    state.wall = new Wall(filler(20, 'w'), null);
    engine.performInitialFlowerReplacements();
    expect(state.players.nan.flowers).toHaveLength(8);
    expect(state.players.nan.hand).toHaveLength(13);
    expect(state.wall.remainingCount).toBe(12);
  });

  it('Ankong replacement is drawn from the tail and recurses over bonus tiles', () => {
    const wall = buildWall([t('2S', 4)], [t('M3'), t('7B', 4)], 5);
    const engine = engineAt('dong', wall);
    const p = engine.getState().players.dong as any;
    const quad = [t('WD', 1), t('WD', 2), t('WD', 3), t('WD', 4)];
    p.hand = [...quad, ...filler(10, 'h')];
    const res = engine.declareAnkong('dong', quad);
    expect(res.replacementTile?.id).toBe('ban-7-4');
    expect(res.exposedFlowers.map(tileToKey)).toEqual(['M3']);
    expect(engine.getState().wall.peekHead()?.id).toBe('sok-2-4');
  });

  it('claimed Kong replacement is drawn from the tail and recurses over bonus tiles', () => {
    const wall = buildWall([t('2S', 4)], [t('F4'), t('8B', 4)], 5);
    const engine = engineAt('dong', wall);
    const xi = engine.getState().players.xi as any;
    xi.hand = [t('DZ', 1), t('DZ', 2), t('DZ', 3), ...filler(10, 'x')];
    openClaimWindow(engine, 'dong', t('DZ', 4));
    engine.submitClaim({ seat: 'xi', action: 'kong' });
    const res = engine.resolveClaimWindow();
    expect(res.winningAction).toBe('kong');
    expect(xi.flowers.map(tileToKey)).toEqual(['F4']);
    expect(xi.hand.at(-1).id).toBe('ban-8-4');
    expect(engine.getState().currentTurn).toBe('xi');
  });
});

// ---------------------------------------------------------------------------
// 4. Claim priority: Hu > Pung/Kong > Jia
// ---------------------------------------------------------------------------

describe('Audit 4: claim arbitration priority (Hu > Pung/Kong > Jia)', () => {
  // Nan (downstream of dong) is the only legal Jia claimant on a dong discard.
  function setupDiscard5T() {
    const engine = engineAt('dong', new Wall(filler(30, 'w'), null));
    const s = engine.getState() as any;
    s.players.nan.hand = [...parseTileHand('4T 6T'), ...filler(11, 'n')];
    s.players.xi.hand = [...parseTileHand('5T 5T'), ...filler(11, 'x')];
    // bei: tenpai on 5T (1T2T3T 4T5T 6S7S8S 9S9S9S WD WD + waiting 5T for 3T4T5T? use simple shape)
    s.players.bei.hand = parseTileHand('1S 2S 3S 4S 5S 6S 7S 8S 9S DZ DZ 5T 5T');
    return engine;
  }

  it('Hu beats Pung and Jia regardless of seat distance', () => {
    const engine = setupDiscard5T();
    openClaimWindow(engine, 'dong', t('5T', 4));
    engine.submitClaim({ seat: 'nan', action: 'jia', meldTiles: parseTileHand('4T 6T') });
    engine.submitClaim({ seat: 'xi', action: 'pung' });
    engine.submitClaim({ seat: 'bei', action: 'hu' });
    const res = engine.resolveClaimWindow();
    expect(res.winningAction).toBe('hu');
    expect(res.winnerSeat).toBe('bei');
    expect(res.displacedClaims.map((c) => c.seat).sort()).toEqual(['nan', 'xi']);
    expect(engine.getState().winType).toBe('ron');
  });

  it('Pung beats Jia even though Jia seat is closer', () => {
    const engine = setupDiscard5T();
    openClaimWindow(engine, 'dong', t('5T', 4));
    engine.submitClaim({ seat: 'nan', action: 'jia', meldTiles: parseTileHand('4T 6T') });
    engine.submitClaim({ seat: 'xi', action: 'pung' });
    const res = engine.resolveClaimWindow();
    expect(res.winningAction).toBe('pung');
    expect(res.nextTurn).toBe('xi');
    const meld = engine.getState().players.xi.melds[0]!;
    expect(meld.type).toBe('pung');
    expect(meld.tiles.map(tileToKey)).toEqual(['5T', '5T', '5T']);
    // Turn skips nan: nan's hand untouched
    expect(engine.getState().players.nan.hand).toHaveLength(13);
  });

  it('Kong beats Jia', () => {
    const engine = setupDiscard5T();
    (engine.getState().players.xi as any).hand = [...parseTileHand('5T 5T 5T'), ...filler(10, 'x')];
    openClaimWindow(engine, 'dong', t('5T', 4));
    engine.submitClaim({ seat: 'nan', action: 'jia', meldTiles: parseTileHand('4T 6T') });
    engine.submitClaim({ seat: 'xi', action: 'kong' });
    const res = engine.resolveClaimWindow();
    expect(res.winningAction).toBe('kong');
    expect(engine.getState().players.xi.melds[0]!.tiles).toHaveLength(4);
  });

  it('Jia alone succeeds for the downstream seat', () => {
    const engine = setupDiscard5T();
    openClaimWindow(engine, 'dong', t('5T', 4));
    const legal = engine.getLegalActions('nan');
    expect(legal.canJia).toBe(true);
    engine.submitClaim({ seat: 'nan', action: 'jia', meldTiles: legal.jiaOptions[0] });
    const res = engine.resolveClaimWindow();
    expect(res.winningAction).toBe('jia');
    expect(engine.getState().players.nan.melds[0]!.tiles.map(tileToKey).sort()).toEqual(['4T', '5T', '6T']);
  });

  it('Jia is not offered to non-downstream seats or on honor tiles', () => {
    const engine = setupDiscard5T();
    (engine.getState().players.xi as any).hand = [...parseTileHand('4T 6T'), ...filler(11, 'x')];
    openClaimWindow(engine, 'dong', t('5T', 4));
    expect(engine.getLegalActions('xi').canJia).toBe(false);
    expect(engine.getLegalActions('bei').canJia).toBe(false);
    expect(getTurnDistance('dong', 'nan')).toBe(1);
  });

  it('multiple Hu: nearest downstream seat from discarder wins (head bump)', () => {
    const engine = setupDiscard5T();
    (engine.getState().players.xi as any).hand = parseTileHand('1B 2B 3B 4B 5B 6B 7B 8B 9B DF DF 5T 5T');
    openClaimWindow(engine, 'dong', t('5T', 4));
    engine.submitClaim({ seat: 'bei', action: 'hu' });
    engine.submitClaim({ seat: 'xi', action: 'hu' });
    const res = engine.resolveClaimWindow();
    expect(res.winnerSeat).toBe('xi');
    expect(res.displacedClaims.map((c) => c.seat)).toEqual(['bei']);
  });

  it('Chiong Kong: only Hu may claim a promoted Kong; Hu wins with winType chiong_kong', () => {
    const engine = engineAt('dong', new Wall(filler(30, 'w'), null));
    const s = engine.getState() as any;
    s.players.dong.melds = [{ type: 'pung', tiles: [t('5T', 1), t('5T', 2), t('5T', 3)], claimedFrom: 'bei' }];
    s.players.dong.hand = [t('5T', 4), ...filler(10, 'd')];
    s.players.xi.hand = parseTileHand('1B 2B 3B 4B 5B 6B 7B 8B 9B DF DF 4T 6T');
    engine.declareKakan('dong', 'tong-5-4', 0);
    expect(engine.getLegalActions('xi').canDiscardWinHu).toBe(true);
    expect(engine.getLegalActions('nan').canPung).toBe(false);
    engine.submitClaim({ seat: 'xi', action: 'hu' });
    const res = engine.resolveClaimWindow();
    expect(res.winnerSeat).toBe('xi');
    expect(engine.getState().winType).toBe('chiong_kong');
  });

  it('Kim cannot be discarded and cannot be used in a meld claim under tournament defaults', () => {
    const engine = engineAt('dong', new Wall(filler(30, 'w'), null));
    (engine.getState().players.dong as any).hand.push(t('KIM'));
    expect(() => engine.discard('dong', 'kim-0-1')).toThrow();
    openClaimWindow(engine, 'dong', t('5T', 4));
    expect(() =>
      engine.submitClaim({ seat: 'xi', action: 'pung', meldTiles: [t('5T', 1), t('KIM', 2)] })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 5. Rulebook / contract discrepancies (Verified resolved)
// ---------------------------------------------------------------------------

describe('Audit 5: discrepancies found (All 8 verified fixed and passing)', () => {
  it('DISCREPANCY-01: a Jia claim from a non-downstream seat must be rejected', () => {
    const engine = engineAt('dong', new Wall(filler(30, 'w'), null));
    (engine.getState().players.xi as any).hand = [...parseTileHand('4T 6T'), ...filler(11, 'x')];
    openClaimWindow(engine, 'dong', t('5T', 4));
    let rejected = false;
    try {
      engine.submitClaim({ seat: 'xi', action: 'jia', meldTiles: parseTileHand('4T 6T') });
      const res = engine.resolveClaimWindow();
      rejected = res.winningAction !== 'jia';
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });

  it('DISCREPANCY-02: a Pung claim without two matching tiles must be rejected', () => {
    const engine = engineAt('dong', new Wall(filler(30, 'w'), null));
    (engine.getState().players.xi as any).hand = filler(13, 'x'); // no 5T at all
    openClaimWindow(engine, 'dong', t('5T', 4));
    let rejected = false;
    try {
      engine.submitClaim({ seat: 'xi', action: 'pung' });
      rejected = engine.resolveClaimWindow().winningAction !== 'pung';
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });

  it('DISCREPANCY-03: a Hu claim on a non-winning hand must not resolve as Hu', () => {
    const engine = engineAt('dong', new Wall(filler(30, 'w'), null));
    (engine.getState().players.xi as any).hand = parseTileHand('1T 3T 5T 7T 9T 1S 3S 5S 7S 9S WD WN WX');
    openClaimWindow(engine, 'dong', t('DZ', 4));
    let rejected = false;
    try {
      engine.submitClaim({ seat: 'xi', action: 'hu' });
      rejected = engine.resolveClaimWindow().winningAction !== 'hu';
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });

  it('DISCREPANCY-04: initial flower replacement must start from the dealer, not always dong', () => {
    const engine = new GameEngine(undefined, new Wall(createCompleteTileSet(), null), { dealerSeat: 'xi' });
    engine.startNewGame(false);
    const state = engine.getState() as any;
    for (const s of ['dong', 'nan', 'xi', 'bei'] as Seat[]) {
      state.players[s].hand = filler(s === 'xi' ? 14 : 13, s);
    }
    state.players.dong.hand[0] = t('F1');
    state.players.xi.hand[0] = t('F2');
    state.wall = new Wall(filler(20, 'w'), null);
    const records = engine.performInitialFlowerReplacements();
    expect(records[0]!.seat).toBe('xi');
  });

  it('DISCREPANCY-05: consecutiveKongs must reset after a normal discard (Kong Kong Hu #38 tracking)', () => {
    const engine = engineAt('dong', buildWall([], [t('7B', 4)], 10));
    const p = engine.getState().players.dong as any;
    const quad = [t('WD', 1), t('WD', 2), t('WD', 3), t('WD', 4)];
    p.hand = [...quad, ...filler(10, 'h')];
    engine.declareAnkong('dong', quad);
    engine.discard('dong', 'h-0');
    engine.resolveClaimWindow();
    expect(engine.getState().consecutiveKongs).toBe(0);
  });

  it('DISCREPANCY-06: a rejected Ankong must not mutate the hand (atomicity)', () => {
    const engine = engineAt('dong', new Wall(filler(30, 'w'), null));
    const p = engine.getState().players.dong as any;
    p.hand = [t('WD', 1), t('WD', 2), t('WD', 3), ...filler(11, 'h')];
    const before = p.hand.length;
    expect(() =>
      engine.declareAnkong('dong', [t('WD', 1), t('WD', 2), t('WD', 3), t('WD', 4)])
    ).toThrow();
    expect(p.hand).toHaveLength(before);
  });

  it('DISCREPANCY-07: turnCount must advance as turns pass (needed for first-turn wins #10-#12)', () => {
    const engine = engineAt('dong', new Wall(filler(30, 'w'), null));
    const start = engine.getState().turnCount;
    openClaimWindow(engine, 'dong', t('5T', 4));
    engine.resolveClaimWindow();
    expect(engine.getState().turnCount).toBeGreaterThan(start);
  });

  it('DISCREPANCY-08: startTurnDraw must refuse to draw outside the proper phase', () => {
    const engine = engineAt('dong', new Wall(filler(30, 'w'), null));
    // dong is mid ACTION_DECISION; xi drawing now is out of turn
    expect(() => engine.startTurnDraw('xi')).toThrow();
  });
});
