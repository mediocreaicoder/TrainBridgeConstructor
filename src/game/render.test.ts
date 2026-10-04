import { describe, expect, it } from 'vitest';
import { strainColor } from './render';

describe('strainColor', () => {
  it('goes from green through yellow to red', () => {
    expect(strainColor(0)).toBe('#3cc84a');
    expect(strainColor(0.5)).toBe('#ffd84a');
    expect(strainColor(1)).toBe('#e8302c');
  });

  it('ignores whether the beam is stretched or squeezed, and stays red past the limit', () => {
    expect(strainColor(-0.5)).toBe(strainColor(0.5));
    expect(strainColor(3)).toBe(strainColor(1));
  });
});
