/**
 * Tier 4 — Real-World Scenarios.
 *
 * Full simulated 4-player matches through the UI GameController (all AI difficulties, multi-round
 * progressions, wall exhaustion, preset transitions, history persistence) plus scripted table
 * scenarios on rigged walls driven through the core GameEngine and scored with the 44-Tay engine
 * (Pao Chin, Thien Fu, Thi Fu, Kong replacement, Kong Kong Hu, Chiong Kong, 7 Flowers, Shi Kim).
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/core/game-engine';
import { SEAT_ORDER, createCompleteTileSet, isBonus, keyToTile, tileToKey } from '@/core/tiles';
import type { GameRules, Seat, Tile } from '@/core/types';
import { Wall } from '@/core/wall';
import { isKim } from '@/kim/wildcard-solver';
import type { ScoringResult } from '@/scoring';
import {
  HISTORY_STORAGE_KEY,
  MemoryStorage,
  applyPreset,
  computeHistoryStats,
  detectPreset,
  getPreset,
  loadGameHistory,
  loadSettings,
  saveGameRecord,
  toGameRules,
  type AIDifficulty,
  type GameSettings,
} from '@/storage';
import { chooseDiscard, type AIStrategy } from '@/ui/ai-controller';
import { GameController } from '@/ui/game-controller';
import { buildWinContext, getScoringEngine, isFirstGoAround, scoreHu, toFullRules, type FullRules, type WinFlags } from '@/ui/win-context';

// ============================================================================
// Helpers
// ============================================================================

const TOURNAMENT = (patch: Partial<GameSettings> = {}): GameSettings => ({ ...getPreset('tournament'), kimMode: 'dedicated', soundEnabled: false, ...patch });
const CASUAL = (patch: Partial<GameSettings> = {}): GameSettings => ({ ...getPreset('casual'), kimMode: 'dedicated', soundEnabled: false, ...patch });

/** A deterministic clock so durations are reproducible. */
function fakeClock(stepMs = 1500): () => number {
  let t = 1_700_000_000_000;
  return () => (t += stepMs);
}

/** Simple human policy: Hu when legal, otherwise pass claims and discard the newest legal tile. */
function autoplayHuman(c: GameController, takeHu = true): void {
  const a = c.getHumanActions();
  if (a.canReplaceFlowers) return c.humanReplaceFlowers();
  if (a.claim) return c.humanClaim(takeHu && a.claim.canHu ? 'hu' : 'pass');
  if (a.canDraw) return c.humanDraw();
  if (takeHu && a.canSelfDrawHu) return c.humanSelfDrawHu();
  if (a.canDiscard) {
    const hand = c.getState().players[c.humanSeat].hand;
    const tile = [...hand].reverse().find((t) => a.discardableTileIds.includes(t.id))!;
    return c.humanDiscard(tile.id);
  }
  throw new Error(`human stuck in phase ${c.getState().phase}`);
}

function totalTiles(c: GameController): number {
  const s = c.getState();
  let n = s.wall.remainingCount + (s.discardPending ? 1 : 0);
  for (const seat of SEAT_ORDER) {
    const p = s.players[seat];
    n += p.hand.length + p.flowers.length + p.discards.length + p.melds.reduce((m, x) => m + x.tiles.length, 0);
  }
  return n;
}

/** Table invariants that must hold after every step of a real match. */
function assertInvariants(c: GameController): void {
  const s = c.getState();
  expect(totalTiles(c)).toBe(148);
  for (const seat of SEAT_ORDER) {
    const p = s.players[seat];
    if (!c.getSettings().kimDiscardAllowed) expect(p.discards.some(isKim)).toBe(false);
    expect(p.hand.some(isBonus)).toBe(false);
    expect(p.flowers.every(isBonus)).toBe(true);
    const effective = p.hand.length + p.melds.length * 3;
    // 13 at rest, 14 for the seat to act; a Hu claimant briefly holds 14 after resolution.
    expect([13, 14]).toContain(effective);
  }
}

interface MatchResult {
  controller: GameController;
  steps: number;
}

function playMatch(c: GameController, opts: { checkEvery?: boolean; takeHu?: boolean } = {}): MatchResult {
  let steps = 0;
  while (!c.outcome && steps < 6000) {
    if (c.isWaitingForHuman()) autoplayHuman(c, opts.takeHu ?? true);
    else if (!c.step()) throw new Error(`stalled in phase ${c.getState().phase}`);
    if (opts.checkEvery) assertInvariants(c);
    steps++;
  }
  expect(c.outcome, 'match must finish').not.toBeNull();
  return { controller: c, steps };
}

/**
 * Builds an unshuffled wall: dealt hands in deal order (dong 14/13, nan, xi, bei), then `draws`
 * from the head, `tail` drawn from the tail (first element = first replacement). The rest is filler.
 */
