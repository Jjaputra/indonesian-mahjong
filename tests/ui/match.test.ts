import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { GameEngine, GameEngineState } from '@/core/game-engine';
import { SEAT_ORDER, parseTileHand } from '@/core/tiles';
import { getPreset, MemoryStorage, type GameSettings } from '@/storage';
import { GameController } from '@/ui/game-controller';
import { createMatch, isMatchOver, nextSeating, recordHand, standings, loadDealerWinRule, saveDealerWinRule, type Seating } from '@/ui/match';
import { seatWindOf } from '@/ui/win-context';
import { MatchStandingsModal, MatchScoreboard, MatchResultNote } from '@/ui/components/MatchBoard';
import { PLAYER_NAME } from '@/ui/labels';
import { MainMenu } from '@/ui/components/MainMenu';
import { HuResultModal } from '@/ui/components/HuResultModal';
import { matchProgressLabel } from '@/ui/labels';
import { Wall, createGameWall } from '@/core/wall';
import { buildObservation, evaluateSelfDrawHu } from '@/ui/ai-controller';
import { toFullRules } from '@/ui/win-context';
import { PracticeCoach } from '@/ui/components/GameTable';

function settings(patch: Partial<GameSettings> = {}): GameSettings {
  return { ...getPreset('tournament'), soundEnabled: false, ...patch };
}

const engineOf = (c: GameController) => (c as unknown as { engine: GameEngine }).engine;
const mutable = (c: GameController) => engineOf(c).getState() as GameEngineState;

/** Plays the human seat with a trivial policy: Hu when legal, otherwise pass / discard the newest tile. */
function playHand(c: GameController): void {
  let guard = 0;
  while (!c.outcome && guard++ < 5000) {
    c.runUntilHuman();
    if (c.outcome) break;
    const a = c.getHumanActions();
    if (a.canReplaceFlowers) c.humanReplaceFlowers();
    else if (a.claim) c.humanClaim(a.claim.canHu ? 'hu' : 'pass');
    else if (a.canDraw) c.humanDraw();
    else if (a.canSelfDrawHu) c.humanSelfDrawHu();
    else if (a.canDiscard) {
      const hand = c.getState().players[c.humanSeat].hand;
      c.humanDiscard([...hand].reverse().find((t) => a.discardableTileIds.includes(t.id))!.id);
    } else if (!c.step()) throw new Error(`stalled in phase ${c.getState().phase}`);
  }
}

const start: Seating = { dealer: 'dong', prevailingWind: 'dong', dealerPasses: 0 };

