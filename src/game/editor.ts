import {
  beamEnds,
  canMoveJoint,
  canPlaceBeam,
  findJointNear,
  getJoint,
  targetPosition,
  type BeamTarget,
  type Bridge,
  type PlacementResult,
} from './bridge';
import { isStrictlyInsidePolygon } from './geometry';
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

/**
 * Free beam ends snap to a world grid. Zoomed in, the grid is fine; zoomed
 * out, a fine grid would be denser than a finger can aim, so it gets coarser.
 * The coarse size matches the triangles: half a 20-unit track beam.
 */
export const FINE_GRID_SIZE = 5;
export const COARSE_GRID_SIZE = 10;

/** Grid points must be at least this far apart on screen to be easy to hit. */
const MIN_GRID_SPACING_CSS_PX = 12;

/**
 * While dragging, the end snaps to an existing joint within this distance.
 * This is the zoomed-out value; the engine passes a smaller radius when
 * zoomed in, so grid points next to a joint can be reached.
 */
export const JOINT_SNAP_RADIUS = 8;

/** How a dragged beam end snaps. The engine adapts both to the zoom level. */
export interface SnapSettings {
  /** Snap to an existing joint (or triangle apex) within this distance. */
  jointRadius: number;
  /** Otherwise snap to a grid with this spacing. */
  gridSize: number;
}

export const DEFAULT_SNAP: SnapSettings = {
  jointRadius: JOINT_SNAP_RADIUS,
  gridSize: FINE_GRID_SIZE,
};

/** The finest grid whose points are at least MIN_GRID_SPACING_CSS_PX apart on screen. */
export function gridSizeFor(cssPixelsPerUnit: number): number {
  return FINE_GRID_SIZE * cssPixelsPerUnit >= MIN_GRID_SPACING_CSS_PX
    ? FINE_GRID_SIZE
    : COARSE_GRID_SIZE;
}

/** Support materials that snap to triangle apexes over and under track beams. */
const TRIANGLE_MATERIALS: ReadonlySet<MaterialId> = new Set(['wood', 'steel']);

type Terrain = readonly (readonly Vec2[])[];

/** The beam the player would get if they let go now. Drawn as a preview. */
export interface BeamPlan {
  fromJointId: number;
  target: BeamTarget;
  from: Vec2;
  to: Vec2;
  material: MaterialId;
  placement: PlacementResult;
  /** Extra snap points (triangle apexes) to show while dragging. */
  guides: readonly Vec2[];
}

/**
 * Works out where a beam dragged from `fromJointId` towards `pointer` ends:
 *
 * 1. Near an existing joint or (for wood and steel) a triangle apex? Snap to
 *    the nearest one, even if it is too far away (the preview shows red).
 * 2. Otherwise the end is limited to the material's max length and snapped to
 *    the grid. If that grid point holds a joint, connect to the joint instead
 *    of stacking a new one on top of it.
 */
export function planBeam(
  bridge: Bridge,
  terrain: Terrain,
  fromJointId: number,
  pointer: Vec2,
  material: MaterialId,
  snap: SnapSettings = DEFAULT_SNAP,
): BeamPlan {
  const from = getJoint(bridge, fromJointId).position;
  const guides = TRIANGLE_MATERIALS.has(material) ? triangleApexes(bridge, terrain) : [];
  const target = resolveTarget(bridge, fromJointId, pointer, material, snap, guides);
  return {
    fromJointId,
    target,
    from,
    to: targetPosition(bridge, target),
    material,
    placement: canPlaceBeam(bridge, terrain, fromJointId, target, material),
    guides,
  };
}

/**
 * Apexes of the right-angled, isosceles triangles that have a track beam as
 * their base: one above and one below the middle of each track beam, half
 * the beam's length away. Both legs then meet the track at 45°, so a row of
 * them under (or over) the deck forms a symmetric zigzag truss.
 *
 * Apexes inside the terrain, or where a joint already is, are left out.
 */
export function triangleApexes(bridge: Bridge, terrain: Terrain): Vec2[] {
  const apexes: Vec2[] = [];
  for (const beam of bridge.beams) {
    if (beam.material !== 'track') continue;
    const [a, b] = beamEnds(bridge, beam);
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // Perpendicular to the beam with length half the beam: (dx, dy) turned 90°, halved.
    const offset = { x: -(b.y - a.y) / 2, y: (b.x - a.x) / 2 };
    for (const sign of [-1, 1]) {
      apexes.push({ x: middle.x + sign * offset.x, y: middle.y + sign * offset.y });
    }
  }
  return apexes.filter(
    (apex) =>
      !findJointNear(bridge, apex, 0.5) &&
      !terrain.some((polygon) => isStrictlyInsidePolygon(apex, polygon)),
  );
}

