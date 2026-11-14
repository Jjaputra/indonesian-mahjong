import { keyToTile } from '../core/tiles';
import type { Meld, Seat, Tile } from '../core/types';
import type { GameController } from './game-controller';
import { isMatchOver, recordHand, roundScore, kongPayment, type KongPayment } from './match';
import { gameDeltas } from '../core/round-score';
import type { DevHand } from '../dev/hand-code';
import type { OpeningRoll } from './components/DiceRoll';

/**
 * Dev-only screenshot hook: `?demo=table|late|claim|hu|dice|melds|final[&seed=n][&win=ce_mo|buangan|chiong_kong]` deals a
 * seeded match and plays the human seat forward to a reproducible table state; `win` restyles the Hu for Round Score shots. App only loads this behind import.meta.env.DEV.
 */
export type DemoMode = 'table' | 'late' | 'claim' | 'hu' | 'seri' | 'dice' | 'melds' | 'final';

/** Sample opening roll with one tie re-roll, for `?demo=dice` before a match exposes its own. */
export const DEMO_OPENING_ROLL: OpeningRoll = {
  rounds: [
    [{ seat: 'dong', dice: [5, 4, 3] }, { seat: 'nan', dice: [6, 3, 3] }, { seat: 'xi', dice: [2, 2, 2] }, { seat: 'bei', dice: [1, 6, 2] }],
    [{ seat: 'dong', dice: [3, 2, 1] }, { seat: 'nan', dice: [6, 5, 4] }],
  ],
  dealer: 'nan',
};

export type DemoWin = 'ce_mo' | 'buangan' | 'chiong_kong';

export function demoFromUrl(search: string): { mode: DemoMode; seed: number; win: DemoWin | null; kong: boolean } | null {
  const params = new URLSearchParams(search);
  const mode = params.get('demo');
  if (mode !== 'table' && mode !== 'late' && mode !== 'claim' && mode !== 'hu' && mode !== 'seri' && mode !== 'dice' && mode !== 'melds' && mode !== 'final') return null;
  const win = params.get('win');
  return { mode, seed: Number(params.get('seed') ?? 7) || 7, win: win === 'ce_mo' || win === 'buangan' || win === 'chiong_kong' ? win : null, kong: params.get('kong') === '1' };
}

/** `?demo=seri`: ends the current hand as a wall-out Seri (fabricated, for screenshots). */
export function seriDemo(controller: GameController): void {
  if (!controller.match || controller.outcome) return;
  controller.outcome = { kind: 'seri', kongPayments: [], gameDeltas: { dong: 0, nan: 0, xi: 0, bei: 0 }, durationSeconds: 312 };
  controller.match = recordHand(controller.match, null, false, 0);
}

/**
 * `&kong=1`: sample Kong koin, Anda Kong 5 Tong makan dari orang (1 per pemain) then Bot Kanan
 * Kong Zhong di dalam (4 per pemain). Mid-hand they become the live payments; after a Hu or Seri they
 * are folded into the outcome, its match record and the koin totals.
 */
export function addDemoKongs(controller: GameController): void {
  const payments: KongPayment[] = [kongPayment('dong', { type: 'tong', value: 5 }, false), kongPayment('nan', { type: 'dragon', value: 1 }, true)];
  const o = controller.outcome;
  if (!o) { controller.currentKongPayments = payments; return; }
  const match = controller.match;
  const last = match?.hands[match.hands.length - 1];
  const score = o.kind === 'hu' && o.scoring.isValidHu ? o.roundScore : null;
  const deltas = gameDeltas(score, payments);
  controller.outcome = { ...o, kongPayments: payments, gameDeltas: deltas };
  if (!match || !last) return;
  const koinTotal = { ...match.koinTotal };
  for (const s of ['dong', 'nan', 'xi', 'bei'] as Seat[]) koinTotal[s] += deltas[s] - last.gameDeltas[s];
  controller.match = { ...match, koinTotal, hands: [...match.hands.slice(0, -1), { ...last, kongPayments: payments, gameDeltas: deltas }] };
}