function riggedWall(spec: { hands: Partial<Record<Seat, string>>; draws?: string; tail?: string; dealer?: Seat }): Wall {
  const pool = createCompleteTileSet();
  const take = (key: string): Tile => {
    const want = keyToTile(key);
    const i = pool.findIndex((t) => tileToKey(t) === tileToKey(want));
    if (i === -1) throw new Error(`no copy of ${key} left for rigged wall`);
    return pool.splice(i, 1)[0]!;
  };
  const keys = (s?: string) => (s ?? '').trim().split(/\s+/).filter(Boolean);
  const dealer = spec.dealer ?? 'dong';
  const dealt: Tile[] = [];
  const reserved: Record<Seat, Tile[]> = { dong: [], nan: [], xi: [], bei: [] };
  for (const seat of SEAT_ORDER) reserved[seat] = keys(spec.hands[seat]).map(take);
  const head = keys(spec.draws).map(take);
  const tail = keys(spec.tail).map(take);
  // Filler: plain suited/honor tiles only, so no surprise flowers or Kims reach rigged hands.
  const filler = () => {
    const i = pool.findIndex((t) => !isBonus(t) && !isKim(t));
    return pool.splice(i, 1)[0]!;
  };
  for (const seat of SEAT_ORDER) {
    const size = seat === dealer ? 14 : 13;
    const hand = reserved[seat];
    if (hand.length > size) throw new Error(`${seat} hand too large`);
    while (hand.length < size) hand.push(filler());
    dealt.push(...hand);
  }
  const middle = [...pool];
  return new Wall([...dealt, ...head, ...middle, ...tail.reverse()], null);
}

const RULES: FullRules = toFullRules(TOURNAMENT());
const SUPERSEDE = 'supersede' as const;

function flags(patch: Partial<WinFlags> = {}): WinFlags {
  return { isSelfDraw: true, isRobbingKong: false, consecutiveKongs: 0, isFirstGoAround: false, isPaoChin: false, ...patch };
}

function scoreSelfDraw(engine: GameEngine, seat: Seat, f: WinFlags, rules: FullRules = RULES): ScoringResult {
  const s = engine.getState();
  const p = s.players[seat];
  const winningTile = s.winningTile ?? p.hand[p.hand.length - 1]!;
  return scoreHu(
    { hand: p.hand.filter((t) => t.id !== winningTile.id), melds: p.melds, flowers: p.flowers, winningTile },
    seat,
    s.roundWind,
    f,
    rules,
    SUPERSEDE
  );
}

const ids = (r: ScoringResult) => r.patterns.map((p) => p.id);

// ============================================================================
// 1. Full simulated matches
// ============================================================================

describe('Tier 4 · Full simulated 4-player matches', () => {
  for (const difficulty of ['easy', 'normal', 'hard'] as AIDifficulty[]) {
    it(`${difficulty}: 12 seeded tournament matches finish with valid outcomes and table invariants`, () => {
      const storage = new MemoryStorage();
      let hu = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const c = new GameController({ settings: TOURNAMENT({ aiDifficulty: difficulty }), seed: seed * 977 + difficulty.length, storage, now: fakeClock() });
        playMatch(c, { checkEvery: seed <= 3 });
        const o = c.outcome!;
        if (o.kind === 'hu') {
          hu++;
          expect(o.scoring.isValidHu).toBe(true);
          expect(o.scoring.isLewFit).toBe(false);
          expect(o.scoring.totalTay).toBeGreaterThanOrEqual(5);
          expect(o.scoring.totalTay).toBe(o.scoring.patterns.reduce((s, p) => s + p.tay, 0));
          expect(o.hand.some((t) => t.id === o.winningTile.id)).toBe(true);
          if (o.winMethod !== 'tsumo') expect(o.discarder).toBeDefined();
        } else {
          expect(c.getState().phase).toBe('DRAW_SERI');
        }
      }
      expect(hu, 'AI tables should produce Hu, not only draws').toBeGreaterThan(0);
      expect(loadGameHistory(storage)).toHaveLength(12);
    });
  }

  it('casual preset matches also finish with Tay-gated Hu only', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const c = new GameController({ settings: CASUAL({ aiDifficulty: 'hard' }), seed: 5000 + seed, saveHistory: false });
      playMatch(c, { checkEvery: seed === 1 });
      const o = c.outcome!;
      if (o.kind === 'hu') expect(o.scoring.totalTay).toBeGreaterThanOrEqual(c.getSettings().minHuTay);
    }
  });

  it('same seed + same settings replays the identical match (determinism)', () => {
    const run = () => {
      const c = new GameController({ settings: TOURNAMENT({ aiDifficulty: 'normal' }), seed: 31337, saveHistory: false });
      playMatch(c);
      return { log: c.log.map((l) => l.text), outcome: JSON.stringify(c.outcome && { ...c.outcome, durationSeconds: 0 }) };
    };
    expect(run()).toEqual(run());
  });

  it('every claim the human sees is legal for the current discard', () => {
    let claimsSeen = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const c = new GameController({ settings: TOURNAMENT(), seed: 700 + seed, saveHistory: false });
      while (!c.outcome) {
        if (!c.isWaitingForHuman()) {
          if (!c.step()) break;
          continue;
        }
        const claim = c.getHumanActions().claim;
        if (claim) {
          claimsSeen++;
          const s = c.getState();
          expect(s.discardPending?.tile.id).toBe(claim.tile.id);
          expect(claim.discarder).not.toBe(c.humanSeat);
          if (claim.jiaOptions.length) expect(claim.discarder).toBe('bei'); // Jia only from the left seat
          for (const opt of claim.jiaOptions) for (const t of opt) expect(isKim(t)).toBe(false);
          if (claim.canHu) expect(claim.huScore!.totalTay).toBeGreaterThanOrEqual(5);
        }
        autoplayHuman(c);
      }
    }
    expect(claimsSeen).toBeGreaterThan(0);
  });
});

