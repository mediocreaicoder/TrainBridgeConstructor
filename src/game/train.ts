import type { Level } from './level';
import { GRAVITY, particleAt, type PointLoad, type Simulation } from './physics';
import type { Vec2 } from './types';

/**
 * Trains that drive across the bridge: a chain of cars at a fixed spacing,
 * all rolling at the train's speed. Each car rides on the simulated track
 * beams on its own, and its weight pushes down on them (`wheelLoads`), which
 * is what makes the bridge sag and, if it is too weak, break. A car whose
 * middle has no track under it tips off and falls; the cars behind keep
 * rolling and follow it over the edge.
 *
 * Everything here is pure: `stepTrain` returns a new Train.
 */

/** A drivable piece of track: a bank rail, or a track beam in the simulation. */
export interface TrackSegment {
  a: Vec2;
  b: Vec2;
  /** For track beams: the particles at the ends, which carry the wheel's weight. */
  particles: [number, number] | null;
}

/** What a car looks like; `renderVehicle.ts` draws each kind. */
export type CarKind = 'handcar' | 'shunter' | 'engine' | 'coach' | 'boxcar';

export interface CarSpec {
  kind: CarKind;
  /** Body length, in world units. Sets the spacing between cars. */
  length: number;
  /** Horizontal distance between the two axles, in world units. */
  wheelBase: number;
  /** Mass in the same units as the beams (see materials.ts). */
  mass: number;
  /** People on board scream when the car falls. */
  hasPeople: boolean;
}

export interface TrainSpec {
  /** Shown to the player, e.g. "Here comes the passenger train!". */
  name: string;
  /** Short name for the toolbar button. */
  label: string;
  /** Stars earned on a level when this train makes it across: heavier trains earn more. */
  stars: number;
  /** Rolling speed, in world units per second. */
  speed: number;
  /** Front to back. */
  cars: readonly CarSpec[];
}

const CARS = {
  handcar: { kind: 'handcar', length: 13, wheelBase: 8, mass: 140, hasPeople: true },
  shunter: { kind: 'shunter', length: 22, wheelBase: 14, mass: 280, hasPeople: true },
  engine: { kind: 'engine', length: 26, wheelBase: 16, mass: 380, hasPeople: true },
  coach: { kind: 'coach', length: 26, wheelBase: 18, mass: 220, hasPeople: true },
  boxcar: { kind: 'boxcar', length: 22, wheelBase: 14, mass: 300, hasPeople: false },
} as const satisfies Record<CarKind, CarSpec>;

/** Every train that can be sent across a bridge, from light to heavy. */
export type VehicleId = 'handcar' | 'maintenance' | 'passenger' | 'goods';

export const VEHICLES: Readonly<Record<VehicleId, TrainSpec>> = {
  handcar: { name: 'handcar', label: 'Handcar', stars: 1, speed: 16, cars: [CARS.handcar] },
  maintenance: {
    name: 'maintenance locomotive',
    label: 'Shunter',
    stars: 2,
    speed: 20,
    cars: [CARS.shunter],
  },
  passenger: {
    name: 'passenger train',
    label: 'Express',
    stars: 3,
    speed: 24,
    cars: [CARS.engine, CARS.coach, CARS.coach, CARS.coach],
  },
  goods: {
    name: 'goods train',
    label: 'Freight',
    stars: 4,
    speed: 18,
    cars: [CARS.engine, ...Array<CarSpec>(6).fill(CARS.boxcar)],
  },
};

/** All trains from light to heavy: the order of the train button and of the stars. */
export const TRAIN_ORDER: readonly VehicleId[] = ['handcar', 'maintenance', 'passenger', 'goods'];

/** The most stars a level can give: for getting the heaviest train across. */
export const MAX_STARS = 4;

/** The next heavier train, or null for the heaviest. */
export function heavierTrain(id: VehicleId): VehicleId | null {
  return TRAIN_ORDER[TRAIN_ORDER.indexOf(id) + 1] ?? null;
}

/** Kept for tests and older callers: the one-car handcar train. */
export const HANDCAR = VEHICLES.handcar;

export type CarStatus = 'rolling' | 'falling' | 'sunk';
export type RunOutcome = 'arrived' | 'lost';

export interface Car {
  kind: CarKind;
  /** The point midway between the axles, on the joint line of the track. */
  position: Vec2;
  /** Tilt in radians. Positive is nose down (y points down, so clockwise). */
  angle: number;
  /** Distance rolled. Drives the wheel animation. */
  distance: number;
  /** Used while falling. */
  velocity: Vec2;
  spin: number;
  status: CarStatus;
}

