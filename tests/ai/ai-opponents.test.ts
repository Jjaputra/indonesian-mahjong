import { describe, expect, it } from 'vitest';
import { AIPlayer, calculateShanten, countUkeire, dangerOf, estimateHuTay } from '@/ai';
import type { AIDifficulty } from '@/ai';
import { canFormWinningHand } from '@/core/game-engine';
import { keyToTile, parseTileHand } from '@/core/tiles';
import type { GameRules, Meld, PlayerState, Seat, Tile, Wind } from '@/core/types';

const DIFFICULTIES: readonly AIDifficulty[] = ['easy', 'normal', 'hard'];

function rules(over: Partial<GameRules> = {}): GameRules {
  return {
    kimEnabled: true,
    kimDiscardAllowed: false,
    allowKimInMeldClaim: false,
    minHuTay: 5,
    ...over,
  };
}

function player(hand: Tile[], over: Partial<PlayerState> = {}): PlayerState {
  return {
    seat: 'nan',
    name: 'bot',
    isHuman: false,
    hand,
    melds: [],
    flowers: [],
    discards: [],
    isCin: false,
    isPaoChin: false,
    ...over,
  };
}

function without(hand: readonly Tile[], id: string): Tile[] {
  const tile = hand.find((item) => item.id === id);
  if (!tile) throw new Error(`missing ${id}`);
  return hand.filter((item) => item !== tile);
}

const ALLOWED = new Set(['seat', 'name', 'isHuman', 'hand', 'melds', 'flowers', 'discards', 'isCin', 'isPaoChin']);

function sealed(source: PlayerState): PlayerState {
  return new Proxy(source, {
    get(target, prop, receiver) {
      if (typeof prop !== 'string') return Reflect.get(target, prop, receiver);
      if (!ALLOWED.has(prop)) throw new Error(`zero-peek violation: ${prop}`);
      return Reflect.get(target, prop, receiver);
    },
  });
}

describe('shanten', () => {
  it('scores a complete hand, a tanki tenpai, and seven-pair tenpai', () => {
    const complete = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 2S 3S 4S WD WD');
    expect(calculateShanten(complete, 0)).toBe(-1);
    expect(calculateShanten(without(complete, 'wind-dong-2'), 0)).toBe(0);
    expect(calculateShanten(parseTileHand('1T 1T 2T 2T 3T 3T 4T 4T 5T 5T 6T 6T 7T'), 0)).toBe(0);
    expect(calculateShanten(parseTileHand('1T 1T 2T 2T 3T 3T 4T 4T 5T 5T 6T 6T 7T 7T'), 0)).toBe(-1);
  });

  it('drops a kind from ukeire when visible melds exhaust its copies', () => {
    const tenpai = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 2S 3S 4S WD');
    const open = countUkeire(tenpai, 0, []);
    const blocked = countUkeire(tenpai, 0, [keyToTile('WD', 2), keyToTile('WD', 3), keyToTile('WD', 4)]);
    expect(open.kinds).toBeGreaterThan(blocked.kinds);
    expect(open.copies).toBeGreaterThan(blocked.copies);
    expect(blocked.copies).toBeGreaterThan(0);
  });
});

