import { describe, expect, it } from 'vitest';
import { addBeam, createBridge, type BeamTarget, type Bridge } from './bridge';
import { getLevel } from './level';
import type { MaterialId } from './materials';
import { createSimulation, stepSimulation, type Simulation } from './physics';
import { createRun, stepRun, type Run } from './run';
import { HANDCAR } from './train';
import type { Vec2 } from './types';

const level = getLevel(0);
const STEP = 1 / 120;

/**
 * Builds bridges on level 1 by position: a beam ends on the joint already at
 * that point, or creates a new joint there. Anchors: (120,100), (126,130),
 * (200,100) and (194,130).
 */
class BridgeBuilder {
  bridge: Bridge = createBridge(level.anchors);
  private readonly jointAt = new Map(level.anchors.map((p, id) => [key(p), id]));

  beam(from: Vec2, to: Vec2, material: MaterialId): this {
    const fromId = this.jointAt.get(key(from));
    if (fromId === undefined) throw new Error(`No joint at ${key(from)}`);
    const existing = this.jointAt.get(key(to));
    const target: BeamTarget =
      existing === undefined
        ? { kind: 'point', position: to }
        : { kind: 'joint', jointId: existing };
    this.bridge = addBeam(this.bridge, fromId, target, material);
    if (existing === undefined) this.jointAt.set(key(to), this.bridge.joints.at(-1)!.id);
    return this;
  }

  chain(points: Vec2[], material: MaterialId): this {
    for (let i = 0; i + 1 < points.length; i++) this.beam(points[i]!, points[i + 1]!, material);
    return this;
  }
}

function key(p: Vec2): string {
  return `${p.x},${p.y}`;
}

const DECK = [120, 140, 160, 180, 200].map((x) => ({ x, y: 100 }));
/** Triangle apexes under the middle of each deck beam. */
const APEXES = [130, 150, 170, 190].map((x) => ({ x, y: 110 }));

const trackDeck = () => new BridgeBuilder().chain(DECK, 'track');

/** Deck + wooden zigzag under it + wooden bottom chord between the apexes. */
function warrenTruss(material: MaterialId = 'wood'): Bridge {
  const builder = trackDeck();
  for (let i = 0; i < APEXES.length; i++) {
    builder.beam(DECK[i]!, APEXES[i]!, material).beam(APEXES[i]!, DECK[i + 1]!, material);
  }
  return builder.chain(APEXES, material).bridge;
}

function simulate(sim: Simulation, seconds: number): Simulation {
  for (let t = 0; t < seconds; t += STEP) stepSimulation(sim, [], STEP);
  return sim;
}

/** Plays a whole run with the handcar, until it is decided (or 15 s pass). */
function playRun(bridge: Bridge): Run {
  const run = createRun(level, bridge);
  for (let t = 0; t < 15 && run.vehicle.outcome === null; t += STEP) {
    stepRun(run, level, HANDCAR, STEP);
  }
  return run;
}

const brokenBeams = (sim: Simulation) => sim.constraints.filter((c) => c.broken).length;

/** Lowest point of the joints the player built (anchors don't move). */
function lowestFreeJoint(sim: Simulation): number {
  const free = sim.particles.filter((p) => p.jointId !== null && p.inverseMass > 0);
  return Math.max(...free.map((p) => p.position.y));
}

describe('createSimulation', () => {
  it('fixes the anchors and gives free joints half the mass of each beam', () => {
    const sim = createSimulation(trackDeck().bridge);
    expect(sim.particles.slice(0, 4).every((p) => p.inverseMass === 0)).toBe(true);
    // A deck joint sits between two 20-unit track beams of mass 20: 10 + 10.
    expect(sim.particles[4]!.inverseMass).toBeCloseTo(1 / 20);
  });
});

describe('stepSimulation', () => {
  it('holds a small steel triangle without moving it noticeably', () => {
    const triangle = new BridgeBuilder()
      .beam({ x: 120, y: 100 }, { x: 140, y: 110 }, 'steel')
      .beam({ x: 126, y: 130 }, { x: 140, y: 110 }, 'steel').bridge;
    const sim = simulate(createSimulation(triangle), 5);
    expect(brokenBeams(sim)).toBe(0);
    expect(sim.particles[4]!.position.y).toBeCloseTo(110, 0);
  });

  it('lets a deck of track alone sag under its own weight, without breaking', () => {
    const sim = simulate(createSimulation(trackDeck().bridge), 5);
    expect(brokenBeams(sim)).toBe(0);
    expect(lowestFreeJoint(sim)).toBeGreaterThan(101);
  });

  it('lets a cable go slack instead of pushing', () => {
    // A joint straight above an anchor, held up only by a cable: it drops and hangs below.
    const onCable = new BridgeBuilder().beam({ x: 120, y: 100 }, { x: 120, y: 80 }, 'cable').bridge;
    const onWood = new BridgeBuilder().beam({ x: 120, y: 100 }, { x: 120, y: 80 }, 'wood').bridge;
    expect(simulate(createSimulation(onCable), 3).particles[4]!.position.y).toBeGreaterThan(115);
    expect(simulate(createSimulation(onWood), 3).particles[4]!.position.y).toBeLessThan(85);
  });

  it('gives exactly the same result every time (deterministic)', () => {
    const a = simulate(createSimulation(warrenTruss()), 2);
    const b = simulate(createSimulation(warrenTruss()), 2);
    expect(a).toEqual(b);
  });
});

describe('runs with the handcar', () => {
  it('breaks a deck of track alone, and the handcar is lost', () => {
    const run = playRun(trackDeck().bridge);
    expect(run.vehicle.outcome).toBe('lost');
    expect(brokenBeams(run.sim)).toBeGreaterThan(0);
  });

  it('turns a broken beam into two dangling halves', () => {
    const { sim } = playRun(trackDeck().bridge);
    const halves = sim.constraints.filter((c) => c.fragment);
    expect(halves).toHaveLength(2 * brokenBeams(sim));
    for (const half of halves) expect(sim.particles[half.b]!.jointId).toBeNull();
  });

  it('carries the handcar across a wooden Warren truss without breaking', () => {
    const run = playRun(warrenTruss());
    expect(run.vehicle.outcome).toBe('arrived');
    expect(brokenBeams(run.sim)).toBe(0);
  });

  it('makes the deck sag more while the handcar is on it', () => {
    const run = createRun(level, warrenTruss());
    let emptySag = 0;
    let loadedSag = 0;
    for (let t = 0; t < 9 && run.vehicle.outcome === null; t += STEP) {
      stepRun(run, level, HANDCAR, STEP);
      // Before the handcar reaches the bridge (~3 s) vs. when it is mid-span (~5.5 s).
      if (t > 2.5 && t < 2.6) emptySag = run.sim.particles[6]!.position.y;
      if (t > 5.4 && t < 5.5) loadedSag = run.sim.particles[6]!.position.y;
    }
    expect(loadedSag).toBeGreaterThan(emptySag + 0.05);
  });
});
