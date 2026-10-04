import { describe, expect, it } from 'vitest';
import { beamEnds, type Bridge } from './bridge';
import { isStrictlyInsidePolygon } from './geometry';
import { LEVELS, type Level } from './level';
import { MATERIALS, MIN_BEAM_LENGTH } from './materials';
import { createRun, stepRun } from './run';
import { BridgeBuilder } from './testing/bridgeBuilder';
import { VEHICLES, type RunOutcome } from './train';
import { distance } from './types';

const STEP = 1 / 120;
const along = (xs: number[], y: number) => xs.map((x) => ({ x, y }));

/**
 * For every level: a bridge that should win (the reference solution, so we
 * know the level can be beaten) and a naive one that should lose (so we know
 * the level asks for what its hint says).
 */
interface LevelCase {
  name: string;
  solution: (b: BridgeBuilder) => void;
  naive: (b: BridgeBuilder) => void;
}

const CASES: LevelCase[] = [
  {
    name: 'First Crossing',
    solution: (b) => {
      const deck = along([120, 140, 160, 180, 200], 100);
      b.chain(deck, 'track').truss(deck, 10, 'wood');
    },
    naive: (b) => b.chain(along([120, 140, 160, 180, 200], 100), 'track'),
  },
  {
    name: 'Stepping Stone',
    solution: (b) => {
      b.chain(along([100, 120, 135, 150, 170, 185, 200, 220], 100), 'track');
      b.truss(along([100, 120, 135, 150], 100), 10, 'wood');
      b.truss(along([170, 185, 200, 220], 100), 10, 'wood');
    },
    naive: (b) => b.chain(along([100, 120, 135, 150, 170, 185, 200, 220], 100), 'track'),
  },
  {
    name: 'Wide Gap',
    solution: (b) => {
      const deck = along([100, 120, 140, 160, 180, 200, 220], 100);
      b.chain(deck, 'track').truss(deck, 10, 'wood');
      // A braced prop from each low anchor up to the first two truss apexes.
      for (const [anchor, prop, near, far] of [
        [{ x: 106, y: 128 }, { x: 125, y: 125 }, { x: 110, y: 110 }, { x: 130, y: 110 }],
        [{ x: 214, y: 128 }, { x: 195, y: 125 }, { x: 210, y: 110 }, { x: 190, y: 110 }],
      ] as const) {
        b.beam(anchor, near, 'wood').beam(anchor, prop, 'wood');
        b.beam(prop, near, 'wood').beam(prop, far, 'wood');
      }
    },
    naive: (b) => {
      const deck = along([100, 120, 140, 160, 180, 200, 220], 100);
      b.chain(deck, 'track').truss(deck, 10, 'wood');
    },
  },
  {
    name: 'From Below',
    solution: (b) => {
      const deck = along([100, 120, 140, 160, 180, 200, 220], 100);
      b.chain(deck, 'track').truss(deck, 10, 'wood');
      // A column from each low anchor up into the truss.
      for (const [anchor, top, left, right] of [
        [{ x: 120, y: 140 }, { x: 120, y: 120 }, { x: 110, y: 110 }, { x: 130, y: 110 }],
        [{ x: 200, y: 140 }, { x: 200, y: 120 }, { x: 190, y: 110 }, { x: 210, y: 110 }],
      ] as const) {
        b.beam(anchor, top, 'wood').beam(top, left, 'wood').beam(top, right, 'wood');
      }
    },
    naive: (b) => {
      const deck = along([100, 120, 140, 160, 180, 200, 220], 100);
      b.chain(deck, 'track').truss(deck, 10, 'wood');
    },
  },
  {
    name: 'Hanging Bridge',
    solution: (b) => {
      b.chain(along([110, 130, 150, 170, 190, 210], 100), 'track');
      b.beam({ x: 106, y: 55 }, { x: 130, y: 100 }, 'cable');
      b.beam({ x: 106, y: 55 }, { x: 150, y: 100 }, 'cable');
      b.beam({ x: 214, y: 55 }, { x: 170, y: 100 }, 'cable');
      b.beam({ x: 214, y: 55 }, { x: 190, y: 100 }, 'cable');
    },
    naive: (b) => b.chain(along([110, 130, 150, 170, 190, 210], 100), 'track'),
  },
  {
    name: 'Long Haul',
    solution: (b) => {
      const deck = along([90, 110, 130, 150, 170, 190, 210, 230], 100);
      b.chain(deck, 'track').truss(deck, 10, 'steel');
    },
    naive: (b) => {
      const deck = along([90, 110, 130, 150, 170, 190, 210, 230], 100);
      b.chain(deck, 'track').truss(deck, 10, 'wood');
    },
  },
];

function build(level: Level, recipe: (b: BridgeBuilder) => void): Bridge {
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
    if (!level.allowedMaterials.includes(beam.material)) problems.push(`not allowed: ${where}`);
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

function play(level: Level, bridge: Bridge): RunOutcome | null {
  const run = createRun(level, bridge);
  for (let t = 0; t < 16 && run.vehicle.outcome === null; t += STEP) {
    stepRun(run, level, VEHICLES[level.vehicle], STEP);
  }
  return run.vehicle.outcome;
}

describe('levels', () => {
  it('has a test case for every level, in order', () => {
    expect(CASES.map((c) => c.name)).toEqual(LEVELS.map((l) => l.name));
  });

  it('numbers the levels 1, 2, 3, ... and only uses known materials', () => {
    LEVELS.forEach((level, index) => {
      expect(level.id).toBe(index + 1);
      expect(level.allowedMaterials).toContain('track');
    });
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
      it('can be won with the reference solution, built within the rules', () => {
        const bridge = build(level, testCase.solution);
        expect(ruleViolations(level, bridge)).toEqual([]);
        expect(play(level, bridge)).toBe('arrived');
      });

      it('is lost with a naive bridge', () => {
        expect(play(level, build(level, testCase.naive))).toBe('lost');
      });
    });
  });
});
