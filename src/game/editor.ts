import {
  canPlaceBeam,
  findJointNear,
  getJoint,
  targetPosition,
  type BeamTarget,
  type Bridge,
  type PlacementResult,
} from './bridge';
import { MATERIALS, type MaterialId } from './materials';
import { distance, type Vec2 } from './types';

// ---------------------------------------------------------------------------
// Undo / redo history
// ---------------------------------------------------------------------------

/**
 * Undo/redo as three stacks of immutable bridges. `present` is what the
 * player sees; `past` and `future` are the snapshots either side of it.
 */
export interface History {
  readonly past: readonly Bridge[];
  readonly present: Bridge;
  readonly future: readonly Bridge[];
}

/** Oldest snapshots are dropped beyond this. Bridges are small, so it's cheap. */
export const MAX_HISTORY = 100;

export function createHistory(bridge: Bridge): History {
  return { past: [], present: bridge, future: [] };
}

/** Makes `bridge` the new present. A new edit always clears the redo stack. */
export function commit(history: History, bridge: Bridge): History {
  if (bridge === history.present) return history; // nothing changed
  const past = [...history.past, history.present].slice(-MAX_HISTORY);
  return { past, present: bridge, future: [] };
}

export function undo(history: History): History {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo(history: History): History {
  const [next, ...future] = history.future;
  if (!next) return history;
  return { past: [...history.past, history.present], present: next, future };
}

export const canUndo = (history: History): boolean => history.past.length > 0;
export const canRedo = (history: History): boolean => history.future.length > 0;

// ---------------------------------------------------------------------------
// Planning a beam while dragging
// ---------------------------------------------------------------------------

/** Free beam ends snap to a world grid with this spacing. */
export const GRID_SIZE = 5;

/**
 * While dragging, the end snaps to an existing joint within this distance.
 * This is the zoomed-out value; the engine passes a smaller radius when
 * zoomed in, so grid points next to a joint can be reached.
 */
export const JOINT_SNAP_RADIUS = 8;

/** The beam the player would get if they let go now. Drawn as a preview. */
export interface BeamPlan {
  fromJointId: number;
  target: BeamTarget;
  from: Vec2;
  to: Vec2;
  material: MaterialId;
  placement: PlacementResult;
}

/**
 * Works out where a beam dragged from `fromJointId` towards `pointer` ends:
 *
 * 1. Near an existing joint? Connect to it (even if too long; it shows red).
 * 2. Otherwise the end is limited to the material's max length and snapped to
 *    the grid. If that grid point holds a joint, connect to the joint instead
 *    of stacking a new one on top of it.
 */
export function planBeam(
  bridge: Bridge,
  terrain: readonly (readonly Vec2[])[],
  fromJointId: number,
  pointer: Vec2,
  material: MaterialId,
  snapRadius = JOINT_SNAP_RADIUS,
): BeamPlan {
  const from = getJoint(bridge, fromJointId).position;
  const target = resolveTarget(bridge, fromJointId, pointer, material, snapRadius);
  return {
    fromJointId,
    target,
    from,
    to: targetPosition(bridge, target),
    material,
    placement: canPlaceBeam(bridge, terrain, fromJointId, target, material),
  };
}

function resolveTarget(
  bridge: Bridge,
  fromJointId: number,
  pointer: Vec2,
  material: MaterialId,
  snapRadius: number,
): BeamTarget {
  const nearJoint = findJointNear(bridge, pointer, snapRadius, fromJointId);
  if (nearJoint) return { kind: 'joint', jointId: nearJoint.id };

  const from = getJoint(bridge, fromJointId).position;
  const point = snapToGridWithin(from, pointer, MATERIALS[material].maxLength);

  const jointOnPoint = findJointNear(bridge, point, 0.5);
  if (jointOnPoint) return { kind: 'joint', jointId: jointOnPoint.id };

  return { kind: 'point', position: point };
}

/**
 * Snaps `pointer` to the grid, keeping it within `maxLength` of `origin`.
 *
 * The pointer is first pulled onto the circle of radius `maxLength` if it is
 * outside. Of the four grid corners around that point, the nearest one that
 * is still within reach wins. Plain rounding could land just outside reach.
 */
export function snapToGridWithin(origin: Vec2, pointer: Vec2, maxLength: number): Vec2 {
  const clamped = clampToCircle(origin, pointer, maxLength);

  const left = Math.floor(clamped.x / GRID_SIZE) * GRID_SIZE;
  const top = Math.floor(clamped.y / GRID_SIZE) * GRID_SIZE;
  const corners: Vec2[] = [
    { x: left, y: top },
    { x: left + GRID_SIZE, y: top },
    { x: left, y: top + GRID_SIZE },
    { x: left + GRID_SIZE, y: top + GRID_SIZE },
  ];

  const reachable = corners.filter((corner) => distance(origin, corner) <= maxLength);
  const candidates = reachable.length > 0 ? reachable : corners;
  return nearest(candidates, clamped);
}

function clampToCircle(center: Vec2, point: Vec2, radius: number): Vec2 {
  const d = distance(center, point);
  if (d <= radius) return point;
  const scale = radius / d;
  return {
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale,
  };
}

function nearest(points: readonly Vec2[], to: Vec2): Vec2 {
  let best = points[0] ?? to;
  for (const p of points) if (distance(p, to) < distance(best, to)) best = p;
  return best;
}
