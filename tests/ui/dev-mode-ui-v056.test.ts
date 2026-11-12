/**
 * v0.5.6 developer mode UI: Settings switch with its warning, Uji Tangan sandbox (live receipt,
 * hand code load / copy helpers), "Buka di Uji Tangan" on the Hu modal, Alat developer, opponent
 * reveal, and the "DEV · tidak dicatat" mark on Tabel Total Poin.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHandCode, type DevHand } from '@/dev/hand-code';
import { getPreset, type GameSettings } from '@/storage';
import { DevTools, FacePicker, PICKER_KEYS } from '@/ui/components/DevTools';
import { OpponentPanel } from '@/ui/components/GameTable';
import { EMPTY_DRAFT, HandSandbox, draftCode, evaluateDraft, meldFrom, sandboxSettings, tileCount, tileTarget } from '@/ui/components/HandSandbox';
import { HuResultModal } from '@/ui/components/HuResultModal';
import { MatchScoreboard } from '@/ui/components/MatchBoard';
import { SettingsModal } from '@/ui/components/SettingsModal';
import { GameController, type HuOutcome } from '@/ui/game-controller';
import { createMatch } from '@/ui/match';

const noop = () => undefined;
const settings = (patch: Partial<GameSettings> = {}): GameSettings => ({ ...getPreset('tournament'), soundEnabled: false, ...patch });
const SAMPLE = '1234567891m | pung 555m | win 1m buangan:W | seat S | round E | bunga 2';
const hand = (code: string): DevHand => {
  const parsed = parseHandCode(code);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.hand;
};
const memoryStorage = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

describe('v0.5.6 developer mode settings', () => {
  it('shows the switch and the one-line warning only when the app wires it', () => {
    const on = renderToStaticMarkup(createElement(SettingsModal, { settings: settings(), onSave: noop, onClose: noop, devMode: true, onDevModeChange: noop }));
    expect(on).toContain('Mode developer');
    expect(on).toContain('Untuk cek skor. Game di mode ini tidak dicatat ke riwayat.');
    expect(on).toMatch(/<input type="checkbox" checked=""\/><span>Mode developer/);
    const off = renderToStaticMarkup(createElement(SettingsModal, { settings: settings(), onSave: noop, onClose: noop }));
    expect(off).not.toContain('Mode developer');
  });
});

describe('v0.5.6 Uji Tangan sandbox', () => {
  it('picker offers all 34 faces plus bunga and musim (KIM on request)', () => {
    expect(PICKER_KEYS).toHaveLength(42);
    const html = renderToStaticMarkup(createElement(FacePicker, { onPick: noop, kim: true }));
    expect(html.match(/<button/g)).toHaveLength(43);
    expect(renderToStaticMarkup(createElement(FacePicker, { onPick: noop, bonus: false })).match(/<button/g)).toHaveLength(34);
  });

  it('one tap builds a meld; Jia needs a suited start 1–7', () => {
    const five = { type: 'ban', value: 5 } as const;
    expect(meldFrom('pung', five)).toHaveLength(3);
    expect(meldFrom('ankong', five)).toHaveLength(4);
    expect(meldFrom('jia', five)!.map((f) => f.value)).toEqual([5, 6, 7]);
    expect(meldFrom('jia', { type: 'ban', value: 8 })).toBeNull();
    expect(meldFrom('jia', { type: 'wind', value: 1 })).toBeNull();
  });

  it('counts tiles against 14 plus one per Kong', () => {
    const h = hand(SAMPLE);
    expect(tileCount(h)).toBe(14);
    expect(tileTarget({ melds: [...h.melds, { type: 'kong', faces: [] }] })).toBe(15);
  });

  it('waits for a winning tile, then scores live; invalid hands surface the validator message', () => {
    expect(evaluateDraft(EMPTY_DRAFT, settings())).toEqual({ kind: 'waiting', text: 'Pilih tile menang untuk menghitung skor.' });
    const ok = evaluateDraft(hand(SAMPLE), settings());
    expect(ok.kind).toBe('ok');
    if (ok.kind === 'ok') {
      expect(ok.result.scoring.isValidHu).toBe(true);
      expect(Object.values(ok.result.roundScore!.deltas).reduce((a, b) => a + b, 0)).toBe(0);
    }
    const short = evaluateDraft({ ...hand(SAMPLE), concealed: [] }, settings());
    expect(short).toEqual({ kind: 'error', text: 'Jumlah tile harus 14 ditambah satu untuk setiap Kong.' });
  });

  it('Kim choice picks the scoring mode: face → natural, KIM tile → dedicated, none → off', () => {
    expect(sandboxSettings(settings(), { ...EMPTY_DRAFT, kimFace: { type: 'ban', value: 3 } })).toMatchObject({ kimEnabled: true, kimMode: 'natural' });
    expect(sandboxSettings(settings(), { ...EMPTY_DRAFT, concealed: [{ type: 'kim', value: 0 }] })).toMatchObject({ kimEnabled: true, kimMode: 'dedicated' });
    expect(sandboxSettings(settings({ kimEnabled: true }), EMPTY_DRAFT)).toMatchObject({ kimEnabled: false, kimMode: 'off' });
  });

  it('"Salin kode" text round-trips through the parser', () => {
    expect(draftCode(EMPTY_DRAFT)).toBeNull();
    const code = draftCode(hand(SAMPLE))!;
    expect(hand(code)).toEqual(hand(SAMPLE));
  });

  it('renders the Hu receipt pieces for a prefilled hand: Tay table, minimum check, Round Score Σ 0', () => {
    const html = renderToStaticMarkup(createElement(HandSandbox, { settings: settings(), initial: hand(SAMPLE), onClose: noop }));
    expect(html).toContain('Uji Tangan');
    expect(html).toContain('Total Tay');
    expect(html).toContain('✓ Memenuhi minimum Hu');
    expect(html).toContain('Round Score');
    expect(html).toContain('Σ 0 · kit-kit ✓');
    expect(html).toContain('Kursi Selatan');
    expect(html).toContain('14/14 tile');
    for (const label of ['+ Pung', '+ Kong', '+ Kong tertutup', '+ Jia', 'Giliran pertama', 'Pao Chin', 'Setelah kong', 'Salin kode', 'Muat kode']) expect(html).toContain(label);
  });

  it('empty sandbox asks for a winning tile and keeps Salin kode disabled', () => {
    const html = renderToStaticMarkup(createElement(HandSandbox, { settings: settings(), onClose: noop }));
    expect(html).toContain('Pilih tile menang untuk menghitung skor.');
    expect(html).toMatch(/<button type="button" class="btn" disabled="">[^]*?Salin kode/);
  });
});

describe('v0.5.6 developer entry points', () => {
  const c = new GameController({ settings: settings(), seed: 3, saveHistory: false, storage: memoryStorage(), devMode: true });

  it('Hu modal shows "Buka di Uji Tangan" only when wired', () => {
    const outcome = { kind: 'hu', winner: 'nan', winningTile: { id: 'w', type: 'ban', value: 1 }, winMethod: 'tsumo', hand: [], melds: [], flowers: [],
      scoring: { isValidHu: true, totalTay: 5, minHuTay: 5, patterns: [], mode: 'NK' }, roundScore: null, durationSeconds: 1 } as unknown as HuOutcome;
    expect(renderToStaticMarkup(createElement(HuResultModal, { outcome, onClose: noop, onNewGame: noop, onOpenSandbox: noop }))).toContain('Buka di Uji Tangan');
    expect(renderToStaticMarkup(createElement(HuResultModal, { outcome, onClose: noop, onNewGame: noop }))).not.toContain('Buka di Uji Tangan');
  });

  it('Alat developer lists the three tools', () => {
    const html = renderToStaticMarkup(createElement(DevTools, { controller: c, revealOpponents: false, onRevealChange: noop }));
    for (const label of ['Alat developer', 'Atur tangan saya', 'Tile berikutnya', 'Lihat tangan lawan']) expect(html).toContain(label);
    expect(html).toContain('aria-pressed="false"');
  });

  it('opponent reveal renders the concealed tiles face-up', () => {
    const n = c.getState().players.xi.hand.length;
    const hidden = renderToStaticMarkup(createElement(OpponentPanel, { seat: 'xi', position: 'top', controller: c }));
    const shown = renderToStaticMarkup(createElement(OpponentPanel, { seat: 'xi', position: 'top', controller: c, reveal: true }));
    expect(hidden.match(/tile-back/g)).toHaveLength(n);
    expect(shown).not.toContain('tile-back');
    expect(shown).toContain('concealed is-revealed');
    expect(shown.match(/role="img"/g)!.length).toBeGreaterThanOrEqual(n);
  });

  it('Tabel Total Poin marks a rigged match', () => {
    const m = createMatch();
    const plain = renderToStaticMarkup(createElement(MatchScoreboard, { match: m, hand: 1, prevailingWind: 'dong', dealer: 'dong' }));
    expect(plain).not.toContain('DEV · tidak dicatat');
    const rigged = renderToStaticMarkup(createElement(MatchScoreboard, { match: { ...m, dev: true }, hand: 1, prevailingWind: 'dong', dealer: 'dong' }));
    expect(rigged).toContain('DEV · tidak dicatat');
  });
});