describe('match rotation policy (nextSeating)', () => {
  it('dealer wins rotate even with a legacy stay argument', () => {
    const rotated = { dealer: 'nan', prevailingWind: 'dong', dealerPasses: 1 };
    expect(nextSeating(start, { kind: 'hu', winner: 'dong' })).toEqual(rotated);
    expect(nextSeating(start, { kind: 'hu', winner: 'dong' }, 'stay')).toEqual(rotated);
    expect(nextSeating(start, { kind: 'hu', winner: 'dong' }, 'rotate')).toEqual(rotated);
  });

  it('non-dealer win: the dealer passes to the next seat in turn order', () => {
    expect(nextSeating(start, { kind: 'hu', winner: 'xi' })).toEqual({ dealer: 'nan', prevailingWind: 'dong', dealerPasses: 1 });
    expect(nextSeating({ dealer: 'bei', prevailingWind: 'dong', dealerPasses: 2 }, { kind: 'hu', winner: 'nan' }).dealer).toBe('dong');
  });

  it('draw (Seri) and Lew Fit rotate without crediting a Hu', () => {
    expect(nextSeating({ dealer: 'xi', prevailingWind: 'nan', dealerPasses: 2 }, { kind: 'none' })).toEqual({ dealer: 'bei', prevailingWind: 'nan', dealerPasses: 3 });
    const m = recordHand(createMatch(), 'nan', false, 3);
    expect(m.seating).toEqual({ dealer: 'nan', prevailingWind: 'dong', dealerPasses: 1 });
    expect(m.huCount.nan).toBe(0);
    expect(m.hands[0]).toMatchObject({ winner: null, lewFit: true });
  });

  it('prevailing wind advances once every seat has been dealer', () => {
    let s = start;
    const winds: string[] = [];
    for (let i = 0; i < 8; i++) {
      const winner = SEAT_ORDER[(SEAT_ORDER.indexOf(s.dealer) + 1) % 4]!; // always a non-dealer
      s = nextSeating(s, { kind: 'hu', winner });
      winds.push(`${s.dealer}/${s.prevailingWind}`);
    }
    expect(winds).toEqual(['nan/dong', 'xi/dong', 'bei/dong', 'dong/nan', 'nan/nan', 'xi/nan', 'bei/nan', 'dong/xi']);
  });

  it('seat winds follow the dealer chair', () => {
    expect(SEAT_ORDER.map((seat) => seatWindOf({ dealerSeat: 'dong' }, seat))).toEqual(['dong', 'nan', 'xi', 'bei']);
    expect(SEAT_ORDER.map((seat) => seatWindOf({ dealerSeat: 'nan' }, seat))).toEqual(['bei', 'dong', 'nan', 'xi']);
  });

  it.each(['dealer', 'non-dealer', 'lew_fit', 'seri'] as const)('16 games give four games per wind after %s results', (result) => {
    let match = createMatch();
    for (let game = 0; game < 16; game++) {
      const dealer = SEAT_ORDER[game % 4]!;
      expect(match.seating).toEqual({ dealer, prevailingWind: SEAT_ORDER[Math.floor(game / 4)], dealerPasses: game % 4 });
      expect(SEAT_ORDER.map(seat => seatWindOf({ dealerSeat: dealer }, seat))).toEqual(
        SEAT_ORDER.map((_, chair) => SEAT_ORDER[(chair - game % 4 + 4) % 4]),
      );
      match = recordHand(match, result === 'seri' ? null : result === 'non-dealer' ? SEAT_ORDER[(game + 1) % 4]! : dealer, result !== 'lew_fit', 5);
    }
    expect(match.hands.map(hand => hand.prevailingWind)).toEqual([
      'dong', 'dong', 'dong', 'dong', 'nan', 'nan', 'nan', 'nan',
      'xi', 'xi', 'xi', 'xi', 'bei', 'bei', 'bei', 'bei',
    ]);
    expect(match.seating).toEqual(start);
    expect(isMatchOver(match)).toBe(true);
  });

  it('Seri advances the fourth dealer change and prevailing wind', () => {
    let match = createMatch();
    for (let i = 0; i < 3; i++) match = recordHand(match, match.seating.dealer, true, 5);
    match = recordHand(match, null, false, 0);
    expect(match.hands).toHaveLength(4);
    expect(match.seating).toEqual({ dealer: 'dong', prevailingWind: 'nan', dealerPasses: 0 });
  });

  it.each(['dong', 'xi'] as const)('result note names the next dealer after %s Hu', (winner) => {
    const match = recordHand(createMatch(), winner, true, 5);
    const html = renderToStaticMarkup(createElement(MatchResultNote, { match }));
    expect(html).toContain(`Dealer pindah ke ${PLAYER_NAME.nan}`);
    expect(html).not.toContain('dealer tetap');
  });
});

