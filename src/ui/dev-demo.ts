import { keyToTile } from '../core/tiles';
import type { Meld, Seat, Tile } from '../core/types';
import type { GameController } from './game-controller';
import type { OpeningRoll } from './components/DiceRoll';

/**
 * Dev-only screenshot hook: `?demo=table|claim|hu|dice|melds[&seed=n]` deals a seeded match and plays the
 * human seat forward to a reproducible table state. App only loads this behind import.meta.env.DEV.
 */
export type DemoMode = 'table' | 'claim' | 'hu' | 'dice' | 'melds';

/** Sample opening roll with one tie re-roll, for `?demo=dice` before a match exposes its own. */
export const DEMO_OPENING_ROLL: OpeningRoll = {
  rounds: [
    [{ seat: 'dong', dice: [5, 4] }, { seat: 'nan', dice: [6, 3] }, { seat: 'xi', dice: [2, 2] }, { seat: 'bei', dice: [1, 6] }],
    [{ seat: 'dong', dice: [3, 2] }, { seat: 'nan', dice: [6, 5] }],
  ],
  dealer: 'nan',
};

export function demoFromUrl(search: string): { mode: DemoMode; seed: number } | null {
  const params = new URLSearchParams(search);
  const mode = params.get('demo');
  if (mode !== 'table' && mode !== 'claim' && mode !== 'hu' && mode !== 'dice' && mode !== 'melds') return null;
  return { mode, seed: Number(params.get('seed') ?? 7) || 7 };
}

/** Plays the human seat with simple choices until the requested state is on the table. */
export function driveDemo(controller: GameController, mode: DemoMode, maxHands = 12): void {
  for (let hand = 0; hand < maxHands; hand++) {
    if (hand > 0 && !controller.nextHand()) return;
    for (let guard = 0; guard < 400; guard++) {
      controller.runUntilHuman();
      if (controller.outcome) break;
      const a = controller.getHumanActions();
      const discards = controller.discardCount;
      if (mode === 'claim' && a.claim && discards >= 6 && (a.claim.canPung || a.claim.jiaOptions.length)) return;
      if (mode === 'table' && a.canDiscard && discards >= 22) return;
      if (a.canReplaceFlowers) controller.humanReplaceFlowers();
      else if (a.claim) controller.humanClaim(mode === 'hu' && a.claim.canHu ? 'hu' : 'pass');
      else if (a.canSelfDrawHu && mode === 'hu') controller.humanSelfDrawHu();
      else if (a.canDraw) controller.humanDraw();
      else if (a.canDiscard) {
        const drawn = controller.humanDrawnTileId;
        controller.humanDiscard(drawn && a.discardableTileIds.includes(drawn) ? drawn : a.discardableTileIds[0]!);
      } else break;
    }
    if (mode === 'hu' && controller.outcome?.kind === 'hu') return;
    if (mode !== 'hu' && !controller.outcome) return;
  }
}

/**
 * `?demo=melds`: after a normal table state, gives every seat four exposed melds claimed from each
 * direction (Jia, Pung, claimed Kong, Ankong) plus bonus tiles, to check meld layout on all sides.
 * Tiles are fabricated (copy 9) and hands shrink to match; for screenshots only.
 */
export function stackDemoMelds(controller: GameController): void {
  const state = controller.getState();
  const order: Seat[] = ['dong', 'nan', 'xi', 'bei'];
  const t = (key: string, copy = 9): Tile => ({ ...keyToTile(key, copy), id: `${keyToTile(key, copy).id}-demo` });
  order.forEach((seat, i) => {
    const left = order[(i + 3) % 4]!; const across = order[(i + 2) % 4]!; const right = order[(i + 1) % 4]!;
    const melds: Meld[] = [
      { type: 'jia', tiles: [t('7B'), t('9B'), t('8B')], claimedFrom: left },
      { type: 'pung', tiles: [t('5T', 7), t('5T', 8), t('5T')], claimedFrom: across },
      { type: 'kong', tiles: [t('WN', 6), t('WN', 7), t('WN', 8), t('WN')], claimedFrom: right },
      { type: 'ankong', tiles: [t('2S', 6), t('2S', 7), t('2S', 8), t('2S')] },
    ];
    const player = state.players[seat];
    player.melds = melds;
    player.hand.splice(0, Math.max(0, player.hand.length - (seat === controller.humanSeat ? 2 : 1)));
    if (player.flowers.length < 3) player.flowers.push(t('F1', 9 - i), t('F2', 9 - i), t('M3', 9 - i));
  });
}
