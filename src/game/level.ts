import type { Vec2 } from './types';

/**
 * Static description of a level.
 *
 * The playfield is the rectangle (0,0)–(width,height). It is always fully
 * visible on screen. Terrain and water may extend beyond it, so that wider or
 * taller screens show more landscape instead of black bars.
 */
export interface Level {
  id: number;
  name: string;
  width: number;
  height: number;
  /** Closed polygons, filled as solid ground. Top edges get grass. */
  terrain: Vec2[][];
  /** y of the water surface, or null for a dry ravine. */
  waterY: number | null;
  /** Fixed points in the terrain that the bridge can be attached to. */
  anchors: Vec2[];
  /** End of the existing track on the left: the bridge starts here. */
  bridgeStart: Vec2;
  /** Where the track continues on the right: the bridge must reach here. */
  bridgeEnd: Vec2;
}

/** How far terrain extends outside the playfield, in world units. */
const FAR = 1000;

export const LEVELS: readonly Level[] = [
  {
    id: 1,
    name: 'First Crossing',
    width: 320,
    height: 180,
    terrain: [
      // Left cliff. Points go clockwise, starting at the top-left.
      [
        { x: -FAR, y: 100 },
        { x: 120, y: 100 },
        { x: 126, y: 130 },
        { x: 132, y: FAR },
        { x: -FAR, y: FAR },
      ],
      // Right cliff.
      [
        { x: 200, y: 100 },
        { x: 320 + FAR, y: 100 },
        { x: 320 + FAR, y: FAR },
        { x: 188, y: FAR },
        { x: 194, y: 130 },
      ],
    ],
    waterY: 150,
    anchors: [
      { x: 120, y: 100 },
      { x: 126, y: 130 },
      { x: 200, y: 100 },
      { x: 194, y: 130 },
    ],
    bridgeStart: { x: 120, y: 100 },
    bridgeEnd: { x: 200, y: 100 },
  },
];

export function getLevel(index: number): Level {
  const level = LEVELS[index];
  if (!level) throw new Error(`No level with index ${index}`);
  return level;
}