describe('Tay lower bound', () => {
  const dragonChicken = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 4S 5S 6S DZ');
  const dragon = keyToTile('DZ', 2);

  function tay(over: { seat?: Seat; roundWind?: Wind; flowers?: Tile[]; winning?: Tile; hand?: Tile[] } = {}) {
    const hand = over.hand ?? dragonChicken;
    const winning = over.winning ?? dragon;
    return estimateHuTay({
      hand,
      melds: [],
      flowers: over.flowers ?? [],
      seat: over.seat ?? 'nan',
      roundWind: over.roundWind ?? 'dong',
      winningTile: winning,
      isPaoChin: false,
      kimEnabled: true,
    });
  }

  it('keeps an ordinary dragon-pair chicken under 5 and counts only a matching flower or season', () => {
    expect(tay()).toBe(3);
    expect(tay({ seat: 'dong', flowers: [keyToTile('F1')] })).toBe(4);
    expect(tay({ seat: 'nan', flowers: [keyToTile('F1')] })).toBe(3);
    expect(tay({ seat: 'nan', flowers: [keyToTile('M1')] })).toBe(3);
    expect(tay({ seat: 'dong', flowers: [keyToTile('M1')] })).toBe(4);
  });

  it('pays the published floors for seven pairs, all pungs, and one Kim', () => {
    const seven = parseTileHand('1T 1T 2T 2T 3T 3T 4T 4T 5T 5T 6T 6T 7T');
    expect(tay({ hand: seven, winning: keyToTile('7T', 2) })).toBe(20);
    const pungs = parseTileHand('1T 1T 1T 2T 2T 2T 3T 3T 3T WD WD WD 9B');
    expect(tay({ hand: pungs, winning: keyToTile('9B', 2), seat: 'nan', roundWind: 'dong' })).toBe(10);
    const kimChicken = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 2S 3S 4S 5S');
    expect(tay({ hand: kimChicken, winning: keyToTile('KIM'), flowers: [keyToTile('F1')], seat: 'nan' })).toBe(1);
  });
});

describe('discard danger', () => {
  it('ranks genbutsu, then suji, then terminals, edges, and middles', () => {
    expect(dangerOf(keyToTile('1T'), [keyToTile('1T', 2)])).toBe(0);
    expect(dangerOf(keyToTile('1T'), [keyToTile('4T')])).toBe(1);
    expect(dangerOf(keyToTile('1T'), [])).toBe(2);
    expect(dangerOf(keyToTile('WD'), [])).toBe(2);
    expect(dangerOf(keyToTile('3T'), [])).toBe(3);
    expect(dangerOf(keyToTile('5T'), [])).toBe(4);
    expect(dangerOf(keyToTile('9S'), [keyToTile('9S', 2), keyToTile('6S')])).toBe(0);
  });
});

describe('AI discard decisions', () => {
  const ai = new AIPlayer(rules());

  it('keeps the round wind when two isolated honors are otherwise equal', () => {
    const hand = parseTileHand('1B 1B 2B 2B 3B 3B 4B 4B 5B 5B 6B 6B WN WB');
    for (const difficulty of DIFFICULTIES) {
      expect(ai.chooseDiscard(player(hand), [], 'bei', difficulty).id).toBe('wind-nan-1');
    }
  });

  it('lets Easy throw an isolated honor while Normal and Hard keep it for tile efficiency', () => {
    const hand = parseTileHand('1B 1B 2B 2B 3B 3B 4B 4B 5B 5B 6B 6B WD 5T');
    expect(ai.chooseDiscard(player(hand), [], 'dong', 'easy').id).toBe('wind-dong-1');
    expect(ai.chooseDiscard(player(hand), [], 'dong', 'normal').id).toBe('tong-5-1');
    expect(ai.chooseDiscard(player(hand), [], 'dong', 'hard').id).toBe('tong-5-1');
  });

  it('splits Normal efficiency from Hard defense on a genbutsu terminal', () => {
    const hand = parseTileHand('WD WD WN WN WX WX WB WB DZ DZ 1B 9B 1S 9S');
    const pool = [keyToTile('9S', 2)];
    const ban = without(hand, 'ban-1-1');
    const sok = without(hand, 'sok-9-1');
    const wind = without(hand, 'wind-dong-1');
    expect(calculateShanten(ban, 0)).toBe(calculateShanten(sok, 0));
    expect(calculateShanten(ban, 0)).toBeLessThan(calculateShanten(wind, 0));
    expect(ai.chooseDiscard(player(hand), pool, 'dong', 'normal').id).toBe('ban-1-1');
    expect(ai.chooseDiscard(player(hand), pool, 'dong', 'hard').id).toBe('sok-9-1');
    expect(ai.chooseDiscard(player(hand), pool, 'dong', 'hard').id).toBe(
      ai.chooseDiscard(player(hand), pool, 'dong', 'hard').id,
    );
  });
});

