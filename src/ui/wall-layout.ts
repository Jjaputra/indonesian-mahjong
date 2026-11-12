/** Table side as seen from the human seat at the bottom of the screen. */
export type WallSide = 'bottom' | 'right' | 'top' | 'left';

/** Sides in clockwise order as seen from above (the human sits at the bottom). */
const CLOCKWISE: readonly WallSide[] = ['bottom', 'left', 'top', 'right'];

/**
 * Within each side, clockwise travel runs right→left along the bottom, up the left, left→right
 * along the top and down the right; screen order (left→right, top→bottom) is reversed for the first two.
 */
const SCREEN_REVERSED: Record<WallSide, boolean> = { bottom: true, left: true, top: false, right: false };

export interface WallLayoutInput {
  initialCount: number;
  /** Next tile index a normal draw takes (Wall.drawHead) */
  headIndex: number;
  /** Next tile index a replacement draw takes (Wall.drawTail) */
  tailIndex: number;
  /** The dealer's side: the break sits at its right-hand corner, from the dealer's point of view. */
  breakSide: WallSide;
}

export interface WallStackSlot {
  /** Position from the break, clockwise: 0 is the first stack a normal draw takes. */
  order: number;
  /** Tiles still standing: 2 = full stack, 1 = top tile taken, 0 = empty slot. */
  tiles: 0 | 1 | 2;
}

/**
 * Lays the wall out as 2-high stacks on four sides. Normal draws take stacks clockwise from the
 * break (wall tile 2k and 2k+1 sit in stack k); replacement draws eat the other end, so the last
 * stack before the break empties first. Each side's slots come back in screen order.
 */
export function wallLayout({ initialCount, headIndex, tailIndex, breakSide }: WallLayoutInput): Record<WallSide, WallStackSlot[]> {
  const stacks = Math.ceil(initialCount / 2);
  const start = CLOCKWISE.indexOf(breakSide);
  const layout = { bottom: [], right: [], top: [], left: [] } as Record<WallSide, WallStackSlot[]>;
  const standing = (index: number) => (index < initialCount && index >= headIndex && index <= tailIndex ? 1 : 0);
  let order = 0;
  for (let i = 0; i < 4; i++) {
    const side = CLOCKWISE[(start + i) % 4]!;
    const length = Math.floor(stacks / 4) + (i < stacks % 4 ? 1 : 0);
    const slots: WallStackSlot[] = [];
    for (let k = 0; k < length; k++, order++) {
      slots.push({ order, tiles: (standing(2 * order) + standing(2 * order + 1)) as 0 | 1 | 2 });
    }
    layout[side] = SCREEN_REVERSED[side] ? slots.reverse() : slots;
  }
  return layout;
}
