import { describe, expect, it } from 'vitest';
import { isUnlocked, startingLevelIndex, starsFor, withResult } from './progress';

describe('isUnlocked', () => {
  it('always opens the first level', () => {
    expect(isUnlocked(1, new Map())).toBe(true);
  });

  it('opens a level once the one before it has at least one star', () => {
    expect(isUnlocked(2, new Map())).toBe(false);
    expect(isUnlocked(2, new Map([[1, 1]]))).toBe(true);
    expect(isUnlocked(4, new Map([[1, 4], [2, 2]]))).toBe(false);
  });
});

describe('withResult', () => {
  it('keeps the best result', () => {
    let stars = withResult(new Map(), 1, 2);
    expect(starsFor(1, stars)).toBe(2);
    stars = withResult(stars, 1, 1);
    expect(starsFor(1, stars)).toBe(2);
    stars = withResult(stars, 1, 4);
    expect(starsFor(1, stars)).toBe(4);
  });

  it('returns the same map when nothing improved', () => {
    const stars = new Map([[1, 3]]);
    expect(withResult(stars, 1, 2)).toBe(stars);
  });
});

describe('startingLevelIndex', () => {
  const ids = [1, 2, 3];

  it('starts at the first level without stars', () => {
    expect(startingLevelIndex(ids, new Map())).toBe(0);
    expect(startingLevelIndex(ids, new Map([[1, 1]]))).toBe(1);
  });

  it('starts at the last level when all have stars', () => {
    expect(startingLevelIndex(ids, new Map([[1, 1], [2, 4], [3, 2]]))).toBe(2);
  });
});
