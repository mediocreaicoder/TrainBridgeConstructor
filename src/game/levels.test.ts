import { describe, expect, it } from 'vitest';
import { beamEnds, bridgeCost, type Bridge } from './bridge';
import { isStrictlyInsidePolygon } from './geometry';
import { LEVELS, type Level } from './level';
import { MATERIALS, MIN_BEAM_LENGTH } from './materials';
import { createRun, stepRun } from './run';
import { BridgeBuilder } from './testing/bridgeBuilder';
import { VEHICLES, type RunOutcome, type VehicleId } from './train';
import { distance } from './types';

const STEP = 1 / 120;
const along = (xs: number[], y: number) => xs.map((x) => ({ x, y }));
type Recipe = (b: BridgeBuilder) => void;

/**
 * For every level, three bridges:
 * - naive: just a deck of track on the given points. Must lose, even with the handcar.
 * - light: a cheap bridge that gets the handcar across (1 star).
 * - strong: a bridge that gets the goods train across (all 4 stars), so we
 *   know every star can be earned on every level.
 * Both must stay within the level's budget (over budget costs a star).
 */
interface LevelCase {
  name: string;
  deck: number[];
  light: Recipe;
  strong: Recipe;
}

/** A track deck on `xs` at y = 75 with a truss under it, and optionally one over it. */
function truss(xs: number[], material: 'wood' | 'steel', withArch = false): Recipe {
  return (b) => {
    const deck = along(xs, 75);
    b.chain(deck, 'track').truss(deck, 15, material);
    if (withArch) b.truss(deck, -15, material);
  };
}

const D120 = [100, 130, 160, 190, 220];
const D150 = [85, 115, 145, 175, 205, 235];
const D180 = [70, 100, 130, 160, 190, 220, 250];
const STEPPING_STONES = [70, 100, 125, 145, 175, 195, 220, 250];

const CASES: LevelCase[] = [
  {
    name: 'First Crossing',
    deck: D120,
    light: truss(D120, 'wood'),
    strong: truss(D120, 'steel'),
  },
  {
    name: 'Stepping Stone',
    deck: STEPPING_STONES,
    light: (b) => {
      b.chain(along(STEPPING_STONES, 75), 'track');
      b.truss(along([70, 100, 125, 145], 75), 15, 'wood');
      b.truss(along([175, 195, 220, 250], 75), 15, 'wood');
    },
    strong: (b) => {
      b.chain(along(STEPPING_STONES, 75), 'track');
      b.truss(along([70, 100, 125, 145], 75), 15, 'steel');
      b.truss(along([175, 195, 220, 250], 75), 15, 'steel');
    },
  },
  {
    name: 'Wide Gap',
    deck: D180,
    light: (b) => {
      truss(D180, 'wood')(b);
      // A braced prop from each low anchor up to the first two truss apexes.
      for (const [anchor, prop, near, far] of [
        [{ x: 80, y: 115 }, { x: 110, y: 115 }, { x: 85, y: 90 }, { x: 115, y: 90 }],
        [{ x: 240, y: 115 }, { x: 210, y: 115 }, { x: 235, y: 90 }, { x: 205, y: 90 }],
      ] as const) {
        b.beam(anchor, near, 'wood').beam(anchor, prop, 'wood');
        b.beam(prop, near, 'wood').beam(prop, far, 'wood');
      }
    },
    strong: truss(D180, 'steel', true),
  },
  {
    name: 'From Below',
    deck: D180,
    light: (b) => {
      truss(D180, 'wood')(b);
      // A column from each deep anchor up into the truss.
      for (const [anchor, top, left, right] of [
        [{ x: 100, y: 135 }, { x: 100, y: 105 }, { x: 85, y: 90 }, { x: 115, y: 90 }],
        [{ x: 220, y: 135 }, { x: 220, y: 105 }, { x: 205, y: 90 }, { x: 235, y: 90 }],
      ] as const) {
        b.beam(anchor, top, 'wood').beam(top, left, 'wood').beam(top, right, 'wood');
      }
    },
    strong: truss(D180, 'steel', true),
  },
  {
    name: 'Hanging Bridge',
    deck: D150,
    light: (b) => {
      b.chain(along(D150, 75), 'track');
      b.beam({ x: 80, y: 30 }, { x: 115, y: 75 }, 'cable');
      b.beam({ x: 80, y: 30 }, { x: 145, y: 75 }, 'cable');
      b.beam({ x: 240, y: 30 }, { x: 175, y: 75 }, 'cable');
      b.beam({ x: 240, y: 30 }, { x: 205, y: 75 }, 'cable');
    },
    strong: truss(D150, 'steel', true),
  },
  {
    name: 'Long Haul',
    deck: D180,
    light: truss(D180, 'steel'),
    strong: truss(D180, 'steel', true),
  },
  {
    name: 'Bare Cliffs',
    deck: D120,
    light: truss(D120, 'wood'),
    strong: truss(D120, 'steel'),
  },
  {
    name: 'Ledges',
    deck: D150,
    light: truss(D150, 'steel'),
    strong: (b) => {
      truss(D150, 'steel')(b);
      // Steel props from the cliff anchors up to the first two apexes on each side.
      b.beam({ x: 95, y: 120 }, { x: 100, y: 90 }, 'steel');
      b.beam({ x: 95, y: 120 }, { x: 130, y: 90 }, 'steel');
      b.beam({ x: 225, y: 120 }, { x: 220, y: 90 }, 'steel');
      b.beam({ x: 225, y: 120 }, { x: 190, y: 90 }, 'steel');
    },
  },
  {
    name: 'Grand Span',
    deck: D180,
    light: truss(D180, 'steel'),
    strong: truss(D180, 'steel', true),
  },
];