describe('Kim discard and claim legality', () => {
  const ai = new AIPlayer(rules());
  const mixed = parseTileHand('KIM 1T 2T 3T 4T 5T 6T 7T 8T 9T WD WD WN WN');

  it('never discards Kim when kimDiscardAllowed is false', () => {
    for (const difficulty of DIFFICULTIES) {
      const tile = ai.chooseDiscard(sealed(player(mixed)), [], 'dong', difficulty, rules());
      expect(tile.type).not.toBe('kim');
      expect(tile.isKim).not.toBe(true);
    }
  });

  it('refuses a discard when every tile is a protected Kim', () => {
    const onlyKim = parseTileHand('KIM KIM KIM KIM');
    expect(() => ai.chooseDiscard(player(onlyKim), [], 'dong', 'normal')).toThrow(/legal discard/i);
  });

  it('discards Kim when the rules allow it and Kim is the whole hand', () => {
    const onlyKim = parseTileHand('KIM KIM KIM');
    const allowed = rules({ kimDiscardAllowed: true });
    const tile = new AIPlayer(allowed).chooseDiscard(player(onlyKim), [], 'xi', 'hard');
    expect(tile.type).toBe('kim');
  });

  it('does not call a Kim pung while Lew Fit claims are forbidden', () => {
    const hand = parseTileHand('DZ KIM WD WN WX WB DF DP 1T 9T 1S 9S 1B');
    const discard = keyToTile('DZ', 2);
    for (const difficulty of ['normal', 'hard'] as const) {
      const decision = ai.evaluateClaim(player(hand), discard, 'dong', [], 'dong', difficulty, rules());
      expect(decision.action).toBe('pass');
      expect(decision.meldTiles?.some((tile) => tile.type === 'kim')).toBeUndefined();
    }
  });

  it('pungs an honor with one natural tile and one Kim when claims are allowed', () => {
    const hand = parseTileHand('DZ KIM WD WN WX WB DF DP 1T 9T 1S 9S 1B');
    const discard = keyToTile('DZ', 2);
    const casual = rules({ allowKimInMeldClaim: true });
    for (const difficulty of ['normal', 'hard'] as const) {
      const decision = ai.evaluateClaim(player(hand), discard, 'dong', [], 'dong', difficulty, casual);
      expect(decision.action).toBe('pung');
      expect(decision.meldTiles?.map((tile) => tile.type).sort()).toEqual(['dragon', 'kim']);
      expect(decision.meldTiles?.every((tile) => hand.includes(tile))).toBe(true);
    }
  });
});

