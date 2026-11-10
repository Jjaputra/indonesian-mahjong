/**
 * Server-render smoke tests (Vitest runs in node without a DOM): every screen renders
 * without throwing and shows its key Bahasa Indonesia labels.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import App from '@/App';
import { keyToTile } from '@/core/tiles';
import { MemoryStorage, getPreset, saveGameRecord, loadGameHistory, type GameSettings } from '@/storage';
import { ActionHud, CenterArea, HumanArea, OpponentPanel, seatPositions } from '@/ui/components/GameTable';
import { HistoryDetail, HistoryModal } from '@/ui/components/HistoryModal';
import { HuResultModal } from '@/ui/components/HuResultModal';
import { SettingsModal, withPreset } from '@/ui/components/SettingsModal';
import { TayCalculator } from '@/ui/components/TayCalculator';
import { TileView } from '@/ui/components/TileView';
import { GameController } from '@/ui/game-controller';

const noop = () => undefined;
const settings = (patch: Partial<GameSettings> = {}): GameSettings => ({ ...getPreset('tournament'), soundEnabled: false, ...patch });

function finishedGame(): GameController {
  for (let seed = 1; seed < 50; seed++) {
    const c = new GameController({ settings: settings(), seed, saveHistory: false });
    let guard = 0;
    while (!c.outcome && guard++ < 3000) {
      c.runUntilHuman();
      const a = c.getHumanActions();
      if (a.claim) c.humanClaim(a.claim.canHu ? 'hu' : 'pass');
      else if (a.canSelfDrawHu) c.humanSelfDrawHu();
      else if (a.canDiscard) c.humanDiscard(a.discardableTileIds[a.discardableTileIds.length - 1]!);
    }
    if (c.outcome?.kind === 'hu') return c;
  }
  throw new Error('no Hu found');
}

describe('UI render smoke tests', () => {
  it('App first renders the main menu without dealing', () => {
    const html = renderToString(createElement(App));
    expect(html).toContain('Mahjong Tradisional Indonesia');
    expect(html).toContain('Kalkulator Tay');
    expect(html).toContain('Latihan');
    expect(html).toContain('Bandung Mahjong Cup ver06');
    expect(html).toContain('Timur');
    expect(html).not.toContain('Tembok');
    expect(html).not.toContain('Permainan Baru');
  });

  it('deferred controller stays undealt until practice starts', () => {
    const c = new GameController({ settings: settings(), autoStart: false, saveHistory: false });
    expect(c.getState().phase).toBe('INIT');
    expect(c.getState().players.dong.hand).toHaveLength(0);
    c.newGame();
    expect(c.getState().players.dong.hand.length).toBeGreaterThan(0);
  });

  it('table parts render seat winds, wall counter, Kim indicator and hand tiles', () => {
    const c = new GameController({ settings: settings(), seed: 11, saveHistory: false });
    const pos = seatPositions(c.humanSeat);
    expect(pos).toEqual({ bottom: 'dong', right: 'nan', top: 'xi', left: 'bei' });
    const actions = c.getHumanActions();
    const html = renderToString(
      createElement('div', null, [
        createElement(OpponentPanel, { key: 1, seat: 'nan', position: 'right', controller: c }),
        createElement(CenterArea, { key: 2, controller: c }),
        createElement(HumanArea, { key: 3, controller: c, actions, selectedId: null, onSelect: noop }),
        createElement(ActionHud, { key: 4, controller: c, actions, selectedId: null, onSelect: noop }),
      ])
    );
    expect(html).toContain('Buang');
    expect(html).toContain('practice-coach');
    expect(html).toContain('is-coached');
    expect(html).toContain('Tembok');
    expect(html).toContain('Selatan');
    expect(html).toContain('Timur');
    expect(html).toContain(`<b>${c.getState().wall.remainingCount}</b>`);
    expect(html).toContain('KIM aktif');
    expect((html.match(/tile-lg/g) ?? []).length).toBe(c.getState().players.dong.hand.length);
  });

  it('Kim tile shows the gold KIM badge', () => {
    const html = renderToString(createElement(TileView, { tile: keyToTile('KIM') }));
    expect(html).toContain('kim-badge');
    expect(html).toContain('tone-kim');
  });

  it('Hu result modal shows receipt sections', () => {
    const c = finishedGame();
    const html = renderToString(createElement(HuResultModal, { outcome: c.outcome!, onClose: noop, onNewGame: noop }));
    for (const label of ['Pemenang', 'Tile menang', 'Cara menang', 'Klasifikasi', 'Ada Kim', 'Tanpa Kim', 'Total Tay', 'Salin Struk', 'Rincian perhitungan']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('Memenuhi minimum Hu');
  });

  it('Seri modal renders', () => {
    const html = renderToString(createElement(HuResultModal, { outcome: { kind: 'seri', durationSeconds: 5 }, onClose: noop, onNewGame: noop }));
    expect(html).toContain('Seri');
  });

  it('Tay calculator renders all 44 patterns and the status line', () => {
    const html = renderToString(createElement(TayCalculator, { defaultMinHuTay: 5 }));
    expect((html.match(/aria-label="Pilih /g) ?? []).length).toBe(44);
    expect(html).toContain('Hand memiliki / menggunakan Kim');
    expect(html).toContain('Di bawah ambang Tay');
    expect(html).toContain('Bukan vonis Hu');
    expect(html).toContain('Salin hasil');
  });

  it('Settings modal renders every toggle; presets keep preferences', () => {
    const s = settings({ aiDifficulty: 'hard', soundEnabled: true });
    const html = renderToString(createElement(SettingsModal, { settings: s, onSave: noop, onClose: noop }));
    for (const label of ['Kim aktif', 'Kim boleh dibuang', 'Kim dalam Pung', 'Kim dalam Jia', 'Kim sebagai pasangan', 'Kim dalam Tris', 'Minimum Tay', 'Angin putaran', 'Dealer awal', 'Bunga/Musim', 'tumpang tindih', 'kesulitan AI', 'animasi', 'Suara', 'Turnamen', 'Kasual']) {
      expect(html).toContain(label);
    }
    const casual = withPreset(s, 'casual');
    expect(casual.allowKimInMeldClaim).toBe(getPreset('casual').allowKimInMeldClaim);
    expect(casual.aiDifficulty).toBe('hard');
    expect(casual.soundEnabled).toBe(true);
  });

  it('History modal renders stored games', () => {
    const storage = new MemoryStorage();
    saveGameRecord(
      { winner: 'xi', winningHand: [keyToTile('1T')], winningTile: keyToTile('1T'), scoringBreakdown: [{ id: 18, name: 'It Set', tay: 30 }], totalTay: 30, isWithKim: false, winMethod: 'tsumo', durationSeconds: 120 },
      storage
    );
    saveGameRecord({ winner: null, winningHand: [], winningTile: null, scoringBreakdown: [], totalTay: 0, isWithKim: false, winMethod: 'draw', durationSeconds: 300 }, storage);
    const html = renderToString(createElement(HistoryModal, { history: loadGameHistory(storage), onDelete: noop, onClear: noop, onClose: noop }));
    expect(html).toContain('Riwayat Permainan');
    expect(html).toContain('Bot Barat Hu');
    expect(html).toContain('Seri');
    expect(html).toContain('30 Tay');
  });

  it('history detail shows grouped melds and bonus tiles without repeating meld tiles', () => {
    const hand = keyToTile('1T');
    const meldTile = keyToTile('5T', 1);
    const html = renderToString(
      createElement(HistoryDetail, {
        record: {
          id: 'g',
          timestamp: 1,
          winner: 'dong',
          winningHand: [hand, meldTile],
          winningTile: hand,
          scoringBreakdown: [{ id: 4, name: '4 Tiles Bunga', tay: 10 }],
          totalTay: 10,
          isWithKim: false,
          winMethod: 'tsumo',
          durationSeconds: 12,
          flowers: [keyToTile('F2')],
          melds: [{ type: 'pung', tiles: [meldTile, keyToTile('5T', 2), keyToTile('5T', 3)], claimedFrom: 'nan' }],
        },
        onDelete: noop,
      }),
    );
    expect(html).toContain('Pung');
    expect(html).toContain('Bunga/Musim');
    expect(html).toContain('Bunga 2');
    expect(html.match(/aria-label="5 Tong"/g) ?? []).toHaveLength(3);
    expect(html.match(/aria-label="1 Tong"/g) ?? []).toHaveLength(2);
  });
});
