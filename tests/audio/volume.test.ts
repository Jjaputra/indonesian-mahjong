import { describe, expect, it } from 'vitest';
import { effectiveGain } from '../../src/audio';

describe('perceptual audio mix', () => {
  it('multiplies squared master and channel sliders with the mix trim', () => {
    expect(effectiveGain(0.5, 0.5)).toBe(0.0625);
    expect(effectiveGain(1, 0.5, 0.6)).toBe(0.15);
    expect(effectiveGain(1, 0.4)).toBeCloseTo(0.16);
    expect(effectiveGain(0.1, 1)).toBeCloseTo(0.01);
    expect(effectiveGain(0, 1)).toBe(0);
    expect(effectiveGain(1, 0)).toBe(0);
  });
  it('clamps invalid slider values', () => {
    expect(effectiveGain(2, 2)).toBe(1);
    expect(effectiveGain(-1, 1)).toBe(0);
    expect(effectiveGain(1, NaN)).toBe(0);
  });
});
