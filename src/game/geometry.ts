import { distance, type Vec2 } from './types';

/** Shortest distance from point `p` to the line segment `a`–`b`. */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(p, a);

  // Project p onto the segment's line, clamped to the segment: t = 0 at a, 1 at b.
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * Ray casting: count how many polygon edges a horizontal ray from `p` to the
 * right crosses. An odd count means the point is inside. Points exactly on an
 * edge may go either way; use `isStrictlyInsidePolygon` when that matters.
 */
export function isPointInPolygon(p: Vec2, polygon: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) continue;
    const crossesRayHeight = a.y > p.y !== b.y > p.y;
    if (crossesRayHeight) {
      const edgeX = a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (p.x < edgeX) inside = !inside;
    }
  }
  return inside;
}

/** Distance from `p` to the nearest edge of the polygon. */
export function distanceToPolygonEdge(p: Vec2, polygon: readonly Vec2[]): number {
  let best = Infinity;
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    if (b) best = Math.min(best, distanceToSegment(p, a, b));
  });
  return best;
}

/**
 * Inside the polygon and more than `margin` away from its edges.
 * Points on (or very close to) the outline count as outside, so a joint may
 * rest on the ground surface but not be buried in it.
 */
export function isStrictlyInsidePolygon(p: Vec2, polygon: readonly Vec2[], margin = 0.5): boolean {
  return isPointInPolygon(p, polygon) && distanceToPolygonEdge(p, polygon) > margin;
}