export interface Train {
  /** Front to back, matching the spec's cars. */
  cars: Car[];
  /** Set once, when the run is decided. */
  outcome: RunOutcome | null;
}

/** How far the front car starts before the bridge, so it is seen rolling up to it. */
const START_DISTANCE = 48;

/** Gap between the bodies of coupled cars. */
const COUPLING_GAP = 2;

/** The run is won when the last car gets this far past the end of the bridge. */
const ARRIVE_MARGIN = 24;

/**
 * A wheel only rests on track within this height of where it is now. A beam
 * further above or below doesn't count, and a step bigger than this is a gap.
 */
const STEP_TOLERANCE = 2.5;

/** Rails on the banks reach this far beyond the bridge ends. */
const RAIL_EXTENT = 1000;

/** How fast a falling car tips forward, in radians per second. */
const FALL_SPIN = 3;

/**
 * The drivable track: the rails on both banks plus every intact track beam
 * in the simulation that isn't too steep to drive on (more than 45°).
 */
export function buildTrack(level: Level, sim: Simulation): TrackSegment[] {
  const { bridgeStart, bridgeEnd } = level;
  const rails: TrackSegment[] = [
    { a: { x: bridgeStart.x - RAIL_EXTENT, y: bridgeStart.y }, b: bridgeStart, particles: null },
    { a: bridgeEnd, b: { x: bridgeEnd.x + RAIL_EXTENT, y: bridgeEnd.y }, particles: null },
  ];
  const beams = sim.constraints
    .filter((c) => c.material === 'track' && !c.broken && !c.fragment)
    .map(
      (c): TrackSegment => ({
        a: particleAt(sim, c.a).position,
        b: particleAt(sim, c.b).position,
        particles: [c.a, c.b],
      }),
    )
    .filter(({ a, b }) => Math.abs(b.y - a.y) <= Math.abs(b.x - a.x));
  return [...rails, ...beams];
}

/** A new train on the left bank, ready to roll: the cars coupled one behind the other. */
export function createTrain(level: Level, spec: TrainSpec): Train {
  let x = level.bridgeStart.x - START_DISTANCE;
  const cars = spec.cars.map((carSpec, i) => {
    const previous = spec.cars[i - 1];
    if (previous) x -= previous.length / 2 + COUPLING_GAP + carSpec.length / 2;
    return {
      kind: carSpec.kind,
      position: { x, y: level.bridgeStart.y },
      angle: 0,
      distance: 0,
      velocity: { x: 0, y: 0 },
      spin: 0,
      status: 'rolling' as const,
    };
  });
  return { cars, outcome: null };
}

/** Advances the train by `dt` seconds, and decides the run once it can be decided. */
export function stepTrain(
  train: Train,
  spec: TrainSpec,
  track: readonly TrackSegment[],
  level: Level,
  dt: number,
): Train {
  const cars = train.cars.map((car, i) =>
    stepCar(car, carSpecAt(spec, i), spec.speed, track, level, dt),
  );
  return { cars, outcome: train.outcome ?? decideOutcome(cars, level) };
}

/** Lost as soon as a car is in the water (or off the screen); won when all are safely across. */
function decideOutcome(cars: readonly Car[], level: Level): RunOutcome | null {
  if (cars.some((car) => car.status === 'sunk')) return 'lost';
  const last = cars.at(-1);
  const allRolling = cars.every((car) => car.status === 'rolling');
  if (allRolling && last && last.position.x >= level.bridgeEnd.x + ARRIVE_MARGIN) return 'arrived';
  return null;
}

/**
 * The forces the rolling cars put on the bridge. Each car's weight is shared
 * by its wheels that stand on track. A wheel on a track beam pushes on the
 * beam's two end particles, split by where along the beam it stands (the
 * lever principle: a quarter of the way along puts 3/4 on the near end).
 * Wheels on the bank rails push on solid ground, so they add no load.
 */
export function wheelLoads(
  train: Train,
  spec: TrainSpec,
  track: readonly TrackSegment[],
): PointLoad[] {
  return train.cars.flatMap((car, i) => carLoads(car, carSpecAt(spec, i), track));
}

