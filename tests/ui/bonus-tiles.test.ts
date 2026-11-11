/**
 * Bonus tile visuals follow the supplied tile sheet (tiles.pdf p. 2) and the user's clarification
 * "Bunga biru = Musim": Musim 1–4 春夏秋冬 carry blue numerals and glyphs, Bunga 1–4 梅蘭竹菊 carry red ones.
 * Internal types, IDs and scoring values are unchanged; only colours, flower order and wording moved.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createCompleteTileSet, getTileIndonesianLabel, getTileUnicode, keyToTile, parseTileHand } from '@/core/tiles';
import type { BonusTileRule, GameRules, Seat, Tile } from '@/core/types';
import { scoringEngine, type ScoringResult } from '@/scoring';
import { getTileFace, tileAccessibleLabel } from '@/ui/labels';
import { TileArt } from '@/ui/components/TileArt';
import { TileView } from '@/ui/components/TileView';
import { OpponentPanel } from '@/ui/components/GameTable';
import { TayCalculator } from '@/ui/components/TayCalculator';
import { GameController } from '@/ui/game-controller';
import { getPreset } from '@/storage';
import { buildWinContext } from '@/ui/win-context';

const BLUE = '#1f4e9c';
const RED = '#c0392b';
const SEASONS = [
  [1, '春', 'Semi'],
  [2, '夏', 'Panas'],
  [3, '秋', 'Gugur'],
  [4, '冬', 'Dingin'],
] as const;
const FLOWERS = [
  [1, '梅', 'Plum'],
  [2, '蘭', 'Anggrek'],
  [3, '竹', 'Bambu'],
  [4, '菊', 'Krisan'],
] as const;

const art = (key: string) => renderToStaticMarkup(createElement(TileArt, { tile: keyToTile(key) }));
const view = (key: string, size: 'sm' | 'md' | 'lg') => renderToStaticMarkup(createElement(TileView, { tile: keyToTile(key), size }));
const numberInk = (html: string, v: number) => html.match(new RegExp(`class="art-bonus-number"[^>]*fill="(#[0-9a-f]{6})"[^>]*>${v}</text>`))?.[1];
const glyphInk = (html: string, glyph: string) => html.match(new RegExp(`class="art-detail art-bonus-glyph"[^>]*fill="(#[0-9a-f]{6})"[^>]*>${glyph}</text>`))?.[1];

describe('bonus tile SVG ink (tiles rev2.pdf p. 2)', () => {
  it('Musim numbers and glyphs are red at every tile size', () => {
    for (const [v, glyph] of SEASONS) {
      for (const html of [art(`M${v}`), view(`M${v}`, 'sm'), view(`M${v}`, 'lg')]) {
        expect(numberInk(html, v), `M${v}`).toBe(RED);
        expect(glyphInk(html, glyph), `M${v}`).toBe(RED);
        expect(html).not.toContain(`fill="${BLUE}"`);
      }
    }
  });

  it('Bunga numbers and glyphs are blue at every tile size', () => {
    for (const [v, glyph] of FLOWERS) {
      for (const html of [art(`F${v}`), view(`F${v}`, 'sm'), view(`F${v}`, 'lg')]) {
        expect(numberInk(html, v), `F${v}`).toBe(BLUE);
        expect(glyphInk(html, glyph), `F${v}`).toBe(BLUE);
        expect(html).not.toContain(`fill="${RED}"`);
      }
    }
  });

  it('each of the eight bonus tiles has its own artwork, F3 bamboo and F4 chrysanthemum', () => {
    const arts = ['F1', 'F2', 'F3', 'F4', 'M1', 'M2', 'M3', 'M4'].map((k) => art(k).match(/data-art="([a-z]+-\d)"/)?.[1]);
    expect(arts).toEqual(['flower-1', 'flower-2', 'flower-3', 'flower-4', 'season-1', 'season-2', 'season-3', 'season-4']);
    const bodies = ['F1', 'F2', 'F3', 'F4', 'M1', 'M2', 'M3', 'M4'].map((k) => art(k).replace(/<text[\s\S]*?<\/text>/g, '').replace(/data-art="[^"]*"/, ''));
    expect(new Set(bodies).size).toBe(8);
    expect(glyphInk(art('F3'), '竹')).toBe(BLUE);
    expect(glyphInk(art('F4'), '菊')).toBe(BLUE);
    expect(art('F3')).toContain('class="art-blossom"');
    expect(art('M3')).toContain('class="art-season"');
  });
});

describe('bonus tile names, order and hints', () => {
  it('reference names 1–4 in printed order', () => {
    for (const [v, glyph, name] of FLOWERS) {
      expect(getTileFace(keyToTile(`F${v}`)).main).toBe(glyph);
      expect(getTileFace(keyToTile(`F${v}`)).title).toBe(`Bunga ${v}`);
      expect(tileAccessibleLabel(getTileFace(keyToTile(`F${v}`)))).toBe(`Bunga ${v}, bunga hitam ${glyph} ${name}, angka & huruf biru`);
    }
    for (const [v, glyph, name] of SEASONS) {
      expect(getTileFace(keyToTile(`M${v}`)).main).toBe(glyph);
      expect(getTileFace(keyToTile(`M${v}`)).title).toBe(`Musim ${v}`);
      expect(tileAccessibleLabel(getTileFace(keyToTile(`M${v}`)))).toBe(`Musim ${v}, bunga merah ${glyph} ${name}, angka & huruf merah`);
    }
    expect(['F1', 'F2', 'F3', 'F4'].map((k) => getTileIndonesianLabel(keyToTile(k)))).toEqual([
      'Bunga 1 (Plum / 梅)',
      'Bunga 2 (Anggrek / 蘭)',
      'Bunga 3 (Bambu / 竹)',
      'Bunga 4 (Krisan / 菊)',
    ]);
    expect(['M1', 'M2', 'M3', 'M4'].map((k) => getTileIndonesianLabel(keyToTile(k)))).toEqual([
      'Musim 1 (Musim Semi / 春)',
      'Musim 2 (Musim Panas / 夏)',
      'Musim 3 (Musim Gugur / 秋)',
      'Musim 4 (Musim Dingin / 冬)',
    ]);
  });

  it('Unicode bonus glyphs follow the standard plum/orchid/bamboo/chrysanthemum and spring–winter blocks', () => {
    expect(['F1', 'F2', 'F3', 'F4'].map((k) => getTileUnicode(keyToTile(k)))).toEqual(['🀢', '🀣', '🀤', '🀥']);
    expect(['M1', 'M2', 'M3', 'M4'].map((k) => getTileUnicode(keyToTile(k)))).toEqual(['🀦', '🀧', '🀨', '🀩']);
  });

  it('keeps four of each family with the same IDs', () => {
    const set = createCompleteTileSet();
    expect(set.filter((t) => t.type === 'flower').map((t) => t.id).sort()).toEqual(['flower-1-1', 'flower-2-1', 'flower-3-1', 'flower-4-1']);
    expect(set.filter((t) => t.type === 'season').map((t) => t.id).sort()).toEqual(['season-1-1', 'season-2-1', 'season-3-1', 'season-4-1']);
  });

  it('public bonus tiles retain readable artwork and accessible names', () => {
    const season = view('M1', 'sm');
    const flower = view('F4', 'sm');
    expect(season).toContain('aria-label="Musim 1, bunga merah 春 Semi, angka &amp; huruf merah"');
    expect(flower).toContain('aria-label="Bunga 4, bunga hitam 菊 Krisan, angka &amp; huruf biru"');
    expect(numberInk(season, 1)).toBe(RED);
    expect(numberInk(flower, 4)).toBe(BLUE);
  });

  it('calculator keeps the rulebook wording but adds the tile-sheet ink beside it', () => {
    const html = renderToStaticMarkup(createElement(TayCalculator, { defaultMinHuTay: 5 }));
    expect(html).toContain('Kembang hitam (sesuai posisi duduk +1) (istilah rulebook; di tile: Bunga = bunga hitam: angka &amp; huruf biru)');
    expect(html).toContain('Kembang merah (sesuai posisi duduk +1) (istilah rulebook; di tile: Musim = bunga merah: angka &amp; huruf merah)');
  });

  it('table bonus rack keeps tiles and own seat number without instructional paragraphs', () => {
    const c = new GameController({ settings: { ...getPreset('tournament'), soundEnabled: false }, seed: 11, saveHistory: false });
    const real = c.getState();
    const withRack = (flowers: Tile[]) => {
      const state = { ...real, players: { ...real.players, nan: { ...real.players.nan, flowers } } };
      const stub = new Proxy(c, { get: (t, k) => (k === 'getState' ? () => state : Reflect.get(t, k, t)) });
      return renderToStaticMarkup(createElement(OpponentPanel, { seat: 'nan', position: 'right', controller: stub }));
    };
    const both = withRack([keyToTile('M2'), keyToTile('F3')]);
    expect(both).toContain('<small>Nomor sendiri: 2</small>');
    expect(both).toContain('aria-label="Musim 2,');
    expect(both).toContain('aria-label="Bunga 3,');
    expect(both).not.toContain('bonus posisi +1');
    expect(withRack([keyToTile('F1')])).toContain('<small>Nomor sendiri: 2</small>');
    expect(withRack([])).toContain('Belum ada Bunga / Musim</span>');
  });
});

describe('bonus posisi +1 is unaffected by the visual correction', () => {
  const LEGACY: GameRules = { kimEnabled: true, kimDiscardAllowed: false, allowKimInMeldClaim: false, minHuTay: 5 };
  const HAND = parseTileHand('1T 2T 3T 4S 5S 6S 7B 8B 9B WN WN WN 4T');
  const WIN = keyToTile('4T', 2);
  const SEATS: readonly Seat[] = ['dong', 'nan', 'xi', 'bei'];
  const score = (seat: Seat, flowers: Tile[], bonusTileRule?: BonusTileRule): ScoringResult => {
    const ctx = buildWinContext(seat, 'dong', WIN, { isSelfDraw: false, isRobbingKong: false, consecutiveKongs: 0, isFirstGoAround: false, isPaoChin: false });
    return scoringEngine.evaluateHand(HAND, [], flowers, ctx, { ...LEGACY, ...(bonusTileRule ? { bonusTileRule } : {}) });
  };
  const tay = (r: ScoringResult, id: number) => r.patterns.find((p) => p.id === id)?.tay ?? 0;

  it('own_seat_only: the own-seat Bunga and Musim each earn exactly +1, off-seat tiles 0, for every seat', () => {
    SEATS.forEach((seat, i) => {
      const own = i + 1;
      const off = (i + 1) % 4 + 1;
      expect(tay(score(seat, [keyToTile(`M${own}`)], 'own_seat_only'), 2), `${seat} M${own}`).toBe(1);
      expect(tay(score(seat, [keyToTile(`F${own}`)], 'own_seat_only'), 1), `${seat} F${own}`).toBe(1);
      expect(tay(score(seat, [keyToTile(`M${off}`)], 'own_seat_only'), 2), `${seat} M${off}`).toBe(0);
      expect(tay(score(seat, [keyToTile(`F${off}`)], 'own_seat_only'), 1), `${seat} F${off}`).toBe(0);
    });
  });

  it('PDF reference preset stays per-tile base plus own-seat bonus (Musim 1+1, Bunga 0+1)', () => {
    SEATS.forEach((seat, i) => {
      const own = i + 1;
      const off = (i + 1) % 4 + 1;
      expect(tay(score(seat, [keyToTile(`M${own}`)], 'rulebook_per_tile'), 2)).toBe(2);
      expect(tay(score(seat, [keyToTile(`M${off}`)], 'rulebook_per_tile'), 2)).toBe(1);
      expect(tay(score(seat, [keyToTile(`F${own}`)], 'rulebook_per_tile'), 1)).toBe(1);
      expect(tay(score(seat, [keyToTile(`F${off}`)], 'rulebook_per_tile'), 1)).toBe(0);
    });
  });
});