describe('claim decisions', () => {
  const ai = new AIPlayer(rules());

  it('lets Easy pass a kong or pung that Normal and Hard take', () => {
    const kongHand = parseTileHand('DZ DZ DZ WD WN WX WB DF DP 1T 9T 1S 9S 1B');
    const discard = keyToTile('DZ', 4);
    expect(canFormWinningHand([...kongHand, discard], true)).toBe(false);
    expect(ai.evaluateClaim(player(kongHand), discard, 'dong', [], 'dong', 'easy', rules()).action).toBe('pass');
    for (const difficulty of ['normal', 'hard'] as const) {
      const decision = ai.evaluateClaim(player(kongHand), discard, 'xi', [], 'dong', difficulty, rules());
      expect(decision.action).toBe('kong');
      expect(decision.meldTiles?.map((tile) => tile.id)).toEqual(['dragon-zhong-1', 'dragon-zhong-2', 'dragon-zhong-3']);
    }

    const pungHand = parseTileHand('DZ DZ WD WN WX WB DF DP 1T 9T 1S 9S 1B');
    const pungDiscard = keyToTile('DZ', 3);
    expect(ai.evaluateClaim(player(pungHand), pungDiscard, 'bei', [], 'nan', 'easy', rules()).action).toBe('pass');
    const pung = ai.evaluateClaim(player(pungHand), pungDiscard, 'bei', [], 'nan', 'normal', rules());
    expect(pung.action).toBe('pung');
    expect(pung.meldTiles?.map((tile) => tile.id)).toEqual(['dragon-zhong-1', 'dragon-zhong-2']);
    expect(ai.evaluateClaim(player(pungHand), pungDiscard, 'bei', [], 'nan', 'hard', rules()).action).toBe('pung');
  });

  it('calls Jia only for the next seat, and only on Normal and Hard', () => {
    const hand = parseTileHand('2T 3T WD WN WX WB DZ DF DP 1S');
    const meld: Meld = {
      type: 'pung',
      tiles: [keyToTile('9B', 1), keyToTile('9B', 2), keyToTile('9B', 3)],
      claimedFrom: 'bei',
    };
    const bot = player(hand, { seat: 'nan', melds: [meld] });
    const discard = keyToTile('1T');
    expect(canFormWinningHand([...hand, discard], true)).toBe(false);
    expect(ai.evaluateClaim(bot, discard, 'dong', [], 'dong', 'easy', rules()).action).toBe('pass');
    const jia = ai.evaluateClaim(bot, discard, 'dong', [], 'dong', 'normal', rules());
    expect(jia.action).toBe('jia');
    expect(jia.meldTiles).toEqual([hand[0], hand[1]]);
    expect(ai.evaluateClaim(bot, discard, 'dong', [], 'dong', 'hard', rules()).action).toBe('jia');
    const tooFar = player(hand, { seat: 'xi', melds: [meld] });
    expect(ai.evaluateClaim(tooFar, discard, 'dong', [], 'dong', 'normal', rules()).action).toBe('pass');
    expect(ai.evaluateClaim(tooFar, discard, 'dong', [], 'dong', 'hard', rules()).action).toBe('pass');
  });
});

describe('5 Tay Hu gate', () => {
  const ai = new AIPlayer(rules());

  it('declares seven pairs and all pungs at 5 Tay and passes when the floor is higher', () => {
    // 24 Tay without Kim (Tjit Tuei 20 + Bo Kim 3 + Mun 1; DZ disqualifies Bo Hua Zi): hu at 5, pass at 25 and 100
    const seven = parseTileHand('1T 1T 2T 2T 3S 3S 4S 4S 5B 5B DZ DZ 7T');
    const last = keyToTile('7T', 2);
    expect(canFormWinningHand([...seven, last], true)).toBe(true);
    for (const difficulty of DIFFICULTIES) {
      expect(ai.evaluateClaim(player(seven), last, 'dong', [], 'dong', difficulty, rules()).action).toBe('hu');
      expect(ai.evaluateClaim(player(seven), last, 'dong', [], 'dong', difficulty, rules({ minHuTay: 25 })).action).toBe('pass');
      expect(ai.evaluateClaim(player(seven), last, 'dong', [], 'dong', difficulty, rules({ minHuTay: 100 })).action).toBe('pass');
    }

    const pungs = parseTileHand('1T 1T 1T 2T 2T 2T 3T 3T 3T WD WD WD 9B');
    const pair = keyToTile('9B', 2);
    expect(canFormWinningHand([...pungs, pair], true)).toBe(true);
    expect(ai.evaluateClaim(player(pungs), pair, 'xi', [], 'dong', 'hard', rules()).action).toBe('hu');
  });

  it('passes a dragon-pair chicken and a one-Kim hand whose lower bound is under 5', () => {
    const chicken = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 4S 5S 6S DZ');
    const dragon = keyToTile('DZ', 2);
    expect(canFormWinningHand([...chicken, dragon], true)).toBe(true);
    for (const difficulty of DIFFICULTIES) {
      expect(ai.evaluateClaim(player(chicken), dragon, 'dong', [], 'dong', difficulty, rules()).action).toBe('pass');
    }

    // Hand with dragon pair DZ-KIM (Ping Fu disqualified): Tile Bunga 0 + Tile KIM 1 + Mun 1 = 2 Tay < 5 Tay
    const kimHand = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 3S 4S 5S DZ');
    const kim = keyToTile('KIM');
    const bot = player(kimHand, { seat: 'nan', flowers: [keyToTile('F1')] });
    expect(canFormWinningHand([...kimHand, kim], true)).toBe(true);
    for (const difficulty of DIFFICULTIES) {
      expect(ai.evaluateClaim(bot, kim, 'dong', [], 'dong', difficulty, rules()).action).toBe('pass');
    }

    // Hand with Kim inside a sequence (1T-KIM-3T) and dragon pair DZ (Ping Fu disqualified): 2 Tay < 5 Tay
    const seqKimHand = parseTileHand('1T KIM 3T 4T 5T 6T 7T 8T 9T 3S 4S 5S DZ');
    const dragonDiscard = keyToTile('DZ', 2);
    expect(canFormWinningHand([...seqKimHand, dragonDiscard], true)).toBe(true);
    for (const difficulty of DIFFICULTIES) {
      expect(ai.evaluateClaim(player(seqKimHand, { seat: 'nan', flowers: [keyToTile('F1')] }), dragonDiscard, 'dong', [], 'dong', difficulty, rules()).action).toBe('pass');
    }
  });

  it('declares Shi Kim when the fourth Kim arrives', () => {
    const hand = parseTileHand('KIM KIM KIM WD WN WX WB DZ DF DP 1T 9T 1B');
    const kim = keyToTile('KIM', 4);
    expect(ai.evaluateClaim(player(hand), kim, 'bei', [], 'nan', 'easy', rules()).action).toBe('hu');
  });
});

