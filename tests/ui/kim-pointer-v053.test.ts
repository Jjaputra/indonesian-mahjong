import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MatchResultNote, TableInfo } from '@/ui/components/MatchBoard';
import { createMatch, recordHand } from '@/ui/match';

const base = { roundWind: 'dong' as const, kimEnabled: true, minHuTay: 5 };

describe('v0.5.3 Kim indicator in the table info', () => {
  it('shows the face-up indicator tile next to a natural Kim', () => {
    const html = renderToStaticMarkup(createElement(TableInfo, { ...base,
      kimFace: { type: 'tong', value: 5 }, kimIndicator: { type: 'tong', value: 4 } }));
    expect(html).toContain('class="table-info-pointer"');
    expect(html).toMatch(/<dt>Penunjuk<\/dt><dd><span class="tile tile-sm[^]*?<\/span> 4 Tong <small>\(3 tile tersisa\)<\/small>/);
  });

  it('omits the indicator when it is missing, or Kim is the dedicated tile or off', () => {
    for (const props of [
      { kimFace: { type: 'tong', value: 5 } as const },
      { kimFace: { type: 'tong', value: 5 } as const, kimIndicator: null },
      { kimFace: null, kimIndicator: { type: 'tong', value: 4 } as const },
      { kimFace: { type: 'tong', value: 5 } as const, kimIndicator: { type: 'tong', value: 4 } as const, kimEnabled: false },
    ]) {
      expect(renderToStaticMarkup(createElement(TableInfo, { ...base, ...props }))).not.toContain('Penunjuk');
    }
  });
});

describe('v0.5.3 Seri result note', () => {
  it('says the dealer moves on after a Seri, like every other game', () => {
    const m = recordHand(createMatch(), null, false, 0);
    const html = renderToStaticMarkup(createElement(MatchResultNote, { match: m }));
    expect(html).toContain('Seri. Dealer pindah ke Bot Kanan');
    expect(html).not.toContain('tetap');
  });
});
