import type { Level } from './level';
import { GRAVITY, particleAt, type PointLoad, type Simulation } from './physics';
import type { Vec2 } from './types';

/**
 * Vehicles that drive across the bridge. The vehicle rides on the simulated
 * track beams, and its weight pushes down on them (`wheelLoads`), which is
 * what makes the bridge sag and, if it is too weak, break.
 *
 * Everything here is pure: `stepVehicle` returns a new Vehicle.
 */

/** A drivable piece of track: a bank rail, or a track beam in the simulation. */
export interface TrackSegment {
  a: Vec2;
  b: Vec2;
  /** For track beams: the particles at the ends, which carry the wheel's weight. */
  particles: [number, number] | null;
}

export interface VehicleSpec {
  /** Horizontal distance between the two axles, in world units. */
  wheelBase: number;
  /** Rolling speed, in world units per second. */
  speed: number;
  /** Mass in the same units as the beams (see materials.ts). */
  mass: number;
}

/** The first vehicle: a one-man handcar, small and slow. */
export const HANDCAR: VehicleSpec = { wheelBase: 8, speed: 16, mass: 140 };

export type VehicleStatus = 'rolling' | 'falling' | 'sunk';
export type RunOutcome = 'arrived' | 'lost';

export interface Vehicle {
  /** The point midway between the axles, on top of the track (the joint line). */
  position: Vec2;
  /** Tilt in radians. Positive is nose down (y points down, so clockwise). */
  angle: number;
  /** Distance rolled. Drives the wheel and pump animation. */
  distance: number;
  /** Used while falling. */
  velocity: Vec2;
  spin: number;
  status: VehicleStatus;
  /** Set once, when the run is decided. */
  outcome: RunOutcome | null;
}

/** How far the vehicle starts before the bridge, so it is seen rolling up to it. */
const START_DISTANCE = 48;

/** The run is won when the vehicle gets this far past the end of the bridge. */
const ARRIVE_MARGIN = 24;

/**
 * A wheel only rests on track within this height of where it is now. A beam
 * further above or below doesn't count, and a step bigger than this is a gap.
 */
const STEP_TOLERANCE = 2.5;

/** Rails on the banks reach this far beyond the bridge ends. */
const RAIL_EXTENT = 1000;

/** How fast a falling vehicle tips forward, in radians per second. */
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

/** A new vehicle standing on the left bank, ready to roll. */
export function createVehicle(level: Level): Vehicle {
  return {
    position: { x: level.bridgeStart.x - START_DISTANCE, y: level.bridgeStart.y },
    angle: 0,
    distance: 0,
    velocity: { x: 0, y: 0 },
    spin: 0,
    status: 'rolling',
    outcome: null,
  };
}

/** Advances the vehicle by `dt` seconds. */
export function stepVehicle(
  vehicle: Vehicle,
  spec: VehicleSpec,
  track: readonly TrackSegment[],
  level: Level,
  dt: number,
): Vehicle {
  switch (vehicle.status) {
    case 'rolling':
      return roll(vehicle, spec, track, level, dt);
    case 'falling':
      return fall(vehicle, level, dt);
    case 'sunk':
      return vehicle;
  }
}

/**
 * The forces the rolling vehicle puts on the bridge. Its weight is shared by
 * the wheels that stand on track. A wheel on a track beam pushes on the beam's
 * two end particles, split by where along the beam it stands (the lever
 * principle: standing a quarter of the way along puts 3/4 on the near end).
 * Wheels on the bank rails push on solid ground, so they add no load.
 */
export function wheelLoads(
  vehicle: Vehicle,
  spec: VehicleSpec,
  track: readonly TrackSegment[],
): PointLoad[] {
  if (vehicle.status !== 'rolling') return [];

  const contacts = wheelPositions(vehicle, spec)
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

/** Where the two wheels touch the track, from the vehicle's position and tilt. */
function wheelPositions(vehicle: Vehicle, spec: VehicleSpec): [Vec2, Vec2] {
  const half = spec.wheelBase / 2;
  const tilt = Math.sin(vehicle.angle) * half;
  const { x, y } = vehicle.position;
  return [
    { x: x + half, y: y + tilt },
    { x: x - half, y: y - tilt },
  ];
}

/**
 * Rolls forward at constant speed. The car tips off when the point between
 * its axles (roughly its centre of mass) is no longer over track. A single
 * wheel over a gap just hangs, keeping the car's current tilt.
 */
function roll(
  vehicle: Vehicle,
  spec: VehicleSpec,
  track: readonly TrackSegment[],
  level: Level,
  dt: number,
): Vehicle {
  const x = vehicle.position.x + spec.speed * dt;
  const centreY = trackHeightAt(track, x, vehicle.position.y);
  if (centreY === null) return startFalling(vehicle, spec);

  // Look for each wheel's track near where that wheel was last step.
  const moved = { ...vehicle, position: { x, y: vehicle.position.y } };
  const [front, rear] = wheelPositions(moved, spec);
  const frontY = trackHeightAt(track, front.x, front.y);
  const rearY = trackHeightAt(track, rear.x, rear.y);
  const angle =
    frontY !== null && rearY !== null ? Math.atan2(frontY - rearY, spec.wheelBase) : vehicle.angle;

  const arrived = vehicle.outcome === null && x >= level.bridgeEnd.x + ARRIVE_MARGIN;
  return {
    ...vehicle,
    position: { x, y: centreY },
    angle,
    distance: vehicle.distance + spec.speed * dt,
    outcome: arrived ? 'arrived' : vehicle.outcome,
  };
}

/** Leaves the track with its current speed and direction, and starts to tip forward. */
function startFalling(vehicle: Vehicle, spec: VehicleSpec): Vehicle {
  return {
    ...vehicle,
    status: 'falling',
    velocity: {
      x: spec.speed * Math.cos(vehicle.angle),
      y: spec.speed * Math.sin(vehicle.angle),
    },
    spin: FALL_SPIN,
  };
}

/** Simple ballistics. The run is lost when the vehicle reaches the water or leaves the screen. */
function fall(vehicle: Vehicle, level: Level, dt: number): Vehicle {
  const velocity = { x: vehicle.velocity.x, y: vehicle.velocity.y + GRAVITY * dt };
  const position = {
    x: vehicle.position.x + velocity.x * dt,
    y: vehicle.position.y + velocity.y * dt,
  };
  const bottom = level.waterY ?? level.height + 40;
  const lost = position.y >= bottom;
  return {
    ...vehicle,
    position,
    velocity,
    angle: vehicle.angle + vehicle.spin * dt,
    status: lost ? 'sunk' : 'falling',
    outcome: lost ? (vehicle.outcome ?? 'lost') : vehicle.outcome,
  };
}
