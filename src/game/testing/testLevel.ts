import type { Level } from '../level';

const FAR = 1000;

/**
 * A fixed level for unit tests, so they don't change whenever a real level
 * is redesigned. An 80-unit gap with the track at y = 100 and water at 150.
 *
 * Anchors (joint ids 0–3): 0 = left top (120,100), 1 = left low (126,130),
 * 2 = right top (200,100), 3 = right low (194,130).
 */
export const TEST_LEVEL: Level = {
  id: 1,
  name: 'Test Gap',
  hint: '',
  width: 320,
  height: 180,
  terrain: [
    [
      { x: -FAR, y: 100 },
      { x: 120, y: 100 },
      { x: 126, y: 130 },
      { x: 132, y: FAR },
      { x: -FAR, y: FAR },
    ],
    [
      { x: 200, y: 100 },
      { x: 320 + FAR, y: 100 },
      { x: 320 + FAR, y: FAR },
      { x: 188, y: FAR },
      { x: 194, y: 130 },
    ],
  ],
  pillars: [],
  waterY: 150,
  anchors: [
    { x: 120, y: 100 },
    { x: 126, y: 130 },
    { x: 200, y: 100 },
    { x: 194, y: 130 },
  ],
  bridgeStart: { x: 120, y: 100 },
  bridgeEnd: { x: 200, y: 100 },
};
