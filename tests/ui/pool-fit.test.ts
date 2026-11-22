import { describe, expect, it } from 'vitest';
import { fitDiscardPool, type PoolFitInput } from '@/ui/components/GameTable';

const RATIO = 1.34;
const rowsOf = (count: number, cols: number) => Math.ceil(count / cols);
const widthOf = (width: number, gap: number, cols: number, scale: number) => ((width - 1 - (cols - 1) * gap) / cols) * scale;
/** Height the rows need when the pool lays out `count` tiles of this width (cols per row, as the stylesheet wraps them). */
const needed = (count: number, tile: number, cols: number, rowGap: number) => rowsOf(count, cols) * tile * RATIO + (rowsOf(count, cols) - 1) * rowGap;

/** What CenterArea did before: fixed columns, then shrink by 0.05 until the rows fit (tiles wrap per row by actual width; the 3px seat mark is counted here too). */
function legacyTile({ width, height, count, gap, rowGap, baseCols }: PoolFitInput): number {
  let scale = 1;
  const tile = (s: number) => widthAt(s);
  const widthAt = (s: number) => widthOf(width, gap, baseCols, s);
  const rows = (s: number) => Math.ceil(count / Math.max(1, Math.floor((width + gap) / (tile(s) + gap))));
  while (scale > 0.4 && rows(scale) * tile(scale) * RATIO + (rows(scale) - 1) * rowGap + 3 > height) scale = Math.round((scale - 0.05) * 100) / 100;
  return tile(scale);
}

/** Frames measured in a real browser (see .agents/pool-fit/): pool content box, stylesheet gaps and --pool-cols. */
const FRAMES: Record<string, Omit<PoolFitInput, 'count'>> = {
  'tablet 1280x690': { width: 536, height: 214, gap: 3, rowGap: 8, baseCols: 17 },
  'tablet 1200x740': { width: 483, height: 264, gap: 3, rowGap: 8, baseCols: 17 },
  'tablet 1024x600': { width: 399, height: 140, gap: 3, rowGap: 8, baseCols: 17 },
  'iPad 1180x820': { width: 469, height: 314, gap: 3, rowGap: 8, baseCols: 17 },
  'iPad 820x1180': { width: 522, height: 378, gap: 3, rowGap: 8, baseCols: 11 },
  'phone 390x844': { width: 193, height: 207, gap: 2, rowGap: 5, baseCols: 10 },
  'phone 844x390': { width: 634, height: 110, gap: 1, rowGap: 3, baseCols: 20 },
  'desktop 1440x900': { width: 643, height: 394, gap: 3, rowGap: 8, baseCols: 17 },
  'wide strip 760x100 (group photo)': { width: 760, height: 100, gap: 3, rowGap: 8, baseCols: 17 },
};

describe('fitDiscardPool', () => {
  it('uses two larger rows instead of one row of tiny tiles in a short, wide frame', () => {
    const input: PoolFitInput = { width: 760, height: 100, count: 40, gap: 3, rowGap: 8, baseCols: 17 };
    const fit = fitDiscardPool(input);
    const legacy = legacyTile(input);
    console.log('760x100, 40 tiles:', { ...fit, rows: rowsOf(40, fit.cols), legacyTile: Math.round(legacy * 10) / 10 });
    const oneRow = (760 - 1 - 39 * 3) / 40;
    expect(rowsOf(40, fit.cols)).toBe(2);
    expect(fit.tile).toBeGreaterThan(oneRow * 1.5);
    expect(fit.tile).toBeGreaterThanOrEqual(legacy - 0.01);
    expect(fit.tile).toBeGreaterThanOrEqual(22);
    expect(needed(40, fit.tile, fit.cols, fit.rowGap)).toBeLessThanOrEqual(100);
  });

  it('keeps one row of the stylesheet size when it all fits', () => {
    const fit = fitDiscardPool({ width: 643, height: 394, count: 6, gap: 3, rowGap: 8, baseCols: 17 });
    expect(rowsOf(6, fit.cols)).toBe(1);
    expect(fit.tile).toBeGreaterThanOrEqual(widthOf(643, 3, 17, 1));
    expect(fit.tile).toBeLessThanOrEqual(38);
  });

  it('chooses fewer columns and more rows when the frame is tall', () => {
    const wide = fitDiscardPool({ width: 400, height: 90, count: 36, gap: 3, rowGap: 8, baseCols: 17 });
    const tall = fitDiscardPool({ width: 400, height: 400, count: 36, gap: 3, rowGap: 8, baseCols: 17 });
    expect(tall.cols).toBeLessThan(wide.cols);
    expect(tall.tile).toBeGreaterThan(wide.tile);
  });

  it('never shrinks below the stylesheet size while that size fits', () => {
    const portrait = fitDiscardPool({ ...FRAMES['iPad 820x1180']!, count: 40 });
    expect(portrait.tile).toBeGreaterThanOrEqual(widthOf(522, 3, 11, 1) - 0.01);
  });

  it('tightens the row gap only to keep tiles from falling under the minimum', () => {
    const fit = fitDiscardPool({ width: 399, height: 100, count: 40, gap: 3, rowGap: 8, baseCols: 17 });
    expect(fit.rowGap).toBeLessThan(8);
    const roomy = fitDiscardPool({ width: 399, height: 240, count: 40, gap: 3, rowGap: 8, baseCols: 17 });
    expect(roomy.rowGap).toBe(8);
  });

  it('falls back to the stylesheet columns for an empty or unmeasured frame', () => {
    expect(fitDiscardPool({ width: 0, height: 0, count: 30, gap: 3, rowGap: 8, baseCols: 17 })).toMatchObject({ cols: 17, scale: 1, rowGap: 8 });
    expect(fitDiscardPool({ width: 500, height: 200, count: 0, gap: 3, rowGap: 8, baseCols: 17 })).toMatchObject({ cols: 17, scale: 1 });
  });

  it('fits every discard and beats the old shrink-only fit at each real frame size', () => {
    const rows: Record<string, string | number>[] = [];
    for (const [name, frame] of Object.entries(FRAMES)) {
      for (const count of [10, 40, 80]) {
        const input = { ...frame, count };
        const fit = fitDiscardPool(input);
        const legacy = legacyTile(input);
        rows.push({ frame: name, discards: count, cols: fit.cols, rows: rowsOf(count, fit.cols), tile: Math.round(fit.tile * 10) / 10, scale: Math.round(fit.scale * 1000) / 1000, rowGap: fit.rowGap, legacyTile: Math.round(legacy * 10) / 10 });
        expect(needed(count, fit.tile, fit.cols, fit.rowGap) + 3, `${name} / ${count}`).toBeLessThanOrEqual(input.height + 0.5);
        expect(fit.tile, `${name} / ${count}`).toBeGreaterThanOrEqual(legacy - 0.01);
        expect(fit.scale).toBeLessThanOrEqual(1);
        expect(fit.scale).toBeGreaterThan(0.3);
      }
    }
    console.table(rows);
  });
});
