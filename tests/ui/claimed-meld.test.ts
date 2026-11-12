import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { keyToTile } from '@/core/tiles';
import type { Meld } from '@/core/types';
import { MeldView, claimedMeldOrder } from '@/ui/components/TileView';

const t = (key: string, copy = 1) => keyToTile(key, copy);

describe('claimed meld layout', () => {
  it('turns the claimed tile sideways toward the seat it came from', () => {
    // Engine order: the owner's own tiles, then the claimed discard.
    const pung: Meld = { type: 'pung', tiles: [t('5T', 1), t('5T', 2), t('5T', 3)], claimedFrom: 'xi' };
    expect(claimedMeldOrder({ ...pung, claimedFrom: 'bei' }, 'dong').tiles.map((x) => x.id)[0]).toBe('tong-5-3'); // left
    expect(claimedMeldOrder(pung, 'dong').tiles.map((x) => x.id)[1]).toBe('tong-5-3'); // opposite
    expect(claimedMeldOrder({ ...pung, claimedFrom: 'nan' }, 'dong').tiles.map((x) => x.id)[2]).toBe('tong-5-3'); // right
    const jia: Meld = { type: 'jia', tiles: [t('7B'), t('9B'), t('8B')], claimedFrom: 'dong' };
    expect(claimedMeldOrder(jia, 'nan')).toEqual({ tiles: [t('8B'), t('7B'), t('9B')], claimedId: 'ban-8-1' });
  });

  it('marks exactly one claimed tile; Ankong and unknown owners stay upright', () => {
    const kong: Meld = { type: 'kong', tiles: [t('WN', 1), t('WN', 2), t('WN', 3), t('WN', 4)], claimedFrom: 'xi' };
    expect((renderToString(createElement(MeldView, { meld: kong, owner: 'dong' })).match(/is-claimed/g) ?? []).length).toBe(1);
    expect(renderToString(createElement(MeldView, { meld: kong }))).not.toContain('is-claimed');
    const ankong: Meld = { type: 'ankong', tiles: [t('2S', 1), t('2S', 2), t('2S', 3), t('2S', 4)] };
    expect(renderToString(createElement(MeldView, { meld: ankong, owner: 'dong' }))).not.toContain('is-claimed');
  });
});