describe('match scoring and end', () => {
  it('ends after 16 hands; seri still counts as a game', () => {
    let m = createMatch();
    m = recordHand(m, null, false, 0);
    m = recordHand(m, 'xi', true, 8, 0, { winMethod: 'tsumo' });
    m = recordHand(m, null, false, 0);
    expect(isMatchOver(m)).toBe(false);
    m = recordHand(m, 'dong', true, 6, 0, { winMethod: 'tsumo' });
    for (let i = 4; i < 16; i++) m = recordHand(m, null, false, 0);
    expect(isMatchOver(m)).toBe(true);
    expect(m.hands.slice(0, 4).map((h) => h.winner)).toEqual([null, 'xi', null, 'dong']);
    expect(isMatchOver(recordHand(createMatch(), 'xi', true, 5, 0, { winMethod: 'tsumo' }))).toBe(false);
  });

  it('table winner: highest koin, then Hu count, then first to final koin', () => {
    let m = createMatch();
    m = recordHand(m, 'xi', true, 5, 0, { winMethod: 'tsumo' }); // xi reaches 1 at hand 1
    m = recordHand(m, 'bei', true, 30, 0, { winMethod: 'tsumo' }); // bei reaches 1 at hand 2
    m = recordHand(m, 'bei', true, 10, 0, { winMethod: 'tsumo' }); // bei reaches 2 at hand 3
    m = recordHand(m, 'xi', true, 6, 0, { winMethod: 'tsumo' }); // xi reaches 2 at hand 4
    const rows = standings(m);
    expect(rows.map((r) => [r.seat, r.rank, r.hu])).toEqual([['bei', 1, 2], ['xi', 2, 2], ['dong', 3, 0], ['nan', 4, 0]]);
    expect(rows[0]!.tay).toBe(40);
  });

  it('final standings render with Main lagi and back to menu', () => {
    const m = recordHand(createMatch(), 'nan', true, 9, 0, { winMethod: 'tsumo' });
    const html = renderToStaticMarkup(createElement(MatchStandingsModal, { match: m, onPlayAgain: () => {}, onMenu: () => {} }));
    expect(html).toContain('Klasemen Akhir');
    expect(html).toContain('Main lagi');
    expect(html).toContain('Kembali ke menu');
    expect(html).toContain('Pemenang meja');
  });

  it('labels the in-play indicator', () => {
    expect(matchProgressLabel(3, 'dong')).toBe('Game 3/16 · Angin putaran Timur');
    expect(matchProgressLabel(12, 'nan')).toBe('Game 12/16 · Angin putaran Selatan');
  });
});

