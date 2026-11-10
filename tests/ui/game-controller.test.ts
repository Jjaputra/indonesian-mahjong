import { describe, it, expect } from 'vitest';
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
        const c = new GameController({ settings: settings({ aiDifficulty: difficulty }), seed: seed * 101, storage });
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
    const c = new GameController({ settings: settings(), seed: 7, saveHistory: false });
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
      const c = new GameController({ settings: settings({ aiDifficulty: 'hard' }), seed, saveHistory: false });
      playToEnd(c);
      const s = c.getState();
      for (const seat of SEAT_ORDER) expect(s.players[seat].discards.some(isKim)).toBe(false);
      expect(c.discardTrail.some((d) => isKim(d.tile))).toBe(false);
    }
  });

  it('waits for the dealer human before any AI moves and exposes only legal discards', () => {
    const c = new GameController({ settings: settings({ startingSeatWind: 'dong' }), seed: 42, saveHistory: false });
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
    const c = new GameController({ settings: settings({ flowerReplacementMode: 'manual' }), seed: 3, saveHistory: false });
    expect(c.getState().phase).toBe('FLOWER_REPLACEMENT');
    expect(c.getHumanActions().canReplaceFlowers).toBe(true);
    expect(c.step()).toBe(false);
    c.humanReplaceFlowers();
    expect(c.getState().phase).not.toBe('FLOWER_REPLACEMENT');
    for (const seat of SEAT_ORDER) {
      expect(c.getState().players[seat].hand.some((t) => t.type === 'flower' || t.type === 'season')).toBe(false);
    }
  });

  it('ignores illegal human actions', () => {
    const c = new GameController({ settings: settings({ startingSeatWind: 'nan' }), seed: 5, saveHistory: false });
    const before = c.version;
    c.humanDiscard('tong-1-1');
    c.humanClaim('pung');
    c.humanSelfDrawHu();
    expect(c.version).toBe(before);
  });
});
