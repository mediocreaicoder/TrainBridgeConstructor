import { describe, expect, it } from 'vitest';
import { addBeam, createBridge, type Bridge } from './bridge';
import type { MaterialId } from './materials';
import { createSimulation, GRAVITY } from './physics';
import { TEST_LEVEL } from './testing/testLevel';
import {
  buildTrack,
  createTrain,
  HANDCAR,
  stepTrain,
  trackHeightAt,
  VEHICLES,
  wheelLoads,
  type Car,
  type Train,
  type TrainSpec,
} from './train';

const level = TEST_LEVEL;
const LEFT_TOP = 0; // anchor (120, 100)
const RIGHT_TOP = 2; // anchor (200, 100)
const STEP = 1 / 120;

/** A deck from the left to the right anchor through free joints at the given points. */
function deck(points: { x: number; y: number }[], material: MaterialId = 'track'): Bridge {
  let bridge = createBridge(level.anchors);
  let from = LEFT_TOP;
  for (const position of points) {
    bridge = addBeam(bridge, from, { kind: 'point', position }, material);
    from = bridge.joints.at(-1)!.id;
  }
  return addBeam(bridge, from, { kind: 'joint', jointId: RIGHT_TOP }, material);
}

const FLAT_DECK = [140, 160, 180].map((x) => ({ x, y: 100 }));

/** Runs on a rigid bridge (the simulation is never stepped) until the outcome is decided. */
function run(bridge: Bridge, spec: TrainSpec = HANDCAR, maxSeconds = 40): Train {
  const track = buildTrack(level, createSimulation(bridge));
  let train = createTrain(level, spec);
  for (let t = 0; t < maxSeconds && train.outcome === null; t += STEP) {
    train = stepTrain(train, spec, track, level, STEP);
  }
  return train;
}

const front = (train: Train): Car => train.cars[0]!;

describe('trackHeightAt', () => {
  const track = buildTrack(level, createSimulation(deck(FLAT_DECK)));

  it('finds the rail on the bank and the deck over the gap', () => {
    expect(trackHeightAt(track, 50, 100)).toBe(100);
    expect(trackHeightAt(track, 150, 100)).toBe(100);
  });

  it('ignores track far above or below the wheel', () => {
    expect(trackHeightAt(track, 150, 90)).toBeNull();
  });
});

describe('createTrain', () => {
  it('couples the cars one behind the other, front car first', () => {
    const train = createTrain(level, VEHICLES.passenger);
    const xs = train.cars.map((car) => car.position.x);
    expect(xs).toHaveLength(4);
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeLessThan(xs[i - 1]!);
    expect(train.cars.map((car) => car.kind)).toEqual(['engine', 'coach', 'coach', 'coach']);
  });
});