function resolveTarget(
  bridge: Bridge,
  fromJointId: number,
  pointer: Vec2,
  material: MaterialId,
  snap: SnapSettings,
  guides: readonly Vec2[],
): BeamTarget {
  // Snap to whichever is closer: an existing joint or a triangle apex.
  const nearJoint = findJointNear(bridge, pointer, snap.jointRadius, fromJointId);
  const nearGuide = nearestWithin(guides, pointer, snap.jointRadius);
  const jointIsCloser =
    nearJoint !== null &&
    (nearGuide === null || distance(nearJoint.position, pointer) <= distance(nearGuide, pointer));
  if (nearJoint && jointIsCloser) return { kind: 'joint', jointId: nearJoint.id };
  if (nearGuide) return { kind: 'point', position: nearGuide };

  const from = getJoint(bridge, fromJointId).position;
  const point = snapToGridWithin(from, pointer, MATERIALS[material].maxLength, snap.gridSize);

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
export function snapToGridWithin(
  origin: Vec2,
  pointer: Vec2,
  maxLength: number,
  gridSize = FINE_GRID_SIZE,
): Vec2 {
  const clamped = clampToCircle(origin, pointer, maxLength);

  const left = Math.floor(clamped.x / gridSize) * gridSize;
  const top = Math.floor(clamped.y / gridSize) * gridSize;
  const corners: Vec2[] = [
    { x: left, y: top },
    { x: left + gridSize, y: top },
    { x: left, y: top + gridSize },
    { x: left + gridSize, y: top + gridSize },
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

/** The point closest to `to` within `radius`, or null. */
function nearestWithin(points: readonly Vec2[], to: Vec2, radius: number): Vec2 | null {
  const best = nearest(points, to);
  return points.length > 0 && distance(best, to) <= radius ? best : null;
}

// ---------------------------------------------------------------------------
// Choosing the material automatically
// ---------------------------------------------------------------------------

/** A beam this close to horizontal (or flatter) can continue the track. */
const MAX_TRACK_ANGLE_DEGREES = 30;

/**
 * With Track selected, the material is picked per beam: a beam that
 * continues the track (starts on the track and is no steeper than 30°) is
 * track; anything else (diagonals, beams under the deck) is `support`.
 *
 * A joint is on the track if it is one of the bridge ends (`trackEnds`) or
 * already has a track beam.
 */
export function autoMaterial(
  bridge: Bridge,
  trackEnds: readonly Vec2[],
  fromJointId: number,
  pointer: Vec2,
  support: MaterialId,
): MaterialId {
  const from = getJoint(bridge, fromJointId).position;
  const onTrack =
    trackEnds.some((end) => distance(end, from) < 0.5) ||
    bridge.beams.some(
      (beam) => beam.material === 'track' && (beam.a === fromJointId || beam.b === fromJointId),
    );
  const dx = Math.abs(pointer.x - from.x);
  const dy = Math.abs(pointer.y - from.y);
  const flatEnough = dx > 0 && dy <= dx * Math.tan((MAX_TRACK_ANGLE_DEGREES * Math.PI) / 180);
  return onTrack && flatEnough ? 'track' : support;
}

// ---------------------------------------------------------------------------
// Moving a joint (long press)
// ---------------------------------------------------------------------------

/** How many grid steps around the finger to look for a legal spot. */
const MOVE_SEARCH_STEPS = 4;

/**
 * Where a joint dragged towards `wanted` ends up: the grid point nearest to
 * `wanted` where the move is allowed (see `canMoveJoint`), searching a few
 * grid steps around it. If there is none, the joint stays where it is.
 */
export function planJointMove(
  bridge: Bridge,
  terrain: readonly (readonly Vec2[])[],
  jointId: number,
  wanted: Vec2,
  gridSize: number,
): Vec2 {
  const centreX = Math.round(wanted.x / gridSize) * gridSize;
  const centreY = Math.round(wanted.y / gridSize) * gridSize;
  const candidates: Vec2[] = [];
  for (let i = -MOVE_SEARCH_STEPS; i <= MOVE_SEARCH_STEPS; i++) {
    for (let j = -MOVE_SEARCH_STEPS; j <= MOVE_SEARCH_STEPS; j++) {
      candidates.push({ x: centreX + i * gridSize, y: centreY + j * gridSize });
    }
  }
  candidates.sort((a, b) => distance(a, wanted) - distance(b, wanted));
  const allowed = candidates.find((p) => canMoveJoint(bridge, terrain, jointId, p));
  return allowed ?? getJoint(bridge, jointId).position;
}
