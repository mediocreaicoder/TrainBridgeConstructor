import type { Level } from './level';
import type { Vec2 } from './types';

/**
 * Maps world units to the canvas.
 *
 * The canvas backing store is deliberately low resolution (one canvas pixel
 * per world unit). CSS stretches it to fill the screen with
 * `image-rendering: pixelated`, which gives the chunky 16-bit look for free.
 */
export interface Camera {
  /** Canvas backing-store size, in world units / canvas pixels. */
  viewWidth: number;
  viewHeight: number;
  /** World coordinate shown at the canvas' top-left corner. */
  left: number;
  top: number;
}

/**
 * Picks the largest zoom where the whole playfield fits on screen,
 * and centres the playfield. Any spare room shows extra landscape.
 */
export function fitCamera(cssWidth: number, cssHeight: number, level: Level): Camera {
  const cssPixelsPerUnit = Math.min(cssWidth / level.width, cssHeight / level.height);
  const viewWidth = Math.ceil(cssWidth / cssPixelsPerUnit);
  const viewHeight = Math.ceil(cssHeight / cssPixelsPerUnit);

  return {
    viewWidth,
    viewHeight,
    left: Math.round((level.width - viewWidth) / 2),
    top: Math.round((level.height - viewHeight) / 2),
  };
}

/** Converts a position relative to the canvas element (CSS pixels) to world units. */
export function cssToWorld(
  camera: Camera,
  cssX: number,
  cssY: number,
  cssWidth: number,
  cssHeight: number,
): Vec2 {
  return {
    x: camera.left + (cssX / cssWidth) * camera.viewWidth,
    y: camera.top + (cssY / cssHeight) * camera.viewHeight,
  };
}
