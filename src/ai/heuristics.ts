import { canFormWinningHand, getTurnDistance } from '../core/game-engine';
import { isBonus, isHonor, isKim, isSameKind, isSuited } from '../core/tiles';
import type { GameRules, Meld, Seat, Tile, Wind } from '../core/types';
import { checkShiKimInstantHu, KimValidator } from '../kim';
import { scoringEngine } from '../scoring';
import type { AIDecision, AIDifficulty, AIPublicInfo, PlayerStateView } from './types';
import { calculateShanten, countUkeire, sevenPairShanten, toCounts } from './shanten';

const SEAT_NO: Record<Seat, number> = { dong: 1, nan: 2, xi: 3, bei: 4 };
const WIND_NO: Record<Wind, number> = { dong: 1, nan: 2, xi: 3, bei: 4 };

/**
 * Lower bound on Tay for a hand that already has a winning shape.
 * Patterns that are easy to over-count (Ping Fu, Mun, Ce Mo, Bo Hua Zi, the base
 * season point, Kim Ciok) are omitted, so a real hand under 5 Tay is never declared.
 */
export function estimateHuTay(input: {
  hand: readonly Tile[];
  melds: readonly Meld[];
  flowers: readonly Tile[];
  seat: Seat;
  roundWind: Wind;
  winningTile: Tile;
  isPaoChin: boolean;
  kimEnabled: boolean;
}): number {
  const concealed = [...input.hand, input.winningTile];
  const kimEnabled = input.kimEnabled;
  const concealedKim = kimEnabled ? concealed.filter(isKim).length : 0;
  const meldKim = kimEnabled ? input.melds.reduce((sum, meld) => sum + meld.tiles.filter(isKim).length, 0) : 0;
  const kimCount = concealedKim + meldKim;

  if (kimEnabled && concealedKim === 4) {
    return canFormWinningHand(concealed, true) ? 40 : 10;
  }

  if (input.melds.length === 0 && isSevenPairWin(concealed, kimEnabled)) {
    return kimCount > 0 ? 10 : 20;
  }

  if (isAllPungWin(concealed, input.melds, kimEnabled)) {
    return kimCount > 0 ? 5 : 10;
  }

  let tay = kimCount > 0 ? kimCount : 3;
  const pungKinds = collectPungKinds(concealed, input.melds);
  const seatWind = `wind:${SEAT_NO[input.seat]}`;
  const roundWind = `wind:${WIND_NO[input.roundWind]}`;
  for (const kind of pungKinds) {
    if (kind === 'dragon:1') tay += 2;
    else if (kind === 'dragon:2' || kind === 'dragon:3') tay += 1;
    if (kind === seatWind) tay += 1;
    if (kind === roundWind) tay += 1;
  }

  const seatNo = SEAT_NO[input.seat];
  for (const tile of input.flowers) {
    if ((tile.type === 'flower' || tile.type === 'season') && tile.value === seatNo) tay += 1;
  }

  if (input.isPaoChin) tay = Math.max(tay, 20);
  return tay;
}

function isSevenPairWin(tiles: readonly Tile[], kimEnabled: boolean): boolean {
  if (tiles.length !== 14) return false;
  const { counts, kim } = toCounts(tiles);
  return sevenPairShanten(counts, kimEnabled ? kim : 0) === -1;
}

function isAllPungWin(concealed: readonly Tile[], melds: readonly Meld[], kimEnabled: boolean): boolean {
  if (melds.some((meld) => meld.type === 'jia')) return false;
  const { counts, kim } = toCounts(concealed);
  const wild = kimEnabled ? kim : 0;
  let tiles = wild;
  for (let i = 0; i < counts.length; i++) tiles += counts[i] ?? 0;
  if (tiles < 2 || tiles % 3 !== 2) return false;

  const canTriplets = (cursor: number, k: number): boolean => {
    let i = cursor;
    while (i < counts.length && (counts[i] ?? 0) === 0) i++;
    if (i >= counts.length) return k % 3 === 0;
    const n = counts[i] ?? 0;
    const need = (3 - (n % 3)) % 3;
    if (k < need) return false;
    counts[i] = 0;
    const ok = canTriplets(i + 1, k - need);
    counts[i] = n;
    return ok;
  };

  const tryEye = (index: number, take: number, takeKim: number): boolean => {
    if ((counts[index] ?? 0) < take || wild < takeKim) return false;
    const previous = counts[index] ?? 0;
    counts[index] = previous - take;
    const ok = canTriplets(0, wild - takeKim);
    counts[index] = previous;
    return ok;
  };

  for (let i = 0; i < counts.length; i++) {
    if ((counts[i] ?? 0) >= 2 && tryEye(i, 2, 0)) return true;
    if ((counts[i] ?? 0) >= 1 && wild >= 1 && tryEye(i, 1, 1)) return true;
  }
  return wild >= 2 && canTriplets(0, wild - 2);
}