// ============================================================================
// 2. Multi-round progressions
// ============================================================================

describe('Tier 4 · Multi-round progressions', () => {
  it('plays a full 4-wind × 4-dealer session (16 hands) with rotating dealer and prevailing wind', () => {
    const storage = new MemoryStorage();
    const c = new GameController({ settings: TOURNAMENT({ aiDifficulty: 'normal' }), seed: 4242, storage, now: fakeClock() });
    let hands = 0;
    for (const roundWind of SEAT_ORDER) {
      for (const dealer of SEAT_ORDER) {
        if (hands > 0) {
          c.setSettings({ ...c.getSettings(), roundWind, startingSeatWind: dealer });
          c.newGame();
        } else {
          expect(c.getState().dealerSeat).toBe('dong');
        }
        const s = c.getState();
        expect(s.roundWind).toBe(roundWind);
        expect(s.dealerSeat).toBe(dealer);
        // The dealer is the one dealt 14 effective tiles.
        expect(s.players[dealer].hand.length + s.players[dealer].melds.length * 3).toBe(14);
        playMatch(c);
        hands++;
      }
    }
    const history = loadGameHistory(storage);
    expect(history).toHaveLength(16);
    const stats = computeHistoryStats(history);
    expect(stats.gamesPlayed).toBe(16);
    expect(stats.draws + Object.values(stats.wins).reduce((a, b) => a + b, 0)).toBe(16);
    expect(stats.kimWins + stats.noKimWins).toBe(16 - stats.draws);
  });

  it('new game fully resets the table between rounds', () => {
    const c = new GameController({ settings: TOURNAMENT(), seed: 99, saveHistory: false });
    playMatch(c);
    c.newGame();
    const s = c.getState();
    expect(c.outcome).toBeNull();
    expect(c.discardTrail).toHaveLength(0);
    expect(c.lastDiscard).toBeNull();
    for (const seat of SEAT_ORDER) {
      expect(s.players[seat].discards).toHaveLength(0);
      expect(s.players[seat].melds).toHaveLength(0);
    }
    expect(totalTiles(c)).toBe(148);
  });
});

// ============================================================================
// 3. Pao Chin / Thien Fu / Thi Fu
// ============================================================================

// 4 sequences + pair, no honors/bonus: Ping Fu shape.
const WIN14 = '1T 2T 3T 4T 5T 6T 7T 8T 9T 2S 3S 4S 5B 5B';

describe('Tier 4 · Opening-hand scenarios', () => {
  it('Thien Fu: dealer wins with the dealt 14 tiles before any discard', () => {
    const engine = new GameEngine(RULES, riggedWall({ hands: { dong: WIN14 } }));
    engine.startNewGame(true);
    expect(engine.getState().phase).toBe('ACTION_DECISION');
    expect(engine.getLegalActions('dong').canSelfDrawHu).toBe(true);
    engine.declareSelfDrawHu('dong');
    expect(engine.getState().winType).toBe('tsumo');
    const r = scoreSelfDraw(engine, 'dong', flags({ isFirstGoAround: true }));
    expect(ids(r)).toContain(11);
    expect(r.patterns.find((p) => p.id === 11)!.tay).toBe(60); // NK column
    expect(r.isValidHu).toBe(true);
  });

  it('Pao Chin: dealer is Cin on the deal, declares it, and later wins with Pao Chin Tay', () => {
    // Dealer holds a ready hand + one junk tile (WB) to discard; waits on 5B.
    const engine = new GameEngine(RULES, riggedWall({ hands: { dong: '1T 2T 3T 4T 5T 6T 7T 8T 9T 2S 3S 4S 5B WB' }, draws: '1B 1B 1B 5B' }));
    engine.startNewGame(true);
    expect(engine.getLegalActions('dong').canPaoChin).toBe(true);
    expect(engine.declarePaoChin('dong')).toBe(true);
    expect(engine.getState().players.dong.isPaoChin).toBe(true);
    const wb = engine.getState().players.dong.hand.find((t) => tileToKey(t) === 'WB')!;
    engine.discard('dong', wb.id);
    engine.resolveClaimWindow(); // all pass → nan draws
    // Pao Chin can no longer be declared once the player has discarded.
    expect(engine.getState().players.dong.discards).toHaveLength(1);
    expect(engine.getLegalActions('dong').canPaoChin).toBe(false);
    // Score the eventual win on 5B (later in the game, so Pao Chin but not Thi Fu).
    const p = engine.getState().players.dong;
    const r = scoreHu(
      { hand: p.hand, melds: p.melds, flowers: p.flowers, winningTile: keyToTile('5B', 4) },
      'dong',
      'dong',
      flags({ isSelfDraw: false, isPaoChin: true, discarderSeat: 'xi' }),
      RULES,
      SUPERSEDE
    );
    expect(ids(r)).toContain(10);
    expect(ids(r)).not.toContain(12);
    expect(r.isValidHu).toBe(true);
  });

  it('Thi Fu: Pao Chin declared then Ron on a first-round discard (supersedes Pao Chin); a first draw also scores Thi Fu', () => {
    // Dealer discards WB; nan draws its winning 5B as its first draw.
    const engine = new GameEngine(
      RULES,
      riggedWall({ hands: { dong: '1S 1S 1S 9S 9S 9S 7B 7B 7B DZ DZ DF DF WB', nan: '1T 2T 3T 4T 5T 6T 7T 8T 9T 2S 3S 4S 5B' }, draws: '5B' })
    );
    engine.startNewGame(true);
    const wb = engine.getState().players.dong.hand.find((t) => tileToKey(t) === 'WB')!;
    engine.discard('dong', wb.id);
    const res = engine.resolveClaimWindow();
    expect(res.nextTurn).toBe('nan');
    expect(engine.declarePaoChin('nan')).toBe(true);
    expect(engine.getLegalActions('nan').canSelfDrawHu).toBe(true);
    engine.declareSelfDrawHu('nan');
    // Thi Fu includes the first wall draw after Pao Chin.
    const drawn = scoreSelfDraw(engine, 'nan', flags({ isFirstGoAround: true, isPaoChin: true }));
    expect(ids(drawn)).not.toContain(10);
    expect(ids(drawn)).toContain(12);
    expect(ids(drawn)).not.toContain(11); // Thien Fu is dealer-only

    const p = engine.getState().players.nan;
    const winningTile = engine.getState().winningTile ?? p.hand[p.hand.length - 1]!;
    const r = scoreHu(
      { hand: p.hand.filter((t) => t.id !== winningTile.id), melds: p.melds, flowers: p.flowers, winningTile },
      'nan',
      'dong',
      flags({ isSelfDraw: false, isFirstGoAround: true, isPaoChin: true, discarderSeat: 'dong' }),
      RULES,
      SUPERSEDE
    );
    expect(ids(r)).toContain(12);
    expect(ids(r)).not.toContain(10); // rulebook: Pao Chin drops once it turns into Thi Fu
    expect(ids(r)).not.toContain(11);
  });
});

