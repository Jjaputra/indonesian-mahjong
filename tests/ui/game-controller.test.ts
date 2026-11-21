import { describe, it, expect, vi } from 'vitest';
import { SEAT_ORDER } from '@/core/tiles';
import { isKim } from '@/kim/wildcard-solver';
import { MemoryStorage, getPreset, loadGameHistory, type AIDifficulty, type GameSettings } from '@/storage';
import { GameController } from '@/ui/game-controller';

function settings(patch: Partial<GameSettings> = {}): GameSettings {
  return { ...getPreset('tournament'), soundEnabled: false, ...patch };
}

/** Plays the human seat with a trivial policy: Hu when legal, otherwise pass / discard the newest tile. */
function autoplayHuman(c: GameController): void {
  const a = c.getHumanActions();
  if (a.canReplaceFlowers) return c.humanReplaceFlowers();
  if (a.claim) return c.humanClaim(a.claim.canHu ? 'hu' : 'pass');
  if (a.canDraw) return c.humanDraw();
  if (a.canSelfDrawHu) return c.humanSelfDrawHu();
  if (a.canDiscard) {
    const hand = c.getState().players[c.humanSeat].hand;
    const tile = [...hand].reverse().find((t) => a.discardableTileIds.includes(t.id))!;
    return c.humanDiscard(tile.id);
  }
  throw new Error(`human stuck in phase ${c.getState().phase}`);
}

function playToEnd(c: GameController, limit = 5000): number {
  let guard = 0;
  while (!c.outcome && guard++ < limit) {
    c.runUntilHuman();
    if (c.outcome) break;
    if (c.isWaitingForHuman()) autoplayHuman(c);
    else if (!c.step()) throw new Error(`stalled in phase ${c.getState().phase}`);
  }
  return guard;
}

describe('GameController full-game loop', () => {
  for (const difficulty of ['easy', 'normal', 'hard'] as AIDifficulty[]) {
    it(`plays seeded games to completion with ${difficulty} AI and records history`, () => {
      const storage = new MemoryStorage();
      for (let seed = 1; seed <= 4; seed++) {
        const c = new GameController({ discardRevealMs: 0, settings: settings({ aiDifficulty: difficulty }), seed: seed * 101, storage });
        playToEnd(c);
        const outcome = c.outcome!;
        expect(outcome).not.toBeNull();
        if (outcome.kind === 'hu') {
          // Every recorded Hu passed the 44-Tay gate: no Lew Fit can be committed by the table.
          expect(outcome.scoring.isValidHu).toBe(true);
          expect(outcome.scoring.totalTay).toBeGreaterThanOrEqual(5);
        }
      }
      expect(loadGameHistory(storage)).toHaveLength(4);
    });
  }

  it('tile conservation: 148 tiles are always accounted for', () => {
    const c = new GameController({ discardRevealMs: 0, settings: settings({ kimMode: 'dedicated' }), seed: 7, saveHistory: false });
    let checks = 0;
    while (!c.outcome && checks < 3000) {
      const s = c.getState();
      let total = s.wall.remainingCount + (s.discardPending ? 1 : 0);
      for (const seat of SEAT_ORDER) {
        const p = s.players[seat];
        total += p.hand.length + p.flowers.length + p.discards.length + p.melds.reduce((n, m) => n + m.tiles.length, 0);
      }
      expect(total).toBe(148);
      if (c.isWaitingForHuman()) autoplayHuman(c);
      else c.step();
      checks++;
    }
  });

  it('never discards Kim when Kim discard is disallowed', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const c = new GameController({ discardRevealMs: 0, settings: settings({ aiDifficulty: 'hard' }), seed, saveHistory: false });
      playToEnd(c);
      const s = c.getState();
      for (const seat of SEAT_ORDER) expect(s.players[seat].discards.some(isKim)).toBe(false);
      expect(c.discardTrail.some((d) => isKim(d.tile))).toBe(false);
    }
  });

  it('waits for the dealer human before any AI moves and exposes only legal discards', () => {
    const c = new GameController({ discardRevealMs: 0, settings: settings({ startingSeatWind: 'dong' }), seed: 42, saveHistory: false });
    expect(c.isWaitingForHuman()).toBe(true);
    expect(c.step()).toBe(false);
    const a = c.getHumanActions();
    expect(a.canDiscard).toBe(true);
    const hand = c.getState().players.dong.hand;
    for (const id of a.discardableTileIds) expect(isKim(hand.find((t) => t.id === id)!)).toBe(false);
    expect(a.claim).toBeNull();
    expect(a.canDraw).toBe(false);
  });

  it('manual flower replacement waits for the human button', () => {
    const c = new GameController({ discardRevealMs: 0, settings: settings({ flowerReplacementMode: 'manual' }), seed: 3, saveHistory: false });
    expect(c.getState().phase).toBe('FLOWER_REPLACEMENT');
    expect(c.getHumanActions().canReplaceFlowers).toBe(true);
    expect(c.step()).toBe(false);
    c.humanReplaceFlowers();
    expect(c.getState().phase).not.toBe('FLOWER_REPLACEMENT');
    for (const seat of SEAT_ORDER) {
      expect(c.getState().players[seat].hand.some((t) => t.type === 'flower' || t.type === 'season')).toBe(false);
    }
  });

  it('persists flowers and melds separately from the concealed hand', () => {
    const storage = new MemoryStorage();
    let found = false;
    for (let seed = 1; seed <= 12 && !found; seed++) {
      const c = new GameController({ discardRevealMs: 0, settings: settings(), seed, storage });
      playToEnd(c);
      const outcome = c.outcome;
      const saved = loadGameHistory(storage)[0]!;
      if (outcome?.kind !== 'hu') {
        expect(saved.winner).toBeNull();
        expect(saved.flowers).toEqual([]);
        expect(saved.melds).toEqual([]);
        continue;
      }
      expect(saved.winningHand.map((t) => t.id)).toEqual(outcome.hand.map((t) => t.id));
      expect(saved.flowers.map((t) => t.id)).toEqual(outcome.flowers.map((t) => t.id));
      expect(saved.melds.map((m) => ({ type: m.type, ids: m.tiles.map((t) => t.id) }))).toEqual(
        outcome.melds.map((m) => ({ type: m.type, ids: m.tiles.map((t) => t.id) })),
      );
      const meldIds = new Set(saved.melds.flatMap((m) => m.tiles.map((t) => t.id)));
      expect(saved.winningHand.some((t) => meldIds.has(t.id))).toBe(false);
      if (saved.flowers.length > 0 || saved.melds.length > 0) found = true;
    }
    expect(found).toBe(true);
  });

  it('ignores illegal human actions', () => {
    const c = new GameController({ discardRevealMs: 0, settings: settings({ startingSeatWind: 'nan' }), seed: 5, saveHistory: false });
    const before = c.version;
    c.humanDiscard('tong-1-1');
    c.humanClaim('pung');
    c.humanSelfDrawHu();
    expect(c.version).toBe(before);
  });
});

