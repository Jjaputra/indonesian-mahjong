/**
 * Round 2: persistence and propagation of the scoring basis and flower rule, the frozen rules
 * of a match in progress, and how results/history describe the column vs actual Kim usage.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { keyToTile } from '@/core/tiles';
import {
  HOUSE_SETTINGS,
  MemoryStorage,
  PRACTICE_SCORING_DEFAULTS,
  SETTINGS_STORAGE_KEY,
  TOURNAMENT_SETTINGS,
  detectPreset,
  getPreset,
  historyScoringFields,
  loadGameHistory,
  loadSettings,
  saveGameRecord,
  saveSettings,
  toGameRules,
  updateSettings,
  withPracticeScoringDefaults,
  type GameSettings,
} from '@/storage';
import { GameController } from '@/ui/game-controller';
import { toFullRules } from '@/ui/win-context';
import { activeRulesSummary, buildHuReceipt, historyColumnLabel, scoringColumnSummary } from '@/ui/tay-calculator';
import { MainMenu } from '@/ui/components/MainMenu';
import { HistoryModal } from '@/ui/components/HistoryModal';
import { SettingsModal } from '@/ui/components/SettingsModal';
import { scoringEngine } from '@/scoring';
import { parseTileHand } from '@/core/tiles';
import { buildWinContext } from '@/ui/win-context';
import type { HuOutcome } from '@/ui/game-controller';

const stored = (store: MemoryStorage) => JSON.parse(store.getItem(SETTINGS_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
const noop = () => undefined;

describe('Round 2 · presets keep the PDF reference separate from house choices', () => {
  it('the PDF reference preset keeps legacy hand usage and per-tile flower values', () => {
    expect(TOURNAMENT_SETTINGS.scoringBasis).toBe('hand_kim_usage');
    expect(TOURNAMENT_SETTINGS.bonusTileRule).toBe('rulebook_per_tile');
    expect(HOUSE_SETTINGS).toMatchObject(PRACTICE_SCORING_DEFAULTS);
    expect(detectPreset(getPreset('house'))).toBe('house');
    expect(detectPreset(getPreset('tournament'))).toBe('tournament');
    expect(detectPreset({ ...getPreset('tournament'), bonusTileRule: 'own_seat_only' })).toBe('custom');
  });

  it('toGameRules / toFullRules propagate the active basis and flower rule, and omit legacy defaults', () => {
    expect(toGameRules(TOURNAMENT_SETTINGS)).not.toHaveProperty('scoringBasis');
    expect(toGameRules(TOURNAMENT_SETTINGS)).not.toHaveProperty('bonusTileRule');
    expect(toGameRules(HOUSE_SETTINGS)).toMatchObject({ scoringBasis: 'match_table', bonusTileRule: 'own_seat_only' });
    expect(toFullRules(HOUSE_SETTINGS)).toMatchObject({ scoringBasis: 'match_table', bonusTileRule: 'own_seat_only', kimEnabled: true });
  });
});

describe('Round 2 · practice defaults never overwrite an explicit choice', () => {
  it('fresh storage: practice follows the house defaults, but nothing is written for them', () => {
    const store = new MemoryStorage();
    const practice = withPracticeScoringDefaults(loadSettings(store), store);
    expect(practice).toMatchObject(PRACTICE_SCORING_DEFAULTS);
    updateSettings({ soundEnabled: false }, store);
    expect(stored(store)).not.toHaveProperty('scoringBasis');
    expect(stored(store)).not.toHaveProperty('bonusTileRule');
    expect(withPracticeScoringDefaults(loadSettings(store), store)).toMatchObject(PRACTICE_SCORING_DEFAULTS);
  });

  it('an explicitly stored PDF choice survives practice defaults and unrelated updates', () => {
    const store = new MemoryStorage();
    saveSettings({ ...getPreset('tournament') }, store);
    updateSettings({ soundEnabled: false, kimEnabled: false }, store);
    const practice = withPracticeScoringDefaults(loadSettings(store), store);
    expect(practice.scoringBasis).toBe('hand_kim_usage');
    expect(practice.bonusTileRule).toBe('rulebook_per_tile');
    expect(practice.kimEnabled).toBe(false);
  });

  it('a changed choice is persisted; the other one keeps following the default', () => {
    const store = new MemoryStorage();
    updateSettings({ bonusTileRule: 'rulebook_per_tile' }, store);
    expect(stored(store).bonusTileRule).toBe('rulebook_per_tile');
    expect(stored(store)).not.toHaveProperty('scoringBasis');
    const practice = withPracticeScoringDefaults(loadSettings(store), store);
    expect(practice.bonusTileRule).toBe('rulebook_per_tile');
    expect(practice.scoringBasis).toBe('match_table');
  });

  it('legacy records without the fields and corrupted values fall back safely', () => {
    const store = new MemoryStorage();
    store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ kimEnabled: true, scoringBasis: 'nonsense', bonusTileRule: 7 }));
    expect(loadSettings(store)).toMatchObject({ scoringBasis: 'hand_kim_usage', bonusTileRule: 'rulebook_per_tile' });
    expect(withPracticeScoringDefaults(loadSettings(store), store)).toMatchObject(PRACTICE_SCORING_DEFAULTS);
  });
});

function play(c: GameController): void {
  for (let i = 0; i < 3000 && !c.outcome; i++) {
    if (!c.isWaitingForHuman()) {
      c.step();
      continue;
    }
    const a = c.getHumanActions();
    if (a.canReplaceFlowers) c.humanReplaceFlowers();
    else if (a.claim) c.humanClaim(a.claim.canHu ? 'hu' : 'pass');
    else if (a.canDraw) c.humanDraw();
    else if (a.canSelfDrawHu) c.humanSelfDrawHu();
    else {
      const hand = c.getState().players[c.humanSeat].hand;
      c.humanDiscard([...hand].reverse().find((t) => a.discardableTileIds.includes(t.id))!.id);
    }
  }
}

describe('Round 2 · a match freezes its rules until the next hand', () => {
  it('basis and flower rule edits mid-match apply only after newGame', () => {
    const house: GameSettings = { ...HOUSE_SETTINGS, soundEnabled: false };
    const c = new GameController({ settings: house, seed: 7, saveHistory: false });
    c.setSettings({ ...house, scoringBasis: 'hand_kim_usage', bonusTileRule: 'rulebook_per_tile', kimEnabled: false });
    expect(c.getSettings()).toMatchObject({ scoringBasis: 'match_table', bonusTileRule: 'own_seat_only', kimEnabled: true });
    c.newGame();
    expect(c.getSettings()).toMatchObject({ scoringBasis: 'hand_kim_usage', bonusTileRule: 'rulebook_per_tile', kimEnabled: false });
  });

  it('live Hu results carry the active basis, the table column and the real Kim count', () => {
    let checked = 0;
    for (const kimEnabled of [true, false]) {
      for (let seed = 1; seed <= 40 && checked < 4; seed++) {
        const c = new GameController({ settings: { ...HOUSE_SETTINGS, kimEnabled, kimMode: kimEnabled ? 'dedicated' : 'off', soundEnabled: false }, seed, saveHistory: false });
        play(c);
        const o = c.outcome;
        if (!o || o.kind !== 'hu') continue;
        expect(o.scoring.scoringBasis).toBe('match_table');
        expect(o.scoring.bonusTileRule).toBe('own_seat_only');
        expect(o.scoring.mode).toBe(kimEnabled ? 'K' : 'NK');
        const kims = [...o.hand, ...o.melds.flatMap((m) => m.tiles)].filter((t) => t.type === 'kim').length;
        expect(o.scoring.handKimCount).toBe(kims);
        expect(o.scoring.patterns.some((p) => p.id === 7 && p.tay === 0)).toBe(false);
        checked++;
        break;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(2);
  });
});

describe('Round 2 · results and history explain the column vs actual Kim usage', () => {
  const win = keyToTile('7S', 2);
  const hand = parseTileHand('1T 1T 1T 5S 5S 5S 9B 9B 9B 3T 3T 3T 7S');
  const ctx = buildWinContext('nan', 'dong', win, { isSelfDraw: false, isRobbingKong: false, consecutiveKongs: 0, isFirstGoAround: false, isPaoChin: false });
  const scoring = scoringEngine.evaluateHand(hand, [], [], ctx, toFullRules(HOUSE_SETTINGS));

  it('summary and receipt name the table column, why it was chosen, and the Kim actually held', () => {
    expect(scoringColumnSummary(scoring)).toBe('Kolom tabel Ada Kim (pilihan pertandingan) · Kim di tangan: 0');
    const outcome: HuOutcome = { kind: 'hu', winner: 'nan', winningTile: win, winMethod: 'ron', discarder: 'dong', hand: [...hand, win], melds: [], flowers: [], scoring, durationSeconds: 10 };
    const text = buildHuReceipt(outcome);
    expect(text).toContain('Kolom tabel Ada Kim (pilihan pertandingan) · Kim di tangan: 0');
    expect(text).toContain('hanya posisi sendiri');
    expect(text).toContain('Catatan: Hand tanpa Kim (Bo KIM terdeteksi)');
    expect(activeRulesSummary(HOUSE_SETTINGS)).toBe('Tabel Ada Kim untuk semua Hu (semua Kim natural: Bo KIM/NK) · Bunga/Musim hanya posisi sendiri');
    expect(activeRulesSummary(TOURNAMENT_SETTINGS)).toBe('Kolom menurut Kim di tangan · Bunga/Musim per tile (PDF)');
  });

  it('history stores the scoring fields; legacy rows keep their old label and no invented Kim count', () => {
    const store = new MemoryStorage();
    const base = { winner: 'nan' as const, winningHand: [win], winningTile: win, scoringBreakdown: [], totalTay: scoring.totalTay, isWithKim: scoring.isWithKim, winMethod: 'ron' as const, durationSeconds: 1 };
    saveGameRecord({ ...base, id: 'new', timestamp: 2, ...historyScoringFields(scoring) }, store);
    saveGameRecord({ ...base, id: 'old', timestamp: 1 }, store);
    store.setItem('itm.history.v1', JSON.stringify([...JSON.parse(store.getItem('itm.history.v1')!), { ...base, id: 'bad', timestamp: 0, tableColumn: 'X', handKimCount: -2 }]));
    const [fresh, legacy, bad] = loadGameHistory(store);
    expect(fresh).toMatchObject({ scoringBasis: 'match_table', tableColumn: 'K', bonusTileRule: 'own_seat_only', handKimCount: 0 });
    expect(historyColumnLabel(fresh!)).toBe('Tabel Ada Kim · 0 Kim di tangan');
    expect(legacy).not.toHaveProperty('tableColumn');
    expect(legacy).not.toHaveProperty('handKimCount');
    expect(historyColumnLabel(legacy!)).toBe('Tanpa Kim');
    expect(bad).not.toHaveProperty('tableColumn');
    expect(bad).not.toHaveProperty('handKimCount');
    const html = renderToStaticMarkup(createElement(HistoryModal, { history: [fresh!, legacy!], onDelete: noop, onClear: noop, onClose: noop }));
    expect(html).toContain('Ada Kim');
    expect(html).toContain('Tanpa Kim');
  });
});

describe('Public preferences preserve advanced scoring configuration', () => {
  it('pregame offers only the Kim choice and game start', () => {
    const html = renderToStaticMarkup(createElement(MainMenu, {
      difficultyLabel: 'Normal', lastResult: null, onPractice: noop,
      kimEnabled: true, onKimChange: noop,
    }));
    expect(html).toContain('Kim dari tile');
    expect(html).toContain('Tanpa Kim');
    expect(html).not.toMatch(/PDF|aturan rumah|Bunga:|dealer|Tabel:/);
  });

  it('settings render compact preferences without mutating the full configuration', () => {
    const settings = Object.freeze({ ...HOUSE_SETTINGS, minHuTay: 12, scoringBasis: 'hand_kim_usage' as const });
    const before = { ...settings };
    const html = renderToStaticMarkup(createElement(SettingsModal, { settings, onSave: noop, onClose: noop }));
    expect(html).toContain('Simpan');
    expect(html).toContain('Suara');
    expect(html).not.toMatch(/PDF|Aturan rumah|Kolom tabel|Bunga.Musim individual|Minimum Tay/);
    expect(settings).toEqual(before);
  });
});
