import { describe, expect, it } from 'vitest';
import { levelIndexFromQuery } from './level';

describe('levelIndexFromQuery', () => {
  it('converts the 1-based level number to a 0-based index', () => {
    expect(levelIndexFromQuery('?level=1', 3)).toBe(0);
    expect(levelIndexFromQuery('?level=3', 3)).toBe(2);
  });

  it('gives null when the parameter is missing', () => {
    expect(levelIndexFromQuery('', 3)).toBeNull();
    expect(levelIndexFromQuery('?other=2', 3)).toBeNull();
  });

  it('gives null for out-of-range or invalid values', () => {
    for (const value of ['0', '4', '-1', '1.5', 'abc', '']) {
      expect(levelIndexFromQuery(`?level=${value}`, 3)).toBeNull();
    }
  });
});
