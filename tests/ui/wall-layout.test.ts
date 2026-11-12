import { describe, expect, it } from 'vitest';
import { wallLayout, type WallSide } from '@/ui/wall-layout';

const tiles = (layout: ReturnType<typeof wallLayout>, side: WallSide) => layout[side].map((s) => s.tiles);
/** Slots of a side in clockwise order (the order normal draws visit them). */
const clockwise = (layout: ReturnType<typeof wallLayout>, side: WallSide) => [...layout[side]].sort((a, b) => a.order - b.order);

describe('wall stack layout', () => {
  it('splits a full 148-tile wall into 74 two-high stacks, 19/19/18/18 from the break side', () => {
    const layout = wallLayout({ initialCount: 148, headIndex: 0, tailIndex: 147, breakSide: 'bottom' });
    expect(layout.bottom).toHaveLength(19);
    expect(layout.left).toHaveLength(19);
    expect(layout.top).toHaveLength(18);
    expect(layout.right).toHaveLength(18);
    for (const side of ['bottom', 'left', 'top', 'right'] as const) expect(tiles(layout, side).every((t) => t === 2)).toBe(true);
  });

  it('head draws empty the break side first, clockwise, one tile at a time', () => {
    // 3 head draws: stack 0 empty, stack 1 has its bottom tile left.
    const layout = wallLayout({ initialCount: 144, headIndex: 3, tailIndex: 143, breakSide: 'bottom' });
    const order = clockwise(layout, 'bottom');
    expect(order[0]).toEqual({ order: 0, tiles: 0 });
    expect(order[1]).toEqual({ order: 1, tiles: 1 });
    expect(order[2]!.tiles).toBe(2);
    // On the bottom side clockwise runs right→left, so the break is the rightmost screen slot.
    expect(layout.bottom.at(-1)).toEqual({ order: 0, tiles: 0 });
    expect(layout.bottom.at(-2)).toEqual({ order: 1, tiles: 1 });
  });

  it('the 53-tile deal clears the dealer side and moves on to the next side clockwise', () => {
    const layout = wallLayout({ initialCount: 144, headIndex: 53, tailIndex: 143, breakSide: 'top' });
    expect(tiles(layout, 'top').every((t) => t === 0)).toBe(true); // 18 stacks = 36 tiles
    const right = clockwise(layout, 'right'); // top → right is the next side clockwise
    expect(right.slice(0, 8).every((s) => s.tiles === 0)).toBe(true); // tiles 36–51
    expect(right[8]!.tiles).toBe(1); // tile 52 taken, 53 standing
    expect(right[9]!.tiles).toBe(2);
    expect(tiles(layout, 'bottom').every((t) => t === 2)).toBe(true);
    // Top runs left→right on screen, right runs top→bottom.
    expect(layout.top[0]!.order).toBe(0);
    expect(layout.right[0]!.order).toBe(18);
  });

  it('tail (replacement) draws eat the other end: the last stack before the break', () => {
    const layout = wallLayout({ initialCount: 144, headIndex: 0, tailIndex: 140, breakSide: 'bottom' });
    // 3 tail draws take tiles 143, 142, 141: the last stack (71) is empty, stack 70 keeps one tile.
    const right = clockwise(layout, 'right'); // bottom → left → top → right: right is the last side
    expect(right.at(-1)).toEqual({ order: 71, tiles: 0 });
    expect(right.at(-2)).toEqual({ order: 70, tiles: 1 });
    expect(tiles(layout, 'bottom').every((t) => t === 2)).toBe(true);
    // The tail end sits next to the break, at the bottom of the right side on screen.
    expect(layout.right.at(-1)).toEqual({ order: 71, tiles: 0 });
  });

  it('an exhausted wall leaves every slot empty but keeps the positions', () => {
    const layout = wallLayout({ initialCount: 144, headIndex: 100, tailIndex: 99, breakSide: 'left' });
    for (const side of ['bottom', 'left', 'top', 'right'] as const) {
      expect(layout[side]).toHaveLength(18);
      expect(tiles(layout, side).every((t) => t === 0)).toBe(true);
    }
  });
});
