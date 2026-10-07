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
  /** One line shown in the HUD while building: what this level is about. */
  hint: string;
  width: number;
  height: number;
  /** Closed polygons, filled as solid ground. Top edges get grass. */
  terrain: Vec2[][];
  /** Stone pillars drawn behind the track, to hold anchors above the deck. Not solid. */
  pillars: Pillar[];
  /** y of the water surface, or null for a dry ravine. */
  waterY: number | null;
  /** Fixed points that the bridge can be attached to. */
  anchors: Vec2[];
  /** End of the existing track on the left: the bridge starts here. */
  bridgeStart: Vec2;
  /** Where the track continues on the right: the bridge must reach here. */
  bridgeEnd: Vec2;
}

/** A pillar standing on the ground at `x`, reaching up to `top`. */
export interface Pillar {
  x: number;
  top: number;
  /** Ground level at the pillar's foot. */
  bottom: number;
}

const WIDTH = 320;
const HEIGHT = 180;

/** How far terrain extends outside the playfield, in world units. */
const FAR = 1000;

/**
 * A left bank: flat ground at `edge.y` from far left to `edge`, then down the
 * cliff face through `face` (top to bottom; the last point should be at y = FAR).
 * Clockwise, like all terrain.
 */
function leftBank(edge: Vec2, face: Vec2[]): Vec2[] {
  return [{ x: -FAR, y: edge.y }, edge, ...face, { x: -FAR, y: FAR }];
}

/** A right bank: the mirror of `leftBank`. `face` goes from top to bottom. */
function rightBank(edge: Vec2, face: Vec2[]): Vec2[] {
  return [edge, { x: WIDTH + FAR, y: edge.y }, { x: WIDTH + FAR, y: FAR }, ...[...face].reverse()];
}

