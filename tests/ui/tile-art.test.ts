import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createCompleteTileSet, keyToTile, tileToKey } from '@/core/tiles';
import { getTileFace, tileAccessibleLabel } from '@/ui/labels';
import { TileArt } from '@/ui/components/TileArt';
import { TileView, type TileSize } from '@/ui/components/TileView';

const art = (key: string) => renderToStaticMarkup(createElement(TileArt, { tile: keyToTile(key) }));
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('original SVG tile art', () => {
  it('draws a complete SVG face for every distinct tile in the inventory', () => {
    const keys = [...new Set(createCompleteTileSet().map(tileToKey))];
    // 27 suited + 4 winds + 3 dragons + 4 Bunga + 4 Musim + Kim
    expect(keys).toHaveLength(43);
    for (const key of keys) {
      const html = art(key);
      expect(html, key).toMatch(/^<svg class="tile-art art-[a-z]+" viewBox="0 0 60 80" aria-hidden="true"/);
      expect(html, key).toMatch(/<(circle|rect|text|path|polygon|ellipse)/);
      expect(html, key).toMatch(/<\/svg>$/);
    }
  });

  it('keeps the inventory at four of each bonus family and four Kim tiles', () => {
    const set = createCompleteTileSet();
    expect(set.filter((t) => t.type === 'flower').map((t) => t.value).sort()).toEqual([1, 2, 3, 4]);
    expect(set.filter((t) => t.type === 'season').map((t) => t.value).sort()).toEqual([1, 2, 3, 4]);
    expect(set.filter((t) => t.type === 'kim')).toHaveLength(4);
  });

  it('Tong faces show exactly as many countable dots as their number', () => {
    for (let v = 1; v <= 9; v++) expect(count(art(`${v}T`), 'class="art-dot"'), `${v}T`).toBe(v);
  });

  it('Sok faces show one stick per number, and 1 Sok is a bird', () => {
    expect(art('1S')).toContain('art-bird');
    expect(art('1S')).not.toContain('art-stick');
    for (let v = 2; v <= 9; v++) expect(count(art(`${v}S`), 'class="art-stick"'), `${v}S`).toBe(v);
  });

  it('Ban faces carry a Chinese numeral, a red 萬 and a readable corner number', () => {
    const numerals = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
    numerals.forEach((n, i) => {
      const html = art(`${i + 1}B`);
      expect(html).toContain(`>${n}</text>`);
      expect(html).toMatch(/fill="#c0392b"[^>]*>萬<\/text>/);
      expect(html).toMatch(new RegExp(`class="art-index"[^>]*>${i + 1}</text>`));
    });
  });

  it('winds show the character with an Indonesian direction letter', () => {
    const expected = [['WD', '東', 'T', 'Timur'], ['WN', '南', 'S', 'Selatan'], ['WX', '西', 'B', 'Barat'], ['WB', '北', 'U', 'Utara']];
    for (const [key, glyph, letter, word] of expected) {
      const html = art(key!);
      expect(html).toContain(`>${glyph}</text>`);
      expect(html).toMatch(new RegExp(`class="art-index"[^>]*>${letter}</text>`));
      expect(html).toContain(`>${word}</text>`);
    }
  });

  it('dragons: red 中, green 發, and an empty frame instead of 白', () => {
    expect(art('DZ')).toMatch(/fill="#c0392b"[^>]*>中<\/text>/);
    expect(art('DF')).toMatch(/fill="#1d7a47"[^>]*>發<\/text>/);
    const white = art('DP');
    expect(white).toContain('art-white-frame');
    expect(white).not.toContain('白');
    expect(white).not.toContain('<text');
  });

  it('Bunga numbers are blue and Musim numbers are red (tiles rev2.pdf p. 2); artwork differs per family', () => {
    for (let v = 1; v <= 4; v++) {
      const flower = art(`F${v}`);
      const season = art(`M${v}`);
      expect(flower).toMatch(new RegExp(`class="art-bonus-number"[^>]*fill="#1f4e9c"[^>]*>${v}</text>`));
      expect(season).toMatch(new RegExp(`class="art-bonus-number"[^>]*fill="#c0392b"[^>]*>${v}</text>`));
      expect(flower).toContain('art-blossom');
      expect(season).toContain('art-season');
      expect(flower).not.toContain('art-season');
    }
  });

  it('Kim is drawn as its own legacy joker face', () => {
    const html = art('KIM');
    expect(html).toContain('art-kim');
    expect(html).toContain('>KIM</text>');
    expect(html).toContain('stroke-dasharray');
  });
});

describe('TileView with tile art', () => {
  const render = (key: string, size: TileSize) => renderToStaticMarkup(createElement(TileView, { tile: keyToTile(key), size }));

  it('bonus numbers stay in the SVG at the smallest size, and only fine print is marked as detail', () => {
    for (const key of ['F1', 'F4', 'M1', 'M4']) {
      const html = render(key, 'sm');
      expect(html).toContain('tile-sm');
      expect(html).toContain('class="art-bonus-number"');
      // the bonus number is never the hidden-on-small "art-detail" element
      expect(html).not.toMatch(/class="art-detail"[^>]*>[1-4]<\/text>/);
    }
  });

  it('keeps canonical names for scoring/logs and adds learner cues to the accessible label', () => {
    expect(render('5T', 'md')).toContain('aria-label="5 Tong"');
    expect(render('F2', 'sm')).toContain('aria-label="Bunga 2, bunga hitam 蘭 Anggrek, angka &amp; huruf biru"');
    expect(render('M3', 'sm')).toContain('aria-label="Musim 3, bunga merah 秋 Gugur, angka &amp; huruf merah"');
    expect(render('WN', 'md')).toContain('aria-label="Angin Nan, Selatan"');
    expect(render('DP', 'md')).toContain('Naga Pat, naga putih, bingkai kosong');
    expect(tileAccessibleLabel(getTileFace(keyToTile('KIM')))).toContain('KIM (Joker)');
    expect(getTileFace(keyToTile('F2')).title).toBe('Bunga 2');
  });

  it('static tiles expose an image role while hand tiles stay buttons', () => {
    expect(render('3S', 'sm')).toMatch(/^<span class="tile tile-sm tone-sok" role="img"/);
    const button = renderToStaticMarkup(createElement(TileView, { tile: keyToTile('3S'), size: 'lg', onClick: () => undefined }));
    expect(button).toMatch(/^<button type="button" class="tile tile-lg tone-sok is-clickable"/);
    expect(button).toContain('aria-label="3 Sok"');
  });
});
