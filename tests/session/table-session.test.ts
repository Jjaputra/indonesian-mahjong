// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { TableSession, type SerializedSession } from '../../src/session';
import { getPreset } from '../../src/storage';
import { SEAT_ORDER, sortTiles } from '../../src/core/tiles';
import type { Seat, Tile } from '../../src/core/types';
import { GameEngine } from '../../src/core/game-engine';

const humans = { dong: 'human', nan: 'human', xi: 'human', bei: 'human' } as const;
const bots = { dong: 'bot', nan: 'bot', xi: 'bot', bei: 'bot' } as const;
let clock = 1000;
const now = () => clock;
function session(seed = 1, seats: Record<Seat, 'human' | 'bot'> = humans) {
  return new TableSession({ settings: getPreset('tournament'), seats, seed, now });
}
const tile = (value: number, id = `test-${value}`, type: Tile['type'] = 'tong'): Tile => ({ id, type, value });
function rig(edit: (data: SerializedSession) => void): TableSession {
  const data = session().serialize();
  edit(data);
  return TableSession.deserialize(data, now);
}
function claimSession(claimants: Seat[] = ['nan']): TableSession {
  const s = rig(d => {
    d.state.players.dong.hand[13] = tile(3, 'private-claim-discard');
    for (const seat of ['nan', 'xi', 'bei'] as const) {
      d.state.players[seat].hand = Array.from({ length: 13 }, (_, i) => tile(i % 9 + 1, `${seat}-${i}`, 'sok'));
      if (claimants.includes(seat)) {
        d.state.players[seat].hand[0] = tile(3, `${seat}-pair-a`);
        d.state.players[seat].hand[1] = tile(3, `${seat}-pair-b`);
      }
    }
  });
  expect(s.apply('dong', { type: 'discard', tileId: 'private-claim-discard', version: s.version }).ok).toBe(true);
  return s;
}
function expire(s: TableSession, seat: Seat) {
  clock = Math.max(...s.pendingDecisions().map(d => d.deadline));
  expect(s.timeout(seat)).toMatchObject({ ok: true });
}
function containsTile(value: unknown, ids: Set<string>): boolean {
  if (typeof value === 'string') return ids.has(value);
  if (Array.isArray(value)) return value.some(v => containsTile(v, ids));
  if (value && typeof value === 'object') return Object.values(value).some(v => containsTile(v, ids));
  return false;
}
function advance(s: TableSession): void {
  const v = s.viewFor(null);
  if (v.phase === 'RESOLVED_HU' || v.phase === 'DRAW_SERI') {
    expect(s.apply('dong', { type: 'nextHand', version: v.version }).ok).toBe(true);
  } else expect(s.stepBots()).toBe(true);
}