// ============================================================================
// 4. Kong replacement & Chiong Kong
// ============================================================================

describe('Tier 4 · Kong scenarios', () => {
  it('Kong Song Hu/Mo: Ankong, replacement from the wall tail completes the hand', () => {
    const engine = new GameEngine(RULES, riggedWall({ hands: { dong: '9S 9S 9S 9S 1T 2T 3T 4S 5S 6S 7B 8B WX WX' }, tail: '9B' }));
    engine.startNewGame(true);
    const before = engine.getState().wall.remainingCount;
    const legal = engine.getLegalActions('dong');
    expect(legal.canAnkong).toBe(true);
    const k = engine.declareAnkong('dong', legal.ankongOptions[0]!);
    expect(tileToKey(k.replacementTile!)).toBe('9B');
    expect(engine.getState().wall.remainingCount).toBe(before - 1);
    expect(engine.getState().consecutiveKongs).toBe(1);
    expect(engine.getLegalActions('dong').canSelfDrawHu).toBe(true);
    const r = scoreSelfDraw(engine, 'dong', flags({ consecutiveKongs: engine.getState().consecutiveKongs }));
    engine.declareSelfDrawHu('dong');
    expect(ids(r)).toContain(37);
    expect(r.isValidHu).toBe(true);
  });

  it('Kong Kong Hu: two consecutive Ankongs, second replacement wins (supersedes #37)', () => {
    const engine = new GameEngine(RULES, riggedWall({ hands: { dong: '9S 9S 9S 9S 1S 1S 1S 1S 1T 2T 3T WX 5B 6B' }, tail: '7B WX' }));
    engine.startNewGame(true);
    engine.declareAnkong('dong', engine.getLegalActions('dong').ankongOptions.find((g) => tileToKey(g[0]!) === '9S')!);
    engine.declareAnkong('dong', engine.getLegalActions('dong').ankongOptions[0]!);
    expect(engine.getState().consecutiveKongs).toBe(2);
    expect(engine.getState().players.dong.melds.map((m) => m.type)).toEqual(['ankong', 'ankong']);
    expect(engine.getLegalActions('dong').canSelfDrawHu).toBe(true);
    const r = scoreSelfDraw(engine, 'dong', flags({ consecutiveKongs: 2 }));
    expect(ids(r)).toContain(38);
    expect(ids(r)).not.toContain(37);
    expect(r.totalTay).toBeGreaterThanOrEqual(30);
  });

  it('Chiong Kong: an opponent robs a promoted Kong (Kakan) for Hu', () => {
    // Dealer holds 5T×4; nan waits on 2T/5T with 3T 4T.
    const engine = new GameEngine(
      RULES,
      riggedWall({ hands: { dong: '5T 5T 5T 5T 1S 2S 3S 7S 8S 9S 4B 5B 6B DP', nan: '3T 4T 1S 2S 3S 4B 5B 6B 7B 8B 9B WX WX' } })
    );
    engine.startNewGame(true);
    // Set the table: the dealer already holds an exposed Pung of 5T claimed earlier from bei.
    const dong = engine.getState().players.dong;
    const fives = dong.hand.filter((t) => tileToKey(t) === '5T');
    dong.hand = dong.hand.filter((t) => !fives.slice(0, 3).includes(t));
    dong.melds.push({ type: 'pung', tiles: fives.slice(0, 3), claimedFrom: 'bei' });

    const kakan = engine.getLegalActions('dong').kakanOptions[0]!;
    engine.declareKakan('dong', kakan.tile.id, kakan.meldIndex);
    expect(engine.getState().discardPending?.isPromotedKong).toBe(true);
    // Only Hu can intercept a promoted Kong.
    expect(engine.getLegalActions('nan').canPung).toBe(false);
    expect(engine.getLegalActions('nan').canDiscardWinHu).toBe(true);

    const nan = engine.getState().players.nan;
    const r = scoreHu(
      { hand: nan.hand, melds: nan.melds, flowers: nan.flowers, winningTile: kakan.tile },
      'nan',
      'dong',
      flags({ isSelfDraw: false, isRobbingKong: true, discarderSeat: 'dong' }),
      RULES,
      SUPERSEDE
    );
    expect(ids(r)).toContain(35);
    expect(r.isValidHu).toBe(true);

    engine.submitClaim({ seat: 'nan', action: 'hu' });
    const res = engine.resolveClaimWindow();
    expect(res.winnerSeat).toBe('nan');
    expect(engine.getState().winType).toBe('chiong_kong');
    // The robbed Pung stays a Pung.
    expect(engine.getState().players.dong.melds[0]!.type).toBe('pung');
  });

  it('unrobbed Kakan upgrades the Pung to Kong and gives a tail replacement', () => {
    const engine = new GameEngine(RULES, riggedWall({ hands: { dong: '5T 5T 5T 5T 1S 2S 3S 7S 8S 9S 4B 5B 6B DP' }, tail: 'WN' }));
    engine.startNewGame(true);
    const dong = engine.getState().players.dong;
    const fives = dong.hand.filter((t) => tileToKey(t) === '5T');
    dong.hand = dong.hand.filter((t) => !fives.slice(0, 3).includes(t));
    dong.melds.push({ type: 'pung', tiles: fives.slice(0, 3), claimedFrom: 'bei' });
    const kakan = engine.getLegalActions('dong').kakanOptions[0]!;
    engine.declareKakan('dong', kakan.tile.id, kakan.meldIndex);
    const res = engine.resolveClaimWindow();
    expect(res.nextTurn).toBe('dong');
    expect(engine.getState().players.dong.melds[0]!.type).toBe('kong');
    expect(engine.getState().players.dong.melds[0]!.tiles).toHaveLength(4);
    expect(tileToKey(engine.getState().players.dong.hand.at(-1)!)).toBe('WN');
  });
});

