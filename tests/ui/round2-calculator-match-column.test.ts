/**
 * Round 2: the Tay calculator opens on the column of the match in play (active rules, not
 * next-game edits) and keeps its standalone defaults when no match is given.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HOUSE_SETTINGS, TOURNAMENT_SETTINGS, type GameSettings } from '@/storage';
import { GameController } from '@/ui/game-controller';
import { TayCalculator } from '@/ui/components/TayCalculator';
import { calculatorMatchProps, matchColumnWithKim } from '@/ui/tay-calculator';

type Props = Parameters<typeof TayCalculator>[0];
const render = (props: Props) => renderToStaticMarkup(createElement(TayCalculator, props));

/** Column checkbox state, the summary badge and the #39 row cells of a rendered calculator. */
function read(html: string) {
  const box = html.match(/<input type="checkbox"( checked="")?\/>(Pertandingan Ada Kim|Hand memiliki)/);
  const badge = html.match(/<span class="badge badge-kim">([^<]+)<\/span>/)?.[1];
  const row39 = html.match(/<tr[^>]*>(?:(?!<\/tr>).)*aria-label="Pilih Se Sam Pu Tat"(?:(?!<\/tr>).)*<\/tr>/)?.[0] ?? '';
  const cells = [...row39.matchAll(/<td class="([^"]*num[^"]*)">([^<]+)<\/td>/g)].map((m) => ({ active: m[1]!.includes('col-active'), value: m[2] }));
  return { checked: !!box?.[1], badge, k: cells[0], nk: cells[1], row39 };
}

describe('Round 2 · calculator column follows the match', () => {
  it('opens on Ada Kim from a pregame Ada Kim match (house rules) and #39 shows the printed K 40', () => {
    const html = render(calculatorMatchProps(HOUSE_SETTINGS));
    const v = read(html);
    expect(v.checked).toBe(true);
    expect(v.badge).toBe('Ada Kim');
    expect(html).toContain('Mengikuti pertandingan: Ada Kim');
    expect(v.k).toEqual({ active: true, value: '40' });
    expect(v.nk).toEqual({ active: false, value: '40' });
    expect(v.row39).not.toContain('disabled');
  });

  it('pregame switch to Tanpa Kim opens on Tanpa Kim, where #39 also scores 40', () => {
    const html = render(calculatorMatchProps({ ...HOUSE_SETTINGS, kimEnabled: false }));
    const v = read(html);
    expect(v.checked).toBe(false);
    expect(v.badge).toBe('Tanpa Kim');
    expect(html).toContain('Mengikuti pertandingan: Tanpa Kim');
    expect(v.nk).toEqual({ active: true, value: '40' });
    expect(v.row39).not.toContain('disabled');
  });

  it('mid-hand next-game edits do not move the column; the next game does', () => {
    const house: GameSettings = { ...HOUSE_SETTINGS, soundEnabled: false };
    const c = new GameController({ settings: house, seed: 3, saveHistory: false });
    c.setSettings({ ...house, kimEnabled: false });
    expect(calculatorMatchProps(c.getSettings()).matchKimEnabled).toBe(true);
    expect(read(render(calculatorMatchProps(c.getSettings()))).badge).toBe('Ada Kim');
    c.newGame();
    expect(calculatorMatchProps(c.getSettings()).matchKimEnabled).toBe(false);
    expect(read(render(calculatorMatchProps(c.getSettings()))).badge).toBe('Tanpa Kim');
  });

  it('sync rule: only the match-table basis follows the match; hand usage and standalone stay manual', () => {
    expect(matchColumnWithKim(true, 'match_table')).toBe(true);
    expect(matchColumnWithKim(false, 'match_table')).toBe(false);
    expect(matchColumnWithKim(true, 'hand_kim_usage')).toBeNull();
    expect(matchColumnWithKim(undefined, 'match_table')).toBeNull();
  });

  it('PDF reference (hand usage) with a Kim match keeps the manual hand checkbox on Tanpa Kim', () => {
    const html = render(calculatorMatchProps(TOURNAMENT_SETTINGS));
    const v = read(html);
    expect(v.checked).toBe(false);
    expect(html).toContain('Hand memiliki / menggunakan Kim');
    expect(html).not.toContain('Mengikuti pertandingan');
    expect(v.nk).toEqual({ active: true, value: '40' });
  });

  it('standalone calculator without match props keeps the legacy defaults', () => {
    const html = render({ defaultMinHuTay: 5 });
    const v = read(html);
    expect(v.checked).toBe(false);
    expect(v.badge).toBe('Tanpa Kim');
    expect(html).not.toContain('Mengikuti pertandingan');
    expect(v.k).toEqual({ active: false, value: '40' });
    expect(v.nk).toEqual({ active: true, value: '40' });
  });

  it('labels only Thi Fu → Pao Chin as rulebook text and marks house rules as not PDF', () => {
    const html = render(calculatorMatchProps(HOUSE_SETTINGS));
    expect(html).toContain('Hanya Thi Fu → Pao Chin tertulis di rulebook; pasangan lain belum terkonfirmasi.');
    expect(html).toContain('bukan teks PDF');
    expect(html).not.toContain('Kebijakan eksklusif rulebook');
  });
});