describe('practice automation boundaries and public activity', () => {
  it('single automation steps stop at every human choice and reset public progress for a new game', () => {
    const c = new GameController({ discardRevealMs: 0, settings: settings(), seed: 42, saveHistory: false });
    expect(c.discardCount).toBe(0);
    expect(c.initialWallCount).toBe(c.getState().wall.remainingCount);
    let automated = 0;
    for (let n = 0; n < 160 && !c.outcome; n++) {
      if (c.isWaitingForHuman()) {
        const before = c.version;
        expect(c.step()).toBe(false);
        expect(c.version).toBe(before);
        autoplayHuman(c);
      } else {
        expect(c.step()).toBe(true);
        automated++;
      }
    }
    expect(automated).toBeGreaterThan(0);
    expect(c.discardCount).toBeGreaterThan(0);
    expect(c.log.some(l => l.text.includes('tarik satu tile'))).toBe(true);
    expect(c.botExplanation).toMatch(/^Bot (Kanan|Seberang|Kiri)/);
    c.newGame();
    expect(c.discardCount).toBe(0);
    expect(c.botExplanation).toBeNull();
    expect(c.lastDiscard).toBeNull();
    expect(c.discardTrail).toEqual([]);
  });
  it('latest-discard highlight ends on the next emitted game event', () => {
    const c = new GameController({ discardRevealMs: 0, settings: settings(), seed: 10, saveHistory: false });
    const a = c.getHumanActions();
    c.humanDiscard(a.discardableTileIds[0]!);
    expect(c.lastDiscard).not.toBeNull();
    const discarded = c.lastDiscard!.tile.id;
    let nextEvent = false;
    const stop = c.onEvent(e => {
      if (e.type !== 'discard') {
        expect(c.lastDiscard).toBeNull();
        nextEvent = true;
      }
    });
    for (let n = 0; n < 30 && !nextEvent; n++) {
      if (c.isWaitingForHuman()) autoplayHuman(c);
      else c.step();
    }
    stop();
    expect(nextEvent).toBe(true);
    expect(c.discardTrail.some(d => d.tile.id === discarded) || c.getState().players.dong.discards.some(t => t.id === discarded)).toBe(true);
  });
});


it.each(['discard', 'kakan'] as const)('keeps an unclaimable %s visible for one second even at zero practice delay', async kind => {
  vi.useFakeTimers();
  try {
    const { scheduleAutomation } = await import('@/ui/practice-pace');
    const c = new GameController({ settings: settings({ animationSpeed: 'off' }), seed: 42, saveHistory: false });
    const s = c.getState();
    s.players.dong.hand[13] = { type: 'tong', value: 3, id: 'reveal' };
    for (const seat of ['nan', 'xi', 'bei'] as const) s.players[seat].hand = Array.from({ length: 13 }, (_, i) => ({ type: 'sok', value: i % 9 + 1, id: `${seat}-${i}` }));
    if (kind === 'kakan') {
      s.players.dong.melds = [{ type: 'pung', tiles: [0, 1, 2].map(i => ({ type: 'tong', value: 3, id: `meld-${i}` })), claimedFrom: 'nan' }];
      s.players.dong.hand.splice(0, 3);
      c.humanKakan(0);
    } else c.humanDiscard('reveal');
    const pending = s.discardPending;
    expect(pending).not.toBeNull();
    expect(c.getHumanActions().claim).toBeNull();
    expect(c.step()).toBe(true); // collect bot answers privately
    expect(c.step()).toBe(false);
    scheduleAutomation(c, 0, false);
    vi.advanceTimersByTime(999);
    expect(c.getState().discardPending).toEqual(pending);
    expect(c.getState().phase).toBe('CLAIM_WINDOW');
    vi.advanceTimersByTime(1);
    expect(c.getState().discardPending).toBeNull();
    expect(c.getState().phase).toBe('ACTION_DECISION');
  } finally { vi.useRealTimers(); }
});