describe('GameController continuous match', () => {
  it('plays hands back to back with fresh walls until the match ends', () => {
    const c = new GameController({ settings: settings(), seed: 31, saveHistory: false, autoStart: false });
    c.startMatch();
    for (let hand = 1; hand <= 16; hand++) {
      const s = c.getState();
      // Fresh deal: full wall, empty discards and melds, outcome cleared, seating from the match.
      expect(c.outcome).toBeNull();
      expect(s.wall.remainingCount).toBe(c.initialWallCount);
      expect(s.dealerSeat).toBe(c.match!.seating.dealer);
      expect(s.roundWind).toBe(c.match!.seating.prevailingWind);
      for (const seat of SEAT_ORDER) {
        expect(s.players[seat].discards).toHaveLength(0);
        expect(s.players[seat].melds).toHaveLength(0);
      }
      expect(c.discardTrail).toHaveLength(0);
      const dealer = s.dealerSeat;
      playHand(c);
      expect(c.match!.hands).toHaveLength(hand);
      expect(c.match!.seating.dealer).toBe(SEAT_ORDER[(SEAT_ORDER.indexOf(dealer) + 1) % 4]);
      if (hand < 16) {
        expect(c.matchOver).toBe(false);
        expect(c.nextHand()).toBe(true);
      }
    }
    expect(c.matchOver).toBe(true);
    expect(c.nextHand()).toBe(false);
    expect(c.outcome).not.toBeNull();
  });

  it('nextHand is a no-op mid-hand', () => {
    const c = new GameController({ settings: settings(), seed: 3, saveHistory: false, autoStart: false });
    c.startMatch();
    const serial = c.gameSerial;
    expect(c.nextHand()).toBe(false);
    expect(c.gameSerial).toBe(serial);
  });

  it('keeps the match Kim mode for every hand even if settings change mid-match', () => {
    const c = new GameController({ settings: settings({ kimEnabled: false, kimMode: 'off' }), seed: 8, saveHistory: false, autoStart: false });
    c.startMatch();
    c.setSettings(settings({ kimEnabled: true, kimMode: 'dedicated' }));
    playHand(c);
    c.nextHand();
    expect(c.getSettings().kimEnabled).toBe(false);
    expect(c.getState().rules.kimEnabled).toBe(false);
  });

  it('passes the rotated seat wind to the scorer', () => {
    // Dealer on the nan chair: the human (dong chair) sits Utara (Bei) this hand.
    const c = new GameController({ settings: settings({ kimEnabled: false, kimMode: 'off', startingSeatWind: 'nan' }), seed: 5, saveHistory: false, autoStart: false });
    c.startMatch();
    const s = mutable(c);
    s.dealerSeat = 'nan'; // Fixture for rotated-seat scoring, independent of opening dice.
    expect(s.dealerSeat).toBe('nan');
    const prepare = (tiles: string) => {
      s.currentTurn = 'dong';
      s.phase = 'ACTION_DECISION';
      s.selfDrawSeat = 'dong';
      s.players.dong.hand = parseTileHand(tiles);
      s.players.dong.melds = [];
      s.players.dong.flowers = [];
    };
    // Pung of Angin Utara (4W) = own seat wind: Tris angin duduk (#25).
    prepare('1T 2T 3T 4T 5T 6T 7B 8B 9B 4W 4W 4W 9T 9T');
    const bei = c.getHumanActions().selfHuScore!.patterns.map((p) => p.id);
    expect(bei).toContain(25);
    // Pung of Angin Timur (1W) is the prevailing wind only, not this chair's seat wind any more.
    prepare('1T 2T 3T 4T 5T 6T 7B 8B 9B 1W 1W 1W 9T 9T');
    const east = c.getHumanActions().selfHuScore!.patterns.map((p) => p.id);
    expect(east).toContain(26);
    expect(east).not.toContain(25);
  });

  it('records the winner seat wind on the outcome', () => {
    const c = new GameController({ settings: settings(), seed: 77, saveHistory: false, autoStart: false });
    c.startMatch();
    for (let i = 0; i < 6; i++) {
      playHand(c);
      const o = c.outcome!;
      if (o.kind === 'hu') expect(o.seatWind).toBe(seatWindOf(c.getState(), o.winner));
      expect(c.nextHand()).toBe(true);
    }
    expect(c.match!.hands).toHaveLength(6);
  });
});

describe('match UI wiring', () => {
  const noop = () => {};
  it('menu describes 16 games without a length choice', () => {
    const html = renderToStaticMarkup(createElement(MainMenu, { difficultyLabel: 'Normal', lastResult: null, onPractice: noop }));
    expect(html).toContain('16 game');
    expect(html).not.toContain('Panjang pertandingan');
    for (const label of ['8 game', '16 game ++', 'Tanpa batas']) expect(html).not.toContain(label);
  });

  it('result modal offers the next hand or the final standings', () => {
    const seri = { kind: 'seri' as const, durationSeconds: 1 };
    const next = renderToStaticMarkup(createElement(HuResultModal, { outcome: seri, onClose: noop, onNewGame: noop, onNextHand: noop }));
    expect(next).toContain('Lanjut ke game berikutnya');
    expect(next).toContain('Kembali ke menu');
    const last = renderToStaticMarkup(createElement(HuResultModal, { outcome: seri, onClose: noop, onNewGame: noop, onStandings: noop }));
    expect(last).toContain('Lihat klasemen akhir');
    expect(last).not.toContain('Lanjut ke game berikutnya');
  });
});


