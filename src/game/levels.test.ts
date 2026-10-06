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
      const deck = along([100, 130, 160, 190, 220], 75);
      b.chain(deck, 'track').truss(deck, 15, 'wood');
    },
    naive: (b) => b.chain(along([100, 130, 160, 190, 220], 75), 'track'),
  },
  {
    name: 'Stepping Stone',
    solution: (b) => {
      b.chain(along([70, 100, 125, 145, 175, 195, 220, 250], 75), 'track');
      b.truss(along([70, 100, 125, 145], 75), 15, 'wood');
      b.truss(along([175, 195, 220, 250], 75), 15, 'wood');
    },
    naive: (b) => b.chain(along([70, 100, 125, 145, 175, 195, 220, 250], 75), 'track'),
  },
  {
    name: 'Wide Gap',
    solution: (b) => {
      const deck = along([70, 100, 130, 160, 190, 220, 250], 75);
      b.chain(deck, 'track').truss(deck, 15, 'wood');
      // A braced prop from each low anchor up to the first two truss apexes.
      for (const [anchor, prop, near, far] of [
        [{ x: 80, y: 115 }, { x: 110, y: 115 }, { x: 85, y: 90 }, { x: 115, y: 90 }],
        [{ x: 240, y: 115 }, { x: 210, y: 115 }, { x: 235, y: 90 }, { x: 205, y: 90 }],
      ] as const) {
        b.beam(anchor, near, 'wood').beam(anchor, prop, 'wood');
        b.beam(prop, near, 'wood').beam(prop, far, 'wood');
      }
    },
    naive: (b) => {
      const deck = along([70, 100, 130, 160, 190, 220, 250], 75);
      b.chain(deck, 'track').truss(deck, 15, 'wood');
    },
  },
  {
    name: 'From Below',
    solution: (b) => {
      const deck = along([70, 100, 130, 160, 190, 220, 250], 75);
      b.chain(deck, 'track').truss(deck, 15, 'wood');
      // A column from each deep anchor up into the truss.
      for (const [anchor, top, left, right] of [
        [{ x: 100, y: 135 }, { x: 100, y: 105 }, { x: 85, y: 90 }, { x: 115, y: 90 }],
        [{ x: 220, y: 135 }, { x: 220, y: 105 }, { x: 205, y: 90 }, { x: 235, y: 90 }],
      ] as const) {
        b.beam(anchor, top, 'wood').beam(top, left, 'wood').beam(top, right, 'wood');
      }
    },
    naive: (b) => {
      const deck = along([70, 100, 130, 160, 190, 220, 250], 75);
      b.chain(deck, 'track').truss(deck, 15, 'wood');
    },
  },
  {
    name: 'Hanging Bridge',
    solution: (b) => {
      b.chain(along([85, 115, 145, 175, 205, 235], 75), 'track');
      b.beam({ x: 80, y: 30 }, { x: 115, y: 75 }, 'cable');
      b.beam({ x: 80, y: 30 }, { x: 145, y: 75 }, 'cable');
      b.beam({ x: 240, y: 30 }, { x: 175, y: 75 }, 'cable');
      b.beam({ x: 240, y: 30 }, { x: 205, y: 75 }, 'cable');
    },
    naive: (b) => b.chain(along([85, 115, 145, 175, 205, 235], 75), 'track'),
  },
  {
    name: 'Long Haul',
    solution: (b) => {
      const deck = along([70, 100, 130, 160, 190, 220, 250], 75);
      b.chain(deck, 'track').truss(deck, 15, 'steel');
    },
    naive: (b) => {
      const deck = along([70, 100, 130, 160, 190, 220, 250], 75);
      b.chain(deck, 'track').truss(deck, 15, 'wood');
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
  for (let t = 0; t < 30 && run.vehicle.outcome === null; t += STEP) {
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
