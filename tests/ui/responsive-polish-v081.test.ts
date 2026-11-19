import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
const after = (marker: string) => css.slice(css.indexOf(marker));
const polish = after('v0.8.1 responsive polish');

describe('v0.8.1 responsive polish', () => {
  it('seat names stay on one line with an ellipsis, capped at 20 characters', () => {
    expect(polish).toMatch(/\.table-felt \.seat-head strong \{[^}]*max-width: min\(20ch, 100%\);[^}]*white-space: nowrap;/);
    expect(polish).toMatch(/\.table-felt \.seat-head strong \{[^}]*text-overflow: ellipsis;/);
  });

  it('stacked layouts draw one felt panel behind the top seat and the board, not behind the hand', () => {
    expect(polish).toMatch(/\.table-felt::before \{[^}]*grid-area: 1 \/ 1 \/ 3 \/ -1;/);
  });

  it('side seats show sets at the top seat size, and kongs as a 2x2 block', () => {
    expect(polish).toMatch(/:is\(\.seat-top, \.seat-left, \.seat-right\) \.seat-sets \.tile \{ --w: var\(--set-w\);/);
    expect(polish).toMatch(/\.meld-kong, \.meld-ankong\) \{[^}]*width: calc\(var\(--set-w\) \* 2 \+ 1px\);/);
  });

  it('phone hands size tiles from the row (container width), 14 slots or 15 after a Kong', () => {
    expect(polish).toMatch(/\.hand-row \{ container-type: inline-size; width: 100%; --hand-slots: 14;/);
    expect(polish).toMatch(/\.hand-row:has\(> \.tile:nth-child\(16\)\) \{ --hand-slots: 15; \}/);
    expect(polish).toMatch(/--w: min\(54px, calc\(\(100cqw - var\(--hand-fixed\)\) \/ var\(--hand-slots\)\)\);/);
  });

  it('side-seat name boxes take the column width so a long name ellipsizes', () => {
    expect(polish).toMatch(/:is\(\.seat-left, \.seat-right\) \.seat-head \{ width: 0; min-width: 100%; \}/);
  });

  it('short landscape phones wider than 900px get the same felt panel as 844x390', () => {
    expect(css).toMatch(/@media \(max-width: 900px\), \(orientation: landscape\) and \(max-height: 500px\) \{\s*\/\* Felt behind the first two rows/);
  });
});
