import { describe, expect, it } from 'vitest';
import { addBeam, createBridge, type Bridge } from './bridge';
import { getLevel } from './level';
import type { MaterialId } from './materials';
import {
  buildTrack,
  createVehicle,
  HANDCAR,
  stepVehicle,
  trackHeightAt,
  type Vehicle,
} from './train';

const level = getLevel(0);
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

/** Runs until the outcome is decided (or the time runs out). */
function run(bridge: Bridge, maxSeconds = 30): Vehicle {
  const track = buildTrack(level, bridge);
  let vehicle = createVehicle(level);
  for (let t = 0; t < maxSeconds && vehicle.outcome === null; t += STEP) {
    vehicle = stepVehicle(vehicle, HANDCAR, track, level, STEP);
  }
  return vehicle;
}

describe('trackHeightAt', () => {
  const track = buildTrack(level, deck(FLAT_DECK));

  it('finds the rail on the bank and the deck over the gap', () => {
    expect(trackHeightAt(track, 50, 100)).toBe(100);
    expect(trackHeightAt(track, 150, 100)).toBe(100);
  });

  it('ignores track far above or below the wheel', () => {
    expect(trackHeightAt(track, 150, 90)).toBeNull();
  });
});

describe('stepVehicle', () => {
  it('rolls along the flat bank at constant speed', () => {
    const track = buildTrack(level, createBridge(level.anchors));
    let vehicle = createVehicle(level);
    const startX = vehicle.position.x;
    for (let i = 0; i < 120; i++) vehicle = stepVehicle(vehicle, HANDCAR, track, level, STEP);
    expect(vehicle.status).toBe('rolling');
    expect(vehicle.position.x).toBeCloseTo(startX + HANDCAR.speed, 5);
    expect(vehicle.angle).toBe(0);
  });

  it('crosses a complete deck and arrives', () => {
    const vehicle = run(deck(FLAT_DECK));
    expect(vehicle.outcome).toBe('arrived');
    expect(vehicle.status).toBe('rolling');
  });

  it('falls into an empty gap and is lost in the water', () => {
    const vehicle = run(createBridge(level.anchors));
    expect(vehicle.outcome).toBe('lost');
    expect(vehicle.status).toBe('sunk');
    expect(vehicle.position.x).toBeGreaterThan(level.bridgeStart.x);
    expect(vehicle.position.x).toBeLessThan(level.bridgeEnd.x);
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
    const track = buildTrack(level, deck(sagging));
    let vehicle = createVehicle(level);
    let lowest = vehicle.position.y;
    let steepestNoseDown = 0;
    while (vehicle.outcome === null) {
      vehicle = stepVehicle(vehicle, HANDCAR, track, level, STEP);
      lowest = Math.max(lowest, vehicle.position.y);
      steepestNoseDown = Math.max(steepestNoseDown, vehicle.angle);
    }
    expect(vehicle.outcome).toBe('arrived');
    expect(lowest).toBeCloseTo(110, 0);
    expect(steepestNoseDown).toBeGreaterThan(0.2);
  });

  it('does not drive on wood', () => {
    expect(run(deck(FLAT_DECK, 'wood')).outcome).toBe('lost');
  });

  it('gives the same result every time (deterministic)', () => {
    const a = run(createBridge(level.anchors));
    const b = run(createBridge(level.anchors));
    expect(a).toEqual(b);
  });
});