describe('match review regressions', () => {
  const noop = () => {};
  it('credits the configured minimum and labels lower training rules in both scoreboards', () => {
    expect(recordHand(createMatch(), 'nan', true, 3, 0, { winMethod: 'tsumo' }).huCount.nan).toBe(0);
    expect(recordHand(createMatch(), 'nan', true, 5, 0, { winMethod: 'tsumo' }).huCount.nan).toBe(1);
    let training = createMatch('dong', 'dong', 3);
    training = recordHand(training, 'nan', true, 3);
    expect(training.huCount.nan).toBe(1);
    expect(training.tayTotal.nan).toBe(3);
    expect(training.seating.dealer).toBe('nan');
    expect(recordHand(training, 'xi', false, 100).huCount.xi).toBe(0);
    const board = renderToStaticMarkup(createElement(MatchScoreboard, { match: training, hand: 1, prevailingWind: 'dong', dealer: 'dong' }));
    const final = renderToStaticMarkup(createElement(MatchStandingsModal, { match: training, onMenu: noop, onPlayAgain: noop }));
    for (const html of [board, final]) {
      expect(html).toContain('Minimum latihan 3 Tay');
      expect(html).toContain('aturan turnamen 5 Tay');
    }
    const tournament = renderToStaticMarkup(createElement(MatchScoreboard, { match: createMatch(), hand: 1, prevailingWind: 'dong', dealer: 'dong' }));
    expect(tournament).not.toContain('Minimum latihan');
  });

  it('keeps the chosen match minimum through nextHand, then applies a new choice to a new match', () => {
    const c = new GameController({ settings: settings({ minHuTay: 3 }), seed: 74, saveHistory: false, autoStart: false });
    c.startMatch();
    expect(c.match!.minHuTay).toBe(3);
    c.setSettings(settings({ minHuTay: 9 }));
    playHand(c);
    expect(c.nextHand()).toBe(true);
    expect(c.getSettings().minHuTay).toBe(3);
    expect(c.getState().rules.minHuTay).toBe(3);
    c.startMatch();
    expect(c.match!.minHuTay).toBe(9);
    expect(c.getState().rules.minHuTay).toBe(9);
  });

  it('a legal below-five training Hu still agrees with the modal, match credit and rotation', () => {
    const c = new GameController({ settings: settings({ minHuTay: 3, kimEnabled: false, kimMode: 'off', startingSeatWind: 'nan' }), seed: 4, saveHistory: false, autoStart: false });
    c.startMatch();
    const s = mutable(c);
    s.phase = 'ACTION_DECISION'; s.currentTurn = 'dong'; s.selfDrawSeat = 'dong';
    s.players.dong.hand = parseTileHand('4T 5T 6T 7S 8S 9S 3W 3W 3W 2W 2W');
    s.players.dong.melds = [{ type: 'jia', tiles: parseTileHand('1T 2T 3T'), claimedFrom: 'nan' }];
    s.players.dong.flowers = [];
    const score = c.getHumanActions().selfHuScore!;
    expect(score.totalTay).toBe(4);
    expect(c.getHumanActions().canSelfDrawHu).toBe(true);
    c.humanSelfDrawHu();
    expect(c.outcome?.kind).toBe('hu');
    expect(c.match!.huCount.dong).toBe(1);
    expect(c.match!.tayTotal.dong).toBe(4);
    expect(c.match!.koinTotal.dong).toBe(24);
    expect(c.match!.seating.dealer).toBe(SEAT_ORDER[(SEAT_ORDER.indexOf(c.getState().dealerSeat) + 1) % 4]);
  });

  it('a controller wall-out draw counts exactly once and rotates seating', () => {
    const c = new GameController({ settings: settings({ kimEnabled: false, kimMode: 'off', startingSeatWind: 'xi', roundWind: 'nan' }), seed: 5, saveHistory: false, autoStart: false });
    c.startMatch();
    const seating = { ...c.match!.seating };
    const state = mutable(c);
    state.wall = new Wall([], null);
    state.phase = 'TURN_DRAW';
    state.currentTurn = c.humanSeat;
    state.players[c.humanSeat].hand = parseTileHand('1T 2T 3T 4T 5T 6T 7B 8B 9B 1W 1W 2W 3W');
    c.humanDraw();
    expect(c.outcome?.kind).toBe('seri');
    expect(c.match!.hands).toHaveLength(1);
    expect(c.match!.seating).toEqual(nextSeating(seating, { kind: 'none' }));
    c.step(); c.humanDraw();
    expect(c.match!.hands).toHaveLength(1);
    expect(c.nextHand()).toBe(true);
    expect(c.getState().dealerSeat).toBe(nextSeating(seating, { kind: 'none' }).dealer);
    expect(c.getState().roundWind).toBe('nan');
    expect(c.getHumanActions().canDraw || c.getHumanActions().canDiscard || c.getState().currentTurn !== c.humanSeat).toBe(true);
  });

  it('fresh natural walls and Kim faces use the next seed, while pace and bot difficulty persist', () => {
    const c = new GameController({ settings: settings({ kimMode: 'natural', animationSpeed: 'off', aiDifficulty: 'easy' }), seed: 92, saveHistory: false, autoStart: false });
    c.startMatch();
    expect(c.getState().kimFace).toMatchObject(createGameWall('natural', 92).kimFace!);
    expect(c.getState().wall.serialize().tiles).toEqual(createGameWall('natural', 92).wall.serialize().tiles);
    playHand(c);
    c.setSettings(settings({ kimMode: 'off', kimEnabled: false, animationSpeed: 'slow', aiDifficulty: 'hard' }));
    c.nextHand();
    expect(c.getState().kimFace).toMatchObject(createGameWall('natural', 93).kimFace!);
    expect(c.getState().wall.serialize().tiles).toEqual(createGameWall('natural', 93).wall.serialize().tiles);
    expect(c.getState().wall.totalCount).toBe(143);
    expect(c.getSettings()).toMatchObject({ kimMode: 'natural', animationSpeed: 'slow', aiDifficulty: 'hard' });
  });

  it('coaches continuation between match hands and standings at the end', () => {
    const c = new GameController({ settings: settings(), seed: 24, saveHistory: false, autoStart: false });
    c.startMatch();
    playHand(c);
    const line = () => renderToStaticMarkup(createElement(PracticeCoach, { controller: c, actions: c.getHumanActions(), selectedId: null }));
    expect(line()).toContain('Lanjut ke game berikutnya');
    c.nextHand();
    expect(line()).not.toContain('Hasil game sudah siap');
    for (let i = 2; i <= 16; i++) { playHand(c); if (i < 16) c.nextHand(); }
    expect(line()).toContain('Lihat klasemen akhir');
    expect(line()).not.toContain('Lanjut ke game berikutnya');
  });

  function rotatedScore(hand: string, flowers: string = '', roundWind: 'dong' | 'xi' = 'dong') {
    const c = new GameController({ settings: settings({ kimMode: 'off', kimEnabled: false, startingSeatWind: 'nan', roundWind }), seed: 7, saveHistory: false, autoStart: false });
    c.startMatch();
    const s = mutable(c);
    s.phase = 'ACTION_DECISION'; s.currentTurn = 'dong'; s.selfDrawSeat = 'dong';
    s.players.dong.hand = parseTileHand(hand);
    s.players.dong.melds = []; s.players.dong.flowers = flowers ? parseTileHand(flowers) : [];
    const human = c.getHumanActions().selfHuScore!;
    const obs = buildObservation(s, 'dong', engineOf(c).getLegalActions('dong'), 'hard', toFullRules(c.getSettings()), 'supersede');
    expect(obs.seatWind).toBe('bei');
    expect(obs.roundWind).toBe(roundWind);
    const ai = evaluateSelfDrawHu(obs)!;
    expect(ai.patterns).toEqual(human.patterns);
    return { score: human, state: s, controller: c };
  }

  it('rotated own-seat bonuses and prevailing-wind triplets agree for human and AI', () => {
    const { score } = rotatedScore('1T 2T 3T 4T 5T 6T 7B 8B 9B 3W 3W 3W 9T 9T', 'F4 M4 M1', 'xi');
    expect(score.patterns.find(p => p.id === 1)?.tay).toBe(1);
    expect(score.patterns.find(p => p.id === 2)?.tay).toBe(3);
    expect(score.patterns.some(p => p.id === 26)).toBe(true);
    expect(score.patterns.some(p => p.id === 25)).toBe(false);
  });

  it('Ping Fu excludes the rotated seat pair and the prevailing-wind pair', () => {
    const prefix = '1T 2T 3T 4T 5T 6T 7B 8B 9B 2S 3S 4S';
    expect(rotatedScore(prefix + ' 4W 4W').score.patterns.some(p => p.id === 14)).toBe(false);
    expect(rotatedScore(prefix + ' 1W 1W').score.patterns.some(p => p.id === 14)).toBe(false);
    // Player answers 2026-11-12: a non-valued wind pair permits Ping Fu.
    expect(rotatedScore(prefix + ' 2W 2W').score.patterns.find(p => p.id === 14)?.tay).toBe(3);
  });

  it('Tuei Tuei accepts every honor pair for human and AI (player answer B)', () => {
    const prefix = '1T 1T 1T 5S 5S 5S 9B 9B 9B 3T 3T 3T';
    for (const pair of ['DZ', 'DF', 'DP', '4W', '1W']) {
      expect(rotatedScore(`${prefix} ${pair} ${pair}`).score.patterns.find(p => p.id === 15)?.tay).toBe(10);
    }
    expect(rotatedScore(prefix + ' 2W 2W').score.patterns.find(p => p.id === 15)?.tay).toBe(10);
  });

  it('a dealer on another chair receives Thien Fu on the untouched deal, for AI and human', () => {
    const c = new GameController({ settings: settings({ kimMode: 'off', kimEnabled: false, startingSeatWind: 'nan' }), humanSeat: 'nan', seed: 10, saveHistory: false, autoStart: false });
    c.startMatch();
    const s = mutable(c);
    s.players.nan.hand = parseTileHand('1T 2T 3T 4T 5T 6T 7B 8B 9B 2S 3S 4S 9T 9T');
    s.players.nan.melds = []; s.players.nan.flowers = [];
    const human = c.getHumanActions().selfHuScore!;
    expect(human.patterns.some(p => p.id === 11)).toBe(true);
    const obs = buildObservation(s, 'nan', engineOf(c).getLegalActions('nan'), 'hard', toFullRules(c.getSettings()), 'supersede');
    expect(evaluateSelfDrawHu(obs)!.patterns).toEqual(human.patterns);
  });
});


describe('legacy dealer-win migration', () => {
  it.each(['stay', 'rotate'] as const)('ignores legacy %s and removes its saved preference', (legacy) => {
    const store = new MemoryStorage();
    store.setItem('itm.match-dealer-win.v1', legacy);
    expect(loadDealerWinRule(store)).toBe('rotate');
    expect(store.getItem('itm.match-dealer-win.v1')).toBeNull();
    saveDealerWinRule(legacy, store);
    expect(store.getItem('itm.match-dealer-win.v1')).toBeNull();
    let match = createMatch('dong', 'dong', 5, legacy);
    expect(match.dealerWinRule).toBe('rotate');
    for (let i = 0; i < 4; i++) match = recordHand(match, 'dong', true, 5);
    expect(match.seating).toEqual({ dealer: 'dong', prevailingWind: 'nan', dealerPasses: 0 });
  });
  it('does not render the removed dealer control', () => {
    const html = renderToStaticMarkup(createElement(MainMenu, { difficultyLabel: 'Normal', lastResult: null, onPractice: () => {}, dealerWinRule: 'stay', onDealerWinRuleChange: () => {} }));
    expect(html).not.toContain('Dealer menang');
  });
});