it('offers the human their own claim immediately during the reveal', () => {
  let now = 1000;
  const c = new GameController({ settings: settings(), humanSeat: 'nan', seed: 42, now: () => now, saveHistory: false,
    strategy: { decideTurnAction: () => ({ type: 'discard', tileId: 'reveal' }), decideClaim: o => ({ seat: o.seat, action: 'pass' }) } });
  const s = c.getState();
  s.players.dong.hand[13] = { type: 'tong', value: 3, id: 'reveal' };
  s.players.nan.hand = Array.from({ length: 13 }, (_, i) => i < 2 ? { type: 'tong', value: 3, id: `pair-${i}` } : { type: 'sok', value: i % 9 + 1, id: `rest-${i}` });
  expect(c.step()).toBe(true);
  expect(c.getHumanActions().claim?.canPung).toBe(true);
  expect(c.isWaitingForHuman()).toBe(true);
  now += 200;
  c.humanClaim('pass');
  c.step();
  expect(c.step()).toBe(false);
  expect(c.getState().phase).toBe('CLAIM_WINDOW');
  now += 800;
  expect(c.step()).toBe(true);
  expect(c.getState().phase).toBe('ACTION_DECISION');
});

it('keeps bot answers, activity, events and view versions private until the reveal resolves', async () => {
  vi.useFakeTimers();
  try {
    const { scheduleAutomation } = await import('@/ui/practice-pace');
    const make = (claimable: boolean) => {
      const c = new GameController({ settings: settings(), seed: 42, saveHistory: false,
        strategy: { decideTurnAction: () => { throw new Error('Unexpected bot turn'); },
          decideClaim: o => claimable && o.seat === 'nan'
            ? { seat: o.seat, action: 'pung', meldTiles: o.hand.slice(0, 2) }
            : { seat: o.seat, action: 'pass' } } });
      const s = c.getState();
      s.players.dong.hand[13] = { type: 'tong', value: 3, id: 'reveal' };
      for (const seat of ['nan', 'xi', 'bei'] as const) s.players[seat].hand = Array.from({ length: 13 }, (_, i) => ({ type: 'sok', value: i % 9 + 1, id: `${seat}-${i}` }));
      if (claimable) s.players.nan.hand.splice(0, 2, ...[0, 1].map(i => ({ type: 'tong' as const, value: 3, id: `pair-${i}` })));
      c.humanDiscard('reveal');
      const events: unknown[] = [];
      c.onEvent(e => events.push(e));
      const updates = vi.fn(); c.subscribe(updates);
      return { c, events, updates };
    };
    const dead = make(false), live = make(true);
    const visible = (c: GameController) => ({ version: c.version, log: c.log, phase: c.getState().phase,
      pending: c.getState().discardPending, claims: c.getState().pendingClaims, actions: c.getHumanActions(),
      explanation: c.botExplanation, trail: c.discardTrail });
    const before = visible(dead.c);
    expect(visible(live.c)).toEqual(before);
    for (const { c } of [dead, live]) scheduleAutomation(c, 0, false);
    vi.advanceTimersByTime(0);
    const collected = visible(dead.c);
    expect(collected).toEqual({ ...before, version: before.version + 1 });
    expect(visible(live.c)).toEqual(collected);
    for (const { c, updates } of [dead, live]) {
      expect(updates).toHaveBeenCalledTimes(1);
      updates.mockClear();
      scheduleAutomation(c, 0, false);
    }
    vi.advanceTimersByTime(999);
    for (const { c, events, updates } of [dead, live]) {
      expect(c.step()).toBe(false);
      expect(visible(c)).toEqual(collected);
      expect(events).toEqual([]); expect(updates).not.toHaveBeenCalled();
    }
    vi.advanceTimersByTime(1);
    for (const { c, updates } of [dead, live]) {
      expect(c.getState().phase).toBe('ACTION_DECISION');
      expect(c.log.length).toBeGreaterThan(before.log.length);
      expect(updates).toHaveBeenCalledTimes(1);
    }
    expect(dead.c.getState().players.nan.melds).toHaveLength(0);
    expect(live.c.getState().players.nan.melds[0]?.type).toBe('pung');
  } finally { vi.useRealTimers(); }
});
