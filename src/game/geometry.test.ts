import { describe, expect, it } from 'vitest';
import { distanceToSegment, isPointInPolygon, isStrictlyInsidePolygon } from './geometry';

describe('distanceToSegment', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };

  it('measures perpendicular distance to the middle of the segment', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBe(3);
  });

  it('measures to the nearest end beyond the segment', () => {
    expect(distanceToSegment({ x: 13, y: 4 }, a, b)).toBe(5);
    expect(distanceToSegment({ x: -3, y: -4 }, a, b)).toBe(5);
  });

  it('handles a zero-length segment', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, a, a)).toBe(5);
  });
});

describe('polygon tests', () => {
  // Clockwise square (y down), like the level terrain.
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ];

  it('finds points inside and outside', () => {
    expect(isPointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(isPointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(isPointInPolygon({ x: 5, y: -1 }, square)).toBe(false);
  });

  it('treats points on the outline as not strictly inside', () => {
    expect(isStrictlyInsidePolygon({ x: 5, y: 0 }, square)).toBe(false);
    expect(isStrictlyInsidePolygon({ x: 0, y: 5 }, square)).toBe(false);
    expect(isStrictlyInsidePolygon({ x: 5, y: 1 }, square)).toBe(true);
  });
});
