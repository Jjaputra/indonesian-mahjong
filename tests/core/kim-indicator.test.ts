import { describe, expect, it } from 'vitest';
import { createCompleteTileSet, SEAT_ORDER } from '@/core/tiles';
import type { TileFace } from '@/core/types';
import { createGameWall, kimIndicatorFor, Wall } from '@/core/wall';
import type { LegalActions } from '@/core/types';
import { GameEngine } from '@/core/game-engine';
import { buildObservation, visibleKindCounts } from '@/ui/ai-controller';
import { GameController } from '@/ui/game-controller';
import { getPreset } from '@/storage';
import { toFullRules } from '@/ui/win-context';

const faces: TileFace[] = [
  ...(['tong', 'sok', 'ban'] as const).flatMap(type => Array.from({ length: 9 }, (_, i) => ({ type, value: i + 1 }))),
  ...Array.from({ length: 4 }, (_, i) => ({ type: 'wind' as const, value: i + 1 })),
  ...Array.from({ length: 3 }, (_, i) => ({ type: 'dragon' as const, value: i + 1 })),
];

describe('natural Kim removed indicator', () => {
  it.each(faces)('maps $type $value to its preceding face, with wrap', face => {
    const max = face.type === 'wind' ? 4 : face.type === 'dragon' ? 3 : 9;
    expect(kimIndicatorFor(face)).toEqual({ type: face.type, value: (face.value + max - 2) % max + 1 });
  });

  it('conserves 143 + indicator and never deals or draws the removed physical copy', () => {
    for (let seed = 0; seed < 100; seed++) {
      const made = createGameWall('natural', seed);
      const inventory = made.wall.serialize().tiles;
      const removed = createCompleteTileSet().filter(t => t.type !== 'kim' && !inventory.some(x => x.id === t.id));
      expect(removed).toHaveLength(1);
      expect(removed[0]).toMatchObject(made.kimIndicator!);
      const e = new GameEngine({ kimEnabled: true, kimMode: 'natural' }, made.wall);
      e.startNewGame(true);
      const s = e.getState();
      expect(s.kimIndicator).toEqual(kimIndicatorFor(made.kimFace!));
      const dealt = SEAT_ORDER.flatMap(seat => [...s.players[seat].hand, ...s.players[seat].flowers]);
      expect(dealt).not.toContainEqual(removed[0]);
      expect(dealt.length + s.wall.remainingCount).toBe(143);
      const draws = [];
      while (!s.wall.isEmpty) draws.push(s.wall.drawHead()!);
      expect([...dealt, ...draws]).toHaveLength(143);
      expect([...dealt, ...draws].some(t => t.id === removed[0]!.id)).toBe(false);
    }
  });

  it('preserves seeded determinism and indicator metadata through clone and persistence', () => {
    const a = createGameWall('natural', 234);
    expect(a).toEqual(createGameWall('natural', 234));
    a.wall.reservedCount = 14;
    a.wall.dealInitialHands();
    expect(a.wall.remainingDrawable).toBe(143 - 53 - 14);
    for (const wall of [a.wall.clone(), Wall.deserialize(JSON.parse(JSON.stringify(a.wall.serialize())))]) {
      expect(wall.serialize()).toEqual(a.wall.serialize());
      let draws = 0;
      while (wall.drawTail()) draws++;
      expect(draws).toBe(76);
      expect(wall.remainingCount).toBe(14);
    }
    expect(createGameWall('off', 1).kimIndicator).toBeNull();
    expect(createGameWall('dedicated', 1).kimIndicator).toBeNull();
  });

  it('exposes the unavailable public copy to AI and human tile hints, without a discard', () => {
    const settings = { ...getPreset('tournament'), kimEnabled: true, kimMode: 'natural' as const };
    const c = new GameController({ settings, seed: 234, saveHistory: false });
    const s = c.getState();
    const indicator = { ...s.kimIndicator!, id: 'test-indicator' };
    const obs = buildObservation(s, c.humanSeat, {} as LegalActions, 'hard', toFullRules(settings), 'additive');
    const key = `${indicator.type}-${indicator.value}`;
    const withIndicator = visibleKindCounts(obs).get(key) ?? 0;
    const withoutIndicator = visibleKindCounts({ ...obs, kimIndicator: null }).get(key) ?? 0;
    expect(withIndicator).toBe(withoutIndicator + 1);
    expect(c.countVisible(indicator)).toBe(withIndicator);
    expect(SEAT_ORDER.flatMap(seat => s.players[seat].discards)).toHaveLength(0);
  });
});
