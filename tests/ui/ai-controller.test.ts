import { describe, it, expect } from 'vitest';
import { GameEngine } from '@/core/game-engine';
import { SEAT_ORDER, keyToTile, parseTileHand } from '@/core/tiles';
import type { LegalActions, Seat, Tile } from '@/core/types';
import { Wall, createMulberry32 } from '@/core/wall';
import { isKim } from '@/kim/wildcard-solver';
import { getPreset } from '@/storage';
import {
  buildObservation,
  chooseDiscard,
  explainDiscardChoice,
  decideClaim,
  decideTurnAction,
  dominantSuit,
  evaluateDiscardHu,
  type AIObservation,
} from '@/ui/ai-controller';
import { toFullRules } from '@/ui/win-context';

const RULES = toFullRules(getPreset('tournament'));

function legal(patch: Partial<LegalActions> = {}): LegalActions {
  return {
    canDiscard: false,
    discardableTileIds: [],
    canAnkong: false,
    ankongOptions: [],
    canKakan: false,
    kakanOptions: [],
    canSelfDrawHu: false,
    canPaoChin: false,
    canPass: false,
    canJia: false,
    jiaOptions: [],
    canPung: false,
    canKong: false,
    canDiscardWinHu: false,
    ...patch,
  };
}

function obs(hand: Tile[], patch: Partial<AIObservation> = {}): AIObservation {
  return {
    seat: 'nan',
    difficulty: 'hard',
    rules: RULES,
    overlapPolicy: 'supersede',
    roundWind: 'dong',
    hand,
    melds: [],
    flowers: [],
    discards: [],
    isPaoChin: false,
    opponents: (['dong', 'xi', 'bei'] as Seat[]).map((seat) => ({ seat, melds: [], flowers: [], discards: [], concealedCount: 13 })),
    wallRemaining: 60,
    consecutiveKongs: 0,
    isFirstGoAround: false,
    pendingDiscard: null,
    legal: legal(),
    ...patch,
  };
}

const rng = () => createMulberry32(99);

describe('Zero-peeking observation', () => {
  it('contains own hand and public info only — no opponent concealed tile ids', () => {
    const engine = new GameEngine(RULES, new Wall(undefined, 1234));
    engine.startNewGame(true);
    const state = engine.getState();
    for (const seat of SEAT_ORDER) {
      const o = buildObservation(state, seat, engine.getLegalActions(seat), 'hard', RULES, 'supersede');
      const json = JSON.stringify(o);
      for (const other of SEAT_ORDER.filter((s) => s !== seat)) {
        for (const t of state.players[other].hand) expect(json.includes(`"${t.id}"`), `${seat} sees ${other}:${t.id}`).toBe(false);
        expect(o.opponents.find((p) => p.seat === other)!.concealedCount).toBe(state.players[other].hand.length);
      }
      expect(o.hand.map((t) => t.id)).toEqual(state.players[seat].hand.map((t) => t.id));
      expect(o.wallRemaining).toBe(state.wall.remainingCount);
    }
  });

  it('observation is a copy: mutating it never changes the engine', () => {
    const engine = new GameEngine(RULES, new Wall(undefined, 77));
    engine.startNewGame(true);
    const o = buildObservation(engine.getState(), 'dong', engine.getLegalActions('dong'), 'easy', RULES, 'additive');
    const before = engine.getState().players.dong.hand.length;
    o.hand.pop();
    expect(engine.getState().players.dong.hand.length).toBe(before);
  });
});

describe('Kim non-discard compliance', () => {
  it('never picks a Kim even if a (buggy) legal list offers it', () => {
    const hand = [...parseTileHand('1T 5T 9T 2S 6S WD WN DZ DF DP 3B 7B 9B'), keyToTile('KIM', 1)];
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const r = rng();
      for (let i = 0; i < 30; i++) {
        const id = chooseDiscard(obs(hand, { difficulty, legal: legal({ canDiscard: true, discardableTileIds: hand.map((t) => t.id) }) }), r);
        expect(isKim(hand.find((t) => t.id === id)!)).toBe(false);
      }
    }
  });

  it('keeps Kim when Kim discard is allowed (Kim is the most valuable tile)', () => {
    const hand = [...parseTileHand('1T 5T 9T 2S 6S WD WN DZ DF DP 3B 7B 9B'), keyToTile('KIM', 1)];
    const o = obs(hand, { rules: { ...RULES, kimDiscardAllowed: true }, legal: legal({ canDiscard: true, discardableTileIds: hand.map((t) => t.id) }) });
    expect(chooseDiscard(o, rng())).not.toBe('kim-0-1');
  });
});

describe('Discard heuristics', () => {
  it('hard AI throws an isolated off-suit tile before breaking a connected run', () => {
    const hand = parseTileHand('1T 2T 3T 4T 5T 6T 7T 8T 9T 2T 3T WD 5S 9B');
    const o = obs(hand, { legal: legal({ canDiscard: true, discardableTileIds: hand.map((t) => t.id) }) });
    expect(dominantSuit(o).suit).toBe('tong');
    const id = chooseDiscard(o, rng())!;
    expect(['sok-5-1', 'ban-9-1', 'wind-dong-1']).toContain(id);
  });
});