// ============================================================================
// 5. Instant Hu: 7 Flowers & Shi Kim
// ============================================================================

function instantScore(engine: GameEngine, seat: Seat, rules: GameRules = RULES): ScoringResult {
  const s = engine.getState();
  const p = s.players[seat];
  const winningTile = p.hand[p.hand.length - 1]!;
  const ctx = { ...buildWinContext(seat, s.roundWind, winningTile, flags()), isInstantHu: true };
  return getScoringEngine(SUPERSEDE).evaluateHand(p.hand.slice(0, -1), [...p.melds], [...p.flowers], ctx, rules);
}

describe('Tier 4 · Instant Hu matches', () => {
  it('7 Flowers: dealt 7 bonus tiles are replaced from the tail and allow an immediate 10-Tay Hu', () => {
    const engine = new GameEngine(
      RULES,
      riggedWall({ hands: { dong: 'F1 F2 F3 F4 M1 M2 M3 1T 5T 9T 2S 6S 1B WD' }, tail: '4B WN DZ DF DP 3S 8B' })
    );
    const records = engine.startNewGame(true);
    expect(records.find((r) => r.seat === 'dong')!.flowers).toHaveLength(7);
    const dong = engine.getState().players.dong;
    expect(dong.flowers).toHaveLength(7);
    expect(dong.hand).toHaveLength(14);
    expect(dong.hand.some(isBonus)).toBe(false);
    const r = instantScore(engine, 'dong');
    expect(r.isInstantHu).toBe(true);
    expect(r.isValidHu).toBe(true);
    expect(ids(r)).toContain(6);
    expect(r.patterns.find((p) => p.id === 6)!.tay).toBe(10);
  });

  it('Shi Kim: four Kims dealt allow an immediate 10-Tay Hu (K mode)', () => {
    const engine = new GameEngine(RULES, riggedWall({ hands: { dong: 'KIM KIM KIM KIM 1T 5T 9T 2S 6S WD WN DZ DF 3B' } }));
    engine.startNewGame(true);
    const r = instantScore(engine, 'dong');
    expect(r.mode).toBe('K');
    expect(r.isInstantHu).toBe(true);
    expect(r.isValidHu).toBe(true);
    expect(ids(r)).toContain(9);
    // Tournament: none of the four Kims may be discarded.
    const legal = engine.getLegalActions('dong');
    for (const t of engine.getState().players.dong.hand.filter(isKim)) expect(legal.discardableTileIds).not.toContain(t.id);
  });

  it('instant Hu without a trigger is rejected (Lew Fit)', () => {
    const engine = new GameEngine(RULES, riggedWall({ hands: { dong: '1T 5T 9T 2S 6S 1B 4B WD WN DZ DF DP 3S 8B' } }));
    engine.startNewGame(true);
    const r = instantScore(engine, 'dong');
    expect(r.isValidHu).toBe(false);
    expect(r.lewFitReason).toBe('instant-invalid');
  });
});

// ============================================================================
// 6. Wall exhaustion (Seri)
// ============================================================================

