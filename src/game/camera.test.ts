import { describe, expect, it } from 'vitest';
import { cssToWorld, fitCamera } from './camera';
import type { Level } from './level';

/** fitCamera only reads the playfield size, so the rest of the level can be empty. */
const level: Level = {
  id: 0,
  name: 'Test',
  width: 320,
  height: 180,
  terrain: [],
  waterY: null,
  anchors: [],
  bridgeStart: { x: 0, y: 0 },
  bridgeEnd: { x: 320, y: 0 },
};

describe('fitCamera', () => {
  it('shows exactly the playfield when the aspect ratio matches', () => {
    expect(fitCamera(640, 360, level)).toEqual({
      viewWidth: 320,
      viewHeight: 180,
      left: 0,
      top: 0,
    });
  });

  it('adds landscape on the sides of a wide screen and centres the playfield', () => {
    // 2.5 CSS px per unit (limited by height) → 1000 / 2.5 = 400 units wide.
    expect(fitCamera(1000, 450, level)).toEqual({
      viewWidth: 400,
      viewHeight: 180,
      left: -40,
      top: 0,
    });
  });

  it('adds landscape above and below on a portrait screen', () => {
    // 390 / 320 CSS px per unit (limited by width) → 844 css px ≈ 692.5 units tall.
    const camera = fitCamera(390, 844, level);
    expect(camera.viewWidth).toBe(320);
    expect(camera.viewHeight).toBe(693);
    expect(camera.left).toBe(0);
    expect(camera.top).toBe(Math.round((180 - 693) / 2));
  });

  it('always keeps the whole playfield visible', () => {
    for (const [width, height] of [
      [375, 667],
      [667, 375],
      [1, 1],
      [1920, 1080],
      [333, 777],
    ] as const) {
      const camera = fitCamera(width, height, level);
      expect(camera.left).toBeLessThanOrEqual(0);
      expect(camera.top).toBeLessThanOrEqual(0);
      expect(camera.left + camera.viewWidth).toBeGreaterThanOrEqual(level.width);
      expect(camera.top + camera.viewHeight).toBeGreaterThanOrEqual(level.height);
    }
  });
});

describe('cssToWorld', () => {
  const camera = fitCamera(1000, 450, level); // left -40, 400×180 units

  it('maps the canvas corners to the camera edges', () => {
    expect(cssToWorld(camera, 0, 0, 1000, 450)).toEqual({ x: -40, y: 0 });
    expect(cssToWorld(camera, 1000, 450, 1000, 450)).toEqual({ x: 360, y: 180 });
  });

  it('maps the canvas centre to the playfield centre', () => {
    expect(cssToWorld(camera, 500, 225, 1000, 450)).toEqual({ x: 160, y: 90 });
  });
});
