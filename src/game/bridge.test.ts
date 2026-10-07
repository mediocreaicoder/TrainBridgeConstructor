import { describe, expect, it } from 'vitest';
import {
  addBeam,
  bridgeCost,
  canMoveJoint,
  canPlaceBeam,
  createBridge,
  findBeamNear,
  findJointNear,
  moveJoint,
  removeBeam,
  type BeamTarget,
} from './bridge';
import { TEST_LEVEL } from './testing/testLevel';

const level = TEST_LEVEL;
// Level 1 anchors: 0 = left top (120,100), 1 = left low (126,130),
//                  2 = right top (200,100), 3 = right low (194,130).
const LEFT_TOP = 0;
const LEFT_LOW = 1;

const point = (x: number, y: number): BeamTarget => ({ kind: 'point', position: { x, y } });
const joint = (jointId: number): BeamTarget => ({ kind: 'joint', jointId });

describe('createBridge', () => {
  it('turns every anchor into a fixed joint and has no beams', () => {
    const bridge = createBridge(level.anchors);
    expect(bridge.joints).toHaveLength(4);
    expect(bridge.joints.every((j) => j.fixed)).toBe(true);
    expect(bridge.beams).toEqual([]);
    expect(bridge.nextId).toBe(4);
  });
});

describe('addBeam', () => {
  it('creates a free joint when the beam ends at a point', () => {
    const before = createBridge(level.anchors);
    const after = addBeam(before, LEFT_TOP, point(140, 100), 'track');

    expect(after.joints).toHaveLength(5);
    expect(after.joints.at(-1)).toEqual({ id: 4, position: { x: 140, y: 100 }, fixed: false });
    expect(after.beams).toEqual([{ id: 5, a: LEFT_TOP, b: 4, material: 'track' }]);
    expect(after.nextId).toBe(6);
  });

  it('connects two existing joints without adding a joint', () => {
    const before = addBeam(createBridge(level.anchors), LEFT_TOP, point(140, 100), 'track');
    const after = addBeam(before, LEFT_LOW, joint(4), 'wood');
    expect(after.joints).toHaveLength(5);
    expect(after.beams.at(-1)).toMatchObject({ a: LEFT_LOW, b: 4, material: 'wood' });
  });

  it('never changes the bridge it was given', () => {
    const before = createBridge(level.anchors);
    addBeam(before, LEFT_TOP, point(140, 100), 'track');
    expect(before.beams).toHaveLength(0);
    expect(before.joints).toHaveLength(4);
  });
});

describe('removeBeam', () => {
  it('removes the beam and the free joint it leaves behind', () => {
    const built = addBeam(createBridge(level.anchors), LEFT_TOP, point(140, 100), 'track');
    const beamId = built.beams[0]!.id;
    const after = removeBeam(built, beamId);
    expect(after.beams).toEqual([]);
    expect(after.joints).toHaveLength(4); // only the anchors are left
  });

  it('keeps free joints that are still used by another beam', () => {
    let bridge = addBeam(createBridge(level.anchors), LEFT_TOP, point(140, 100), 'track');
    bridge = addBeam(bridge, LEFT_LOW, joint(4), 'wood');
    const after = removeBeam(bridge, bridge.beams[0]!.id);
    expect(after.joints.map((j) => j.id)).toContain(4);
  });

  it('never removes anchors', () => {
    let bridge = createBridge(level.anchors);
    bridge = addBeam(bridge, LEFT_TOP, joint(LEFT_LOW), 'wood');
    const after = removeBeam(bridge, bridge.beams[0]!.id);
    expect(after.joints).toHaveLength(4);
  });

  it('returns the same bridge for an unknown beam id', () => {
    const bridge = createBridge(level.anchors);
    expect(removeBeam(bridge, 999)).toBe(bridge);
  });
});