export const LEVELS: readonly Level[] = [
  {
    id: 1,
    name: 'First Crossing',
    hint: 'Drag from a joint to build. Triangles under the track make it strong',
    width: WIDTH,
    height: HEIGHT,
    terrain: [
      leftBank({ x: 100, y: 75 }, [
        { x: 110, y: 120 },
        { x: 118, y: FAR },
      ]),
      rightBank({ x: 220, y: 75 }, [
        { x: 210, y: 120 },
        { x: 202, y: FAR },
      ]),
    ],
    pillars: [],
    waterY: 150,
    anchors: [
      { x: 100, y: 75 },
      { x: 110, y: 120 },
      { x: 220, y: 75 },
      { x: 210, y: 120 },
    ],
    bridgeStart: { x: 100, y: 75 },
    bridgeEnd: { x: 220, y: 75 },
  },
  {
    id: 2,
    name: 'Stepping Stone',
    hint: 'Two short gaps. The rock in the middle can carry weight too',
    width: WIDTH,
    height: HEIGHT,
    terrain: [
      leftBank({ x: 70, y: 75 }, [
        { x: 75, y: 110 },
        { x: 82, y: FAR },
      ]),
      // The island, clockwise from its top-left corner.
      [
        { x: 145, y: 75 },
        { x: 175, y: 75 },
        { x: 180, y: 110 },
        { x: 187, y: FAR },
        { x: 133, y: FAR },
        { x: 140, y: 110 },
      ],
      rightBank({ x: 250, y: 75 }, [
        { x: 245, y: 110 },
        { x: 238, y: FAR },
      ]),
    ],
    pillars: [],
    waterY: 150,
    anchors: [
      { x: 70, y: 75 },
      { x: 75, y: 110 },
      { x: 145, y: 75 },
      { x: 140, y: 110 },
      { x: 175, y: 75 },
      { x: 180, y: 110 },
      { x: 250, y: 75 },
      { x: 245, y: 110 },
    ],
    bridgeStart: { x: 70, y: 75 },
    bridgeEnd: { x: 250, y: 75 },
  },
  {
    id: 3,
    name: 'Wide Gap',
    hint: 'A wider gap. Prop the bridge up from the anchors on the cliffs',
    width: WIDTH,
    height: HEIGHT,
    terrain: [
      leftBank({ x: 70, y: 75 }, [
        { x: 80, y: 115 },
        { x: 85, y: FAR },
      ]),
      rightBank({ x: 250, y: 75 }, [
        { x: 240, y: 115 },
        { x: 235, y: FAR },
      ]),
    ],
    pillars: [],
    waterY: 157,
    anchors: [
      { x: 70, y: 75 },
      { x: 80, y: 115 },
      { x: 250, y: 75 },
      { x: 240, y: 115 },
    ],
    bridgeStart: { x: 70, y: 75 },
    bridgeEnd: { x: 250, y: 75 },
  },
  {
    id: 4,
    name: 'From Below',
    hint: 'The only help is deep down. Build up from the low anchors',
    width: WIDTH,
    height: HEIGHT,
    terrain: [
      leftBank({ x: 70, y: 75 }, [
        { x: 85, y: 105 },
        { x: 100, y: 135 },
        { x: 106, y: FAR },
      ]),
      rightBank({ x: 250, y: 75 }, [
        { x: 235, y: 105 },
        { x: 220, y: 135 },
        { x: 214, y: FAR },
      ]),
    ],
    pillars: [],
    waterY: null,
    anchors: [
      { x: 70, y: 75 },
      { x: 100, y: 135 },
      { x: 250, y: 75 },
      { x: 220, y: 135 },
    ],
    bridgeStart: { x: 70, y: 75 },
    bridgeEnd: { x: 250, y: 75 },
  },
  {
    id: 5,
    name: 'Hanging Bridge',
    hint: 'No ground to stand on. Hang the track from the pillars with cables',
    width: WIDTH,
    height: HEIGHT,
    terrain: [
      leftBank({ x: 85, y: 75 }, [{ x: 88, y: FAR }]),
      rightBank({ x: 235, y: 75 }, [{ x: 232, y: FAR }]),
    ],
    pillars: [
      { x: 80, top: 30, bottom: 75 },
      { x: 240, top: 30, bottom: 75 },
    ],
    waterY: 150,
    anchors: [
      { x: 85, y: 75 },
      { x: 80, y: 30 },
      { x: 235, y: 75 },
      { x: 240, y: 30 },
    ],
    bridgeStart: { x: 85, y: 75 },
    bridgeEnd: { x: 235, y: 75 },
  },
  {
    id: 6,
    name: 'Long Haul',
    hint: 'A long way across. Steel is strong and reaches far',
    width: WIDTH,
    height: HEIGHT,
    terrain: [
      leftBank({ x: 70, y: 75 }, [
        { x: 79, y: 135 },
        { x: 85, y: FAR },
      ]),
      rightBank({ x: 250, y: 75 }, [
        { x: 241, y: 135 },
        { x: 235, y: FAR },
      ]),
    ],
    pillars: [],
    waterY: 157,
    anchors: [
      { x: 70, y: 75 },
      { x: 250, y: 75 },
    ],
    bridgeStart: { x: 70, y: 75 },
    bridgeEnd: { x: 250, y: 75 },
  },
  {
    id: 7,
    name: 'Bare Cliffs',
    hint: 'No anchors on the cliffs. The bridge has to carry itself',
    width: WIDTH,
    height: HEIGHT,
    terrain: [
      leftBank({ x: 100, y: 75 }, [
        { x: 110, y: 120 },
        { x: 118, y: FAR },
      ]),
      rightBank({ x: 220, y: 75 }, [
        { x: 210, y: 120 },
        { x: 202, y: FAR },
      ]),
    ],
    pillars: [],
    waterY: 150,
    anchors: [
      { x: 100, y: 75 },
      { x: 220, y: 75 },
    ],
    bridgeStart: { x: 100, y: 75 },
    bridgeEnd: { x: 220, y: 75 },
  },
  {
    id: 8,
    name: 'Ledges',
    hint: 'Spread the weight onto the anchors on the cliffs',
    width: WIDTH,
    height: HEIGHT,
    terrain: [
      leftBank({ x: 85, y: 75 }, [
        { x: 95, y: 120 },
        { x: 103, y: FAR },
      ]),
      rightBank({ x: 235, y: 75 }, [
        { x: 225, y: 120 },
        { x: 217, y: FAR },
      ]),
    ],
    pillars: [],
    waterY: 150,
    anchors: [
      { x: 85, y: 75 },
      { x: 95, y: 120 },
      { x: 235, y: 75 },
      { x: 225, y: 120 },
    ],
    bridgeStart: { x: 85, y: 75 },
    bridgeEnd: { x: 235, y: 75 },
  },
  {
    id: 9,
    name: 'Grand Span',
    hint: 'A long span. Brace the track from above and below',
    width: WIDTH,
    height: HEIGHT,
    terrain: [
      leftBank({ x: 70, y: 75 }, [
        { x: 79, y: 135 },
        { x: 85, y: FAR },
      ]),
      rightBank({ x: 250, y: 75 }, [
        { x: 241, y: 135 },
        { x: 235, y: FAR },
      ]),
    ],
    pillars: [],
    waterY: 157,
    anchors: [
      { x: 70, y: 75 },
      { x: 250, y: 75 },
    ],
    bridgeStart: { x: 70, y: 75 },
    bridgeEnd: { x: 250, y: 75 },
  },
];

/**
 * Reads the `?level=N` URL parameter (1-based, like the level ids shown to
 * the player) and returns a 0-based index into LEVELS, or null if it is
 * missing or invalid. Meant for jumping straight to a level while testing.
 */
export function levelIndexFromQuery(search: string, levelCount = LEVELS.length): number | null {
  const param = new URLSearchParams(search).get('level');
  if (param === null || !/^\d+$/.test(param)) return null;
  const index = Number(param) - 1;
  return index >= 0 && index < levelCount ? index : null;
}

export function getLevel(index: number): Level {
  const level = LEVELS[index];
  if (!level) throw new Error(`No level with index ${index}`);
  return level;
}
