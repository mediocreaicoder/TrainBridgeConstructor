import type { Vec2 } from './types';

/**
 * Bresenham's line algorithm: visits each pixel on the line between two
 * points once, so lines are drawn crisp instead of anti-aliased.
 */
export function forEachLinePixel(a: Vec2, b: Vec2, visit: (x: number, y: number) => void): void {
  let x = Math.round(a.x);
  let y = Math.round(a.y);
  const endX = Math.round(b.x);
  const endY = Math.round(b.y);
  const dx = Math.abs(endX - x);
  const dy = -Math.abs(endY - y);
  const stepX = x < endX ? 1 : -1;
  const stepY = y < endY ? 1 : -1;
  // The error term tracks how far the drawn pixels are from the ideal line.
  let error = dx + dy;

  for (;;) {
    visit(x, y);
    if (x === endX && y === endY) return;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += stepX;
    }
    if (doubled <= dx) {
      error += dx;
      y += stepY;
    }
  }
}
