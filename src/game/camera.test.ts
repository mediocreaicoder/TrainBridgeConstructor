import { describe, expect, it } from 'vitest';
import {
  clampView,
  computeCamera,
  cssToWorld,
  fitCamera,
  MAX_ZOOM,
  viewWithAnchor,
} from './camera';
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
    expect(fitCamera(640, 360, level)).toMatchObject({
      viewWidth: 320,
      viewHeight: 180,
      left: 0,
      top: 0,
    });
  });

  it('adds landscape on the sides of a wide screen and centres the playfield', () => {
    // 2.5 CSS px per unit (limited by height) → 1000 / 2.5 = 400 units wide.
    expect(fitCamera(1000, 450, level)).toMatchObject({
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

describe('zoom', () => {
  const screen = { width: 640, height: 360 }; // exactly 2 CSS px per unit at zoom 1

  it('shows a smaller area with bigger pixels when zoomed in', () => {
    const camera = computeCamera(screen, level, { zoom: 2, center: { x: 100, y: 50 } });
    expect(camera.pixelScale).toBe(2);
    expect(camera.viewWidth).toBe(160);
    expect(camera.viewHeight).toBe(90);
    expect(camera.left).toBe(20);
    expect(camera.top).toBe(5);
  });

  it('keeps left/top on whole canvas pixels', () => {
    const camera = computeCamera(screen, level, { zoom: 3, center: { x: 100.123, y: 50.456 } });
    expect((camera.left * camera.pixelScale) % 1).toBeCloseTo(0);
    expect((camera.top * camera.pixelScale) % 1).toBeCloseTo(0);
  });

  it('clamps zoom between 1 and MAX_ZOOM', () => {
    const center = { x: 160, y: 90 };
    expect(clampView({ zoom: 0.5, center }, screen, level).zoom).toBe(1);
    expect(clampView({ zoom: 99, center }, screen, level).zoom).toBe(MAX_ZOOM);
  });

  it('does not pan at zoom 1, and keeps a zoomed view inside the zoom-1 area', () => {
    expect(clampView({ zoom: 1, center: { x: 0, y: 0 } }, screen, level).center).toEqual({
      x: 160,
      y: 90,
    });
    // At zoom 2 the view is 160×90, so its centre can go from (80,45) to (240,135).
    expect(clampView({ zoom: 2, center: { x: -50, y: 500 } }, screen, level).center).toEqual({
      x: 80,
      y: 135,
    });
  });

  it('keeps the anchor point under the fingers', () => {
    const anchor = { x: 150, y: 100 };
    const fingers = { x: 400, y: 200 };
    const view = viewWithAnchor(anchor, fingers, 2, screen, level);
    const camera = computeCamera(screen, level, view);
    const underFingers = cssToWorld(camera, fingers.x, fingers.y, screen.width, screen.height);
    expect(underFingers.x).toBeCloseTo(anchor.x, 0);
    expect(underFingers.y).toBeCloseTo(anchor.y, 0);
  });
});