function kindKey(tile: Tile): string | null {
  if (isKim(tile) || isBonus(tile)) return null;
  return `${tile.type}:${tile.value}`;
}

function collectPungKinds(concealed: readonly Tile[], melds: readonly Meld[]): Set<string> {
  const kinds = new Set<string>();
  const counts = new Map<string, number>();
  for (const tile of concealed) {
    const key = kindKey(tile);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of counts) {
    if (count >= 3) kinds.add(key);
  }
  for (const meld of melds) {
    if (meld.type === 'jia') continue;
    const natural = meld.tiles.find((tile) => !isKim(tile) && !isBonus(tile));
    if (!natural) continue;
    const key = kindKey(natural);
    if (key) kinds.add(key);
  }
  return kinds;
}

/** Lower danger is safer to discard. Genbutsu, then suji, then edge / middle class. */
export function dangerOf(tile: Tile, publicDiscards: readonly Tile[]): number {
  if (isKim(tile) || isBonus(tile)) return 5;
  if (publicDiscards.some((other) => isSameKind(other, tile))) return 0;
  if (isSuited(tile)) {
    const partners: number[] = [];
    if (tile.value - 3 >= 1) partners.push(tile.value - 3);
    if (tile.value + 3 <= 9) partners.push(tile.value + 3);
    const suji = partners.some((value) =>
      publicDiscards.some((other) => other.type === tile.type && other.value === value),
    );
    if (suji) return 1;
    if (tile.value === 1 || tile.value === 9) return 2;
    if (tile.value === 2 || tile.value === 3 || tile.value === 7 || tile.value === 8) return 3;
    return 4;
  }
  return 2;
}

function isRoundWindTile(tile: Tile, roundWind: Wind): boolean {
  return tile.type === 'wind' && tile.value === WIND_NO[roundWind];
}

function keepScore(tile: Tile, hand: readonly Tile[]): number {
  if (isKim(tile)) return 10_000;
  if (isBonus(tile)) return -1_000;
  const copies = hand.filter((other) => isSameKind(other, tile)).length;
  let score = copies >= 3 ? 300 : copies === 2 ? 200 : 0;
  if (isSuited(tile)) {
    const near = (delta: number) => hand.some((other) => other.type === tile.type && other.value === tile.value + delta);
    if (near(-1) || near(1)) score += 40;
    if (near(-2) || near(2)) score += 15;
    if (tile.value >= 4 && tile.value <= 6) score += 6;
    else if (tile.value === 1 || tile.value === 9) score += 2;
    else score += 4;
  } else if (isHonor(tile)) {
    score += 1;
  }
  return score;
}

export function legalDiscardTiles(hand: readonly Tile[], rules: GameRules): Tile[] {
  const validator = new KimValidator(rules);
  const ordinary = hand.filter((tile) => !isBonus(tile) && validator.canDiscard(tile).valid);
  if (ordinary.length > 0) return ordinary;
  return hand.filter((tile) => validator.canDiscard(tile).valid);
}

function visibleTiles(player: PlayerStateView, publicDiscards: readonly Tile[], publicInfo?: AIPublicInfo): Tile[] {
  const visible: Tile[] = [...publicDiscards];
  for (const meld of player.melds) visible.push(...meld.tiles);
  if (publicInfo?.opponentMelds) {
    for (const meld of publicInfo.opponentMelds) visible.push(...meld.tiles);
  }
  if (publicInfo?.opponentFlowers) visible.push(...publicInfo.opponentFlowers);
  return visible;
}

interface ScoredDiscard {
  tile: Tile;
  shanten: number;
  kinds: number;
  copies: number;
  danger: number;
}

function compareDiscard(a: ScoredDiscard, b: ScoredDiscard, difficulty: AIDifficulty, roundWind: Wind, defend: boolean): number {
  if (a.shanten !== b.shanten) return a.shanten - b.shanten;
  if (difficulty === 'hard' && defend && a.danger !== b.danger) return a.danger - b.danger;
  const ukeireA = difficulty === 'hard' ? a.copies : a.kinds;
  const ukeireB = difficulty === 'hard' ? b.copies : b.kinds;
  if (ukeireA !== ukeireB) return ukeireB - ukeireA;
  const windA = isRoundWindTile(a.tile, roundWind) ? 1 : 0;
  const windB = isRoundWindTile(b.tile, roundWind) ? 1 : 0;
  if (windA !== windB) return windA - windB;
  return a.tile.id.localeCompare(b.tile.id);
}