describe('stepTrain', () => {
  it('rolls along the flat bank at constant speed', () => {
    const track = buildTrack(level, createSimulation(createBridge(level.anchors)));
    let train = createTrain(level, HANDCAR);
    const startX = front(train).position.x;
    for (let i = 0; i < 120; i++) train = stepTrain(train, HANDCAR, track, level, STEP);
    expect(front(train).status).toBe('rolling');
    expect(front(train).position.x).toBeCloseTo(startX + HANDCAR.speed, 5);
    expect(front(train).angle).toBe(0);
  });

  it('crosses a complete deck and arrives', () => {
    const train = run(deck(FLAT_DECK));
    expect(train.outcome).toBe('arrived');
    expect(front(train).status).toBe('rolling');
  });

  it('only arrives once the last car of a long train is across', () => {
    const train = run(deck(FLAT_DECK), VEHICLES.goods);
    expect(train.outcome).toBe('arrived');
    expect(train.cars.at(-1)!.position.x).toBeGreaterThan(level.bridgeEnd.x);
  });

  it('falls into an empty gap and is lost in the water', () => {
    const train = run(createBridge(level.anchors));
    expect(train.outcome).toBe('lost');
    expect(front(train).status).toBe('sunk');
    expect(front(train).position.x).toBeGreaterThan(level.bridgeStart.x);
    expect(front(train).position.x).toBeLessThan(level.bridgeEnd.x);
  });

  it('sends the following cars over the edge after the first one', () => {
    const track = buildTrack(level, createSimulation(createBridge(level.anchors)));
    let train = createTrain(level, VEHICLES.passenger);
    for (let t = 0; t < 20; t += STEP) {
      train = stepTrain(train, VEHICLES.passenger, track, level, STEP);
    }
    expect(train.outcome).toBe('lost');
    expect(train.cars.every((car) => car.status === 'sunk')).toBe(true);
  });

  it('falls through a hole in the deck', () => {
    // Deck from the left anchor to x = 160, and from the right anchor back to 180.
    let bridge = createBridge(level.anchors);
    bridge = addBeam(bridge, LEFT_TOP, { kind: 'point', position: { x: 140, y: 100 } }, 'track');
    bridge = addBeam(bridge, 4, { kind: 'point', position: { x: 160, y: 100 } }, 'track');
    bridge = addBeam(bridge, RIGHT_TOP, { kind: 'point', position: { x: 180, y: 100 } }, 'track');
    expect(run(bridge).outcome).toBe('lost');
  });

  it('follows a sagging deck and tilts with it', () => {
    const sagging = [
      { x: 140, y: 105 },
      { x: 160, y: 110 },
      { x: 180, y: 105 },
    ];
    const track = buildTrack(level, createSimulation(deck(sagging)));
    let train = createTrain(level, HANDCAR);
    let lowest = front(train).position.y;
    let steepestNoseDown = 0;
    while (train.outcome === null) {
      train = stepTrain(train, HANDCAR, track, level, STEP);
      lowest = Math.max(lowest, front(train).position.y);
      steepestNoseDown = Math.max(steepestNoseDown, front(train).angle);
    }
    expect(train.outcome).toBe('arrived');
    expect(lowest).toBeCloseTo(110, 0);
    expect(steepestNoseDown).toBeGreaterThan(0.2);
  });

  it('does not drive on wood', () => {
    expect(run(deck(FLAT_DECK, 'wood')).outcome).toBe('lost');
  });

  it('gives the same result every time (deterministic)', () => {
    const a = run(createBridge(level.anchors), VEHICLES.goods);
    const b = run(createBridge(level.anchors), VEHICLES.goods);
    expect(a).toEqual(b);
  });
});

describe('wheelLoads', () => {
  const track = buildTrack(level, createSimulation(deck(FLAT_DECK)));
  const handcarAt = (x: number): Train => {
    const train = createTrain(level, HANDCAR);
    return { ...train, cars: [{ ...front(train), position: { x, y: 100 } }] };
  };

  it('puts no load on the bridge while the train is on the bank', () => {
    expect(wheelLoads(handcarAt(60), HANDCAR, track)).toEqual([]);
  });

  it('passes the whole weight to the beam ends, more to the nearer end', () => {
    // Both wheels (x = 131 and 139) are on the first deck beam,
    // between particles 0 (x = 120) and 4 (x = 140).
    const loads = wheelLoads(handcarAt(135), HANDCAR, track);
    const total = loads.reduce((sum, load) => sum + load.force.y, 0);
    expect(total).toBeCloseTo(HANDCAR.cars[0]!.mass * GRAVITY);

    const onParticle = (index: number) =>
      loads.filter((l) => l.particle === index).reduce((sum, l) => sum + l.force.y, 0);
    expect(onParticle(4)).toBeGreaterThan(onParticle(0));
    // The average wheel position is 3/4 along the beam, so particle 4 carries 3/4.
    expect(onParticle(4) / total).toBeCloseTo(0.75);
  });

  it('adds up the weight of every car on the bridge, and none from cars on the bank', () => {
    // Shift the passenger train so the engine (x = 160) and the first coach
    // (x = 132) are on the deck, and the other two coaches are on the bank.
    const spec = VEHICLES.passenger;
    const train = createTrain(level, spec);
    const shifted: Train = {
      ...train,
      cars: train.cars.map((car) => ({ ...car, position: { x: car.position.x + 88, y: 100 } })),
    };
    expect(shifted.cars.map((car) => car.position.x)).toEqual([160, 132, 104, 76]);

    const total = wheelLoads(shifted, spec, track).reduce((sum, l) => sum + l.force.y, 0);
    const engineAndCoach = spec.cars[0]!.mass + spec.cars[1]!.mass;
    expect(total).toBeCloseTo(engineAndCoach * GRAVITY);
  });

  it('puts no load on the bridge once a car is falling', () => {
    const falling = handcarAt(135);
    falling.cars[0] = { ...front(falling), status: 'falling' };
    expect(wheelLoads(falling, HANDCAR, track)).toEqual([]);
  });
});
