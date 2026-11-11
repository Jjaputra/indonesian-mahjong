import type { GameController } from './game-controller';

/**
 * Dev-only screenshot hook: `?demo=table|claim|hu[&seed=n]` deals a seeded match and plays the
 * human seat forward to a reproducible table state. App only loads this behind import.meta.env.DEV.
 */
export type DemoMode = 'table' | 'claim' | 'hu';

export function demoFromUrl(search: string): { mode: DemoMode; seed: number } | null {
  const params = new URLSearchParams(search);
  const mode = params.get('demo');
  if (mode !== 'table' && mode !== 'claim' && mode !== 'hu') return null;
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