export function chooseDiscardTile(
  player: PlayerStateView,
  publicDiscards: readonly Tile[],
  roundWind: Wind,
  difficulty: AIDifficulty,
  rules: GameRules,
  publicInfo?: AIPublicInfo,
): Tile {
  const hand = player.hand;
  const openMelds = player.melds.length;
  const legal = legalDiscardTiles(hand, rules);
  const chosen = legal[0];
  if (!chosen) throw new Error('No legal discard');
  if (legal.length === 1) return chosen;

  if (difficulty === 'easy') {
    const ranked = [...legal].sort((a, b) => {
      const keep = keepScore(a, hand) - keepScore(b, hand);
      if (keep !== 0) return keep;
      const wind = (isRoundWindTile(a, roundWind) ? 1 : 0) - (isRoundWindTile(b, roundWind) ? 1 : 0);
      if (wind !== 0) return wind;
      return a.id.localeCompare(b.id);
    });
    const pick = ranked[0];
    if (!pick) throw new Error('No legal discard');
    return pick;
  }

  const visible = visibleTiles(player, publicDiscards, publicInfo);
  const scored: ScoredDiscard[] = legal.map((tile) => {
    const rest = hand.filter((other) => other !== tile);
    return {
      tile,
      shanten: calculateShanten(rest, openMelds),
      kinds: 0,
      copies: 0,
      danger: dangerOf(tile, publicDiscards),
    };
  });
  const bestShanten = scored.reduce((min, row) => Math.min(min, row.shanten), 99);
  const contenders = scored.filter((row) => row.shanten === bestShanten);
  for (const row of contenders) {
    const rest = hand.filter((other) => other !== row.tile);
    const ukeire = countUkeire(rest, openMelds, [...visible, row.tile]);
    row.kinds = ukeire.kinds;
    row.copies = ukeire.copies;
  }
  contenders.sort((a, b) => compareDiscard(a, b, difficulty, roundWind, bestShanten >= 1));
  const pick = contenders[0]?.tile;
  if (!pick) throw new Error('No legal discard');
  return pick;
}

function declarationOk(
  action: 'jia' | 'pung' | 'kong',
  meldTiles: Tile[],
  discard: Tile,
  seat: Seat,
  rules: GameRules,
): boolean {
  const validator = new KimValidator(rules);
  return validator.canClaimDeclaration({ seat, action, meldTiles }, discard, rules).valid;
}

function pungOptions(hand: readonly Tile[], discard: Tile, allowKim: boolean): Tile[][] {
  if (isKim(discard) || isBonus(discard)) return [];
  const natural = hand.filter((tile) => !isKim(tile) && isSameKind(tile, discard));
  const kims = allowKim ? hand.filter((tile) => isKim(tile)) : [];
  const options: Tile[][] = [];
  const first = natural[0];
  const second = natural[1];
  const third = natural[2];
  if (first && second && third) options.push([first, second, third]);
  if (first && second) options.push([first, second]);
  const kim = kims[0];
  if (allowKim && first && kim) options.push([first, kim]);
  const kimB = kims[1];
  if (allowKim && !first && kim && kimB) options.push([kim, kimB]);
  return options;
}

function findNatural(hand: readonly Tile[], suit: Tile['type'], value: number, exclude: Tile | null): Tile | undefined {
  return hand.find((tile) => tile !== exclude && !isKim(tile) && tile.type === suit && tile.value === value);
}

function jiaOptions(hand: readonly Tile[], discard: Tile, allowKim: boolean): Tile[][] {
  if (!isSuited(discard)) return [];
  const suit = discard.type;
  const value = discard.value;
  const windows: Array<[number, number]> = [];
  if (value >= 3) windows.push([value - 2, value - 1]);
  if (value >= 2 && value <= 8) windows.push([value - 1, value + 1]);
  if (value <= 7) windows.push([value + 1, value + 2]);

  const options: Tile[][] = [];
  for (const [left, right] of windows) {
    const a = findNatural(hand, suit, left, null);
    const b = findNatural(hand, suit, right, a ?? null);
    if (a && b) {
      options.push([a, b]);
      continue;
    }
    if (!allowKim) continue;
    const natural = a ?? b;
    const kim = hand.find((tile) => isKim(tile));
    if (natural && kim) options.push([natural, kim]);
  }
  return options;
}