/** AI that never wins or claims, so the wall runs out. */
const stallingStrategy: AIStrategy = {
  decideTurnAction: (obs, rng) => ({ type: 'discard', tileId: chooseDiscard(obs, rng) ?? obs.legal.discardableTileIds[0]! }),
  decideClaim: (obs) => ({ seat: obs.seat, action: 'pass' }),
};

describe('Tier 4 · Wall exhaustion draw games', () => {
  it('a table where nobody wins ends in Seri with an empty wall and a draw record', () => {
    const storage = new MemoryStorage();
    for (let seed = 1; seed <= 3; seed++) {
      const c = new GameController({ settings: TOURNAMENT(), seed, strategy: stallingStrategy, storage, now: fakeClock(1000) });
      playMatch(c, { takeHu: false, checkEvery: seed === 1 });
      expect(c.outcome!.kind).toBe('seri');
      expect(c.getState().phase).toBe('DRAW_SERI');
      expect(c.getState().wall.remainingCount).toBe(0);
      expect(c.log.at(-1)!.text).toMatch(/Seri/);
    }
    const history = loadGameHistory(storage);
    expect(history).toHaveLength(3);
    for (const rec of history) {
      expect(rec).toMatchObject({ winner: null, winningTile: null, winMethod: 'draw', totalTay: 0, isWithKim: false });
      expect(rec.durationSeconds).toBeGreaterThan(0);
    }
    expect(computeHistoryStats(history).draws).toBe(3);
  });

  it('every non-flower tile is drawn: discards + hands + melds account for the whole wall', () => {
    const c = new GameController({ settings: TOURNAMENT(), seed: 12, strategy: stallingStrategy, saveHistory: false });
    playMatch(c, { takeHu: false });
    const s = c.getState();
    const flowers = SEAT_ORDER.reduce((n, seat) => n + s.players[seat].flowers.length, 0);
    expect(flowers).toBe(8);
    expect(totalTiles(c)).toBe(148);
  });

  it('an unreachable minimum Tay leaves the AI table without a Hu', () => {
    const c = new GameController({ settings: TOURNAMENT({ minHuTay: 100 }), seed: 3, saveHistory: false });
    playMatch(c, { takeHu: true });
    // With an unreachable minimum nobody may Hu (instant/limit hands aside), so the hand is a draw.
    const o = c.outcome!;
    if (o.kind === 'hu') expect(o.scoring.totalTay).toBeGreaterThanOrEqual(100);
    else expect(o.kind).toBe('seri');
  });
});

// ============================================================================
// 7. Settings preset transitions
// ============================================================================