describe('zero-peeking privacy', () => {
  const ai = new AIPlayer(rules());

  it('reads only the caller hand and the public arguments', () => {
    const hand = parseTileHand('KIM 1T 2T 3T 4T 5T 6T 7T 8T 9T WD WD WN WN');
    const source = player(hand);
    (source as PlayerState & { wall?: string[]; opponents?: Tile[] }).wall = ['hidden-wall'];
    (source as PlayerState & { opponents?: Tile[] }).opponents = parseTileHand('1B 1B 1B');
    const hidden = sealed(source);
    const idsBefore = source.hand.map((tile) => tile.id);

    for (const difficulty of DIFFICULTIES) {
      const discarded = ai.chooseDiscard(hidden, [keyToTile('9B')], 'dong', difficulty, rules());
      expect(discarded.type).not.toBe('kim');
      const claim = ai.evaluateClaim(hidden, keyToTile('WN', 3), 'dong', [keyToTile('9B')], 'dong', difficulty, rules());
      expect(claim.action === 'pass' || claim.action === 'pung' || claim.action === 'hu').toBe(true);
    }

    expect(source.hand.map((tile) => tile.id)).toEqual(idsBefore);
    const again = ai.chooseDiscard(source, [keyToTile('9B')], 'dong', 'hard', rules());
    const first = ai.chooseDiscard(hidden, [keyToTile('9B')], 'dong', 'hard', rules());
    expect(again.id).toBe(first.id);
  });

  it('ignores a concealed-hand decoy attached beside the legal fields', () => {
    const tiles = parseTileHand('1B 1B 2B 2B 3B 3B 4B 4B 5B 5B 6B 6B WN WB');
    const left = player(tiles);
    const right = player(tiles.map((tile) => ({ ...tile })));
    (left as PlayerState & { secretHand?: Tile[] }).secretHand = parseTileHand('9T 9T 9T');
    (right as PlayerState & { secretHand?: Tile[] }).secretHand = parseTileHand('1S 1S 1S');
    expect(ai.chooseDiscard(sealed(left), [], 'bei', 'normal').id).toBe(
      ai.chooseDiscard(sealed(right), [], 'bei', 'normal').id,
    );
  });
});
