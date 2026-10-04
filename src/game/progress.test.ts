import { describe, expect, it } from 'vitest';
import { isUnlocked, startingLevelIndex } from './progress';

describe('isUnlocked', () => {
  it('always opens the first level', () => {
    expect(isUnlocked(1, new Set())).toBe(true);
  });

  it('opens a level once the one before it is completed', () => {
    expect(isUnlocked(2, new Set())).toBe(false);
    expect(isUnlocked(2, new Set([1]))).toBe(true);
    expect(isUnlocked(4, new Set([1, 2]))).toBe(false);
  });
});

describe('startingLevelIndex', () => {
  const ids = [1, 2, 3];

  it('starts at the first level not yet completed', () => {
    expect(startingLevelIndex(ids, new Set())).toBe(0);
    expect(startingLevelIndex(ids, new Set([1]))).toBe(1);
  });

  it('starts at the last level when all are completed', () => {
    expect(startingLevelIndex(ids, new Set([1, 2, 3]))).toBe(2);
  });
});