describe('TableSession', () => {
  it.each([1, 47, 913])('finishes a complete 16-hand four-bot match, seed %i', seed => {
    const s = session(seed, bots);
    let steps = 0;
    while (!s.viewFor(null).matchOver && steps++ < 15000) advance(s);
    const view = s.viewFor(null);
    expect(steps).toBeLessThan(15000);
    expect(view.match.hands).toHaveLength(16);
    expect(Object.values(view.match.koinTotal).reduce((a, b) => a + b, 0)).toBe(0);
  }, 120000);

  it('plays scripted humans beside bots without driving human seats', () => {
    const s = session(88, { ...bots, dong: 'human', xi: 'human' });
    let turns = 0;
    while (!['DRAW_SERI', 'RESOLVED_HU'].includes(s.viewFor(null).phase) && turns++ < 2000) {
      if (s.stepBots()) continue;
      const d = s.pendingDecisions()[0]!;
      expect(['dong', 'xi']).toContain(d.seat);
      const v = s.viewFor(d.seat), a = v.legal!;
      const action = d.kind === 'claim' ? { type: 'pass' as const, version: v.version }
        : a.canSelfDrawHu ? { type: 'selfHu' as const, version: v.version }
        : { type: 'discard' as const, tileId: a.discardableTileIds[0]!, version: v.version };
      expect(s.apply(d.seat, action).ok).toBe(true);
    }
    expect(s.viewFor(null).match.hands).toHaveLength(1);
    expect(turns).toBeLessThan(2000);
  }, 30000);

  it('rejects illegal, foreign, duplicate and stale actions without mutation', () => {
    const s = session();
    const before = s.serialize();
    const id = s.viewFor('dong').hand[0]!.id;
    for (const [seat, action] of [
      ['nan', { type: 'discard', tileId: id, version: 0 }],
      ['dong', { type: 'draw', version: 0 }],
      ['dong', { type: 'discard', tileId: 'missing', version: 0 }],
      ['dong', { type: 'ankong', tileIds: [id, id, id, id], version: 0 }],
      ['dong', { type: 'kakan', tileId: id, meldIndex: 55, version: 0 }],
      ['dong', { type: 'pass', version: 0 }],
      ['dong', { type: 'selfHu', version: 0 }],
      ['dong', { type: 'nextHand', version: 0 }],
    ] as const) {
      expect(s.apply(seat, action as Parameters<TableSession['apply']>[1]).ok).toBe(false);
      expect(s.serialize()).toEqual(before);
    }
    expect(s.apply('dong', { type: 'draw', version: -1 })).toMatchObject({ code: 'stale_version' });
    expect(s.serialize()).toEqual(before);
  });

  it('round-trips mid-hand and mid-claim with identical bot continuation and deadlines', () => {
    const a = session(47, bots);
    let sawClaim = false;
    for (let i = 0; i < 120; i++) {
      const b = TableSession.deserialize(JSON.parse(JSON.stringify(a.serialize())), now);
      expect(b.serialize()).toEqual(a.serialize());
      expect(b.viewFor('nan')).toEqual(a.viewFor('nan'));
      sawClaim ||= a.viewFor(null).phase === 'CLAIM_WINDOW';
      advance(a); advance(b);
      expect(b.serialize()).toEqual(a.serialize());
    }
    expect(sawClaim).toBe(true);
  }, 30000);

  it('projects only own concealed tiles over many random reachable states', () => {
    let checked = 0, claimWindows = 0;
    for (const seed of [5, 10, 11, 12, 13, 14, 15, 16, 17]) {
      const s = session(seed, bots);
      for (let n = 0; n < 75; n++) {
        const raw = s.serialize().state;
        const wallIds = new Set(raw.wall.tiles.slice(raw.wall.headIndex, raw.wall.tailIndex + 1).map(t => t.id));
        for (const viewer of [null, ...SEAT_ORDER]) {
          const view = s.viewFor(viewer);
          const hidden = new Set(SEAT_ORDER.filter(seat => seat !== viewer && !(raw.phase === 'RESOLVED_HU' && seat === raw.winnerSeat)).flatMap(seat => raw.players[seat].hand.map(t => t.id)));
          expect(containsTile(view, hidden)).toBe(false);
          expect(containsTile(view, wallIds)).toBe(false);
          expect(view.hand).toEqual(viewer ? raw.players[viewer].hand : []);
          expect('wall' in view).toBe(false);
          expect(view.pendingDecisions).toEqual(s.pendingDecisions().filter(d => d.seat === viewer));
          expect(view.pendingDecisions.every(d => d.seat === viewer)).toBe(true);
          if (raw.phase === 'CLAIM_WINDOW') {
            expect(view.claimWindow).toEqual({ deadline: s.serialize().claimDeadline });
            expect(view.deadline).toBe(view.claimWindow!.deadline);
            expect(Object.keys(view.claimWindow!)).toEqual(['deadline']);
            claimWindows++;
          } else expect(view.claimWindow).toBeNull();
          checked++;
        }
        advance(s);
      }
    }
    expect(checked).toBe(3375);
    expect(claimWindows).toBeGreaterThan(50);
  }, 120000);

  it('reveals only the declared Hu winner until the next deal, including after eviction', () => {
    const s = rig(d => {
      d.options.settings.kimEnabled = false; d.state.rules.kimEnabled = false;
      d.state.players.dong.hand = [1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8, 9, 9].map((v, i) => tile(v, `public-hu-${i}`));
    });
    expect(s.viewFor(null).lastHand).toBeNull();
    expect(s.apply('dong', { type: 'selfHu', version: s.version }).ok).toBe(true);
    const data = s.serialize();
    for (const viewer of [null, ...SEAT_ORDER]) {
      const view = s.viewFor(viewer);
      expect(view.phase).toBe('RESOLVED_HU');
      expect(view.lastHand).toMatchObject({ winner: 'dong', winMethod: 'tsumo', discarder: null, hand: data.state.players.dong.hand, melds: data.state.players.dong.melds });
      expect(view.lastHand!.breakdown.length).toBeGreaterThan(0);
      expect(view.lastHand!.payments).toEqual(view.lastHandResult);
      const hidden = new Set(SEAT_ORDER.filter(seat => seat !== viewer && seat !== 'dong').flatMap(seat => data.state.players[seat].hand.map(t => t.id)));
      expect(containsTile(view, hidden)).toBe(false);
    }
    expect(TableSession.deserialize(data, now).viewFor(null).lastHand).toEqual(s.viewFor(null).lastHand);
    expect(s.apply('dong', { type: 'nextHand', version: s.version }).ok).toBe(true);
    expect(s.viewFor(null).lastHand).toBeNull();
  });

  it('reveals nobody for Seri or a rejected Lew Fit declaration', () => {
    const seri = rig(d => {
      d.state.phase = 'TURN_DRAW'; d.state.selfDrawSeat = null; d.state.players.dong.hand.pop();
      d.state.wall = { ...d.state.wall, tailIndex: d.state.wall.headIndex };
      d.state.wall.tiles[d.state.wall.headIndex] = tile(1, 'seri-flower', 'flower');
    });
    expire(seri, 'dong');
    expect(seri.viewFor(null).phase).toBe('DRAW_SERI');
    expect(seri.viewFor(null).lastHand).toMatchObject({ winner: null, hand: [], melds: [], breakdown: [], winMethod: 'draw' });
    const lewFit = rig(d => {
      d.options.settings.minHuTay = 10000; d.state.rules.minHuTay = 10000;
      d.state.players.dong.hand = Array.from({ length: 14 }, (_, i) => tile(1, `invalid-hu-${i}`));
    });
    expect(lewFit.apply('dong', { type: 'selfHu', version: lewFit.version }).ok).toBe(false);
    expect(lewFit.viewFor(null).lastHand).toBeNull();
    for (const s of [seri, lewFit]) for (const viewer of [null, ...SEAT_ORDER]) {
      const hidden = new Set(SEAT_ORDER.filter(seat => seat !== viewer).flatMap(seat => s.serialize().state.players[seat].hand.map(t => t.id)));
      expect(containsTile(s.viewFor(viewer), hidden)).toBe(false);
    }
  });

  it('hides claim eligibility from other seats and spectators, with a claimant-independent deadline', () => {
    const a = claimSession(['nan']), b = claimSession(['xi', 'bei']);
    expect(a.pendingDecisions().map(d => d.seat)).toEqual(['nan']);
    expect(b.pendingDecisions().map(d => d.seat)).toEqual(['xi', 'bei']);
    for (const viewer of [null, 'dong'] as const) {
      expect(a.viewFor(viewer)).toEqual(b.viewFor(viewer));
      expect(a.viewFor(viewer).pendingDecisions).toEqual([]);
      expect(a.viewFor(viewer).claimWindow).toEqual({ deadline: clock + 15000 });
    }
    // Public timing is persisted separately, rather than derived from private decisions.
    const changed = a.serialize();
    changed.decisions[0]!.deadline += 4000;
    const restored = TableSession.deserialize(changed, now);
    expect(restored.viewFor(null)).toEqual(a.viewFor(null));
    expect(restored.viewFor('dong')).toEqual(a.viewFor('dong'));
  });

  it('returns detached views and snapshots', () => {
    const s = session(), original = s.serialize();
    s.viewFor('dong').hand.splice(0);
    s.viewFor('dong').players.nan.flowers.push(tile(1));
    s.serialize().state.wall.tiles.splice(0);
    expect(s.serialize()).toEqual(original);
  });

  it('runs without the wall clock, browser globals or random source', () => {
    const date = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('wall clock'); });
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('unseeded'); });
    try { const s = session(12, bots); for (let i = 0; i < 20; i++) advance(s); }
    finally { date.mockRestore(); random.mockRestore(); }
  });
});