function carLoads(car: Car, spec: CarSpec, track: readonly TrackSegment[]): PointLoad[] {
  if (car.status !== 'rolling') return [];

  const contacts = wheelPositions(car, spec)
    .map((wheel) => findTrackUnder(track, wheel.x, wheel.y))
    .filter((contact) => contact !== null);
  if (contacts.length === 0) return [];

  const weightPerWheel = (spec.mass * GRAVITY) / contacts.length;
  const loads: PointLoad[] = [];
  for (const { segment, x } of contacts) {
    if (!segment.particles) continue;
    const t = (x - segment.a.x) / (segment.b.x - segment.a.x);
    const [first, second] = segment.particles;
    loads.push({ particle: first, force: { x: 0, y: weightPerWheel * (1 - t) } });
    loads.push({ particle: second, force: { x: 0, y: weightPerWheel * t } });
  }
  return loads;
}

/**
 * Height of the track at `x`, choosing the segment closest to `nearY`.
 * Returns null if no segment is within STEP_TOLERANCE of that height.
 */
export function trackHeightAt(
  track: readonly TrackSegment[],
  x: number,
  nearY: number,
): number | null {
  return findTrackUnder(track, x, nearY)?.y ?? null;
}

export function carSpecAt(spec: TrainSpec, index: number): CarSpec {
  const car = spec.cars[index];
  if (!car) throw new Error(`Train ${spec.name} has no car ${index}`);
  return car;
}

interface TrackContact {
  segment: TrackSegment;
  x: number;
  y: number;
}

/** The track segment under `x` closest to height `nearY` (within STEP_TOLERANCE), if any. */
function findTrackUnder(
  track: readonly TrackSegment[],
  x: number,
  nearY: number,
): TrackContact | null {
  let best: TrackContact | null = null;
  let bestGap = STEP_TOLERANCE;
  for (const segment of track) {
    const { a, b } = segment;
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);
    if (x < left || x > right || right === left) continue;

    const y = a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
    const gap = Math.abs(y - nearY);
    if (gap <= bestGap) {
      best = { segment, x, y };
      bestGap = gap;
    }
  }
  return best;
}

/** Where a car's two wheels touch the track, from its position and tilt. */
function wheelPositions(car: Car, spec: CarSpec): [Vec2, Vec2] {
  const half = spec.wheelBase / 2;
  const tilt = Math.sin(car.angle) * half;
  const { x, y } = car.position;
  return [
    { x: x + half, y: y + tilt },
    { x: x - half, y: y - tilt },
  ];
}

function stepCar(
  car: Car,
  spec: CarSpec,
  speed: number,
  track: readonly TrackSegment[],
  level: Level,
  dt: number,
): Car {
  switch (car.status) {
    case 'rolling':
      return roll(car, spec, speed, track, dt);
    case 'falling':
      return fall(car, level, dt);
    case 'sunk':
      return car;
  }
}

/**
 * Rolls forward at constant speed. The car tips off when the point between
 * its axles (roughly its centre of mass) is no longer over track. A single
 * wheel over a gap just hangs, keeping the car's current tilt.
 */
function roll(
  car: Car,
  spec: CarSpec,
  speed: number,
  track: readonly TrackSegment[],
  dt: number,
): Car {
  const x = car.position.x + speed * dt;
  const centreY = trackHeightAt(track, x, car.position.y);
  if (centreY === null) return startFalling(car, speed);

  // Look for each wheel's track near where that wheel was last step.
  const moved = { ...car, position: { x, y: car.position.y } };
  const [front, rear] = wheelPositions(moved, spec);
  const frontY = trackHeightAt(track, front.x, front.y);
  const rearY = trackHeightAt(track, rear.x, rear.y);
  const angle =
    frontY !== null && rearY !== null ? Math.atan2(frontY - rearY, spec.wheelBase) : car.angle;

  return { ...car, position: { x, y: centreY }, angle, distance: car.distance + speed * dt };
}

/** Leaves the track with its current speed and direction, and starts to tip forward. */
function startFalling(car: Car, speed: number): Car {
  return {
    ...car,
    status: 'falling',
    velocity: { x: speed * Math.cos(car.angle), y: speed * Math.sin(car.angle) },
    spin: FALL_SPIN,
  };
}

/** Simple ballistics, until the car reaches the water or falls off the screen. */
function fall(car: Car, level: Level, dt: number): Car {
  const velocity = { x: car.velocity.x, y: car.velocity.y + GRAVITY * dt };
  const position = { x: car.position.x + velocity.x * dt, y: car.position.y + velocity.y * dt };
  const bottom = level.waterY ?? level.height + 40;
  return {
    ...car,
    position,
    velocity,
    angle: car.angle + car.spin * dt,
    status: position.y >= bottom ? 'sunk' : 'falling',
  };
}