function build(level: Level, recipe: Recipe): Bridge {
  const builder = new BridgeBuilder(level);
  recipe(builder);
  return builder.bridge;
}

/** Everything the player couldn't build in the game. Empty if the bridge is legal. */
function ruleViolations(level: Level, bridge: Bridge): string[] {
  const problems: string[] = [];
  for (const beam of bridge.beams) {
    const [a, b] = beamEnds(bridge, beam);
    const length = distance(a, b);
    const where = `${beam.material} (${a.x},${a.y})-(${b.x},${b.y})`;
    if (length > MATERIALS[beam.material].maxLength + 1e-6) problems.push(`too long: ${where}`);
    if (length < MIN_BEAM_LENGTH - 1e-6) problems.push(`too short: ${where}`);
  }
  for (const joint of bridge.joints) {
    if (level.terrain.some((polygon) => isStrictlyInsidePolygon(joint.position, polygon))) {
      problems.push(`joint inside terrain at (${joint.position.x},${joint.position.y})`);
    }
  }
  return problems;
}

function play(level: Level, bridge: Bridge, train: VehicleId): RunOutcome | null {
  const spec = VEHICLES[train];
  const run = createRun(level, bridge, spec);
  for (let t = 0; t < 40 && run.train.outcome === null; t += STEP) {
    stepRun(run, level, spec, STEP);
  }
  return run.train.outcome;
}

describe('levels', () => {
  it('has a test case for every level, in order', () => {
    expect(CASES.map((c) => c.name)).toEqual(LEVELS.map((l) => l.name));
  });

  it('numbers the levels 1, 2, 3, ...', () => {
    LEVELS.forEach((level, index) => expect(level.id).toBe(index + 1));
  });

  it('includes the bridge ends among the anchors, so the track can connect', () => {
    for (const level of LEVELS) {
      expect(level.anchors).toContainEqual(level.bridgeStart);
      expect(level.anchors).toContainEqual(level.bridgeEnd);
    }
  });

  LEVELS.forEach((level, index) => {
    const testCase = CASES[index]!;

    describe(`${level.id}. ${level.name}`, () => {
      it('is lost with just a deck of track, even with the handcar', () => {
        const deck = (b: BridgeBuilder) => b.chain(along(testCase.deck, 75), 'track');
        expect(play(level, build(level, deck), 'handcar')).toBe('lost');
      });

      it('can be won with the handcar on a light bridge (1 star)', () => {
        const bridge = build(level, testCase.light);
        expect(ruleViolations(level, bridge)).toEqual([]);
        expect(bridgeCost(bridge)).toBeLessThanOrEqual(level.budget);
        expect(play(level, bridge, 'handcar')).toBe('arrived');
      });

      it('can be won with the goods train on a strong bridge (4 stars)', () => {
        const bridge = build(level, testCase.strong);
        expect(ruleViolations(level, bridge)).toEqual([]);
        expect(bridgeCost(bridge)).toBeLessThanOrEqual(level.budget);
        expect(play(level, bridge, 'goods')).toBe('arrived');
      });
    });
  });
});