describe('Tier 4 · Tournament ↔ Casual transitions', () => {
  it('presets persist, are detected, and keep presentation preferences', () => {
    const storage = new MemoryStorage();
    expect(detectPreset(loadSettings(storage))).toBe('tournament');
    applyPreset('tournament', storage);
    const casual = applyPreset('casual', storage);
    expect(detectPreset(casual)).toBe('casual');
    expect(toGameRules(casual).allowKimInMeldClaim).toBe(true);
    // Change a preference, switch back: preference survives, rules revert.
    storage.setItem('itm.settings.v1', JSON.stringify({ ...casual, aiDifficulty: 'hard', soundEnabled: false }));
    const back = applyPreset('tournament', storage);
    expect(detectPreset(back)).toBe('tournament');
    expect(back.aiDifficulty).toBe('hard');
    expect(back.soundEnabled).toBe(false);
    expect(toGameRules(back)).toEqual(toGameRules(getPreset('tournament')));
    expect(loadSettings(storage)).toEqual(back);
  });

  it('switching preset mid-match changes rules only from the next hand; AI difficulty applies at once', () => {
    const c = new GameController({ settings: TOURNAMENT({ aiDifficulty: 'easy' }), seed: 21, saveHistory: false });
    for (let i = 0; i < 20 && !c.outcome; i++) c.isWaitingForHuman() ? autoplayHuman(c) : c.step();
    c.setSettings(CASUAL({ aiDifficulty: 'hard', minHuTay: 8 }));
    expect(c.getState().rules.allowKimInMeldClaim).toBe(false);
    expect(c.getSettings().minHuTay).toBe(5);
    expect(c.getSettings().aiDifficulty).toBe('hard');
    playMatch(c);
    c.newGame();
    expect(c.getState().rules.allowKimInMeldClaim).toBe(true);
    expect(c.getSettings().minHuTay).toBe(8);
    playMatch(c);
    const o = c.outcome!;
    if (o.kind === 'hu') expect(o.scoring.totalTay).toBeGreaterThanOrEqual(8);
  });

  // nan holds KIM + 5T; dong discards 5T.
  const KIM_CLAIM_HANDS = { dong: '5T 1S 2S 3S 4S 5S 6S 7S 8S 9S 1B 2B 3B WD', nan: 'KIM 5T 1T 1T 9B 9B 9B WX WX WX DZ DZ DF' };
  function afterDiscardOf5T(rules: GameRules): GameEngine {
    const engine = new GameEngine(rules, riggedWall({ hands: KIM_CLAIM_HANDS }));
    engine.startNewGame(true);
    engine.discard('dong', engine.getState().players.dong.hand.find((t) => tileToKey(t) === '5T')!.id);
    return engine;
  }

  it('Kim meld-claim toggle reaches the engine; tournament never offers a Kim-assisted claim', () => {
    const tournament = afterDiscardOf5T(toGameRules({ ...getPreset('tournament'), kimMode: 'dedicated' }));
    expect(tournament.getState().rules.allowKimInMeldClaim).toBe(false);
    expect(tournament.getLegalActions('nan').canPung).toBe(false);
    expect(() => tournament.submitClaim({ seat: 'nan', action: 'pung' })).toThrow();
    const casual = afterDiscardOf5T(toGameRules({ ...getPreset('casual'), kimMode: 'dedicated' }));
    expect(casual.getState().rules.allowKimInMeldClaim).toBe(true);
  });

  it('casual: KIM + 5T is offered a Pung on a discarded 5T and the claim resolves into a Kim Pung', () => {
    const engine = afterDiscardOf5T(toGameRules({ ...getPreset('casual'), kimMode: 'dedicated' }));
    const legal = engine.getLegalActions('nan');
    expect(legal.canPung).toBe(true);
    expect(legal.pungTiles!.some(isKim)).toBe(true);
    expect(tileToKey(legal.pungTiles![0]!)).toBe('5T'); // natural copies are used before Kim
    engine.submitClaim({ seat: 'nan', action: 'pung' });
    const res = engine.resolveClaimWindow();
    expect(res.winningAction).toBe('pung');
    const meld = engine.getState().players.nan.melds[0]!;
    expect(meld.type).toBe('pung');
    expect(meld.tiles.map(tileToKey).sort()).toEqual(['5T', '5T', 'KIM']);
    expect(engine.getState().players.nan.hand.some(isKim)).toBe(false);
    expect(engine.getState().currentTurn).toBe('nan');
  });

  it('casual: one Kim fills the gap of a Jia from the left seat', () => {
    const hands = { dong: '5T 1S 2S 3S 4S 5S 6S 7S 8S 9S 1B 2B 3B WD', nan: 'KIM 7T 1S 1S 9B 9B 9B WX WX WX DZ DZ DF' };
    const engine = new GameEngine(toGameRules({ ...getPreset('casual'), kimMode: 'dedicated' }), riggedWall({ hands }));
    engine.startNewGame(true);
    engine.discard('dong', engine.getState().players.dong.hand.find((t) => tileToKey(t) === '5T')!.id);
    const legal = engine.getLegalActions('nan');
    expect(legal.canJia).toBe(true);
    const option = legal.jiaOptions.find((o) => o.some(isKim))!;
    expect(option.map(tileToKey).sort()).toEqual(['7T', 'KIM']);
    engine.submitClaim({ seat: 'nan', action: 'jia', meldTiles: option });
    expect(engine.resolveClaimWindow().winningAction).toBe('jia');
    expect(engine.getState().players.nan.melds[0]!.tiles.map(tileToKey).sort()).toEqual(['5T', '7T', 'KIM']);
    // The non-adjacent seat may not Jia, Kim or not.
    expect(engine.getLegalActions('xi').canJia).toBe(false);
  });

  it('casual: 5T + two Kims may Kong a discarded 5T and draw a tail replacement', () => {
    const hands = { dong: '5T 1S 2S 3S 4S 5S 6S 7S 8S 9S 1B 2B 3B WD', xi: 'KIM KIM 5T 1S 1S 9B 9B 9B WX WX WX DZ DF' };
    const engine = new GameEngine(toGameRules({ ...getPreset('casual'), kimMode: 'dedicated' }), riggedWall({ hands, tail: 'WN' }));
    engine.startNewGame(true);
    engine.discard('dong', engine.getState().players.dong.hand.find((t) => tileToKey(t) === '5T')!.id);
    const legal = engine.getLegalActions('xi');
    expect(legal.canKong).toBe(true);
    expect(legal.kongTiles!.filter(isKim)).toHaveLength(2);
    engine.submitClaim({ seat: 'xi', action: 'kong' });
    expect(engine.resolveClaimWindow().winningAction).toBe('kong');
    const xi = engine.getState().players.xi;
    expect(xi.melds[0]!.tiles).toHaveLength(4);
    expect(tileToKey(xi.hand.at(-1)!)).toBe('WN');
  });

  it('tournament rejects an explicit Kim-assisted Jia or Pung (Lew Fit rule)', () => {
    const engine = afterDiscardOf5T(toGameRules({ ...getPreset('tournament'), kimMode: 'dedicated' }));
    const nan = engine.getState().players.nan.hand;
    const kim = nan.find(isKim)!;
    const five = nan.find((t) => tileToKey(t) === '5T')!;
    expect(engine.getLegalActions('nan').jiaOptions.some((o) => o.some(isKim))).toBe(false);
    expect(() => engine.submitClaim({ seat: 'nan', action: 'pung', meldTiles: [five, kim] })).toThrow(/Kim/);
  });
});