describe('canPlaceBeam', () => {
  const bridge = createBridge(level.anchors);
  const check = (target: BeamTarget, material: 'track' | 'cable' = 'track') =>
    canPlaceBeam(bridge, level.terrain, LEFT_TOP, target, material);

  it('accepts a beam within the length limits', () => {
    expect(check(point(130, 95))).toEqual({ ok: true });
  });

  it('accepts a beam of exactly the max length and exactly the min length', () => {
    expect(check(point(150, 100))).toEqual({ ok: true }); // track max is 30
    expect(check(point(125, 100))).toEqual({ ok: true }); // min is 5
  });

  it('rejects beams that are too short or too long', () => {
    expect(check(point(123, 100))).toEqual({ ok: false, problem: 'tooShort' });
    expect(check(point(155, 100))).toEqual({ ok: false, problem: 'tooLong' });
    expect(check(point(155, 100), 'cable')).toEqual({ ok: true });
  });

  it('rejects a beam from a joint to itself', () => {
    expect(check(joint(LEFT_TOP))).toEqual({ ok: false, problem: 'sameJoint' });
  });

  it('rejects a second beam between the same two joints, in either direction', () => {
    const withBeam = addBeam(bridge, LEFT_TOP, joint(LEFT_LOW), 'wood');
    expect(canPlaceBeam(withBeam, level.terrain, LEFT_LOW, joint(LEFT_TOP), 'steel')).toEqual({
      ok: false,
      problem: 'duplicate',
    });
  });

  it('rejects an end point buried in the terrain but allows one on the surface', () => {
    expect(check(point(110, 110))).toEqual({ ok: false, problem: 'insideTerrain' });
    expect(check(point(110, 100))).toEqual({ ok: true });
  });
});

describe('findJointNear / findBeamNear', () => {
  const bridge = addBeam(createBridge(level.anchors), LEFT_TOP, point(140, 100), 'track');

  it('finds the closest joint within the radius', () => {
    expect(findJointNear(bridge, { x: 138, y: 102 }, 5)?.id).toBe(4);
    expect(findJointNear(bridge, { x: 160, y: 120 }, 5)).toBeNull();
  });

  it('can skip a joint', () => {
    expect(findJointNear(bridge, { x: 140, y: 100 }, 5, 4)).toBeNull();
  });

  it('finds a beam by distance to its line', () => {
    expect(findBeamNear(bridge, { x: 130, y: 103 }, 4)?.id).toBe(5);
    expect(findBeamNear(bridge, { x: 130, y: 110 }, 4)).toBeNull();
  });
});

describe('moveJoint / canMoveJoint', () => {
  // Joint 4 at (140,100) on a track beam from the left anchor.
  const bridge = addBeam(createBridge(level.anchors), LEFT_TOP, point(140, 100), 'track');

  it('moves a built joint, and its beams follow', () => {
    const moved = moveJoint(bridge, 4, { x: 145, y: 95 });
    expect(moved.joints.find((j) => j.id === 4)?.position).toEqual({ x: 145, y: 95 });
    expect(bridge.joints.find((j) => j.id === 4)?.position).toEqual({ x: 140, y: 100 });
  });

  it('allows moves that keep every beam within its length limits', () => {
    expect(canMoveJoint(bridge, level.terrain, 4, { x: 150, y: 100 })).toBe(true); // 30 = max
    expect(canMoveJoint(bridge, level.terrain, 4, { x: 155, y: 100 })).toBe(false); // 35
    expect(canMoveJoint(bridge, level.terrain, 4, { x: 122, y: 100 })).toBe(false); // too short
  });

  it('refuses anchors, other joints and spots inside the terrain', () => {
    expect(canMoveJoint(bridge, level.terrain, LEFT_TOP, { x: 110, y: 90 })).toBe(false);
    expect(canMoveJoint(bridge, level.terrain, 4, { x: 126, y: 130 })).toBe(false); // an anchor
    expect(canMoveJoint(bridge, level.terrain, 4, { x: 115, y: 110 })).toBe(false); // in the cliff
  });
});

describe('bridgeCost', () => {
  it('is free when nothing is built', () => {
    expect(bridgeCost(createBridge(level.anchors))).toBe(0);
  });

  it('adds up length times price per material', () => {
    // 20 units of track (2 per unit) and a 30.6-unit wood beam (1 per unit).
    let bridge = addBeam(createBridge(level.anchors), LEFT_TOP, point(140, 100), 'track');
    bridge = addBeam(bridge, LEFT_TOP, joint(LEFT_LOW), 'wood');
    expect(bridgeCost(bridge)).toBe(Math.round(20 * 2 + Math.hypot(6, 30) * 1));
  });
});
