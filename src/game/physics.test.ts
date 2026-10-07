import { describe, expect, it } from 'vitest';
import type { Bridge } from './bridge';
import { TEST_LEVEL } from './testing/testLevel';
import type { MaterialId } from './materials';
import { createSimulation, stepSimulation, type Simulation } from './physics';
import { createRun, stepRun, type Run } from './run';
import { BridgeBuilder } from './testing/bridgeBuilder';
import { HANDCAR } from './train';

const level = TEST_LEVEL;
const STEP = 1 / 120;

const DECK = [120, 140, 160, 180, 200].map((x) => ({ x, y: 100 }));

const trackDeck = () => new BridgeBuilder(level).chain(DECK, 'track');

/** Deck + wooden zigzag under it + wooden bottom chord between the apexes. */
function warrenTruss(material: MaterialId = 'wood'): Bridge {
  return trackDeck().truss(DECK, 10, material).bridge;
}

function simulate(sim: Simulation, seconds: number): Simulation {
  for (let t = 0; t < seconds; t += STEP) stepSimulation(sim, [], STEP);
  return sim;
}

/** Plays a whole run with the handcar, until it is decided (or 15 s pass). */
function playRun(bridge: Bridge): Run {
  const run = createRun(level, bridge, HANDCAR);
  for (let t = 0; t < 15 && run.train.outcome === null; t += STEP) {
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
    const triangle = new BridgeBuilder(level)
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
    const anchor = { x: 120, y: 100 };
    const above = { x: 120, y: 80 };
    const onCable = new BridgeBuilder(level).beam(anchor, above, 'cable').bridge;
    const onWood = new BridgeBuilder(level).beam(anchor, above, 'wood').bridge;
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
    expect(run.train.outcome).toBe('lost');
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
    expect(run.train.outcome).toBe('arrived');
    expect(brokenBeams(run.sim)).toBe(0);
  });

  it('makes the deck sag more while the handcar is on it', () => {
    const run = createRun(level, warrenTruss(), HANDCAR);
    let emptySag = 0;
    let loadedSag = 0;
    for (let t = 0; t < 9 && run.train.outcome === null; t += STEP) {
      stepRun(run, level, HANDCAR, STEP);
      // Before the handcar reaches the bridge (~3 s) vs. when it is mid-span (~5.5 s).
      if (t > 2.5 && t < 2.6) emptySag = run.sim.particles[6]!.position.y;
      if (t > 5.4 && t < 5.5) loadedSag = run.sim.particles[6]!.position.y;
    }
    expect(loadedSag).toBeGreaterThan(emptySag + 0.05);
  });
});