describe('Tier 4 · First go-around window (Thien Fu / Thi Fu)', () => {
  it('stays open through the first discard of every seat and closes after the fourth or on any meld', () => {
    const engine = new GameEngine(RULES, new Wall(undefined, 2024));
    engine.startNewGame(true);
    const s = engine.getState();
    expect(isFirstGoAround(s)).toBe(true);
    const order: Seat[] = ['dong', 'nan', 'xi', 'bei'];
    for (let i = 0; i < 4; i++) {
      const seat = order[i]!;
      expect(s.currentTurn).toBe(seat);
      const tile = s.players[seat].hand.filter((t) => !isKim(t)).at(-1)!;
      engine.discard(seat, tile.id);
      // A Ron on this first-round discard would still be in the window.
      expect(isFirstGoAround(s)).toBe(true);
      engine.resolveClaimWindow();
      if (i < 3) expect(isFirstGoAround(s), `after ${seat}'s first discard`).toBe(true);
      if (s.phase !== 'ACTION_DECISION') break;
    }
    expect(isFirstGoAround(s)).toBe(false);
  });

  it('closes as soon as anyone melds', () => {
    const engine = new GameEngine(RULES, riggedWall({ hands: { dong: WIN14 } }));
    engine.startNewGame(true);
    const s = engine.getState();
    s.players.xi.melds.push({ type: 'pung', tiles: [keyToTile('DZ', 1), keyToTile('DZ', 2), keyToTile('DZ', 3)], claimedFrom: 'dong' });
    expect(isFirstGoAround(s)).toBe(false);
  });

  it('a non-dealer Pao Chin + first-draw Hu scores Thi Fu from live table state', () => {
    const engine = new GameEngine(
      RULES,
      riggedWall({ hands: { dong: '1S 1S 1S 9S 9S 9S 7B 7B 7B DZ DZ DF DF WB', nan: '1T 2T 3T 4T 5T 6T 7T 8T 9T 2S 3S 4S 5B' }, draws: '5B' })
    );
    engine.startNewGame(true);
    engine.discard('dong', engine.getState().players.dong.hand.find((t) => tileToKey(t) === 'WB')!.id);
    engine.resolveClaimWindow();
    engine.declarePaoChin('nan');
    const r = scoreSelfDraw(engine, 'nan', flags({ isFirstGoAround: isFirstGoAround(engine.getState()), isPaoChin: true }));
    expect(isFirstGoAround(engine.getState())).toBe(true);
    expect(ids(r)).not.toContain(10);
    expect(ids(r)).toContain(12); // First wall draw after Pao Chin
  });
});

// ============================================================================
// 8. MatchHistoryRecord persistence
// ============================================================================

describe('Tier 4 · Match history persistence', () => {
  it('records written by real matches round-trip through serialized storage', () => {
    const storage = new MemoryStorage();
    const outcomes = [];
    for (let seed = 1; seed <= 6; seed++) {
      const c = new GameController({ settings: TOURNAMENT({ aiDifficulty: 'hard' }), seed: 300 + seed, storage, now: fakeClock(2000) });
      playMatch(c);
      outcomes.push(c.outcome!);
    }
    const history = loadGameHistory(storage);
    expect(history).toHaveLength(6);
    // Newest first, unique ids.
    for (let i = 1; i < history.length; i++) expect(history[i - 1]!.timestamp).toBeGreaterThanOrEqual(history[i]!.timestamp);
    expect(new Set(history.map((h) => h.id)).size).toBe(6);

    for (const rec of history) {
      if (rec.winner === null) continue;
      expect(rec.totalTay).toBe(rec.scoringBreakdown.reduce((s, b) => s + b.tay, 0));
      expect(rec.totalTay).toBeGreaterThanOrEqual(5);
      expect(rec.winningHand.some((t) => t.id === rec.winningTile!.id)).toBe(true);
      expect(['tsumo', 'ron', 'chiong_kong']).toContain(rec.winMethod);
    }
    const huCount = outcomes.filter((o) => o.kind === 'hu').length;
    expect(history.filter((h) => h.winner !== null)).toHaveLength(huCount);

    // Copy the raw payload into a fresh backend (e.g. a reload in another tab).
    const reloaded = new MemoryStorage();
    reloaded.setItem(HISTORY_STORAGE_KEY, storage.getItem(HISTORY_STORAGE_KEY)!);
    expect(loadGameHistory(reloaded)).toEqual(history);
  });

  it('corrupted entries are skipped while valid ones survive', () => {
    const storage = new MemoryStorage();
    const ok = saveGameRecord(
      { winner: 'xi', winningHand: [keyToTile('1T')], winningTile: keyToTile('1T'), scoringBreakdown: [{ id: 18, name: 'It Set', tay: 30 }], totalTay: 30, isWithKim: false, winMethod: 'tsumo', durationSeconds: 60 },
      storage
    )!;
    const raw = JSON.parse(storage.getItem(HISTORY_STORAGE_KEY)!) as unknown[];
    storage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify([...raw, { id: 'bad' }, 42, null, { ...ok, id: 'x1', winner: 'centre' }, { ...ok, id: 'x2', timestamp: ok.timestamp - 1, winMethod: 'teleport' }])
    );
    const history = loadGameHistory(storage);
    // Unrecoverable records are dropped; a recoverable one is repaired (unknown win method → 'ron').
    expect(history.map((h) => h.id)).toEqual([ok.id, 'x2']);
    expect(history[1]!.winMethod).toBe('ron');
  });

  it('history survives a completely unreadable payload by starting empty', () => {
    const storage = new MemoryStorage();
    storage.setItem(HISTORY_STORAGE_KEY, '{not json');
    expect(loadGameHistory(storage)).toEqual([]);
    const c = new GameController({ settings: TOURNAMENT(), seed: 8, storage });
    playMatch(c);
    expect(loadGameHistory(storage)).toHaveLength(1);
  });
});
