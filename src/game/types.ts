/**
 * A point or vector in world units.
 * 1 world unit = 1 "virtual pixel" of the low-resolution, 16-bit style screen.
 * The origin is top-left and y points down, the same as the canvas API.
 */
export interface Vec2 {
  x: number;
  y: number;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