/** `&sandbox=kong`: Uji Tangan sample with a concealed Kong Zhong and an open Kong. */
export const DEMO_KONG_HAND: DevHand = {
  concealed: [{ type: 'tong', value: 1 }, { type: 'tong', value: 2 }, { type: 'tong', value: 3 }, { type: 'ban', value: 7 }, { type: 'ban', value: 8 }, { type: 'ban', value: 9 }, { type: 'sok', value: 5 }],
  melds: [{ type: 'ankong', faces: Array.from({ length: 4 }, () => ({ type: 'dragon' as const, value: 1 })) }, { type: 'kakan', faces: Array.from({ length: 4 }, () => ({ type: 'wind' as const, value: 2 })) }],
  bonus: { bunga: [], musim: [] }, winningTile: { type: 'sok', value: 5 },
  win: { method: 'tsumo' }, kimFace: null, seatWind: 'nan', roundWind: 'dong', flags: {},
};

/**
 * `&win=`: rewrites a valid demo Hu as Ce Mo, Buangan (from the next seat) or Chiong Kong, and its
 * Round Score in the match's last hand, so both payout shapes can be screenshotted from one seed.
 */
export function restyleDemoWin(controller: GameController, win: DemoWin): void {
  const o = controller.outcome;
  const match = controller.match;
  const last = match?.hands[match.hands.length - 1];
  if (o?.kind !== 'hu' || !o.scoring.isValidHu || !match || !last || last.winner !== o.winner) return;
  const order: Seat[] = ['dong', 'nan', 'xi', 'bei'];
  const winMethod = win === 'ce_mo' ? 'tsumo' : win === 'buangan' ? 'ron' : 'chiong_kong';
  const discarder = win === 'ce_mo' ? undefined : order[(order.indexOf(o.winner) + 1) % 4]!;
  const score = roundScore(o.winner, o.scoring.totalTay, { winMethod, discarder });
  const koinTotal = { ...match.koinTotal };
  const deltas = gameDeltas(score, o.kongPayments);
  for (const s of order) koinTotal[s] += deltas[s] - last.gameDeltas[s];
  controller.outcome = { ...o, winMethod, discarder, roundScore: score, gameDeltas: deltas };
  controller.match = { ...match, koinTotal, hands: [...match.hands.slice(0, -1), { ...last, roundScore: score, gameDeltas: deltas }] };
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
      // Late game: a crowded discard pool, to check it still fits the felt.
      if (mode === 'late' && a.canDiscard && discards >= 56) return;
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
      { type: 'kong', tiles: [t('WN', 6), t('WN', 7), t('WN', 8), t('WN')], claimedFrom: right, fromConcealedTriplet: true },
      { type: 'ankong', tiles: [t('2S', 6), t('2S', 7), t('2S', 8), t('2S')] },
    ];
    const player = state.players[seat];
    player.melds = melds;
    player.hand.splice(0, Math.max(0, player.hand.length - (seat === controller.humanSeat ? 2 : 1)));
    if (player.flowers.length < 3) player.flowers.push(t('F1', 9 - i), t('F2', 9 - i), t('M3', 9 - i));
  });
}

/**
 * `?demo=final`: after a played Hu, fills the rest of the 16-game match with fabricated results
 * so the final standings can be screenshotted. For screenshots only.
 */
export function finishDemoMatch(controller: GameController): void {
  if (!controller.match) return;
  // [winner, Tay, payer]: a null payer is Ce Mo; otherwise a win on that seat's discard.
  const script: [Seat | null, number, Seat | null][] = [['nan', 12, 'dong'], [null, 0, null], ['xi', 6, null], ['dong', 9, 'bei'], ['bei', 5, null], [null, 0, null], ['nan', 7, 'xi'], ['dong', 16, null], ['xi', 5, 'nan'], [null, 0, null], ['bei', 8, 'dong'], ['dong', 6, 'xi'], ['nan', 5, null], [null, 0, null], ['xi', 10, 'bei']];
  let match = controller.match;
  for (const [winner, tay, payer] of script) {
    if (isMatchOver(match)) break;
    match = recordHand(match, winner, winner !== null, tay, Date.now(), payer ? { winMethod: 'ron', discarder: payer } : { winMethod: 'tsumo' });
  }
  controller.match = match;
}
