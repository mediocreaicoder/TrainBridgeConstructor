import { describe, expect, it } from 'vitest';
import { SHAKE_SECONDS, shakeOffset, spawnSplash, stepDroplets } from './effects';

describe('splash droplets', () => {
  const water = 150;

  it('throws droplets upwards from the splash point, the same way every time', () => {
    const droplets = spawnSplash({ x: 160, y: water }, 7);
    expect(droplets.length).toBeGreaterThan(5);
    expect(droplets.every((d) => d.velocity.y < 0)).toBe(true);
    expect(spawnSplash({ x: 160, y: water }, 7)).toEqual(droplets);
  });

  it('lets the droplets rise, fall back and disappear', () => {
    let droplets = spawnSplash({ x: 160, y: water });
    droplets = stepDroplets(droplets, 0.1, water);
    expect(droplets.every((d) => d.position.y < water)).toBe(true);
    for (let i = 0; i < 40; i++) droplets = stepDroplets(droplets, 0.05, water);
    expect(droplets).toEqual([]);
  });
});

describe('shakeOffset', () => {
  it('is still when the shake is over', () => {
    expect(shakeOffset(0, 1.23)).toEqual({ x: 0, y: 0 });
  });

  it('moves by whole units, never more than the amplitude', () => {
    for (let t = 0; t < 1; t += 0.013) {
      const { x, y } = shakeOffset(SHAKE_SECONDS, t);
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      expect(Math.abs(x)).toBeLessThanOrEqual(2);
      expect(Math.abs(y)).toBeLessThanOrEqual(2);
    }
  });
});