function callShanten(hand: readonly Tile[], remove: readonly Tile[], openMelds: number, rules: GameRules): number {
  const remain = hand.filter((tile) => !remove.includes(tile));
  const legal = legalDiscardTiles(remain, rules);
  if (legal.length === 0) return 99;
  let best = 99;
  for (const tile of legal) {
    const after = remain.filter((other) => other !== tile);
    const distance = calculateShanten(after, openMelds + 1);
    if (distance < best) best = distance;
  }
  return best;
}

function pass(): AIDecision {
  return { action: 'pass' };
}

export function chooseClaim(
  player: PlayerStateView,
  discardedTile: Tile,
  fromSeat: Seat,
  publicDiscards: readonly Tile[],
  roundWind: Wind,
  difficulty: AIDifficulty,
  rules: GameRules,
  publicInfo?: AIPublicInfo,
): AIDecision {
  // Discards and flowers are visible context. Claim priority does not depend on the pool,
  // but the observation is part of the legal public view and must stay readable.
  void publicDiscards.length;
  void publicInfo?.opponentFlowers?.length;
  void publicInfo?.opponentMelds?.length;

  const hand = player.hand;
  const combined = [...hand, discardedTile];
  const kimWild = rules.kimEnabled;
  const structural =
    canFormWinningHand(combined, kimWild) || (kimWild && checkShiKimInstantHu(combined));
  if (structural && fromSeat !== player.seat) {
    // Authoritative 44-Tay gate: only a Hu the scoring engine accepts (>= minHuTay) is declared,
    // so the bot can never commit a Lew Fit.
    const result = scoringEngine.evaluateHand(
      [...hand],
      [...player.melds],
      [...player.flowers],
      {
        winningTile: discardedTile,
        isSelfDraw: false,
        isDiscardWin: true,
        isInitialDeal: false,
        isPaoChin: player.isPaoChin,
        isRobbingKong: false,
        isSelfRobbingKong: false,
        isKongReplacement: false,
        isDoubleKongReplacement: false,
        seatWind: player.seat,
        roundWind,
        discarderSeat: fromSeat,
      },
      rules,
    );
    if (result.isValidHu) return { action: 'hu', targetTile: discardedTile };
  }

  if (difficulty === 'easy' || fromSeat === player.seat) return pass();

  const allowKim = rules.allowKimInMeldClaim && rules.kimEnabled;
  if (!isKim(discardedTile) && !isBonus(discardedTile)) {
    const natural = hand.filter((tile) => !isKim(tile) && isSameKind(tile, discardedTile));
    const a = natural[0];
    const b = natural[1];
    const c = natural[2];
    if (a && b && c && declarationOk('kong', [a, b, c], discardedTile, player.seat, rules)) {
      return { action: 'kong', targetTile: discardedTile, meldTiles: [a, b, c] };
    }
  }

  if (isHonor(discardedTile)) {
    const options = pungOptions(hand, discardedTile, allowKim).filter((tiles) => tiles.length === 2);
    const natural = options.find((tiles) => tiles.every((tile) => !isKim(tile)));
    const chosen = natural ?? (allowKim ? options[0] : undefined);
    if (chosen && declarationOk('pung', chosen, discardedTile, player.seat, rules)) {
      return { action: 'pung', targetTile: discardedTile, meldTiles: chosen };
    }
    return pass();
  }

  if (!isSuited(discardedTile)) return pass();

  const openMelds = player.melds.length;
  const current = calculateShanten(hand, openMelds);
  const slot: { current: { action: 'pung' | 'jia'; tiles: Tile[]; shanten: number } | null } = { current: null };

  const consider = (action: 'pung' | 'jia', tiles: Tile[]) => {
    if (!declarationOk(action, tiles, discardedTile, player.seat, rules)) return;
    const next = callShanten(hand, tiles, openMelds, rules);
    if (next >= current) return;
    const key = tiles.map((tile) => tile.id).sort().join(',');
    const incumbent = slot.current;
    const bestKey = incumbent ? incumbent.tiles.map((tile) => tile.id).sort().join(',') : '';
    const better =
      !incumbent ||
      next < incumbent.shanten ||
      (next === incumbent.shanten &&
        (action === 'pung' && incumbent.action === 'jia' || (action === incumbent.action && key < bestKey)));
    if (better) slot.current = { action, tiles, shanten: next };
  };

  for (const tiles of pungOptions(hand, discardedTile, allowKim)) {
    if (tiles.length === 2) consider('pung', tiles);
  }
  if (getTurnDistance(fromSeat, player.seat) === 1) {
    for (const tiles of jiaOptions(hand, discardedTile, allowKim)) consider('jia', tiles);
  }

  const chosen = slot.current;
  if (!chosen) return pass();
  return { action: chosen.action, targetTile: discardedTile, meldTiles: chosen.tiles };
}