describe('Hu decisions with the >= minimum Tay gate', () => {
  // Ping Fu 3 + Bo KIM 3 + Mun 1 = 7 Tay on 5 Sok from the discard.
  const hand = parseTileHand('1T 2T 3T 4T 5T 6T 2S 3S 4S 6B 7B 8B 5S');
  const discard = keyToTile('5S', 2);
  const pending = { discarder: 'dong' as Seat, tile: discard, isPromotedKong: false };

  it('claims Hu when the hand reaches the minimum', () => {
    const o = obs(hand, { pendingDiscard: pending, legal: legal({ canPass: true, canDiscardWinHu: true }) });
    expect(evaluateDiscardHu(o)!.totalTay).toBeGreaterThanOrEqual(5);
    expect(decideClaim(o, rng()).action).toBe('hu');
  });

  it('refuses a structurally complete Hu below the minimum (no Lew Fit)', () => {
    const o = obs(hand, {
      rules: { ...RULES, minHuTay: 50 },
      pendingDiscard: pending,
      legal: legal({ canPass: true, canDiscardWinHu: true }),
    });
    expect(evaluateDiscardHu(o)!.lewFitReason).toBe('below-minimum');
    expect(decideClaim(o, rng()).action).toBe('pass');
  });

  it('self-draw Hu only when valid; otherwise discards', () => {
    const drawn = [...hand, keyToTile('5S', 2)];
    const ok = obs(drawn, { legal: legal({ canSelfDrawHu: true, canDiscard: true, discardableTileIds: drawn.map((t) => t.id) }) });
    expect(decideTurnAction(ok, rng()).type).toBe('hu');
    const strict = { ...ok, rules: { ...RULES, minHuTay: 60 } };
    expect(decideTurnAction(strict, rng()).type).toBe('discard');
  });
});

describe('Claim decisions', () => {
  it('passes on its own discard and on a promoted Kong it cannot rob', () => {
    const hand = parseTileHand('DZ DZ 1T 2T 3T 4T 5T 6T 7T 8T 9T 1S 1S');
    const own = obs(hand, { pendingDiscard: { discarder: 'nan', tile: keyToTile('DZ', 3), isPromotedKong: false } });
    expect(decideClaim(own, rng()).action).toBe('pass');
    const kakan = obs(hand, {
      pendingDiscard: { discarder: 'dong', tile: keyToTile('DZ', 3), isPromotedKong: true },
      legal: legal({ canPass: true, canPung: true, pungTiles: hand.slice(0, 2) }),
    });
    expect(decideClaim(kakan, rng()).action).toBe('pass');
  });

  it('every difficulty Pungs a dragon (valuable Tris)', () => {
    const hand = parseTileHand('DZ DZ 1T 2T 3T 4T 5T 6T 7T 8T 9T 1S 1S');
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const o = obs(hand, {
        difficulty,
        pendingDiscard: { discarder: 'dong', tile: keyToTile('DZ', 3), isPromotedKong: false },
        legal: legal({ canPass: true, canPung: true, pungTiles: hand.slice(0, 2) }),
      });
      expect(decideClaim(o, rng())).toMatchObject({ action: 'pung', seat: 'nan' });
    }
  });

  it('never claims Jia with a Kim tile', () => {
    const hand = [...parseTileHand('2T 4T 5T 6T 7T 8T 9T 1T 1T 3S 4S DZ'), keyToTile('KIM', 1)];
    const kimOption = [keyToTile('KIM', 1), hand[0]!];
    const o = obs(hand, {
      pendingDiscard: { discarder: 'dong', tile: keyToTile('3T', 2), isPromotedKong: false },
      legal: legal({ canPass: true, canJia: true, jiaOptions: [kimOption] }),
    });
    expect(decideClaim(o, rng()).action).toBe('pass');
  });
});

describe('public bot discard explanation', () => {
  it('derives explanation from the selected tile and difficulty without consuming RNG or listing candidates', () => {
    const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WD WD WN WN');
    const observation = obs(hand, { difficulty: 'easy', legal: legal({ canDiscard: true, discardableTileIds: hand.map(t => t.id) }) });
    const random = rng();
    const choice = decideTurnAction(observation, random);
    expect(choice.type).toBe('discard');
    if (choice.type !== 'discard') return;
    const before = JSON.stringify(observation);
    const explanation = explainDiscardChoice(observation, choice.tileId)!;
    expect(explanation).toContain('variasi acak besar');
    expect(JSON.stringify(observation)).toBe(before);
    for (const t of hand) expect(explanation).not.toContain(t.id);
    expect(explainDiscardChoice(observation, 'concealed-unknown')).toBeNull();
    const nextWithExplanation = decideTurnAction(observation, random);
    const reference = rng();
    decideTurnAction(observation, reference);
    expect(nextWithExplanation).toEqual(decideTurnAction(observation, reference));
  });
  it('reports deterministic hard selection honestly', () => {
    const hand = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WD WD WN WN');
    const observation = obs(hand, { legal: legal({ canDiscard: true, discardableTileIds: hand.map(t => t.id) }) });
    const action = decideTurnAction(observation, rng());
    if (action.type !== 'discard') throw new Error('expected discard');
    const explanation = explainDiscardChoice(observation, action.tileId)!;
    expect(explanation).toContain('termasuk nilai retensi terendah');
    expect(explanation).toContain('tidak menambahkan variasi acak');
  });
});