describe('multiplayer timeouts', () => {
  it.each(['turn', 'claim'] as const)('%s timeout publishes AFK with exactly one version change', kind => {
    const s = kind === 'turn' ? session() : claimSession();
    const seat = kind === 'turn' ? 'dong' : 'nan';
    let version = s.version;
    const beforeVersion = version, published: ReturnType<TableSession['viewFor']>[] = [];
    Object.defineProperty(s, 'version', {
      get: () => version,
      set: (value: number) => { version = value; published.push(s.viewFor(null)); },
    });
    clock = s.pendingDecisions().find(d => d.seat === seat)!.deadline;
    expect(s.timeout(seat)).toEqual({ ok: true, version: beforeVersion + 1 });
    expect(published).toHaveLength(1);
    expect(published[0]!.players[seat].afk).toBe(true);
    expect(published[0]).toEqual(s.viewFor(null));
    const after = s.serialize();
    expect(s.timeout(seat).ok).toBe(false);
    expect(s.serialize()).toEqual(after);
    expect(published).toHaveLength(1);
  });

  it.each(['draw', 'discard', 'claim'] as const)('rolls back a %s timeout after the engine mutates and throws', path => {
    const s = path === 'claim' ? claimSession() : path === 'draw' ? rig(d => {
      d.state.phase = 'TURN_DRAW'; d.state.selfDrawSeat = null; d.state.players.dong.hand.pop();
    }) : session();
    const seat = path === 'claim' ? 'nan' : 'dong';
    const before = s.serialize();
    clock = s.pendingDecisions().find(d => d.seat === seat)!.deadline;
    const originalDraw = GameEngine.prototype.startTurnDraw;
    const originalDiscard = GameEngine.prototype.discard;
    const originalResolve = GameEngine.prototype.resolveClaimWindow;
    const spy = path === 'draw' ? vi.spyOn(GameEngine.prototype, 'startTurnDraw').mockImplementation(function (this: GameEngine, seat) {
      originalDraw.call(this, seat); throw new Error('injected timeout failure');
    }) : path === 'discard' ? vi.spyOn(GameEngine.prototype, 'discard').mockImplementation(function (this: GameEngine, seat, tileId) {
      originalDiscard.call(this, seat, tileId); throw new Error('injected timeout failure');
    }) : vi.spyOn(GameEngine.prototype, 'resolveClaimWindow').mockImplementation(function (this: GameEngine) {
      originalResolve.call(this); throw new Error('injected timeout failure');
    });
    try {
      expect(s.timeout(seat)).toMatchObject({ ok: false, code: 'illegal_action', message: 'injected timeout failure' });
      expect(s.serialize()).toEqual(before);
    } finally { spy.mockRestore(); }
    expect(s.timeout(seat)).toEqual({ ok: true, version: before.version + 1 });
  });

  it('does nothing before the deadline; discards the drawn tile and retains a disconnected seat', () => {
    const s = session(), id = s.viewFor('dong').drawnTileId;
    expect(s.timeout('dong')).toMatchObject({ code: 'not_due' });
    s.setConnected('dong', false);
    expire(s, 'dong');
    const v = s.viewFor('dong');
    expect(v.hand.some(t => t.id === id)).toBe(false);
    expect(v.players.dong).toMatchObject({ connected: false, afk: true });
    s.setConnected('dong', true);
    expect(s.viewFor('dong').players.dong.connected).toBe(true);
    expect(s.serialize().options.seats.dong).toBe('human');
  });

  it('discards a Hu-completing tile without declaring Hu', () => {
    const s = rig(d => {
      d.options.settings.kimEnabled = false;
      d.state.rules.kimEnabled = false;
      d.state.players.dong.hand = [1, 1, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8, 9, 9].map((v, i) => tile(v, `hu-${i}`));
    });
    expect(s.viewFor('dong').legal!.canSelfDrawHu).toBe(true);
    expire(s, 'dong');
    expect(s.viewFor(null).phase).not.toBe('RESOLVED_HU');
    expect(s.viewFor(null).match.hands).toHaveLength(0);
  });

  it.each(['dedicated', 'natural'] as const)('timeout discards Kim under the proposed %s exception; manual discard stays illegal', mode => {
    const s = rig(d => {
      d.options.settings.kimMode = mode;
      d.state.rules.kimMode = mode;
      d.state.players.dong.hand[13] = { ...tile(0, 'timeout-kim', 'kim'), isKim: true };
    });
    expect(s.apply('dong', { type: 'discard', tileId: 'timeout-kim', version: s.version }).ok).toBe(false);
    expire(s, 'dong');
    expect(s.viewFor('dong').hand.some(t => t.id === 'timeout-kim')).toBe(false);
    expect(s.serialize().state.rules.kimDiscardAllowed).toBe(false);
    expect(s.serialize().state.rules.kimMode).toBe(mode);
  });

  it.each(['flower', 'season'] as const)('replaces a drawn %s recursively before discarding the replacement', bonus => {
    const s = rig(d => {
      d.state.phase = 'TURN_DRAW'; d.state.selfDrawSeat = null;
      d.state.players.dong.hand.pop();
      const w = d.state.wall;
      w.tiles[w.headIndex] = tile(1, 'bonus-head', bonus);
      w.tiles[w.tailIndex] = tile(2, 'bonus-tail', bonus);
      w.tiles[w.tailIndex - 1] = tile(9, 'replacement');
    });
    expire(s, 'dong');
    const v = s.viewFor('dong');
    expect(v.players.dong.flowers.map(t => t.id)).toEqual(expect.arrayContaining(['bonus-head', 'bonus-tail']));
    expect(v.hand.some(t => t.id === 'replacement')).toBe(false);
    expect(v.pendingDiscard?.tile.id === 'replacement' || v.players.dong.discards.some(t => t.id === 'replacement')).toBe(true);
  });

  it('wall exhaustion during bonus replacement ends as Seri', () => {
    const s = rig(d => {
      d.state.phase = 'TURN_DRAW'; d.state.selfDrawSeat = null; d.state.players.dong.hand.pop();
      d.state.wall = { ...d.state.wall, tailIndex: d.state.wall.headIndex };
      d.state.wall.tiles[d.state.wall.headIndex] = tile(1, 'last-flower', 'flower');
    });
    expire(s, 'dong');
    expect(s.viewFor(null).phase).toBe('DRAW_SERI');
    expect(s.viewFor(null).match.hands).toHaveLength(1);
    expect(s.pendingDecisions()).toEqual([]);
  });

  it('claims keep their original deadlines when another seat answers', () => {
    const s = rig(d => {
      d.state.players.dong.hand[13] = tile(3, 'deadline-discard');
      for (const seat of ['nan', 'xi'] as const) {
        d.state.players[seat].hand[0] = tile(3, `${seat}-a`);
        d.state.players[seat].hand[1] = tile(3, `${seat}-b`);
      }
    });
    expect(s.apply('dong', { type: 'discard', tileId: 'deadline-discard', version: s.version }).ok).toBe(true);
    const deadline = s.pendingDecisions().find(d => d.seat === 'xi')!.deadline;
    clock += 1000;
    expect(s.apply('nan', { type: 'pass', version: s.version }).ok).toBe(true);
    expect(s.pendingDecisions().find(d => d.seat === 'xi')!.deadline).toBe(deadline);
    expect(s.viewFor('nan').legal!.canPass).toBe(false);
    expect(s.apply('nan', { type: 'pass', version: s.version }).ok).toBe(false);
  });

  it.each(['ankong', 'kakan'] as const)('discards the %s replacement on timeout and records the completed payment', kind => {
    const s = rig(d => {
      d.state.players.dong.hand = Array.from({ length: 14 }, (_, i) => tile(i < 4 ? 1 : i % 9 + 1, `kong-${i}`, i < 4 ? 'dragon' : 'ban'));
      if (kind === 'kakan') {
        d.state.players.dong.melds = [{ type: 'pung', tiles: d.state.players.dong.hand.splice(0, 3) }];
      }
      for (const seat of ['nan', 'xi', 'bei'] as const) d.state.players[seat].hand = Array.from({ length: 13 }, (_, i) => tile(i % 9 + 1, `${seat}-${i}`, 'sok'));
      d.state.wall.tiles[d.state.wall.tailIndex] = tile(9, 'kong-replacement');
    });
    expect(s.apply('dong', kind === 'ankong' ? { type: 'ankong', tileIds: ['kong-0', 'kong-1', 'kong-2', 'kong-3'], version: s.version }
      : { type: 'kakan', tileId: 'kong-3', meldIndex: 0, version: s.version }).ok).toBe(true);
    expect(s.viewFor('dong').drawnTileId).toBe('kong-replacement');
    expect(s.serialize().payments).toHaveLength(1);
    expire(s, 'dong');
    expect(s.viewFor('dong').hand.some(t => t.id === 'kong-replacement')).toBe(false);
  });

  it.each(['pung', 'jia'] as const)('keeps an accepted %s claim committed when its following turn expires', kind => {
    const s = rig(d => {
      d.state.players.dong.hand[13] = tile(3, 'actual-discard');
      for (const seat of ['nan', 'xi', 'bei'] as const) d.state.players[seat].hand = Array.from({ length: 13 }, (_, i) => tile(i % 9 + 1, `${seat}-${i}`, 'sok'));
      d.state.players.nan.hand[0] = tile(kind === 'pung' ? 3 : 1, 'actual-a');
      d.state.players.nan.hand[1] = tile(kind === 'pung' ? 3 : 2, 'actual-b');
    });
    expect(s.apply('dong', { type: 'discard', tileId: 'actual-discard', version: s.version }).ok).toBe(true);
    expect(s.apply('nan', { type: 'claim', kind, tileIds: ['actual-a', 'actual-b'], version: s.version }).ok).toBe(true);
    expect(s.viewFor('nan').drawnTileId).toBeNull();
    const rightmost = sortTiles(s.viewFor('nan').hand).at(-1)!.id;
    expire(s, 'nan');
    expect(s.viewFor('nan').players.nan.melds[0]?.type).toBe(kind);
    expect(s.viewFor('nan').hand.some(t => t.id === rightmost)).toBe(false);
  });

  it.each(['pung', 'jia'] as const)('after %s discards the right-most sorted tile, not the last array entry', kind => {
    const s = rig(d => {
      d.state.selfDrawSeat = null;
      d.state.players.dong.hand = [9, 1, 8, 2, 7, 3, 6, 4, 5, 2, 1].map((v, i) => tile(v, `claim-${i}`));
      d.state.players.dong.melds = [{ type: kind, tiles: [tile(1), tile(2), tile(3)], claimedFrom: 'bei' }];
    });
    const id = sortTiles(s.viewFor('dong').hand).at(-1)!.id;
    expire(s, 'dong');
    expect(s.viewFor('dong').hand.some(t => t.id === id)).toBe(false);
    expect(s.viewFor('dong').players.dong.melds).toHaveLength(1);
  });

  it.each(['pung', 'kong', 'jia', 'hu'] as const)('%s claim timeout passes with no timer on seats without a prompt', kind => {
    // Reach a claim window using the public discard API, with known eligibility.
    let s = rig(d => {
      for (const seat of SEAT_ORDER) if (seat !== 'dong') d.state.players[seat].hand = Array.from({ length: 13 }, (_, i) => tile((i % 9) + 1, `${seat}-${i}`, 'ban'));
      d.state.players.dong.hand[13] = tile(3, 'discard-me');
      d.state.players.nan.hand = kind === 'hu'
        ? [1, 1, 1, 2, 2, 2, 4, 4, 4, 5, 5, 3, 3].map((v, i) => tile(v, `nan-hu-${i}`))
        : [...Array.from({ length: kind === 'kong' ? 3 : 2 }, (_, i) => tile(kind === 'jia' ? i + 1 : 3, `nan-match-${i}`)), ...Array.from({ length: kind === 'kong' ? 10 : 11 }, (_, i) => tile(9, `nan-filler-${i}`, 'sok'))];
    });
    expect(s.apply('dong', { type: 'discard', tileId: 'discard-me', version: s.version }).ok).toBe(true);
    expect(s.pendingDecisions().map(d => d.seat)).toContain('nan');
    expect(s.pendingDecisions().every(d => d.kind === 'claim')).toBe(true);
    s = TableSession.deserialize(s.serialize(), now);
    expire(s, 'nan');
    expect(s.viewFor('nan').players.nan.afk).toBe(true);
    expect(s.viewFor(null).phase).not.toBe('RESOLVED_HU');
    expect(s.pendingDecisions().some(d => d.seat === 'nan' && d.kind === 'claim')).toBe(false);
  });
});
