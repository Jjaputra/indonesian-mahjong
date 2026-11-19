import { sortTiles } from '../core/tiles';
import type { Tile } from '../core/types';

/**
 * Manual hand order (display only, ids): keep the previous order for tiles still in hand, drop the
 * ones that left, append new tiles at the right. A wholly new hand (next round) starts sorted.
 */
export function mergeHandOrder(prev: readonly string[], hand: readonly Tile[]): string[] {
  const ids = new Set(hand.map((t) => t.id));
  const kept = prev.filter((id) => ids.has(id));
  if (kept.length === 0) return sortTiles(hand).map((t) => t.id);
  const known = new Set(kept);
  return [...kept, ...hand.filter((t) => !known.has(t.id)).map((t) => t.id)];
}

/** The hand laid out in `order` (ids missing from it go last, in hand order). */
export function applyHandOrder(order: readonly string[], hand: readonly Tile[]): Tile[] {
  const byId = new Map(hand.map((t) => [t.id, t]));
  const placed = order.flatMap((id) => byId.get(id) ?? []);
  const seen = new Set(placed.map((t) => t.id));
  return [...placed, ...hand.filter((t) => !seen.has(t.id))];
}

/** Move `id` so it sits at `index` of the list (clamped). */
export function moveInOrder(order: readonly string[], id: string, index: number): string[] {
  const rest = order.filter((x) => x !== id);
  rest.splice(Math.max(0, Math.min(rest.length, index)), 0, id);
  return rest;
}

export interface HandMark { key: number; trail: number }

/** A new hand began: the match hand count changed, or the discard pool emptied (tile ids repeat across hands). */
export function isNewHand(prev: HandMark, now: HandMark): boolean {
  return prev.key !== now.key || now.trail < prev.trail;
}
