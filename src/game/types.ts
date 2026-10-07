/**
 * A point or vector in world units.
 * 1 world unit = 1 "virtual pixel" of the low-resolution, 16-bit style screen.
 * The origin is top-left and y points down, the same as the canvas API.
 */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Distance between two points. Uses Math.sqrt rather than Math.hypot: sqrt is
 * exact IEEE arithmetic, so every JavaScript engine gives the same last bit,
 * which the shared physics needs (see docs/PLAN.md, determinism).
 */
export function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
