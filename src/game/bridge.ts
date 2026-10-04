import { distanceToSegment, isStrictlyInsidePolygon } from './geometry';
import { MATERIALS, MIN_BEAM_LENGTH, type MaterialId } from './materials';
import { distance, type Vec2 } from './types';

/**
 * The bridge the player builds: joints connected by beams.
 *
 * Bridges are immutable. Every edit returns a new Bridge and never changes the
 * old one, which makes undo/redo a matter of keeping old bridges around.
 */
export interface Joint {
  readonly id: number;
  readonly position: Vec2;
  /** Fixed joints are the level's anchors. They never move and can't be removed. */
  readonly fixed: boolean;
}

export interface Beam {
  readonly id: number;
  /** Joint ids of the two ends. */
  readonly a: number;
  readonly b: number;
  readonly material: MaterialId;
}

export interface Bridge {
  readonly joints: readonly Joint[];
  readonly beams: readonly Beam[];
  /** Next free id. Joints and beams share one counter. */
  readonly nextId: number;
}

/** Where a new beam ends: on an existing joint, or at a point that becomes a new joint. */
export type BeamTarget =
  | { kind: 'joint'; jointId: number }
  | { kind: 'point'; position: Vec2 };

export type PlacementProblem = 'sameJoint' | 'tooShort' | 'tooLong' | 'duplicate' | 'insideTerrain';

export type PlacementResult = { ok: true } | { ok: false; problem: PlacementProblem };

/** An empty bridge where every level anchor is a fixed joint (ids 0, 1, 2, ...). */
export function createBridge(anchors: readonly Vec2[]): Bridge {
  const joints = anchors.map((position, id) => ({ id, position, fixed: true }));
  return { joints, beams: [], nextId: joints.length };
}

export function getJoint(bridge: Bridge, jointId: number): Joint {
  const joint = bridge.joints.find((j) => j.id === jointId);
  if (!joint) throw new Error(`No joint with id ${jointId}`);
  return joint;
}

/** Position of a beam target, whether it is an existing joint or a free point. */
export function targetPosition(bridge: Bridge, target: BeamTarget): Vec2 {
  return target.kind === 'joint' ? getJoint(bridge, target.jointId).position : target.position;
}

/** The two end positions of a beam. */
export function beamEnds(bridge: Bridge, beam: Beam): [Vec2, Vec2] {
  return [getJoint(bridge, beam.a).position, getJoint(bridge, beam.b).position];
}

/** Checks whether a beam from `fromJointId` to `target` may be built. */
export function canPlaceBeam(
  bridge: Bridge,
  terrain: readonly (readonly Vec2[])[],
  fromJointId: number,
  target: BeamTarget,
  material: MaterialId,
): PlacementResult {
  const fail = (problem: PlacementProblem): PlacementResult => ({ ok: false, problem });

  if (target.kind === 'joint' && target.jointId === fromJointId) return fail('sameJoint');

  const length = distance(getJoint(bridge, fromJointId).position, targetPosition(bridge, target));
  // The small tolerance absorbs floating point error, so a beam of exactly
  // the limit (e.g. one grid step) is allowed.
  const EPSILON = 1e-6;
  if (length < MIN_BEAM_LENGTH - EPSILON) return fail('tooShort');
  if (length > MATERIALS[material].maxLength + EPSILON) return fail('tooLong');

  if (target.kind === 'joint' && findBeamBetween(bridge, fromJointId, target.jointId)) {
    return fail('duplicate');
  }
  if (
    target.kind === 'point' &&
    terrain.some((polygon) => isStrictlyInsidePolygon(target.position, polygon))
  ) {
    return fail('insideTerrain');
  }
  return { ok: true };
}

/**
 * Adds a beam from an existing joint to `target`. A point target becomes a new
 * free joint. Assumes `canPlaceBeam` has approved the beam.
 */
export function addBeam(
  bridge: Bridge,
  fromJointId: number,
  target: BeamTarget,
  material: MaterialId,
): Bridge {
  let { joints, nextId } = bridge;
  let toJointId: number;

  if (target.kind === 'joint') {
    toJointId = target.jointId;
  } else {
    toJointId = nextId++;
    joints = [...joints, { id: toJointId, position: target.position, fixed: false }];
  }

  const beam: Beam = { id: nextId++, a: fromJointId, b: toJointId, material };
  return { joints, beams: [...bridge.beams, beam], nextId };
}

/** Removes a beam, plus any free joint that is left without beams. */
export function removeBeam(bridge: Bridge, beamId: number): Bridge {
  const beams = bridge.beams.filter((beam) => beam.id !== beamId);
  if (beams.length === bridge.beams.length) return bridge; // no such beam

  const usedJoints = new Set(beams.flatMap((beam) => [beam.a, beam.b]));
  const joints = bridge.joints.filter((joint) => joint.fixed || usedJoints.has(joint.id));
  return { ...bridge, joints, beams };
}

/** The closest joint within `radius` of `position`, or null. */
export function findJointNear(
  bridge: Bridge,
  position: Vec2,
  radius: number,
  excludeJointId?: number,
): Joint | null {
  let best: Joint | null = null;
  let bestDistance = radius;
  for (const joint of bridge.joints) {
    if (joint.id === excludeJointId) continue;
    const d = distance(joint.position, position);
    if (d <= bestDistance) {
      best = joint;
      bestDistance = d;
    }
  }
  return best;
}

/** The beam closest to `position` within `radius`, or null. */
export function findBeamNear(bridge: Bridge, position: Vec2, radius: number): Beam | null {
  let best: Beam | null = null;
  let bestDistance = radius;
  for (const beam of bridge.beams) {
    const [a, b] = beamEnds(bridge, beam);
    const d = distanceToSegment(position, a, b);
    if (d <= bestDistance) {
      best = beam;
      bestDistance = d;
    }
  }
  return best;
}

function findBeamBetween(bridge: Bridge, jointA: number, jointB: number): Beam | undefined {
  return bridge.beams.find(
    (beam) => (beam.a === jointA && beam.b === jointB) || (beam.a === jointB && beam.b === jointA),
  );
}
