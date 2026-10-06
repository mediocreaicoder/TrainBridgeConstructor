import { describe, expect, it } from 'vitest';
import { addBeam, createBridge, type Bridge } from './bridge';
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  MAX_HISTORY,
  planBeam,
  redo,
  COARSE_GRID_SIZE,
  FINE_GRID_SIZE,
  gridSizeFor,
  snapToGridWithin,
  triangleApexes,
  undo,
} from './editor';
import { TEST_LEVEL } from './testing/testLevel';
import { distance } from './types';

const level = TEST_LEVEL;
const LEFT_TOP = 0; // anchor at (120, 100)

/** A bridge with `n` track beams marching right from the left anchor. */
function bridgeWithBeams(n: number): Bridge[] {
  const bridges = [createBridge(level.anchors)];
  for (let i = 0; i < n; i++) {
    const previous = bridges.at(-1)!;
    const position = { x: 125 + i * 5, y: 100 };
    bridges.push(addBeam(previous, LEFT_TOP, { kind: 'point', position }, 'track'));
  }
  return bridges;
}

describe('history', () => {
  const [b0, b1, b2, b3] = bridgeWithBeams(3) as [Bridge, Bridge, Bridge, Bridge];

  it('starts with nothing to undo or redo', () => {
    const history = createHistory(b0);
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it('undoes and redoes several steps in order', () => {
    let history = commit(commit(commit(createHistory(b0), b1), b2), b3);
    history = undo(undo(history));
    expect(history.present).toBe(b1);
    expect(canRedo(history)).toBe(true);

    history = redo(history);
    expect(history.present).toBe(b2);
    history = redo(history);
    expect(history.present).toBe(b3);
    expect(canRedo(history)).toBe(false);
  });

  it('clears the redo stack when a new edit is made after undo', () => {
    let history = commit(commit(createHistory(b0), b1), b2);
    history = undo(history);
    history = commit(history, b3);
    expect(history.present).toBe(b3);
    expect(canRedo(history)).toBe(false);
    expect(undo(history).present).toBe(b1);
  });

  it('does nothing when there is nothing to undo or redo', () => {
    const history = createHistory(b0);
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });

  it('ignores a commit of the bridge that is already present', () => {
    const history = createHistory(b0);
    expect(commit(history, b0)).toBe(history);
  });

  it(`keeps at most ${MAX_HISTORY} undo steps`, () => {
    let history = createHistory(b0);
    for (let i = 0; i < MAX_HISTORY + 20; i++) {
      history = commit(history, { ...b0, nextId: b0.nextId + i + 1 });
    }
    expect(history.past).toHaveLength(MAX_HISTORY);
  });
});

describe('snapToGridWithin', () => {
  const origin = { x: 120, y: 100 };

  it('rounds to the nearest grid point', () => {
    expect(snapToGridWithin(origin, { x: 131.4, y: 98.1 }, 20)).toEqual({ x: 130, y: 100 });
  });

  it('pulls a far pointer back within reach and stays on the grid', () => {
    const snapped = snapToGridWithin(origin, { x: 200, y: 60 }, 20);
    expect(distance(origin, snapped)).toBeLessThanOrEqual(20);
    expect(snapped.x % 5).toBe(0);
    expect(snapped.y % 5).toBe(0);
  });

  it('never rounds out of reach for any direction', () => {
    for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
      const far = { x: origin.x + Math.cos(angle) * 100, y: origin.y + Math.sin(angle) * 100 };
      expect(distance(origin, snapToGridWithin(origin, far, 24))).toBeLessThanOrEqual(24);
    }
  });
});

describe('planBeam', () => {
  const bridge = createBridge(level.anchors);

  it('snaps the end to a nearby joint', () => {
    // Anchor 1 (left low) is at (126, 130).
    const plan = planBeam(bridge, level.terrain, LEFT_TOP, { x: 129, y: 127 }, 'steel');
    expect(plan.target).toEqual({ kind: 'joint', jointId: 1 });
    expect(plan.placement.ok).toBe(true);
  });

  it('snaps a free end to the grid', () => {
    const plan = planBeam(bridge, level.terrain, LEFT_TOP, { x: 138.2, y: 101.9 }, 'track');
    expect(plan.target).toEqual({ kind: 'point', position: { x: 140, y: 100 } });
    expect(plan.placement.ok).toBe(true);
  });

  it('limits a free end to the material max length', () => {
    const plan = planBeam(bridge, level.terrain, LEFT_TOP, { x: 175, y: 100 }, 'track');
    expect(plan.to).toEqual({ x: 150, y: 100 }); // track max is 30
    expect(plan.placement.ok).toBe(true);
  });

  it('marks a joint that is out of reach as invalid instead of shortening', () => {
    // Right top anchor (200, 100) is 80 units away; too far for track.
    const plan = planBeam(bridge, level.terrain, LEFT_TOP, { x: 199, y: 101 }, 'track');
    expect(plan.target).toEqual({ kind: 'joint', jointId: 2 });
    expect(plan.placement).toEqual({ ok: false, problem: 'tooLong' });
  });

  it('marks an end inside the terrain as invalid', () => {
    const plan = planBeam(bridge, level.terrain, LEFT_TOP, { x: 110, y: 112 }, 'track');
    expect(plan.placement).toEqual({ ok: false, problem: 'insideTerrain' });
  });
});

describe('triangle snapping', () => {
  /** Level 1 with a track deck: joints at x = 120 (anchor 0), 140, 160, 180, 200 (anchor 2). */
  function deck(): Bridge {
    let bridge = createBridge(level.anchors);
    let from = LEFT_TOP;
    for (const x of [140, 160, 180]) {
      bridge = addBeam(bridge, from, { kind: 'point', position: { x, y: 100 } }, 'track');
      from = bridge.joints.at(-1)!.id;
    }
    return addBeam(bridge, from, { kind: 'joint', jointId: 2 }, 'track');
  }

  it('puts an apex above and below the middle of each track beam, at 45°', () => {
    const apexes = triangleApexes(deck(), level.terrain);
    expect(apexes).toHaveLength(8);
    expect(apexes).toContainEqual({ x: 130, y: 90 });
    expect(apexes).toContainEqual({ x: 130, y: 110 });
    expect(apexes).toContainEqual({ x: 190, y: 110 });
  });

  it('works for a sloped track beam too', () => {
    const sloped = addBeam(
      createBridge(level.anchors),
      LEFT_TOP,
      { kind: 'point', position: { x: 136, y: 88 } },
      'track',
    );
    // Beam (120,100)→(136,88): middle (128,94), half-length perpendicular (6,8).
    const apexes = triangleApexes(sloped, level.terrain);
    expect(apexes).toHaveLength(2);
    expect(apexes).toContainEqual({ x: 134, y: 102 });
    expect(apexes).toContainEqual({ x: 122, y: 86 });
  });

  it('snaps wood and steel to a nearby apex, but not track', () => {
    const bridge = deck();
    const pointer = { x: 131.5, y: 108 }; // near the apex (130, 110), off the grid point
    for (const material of ['wood', 'steel'] as const) {
      const plan = planBeam(bridge, level.terrain, LEFT_TOP, pointer, material);
      expect(plan.target).toEqual({ kind: 'point', position: { x: 130, y: 110 } });
    }
    const trackPlan = planBeam(bridge, level.terrain, LEFT_TOP, pointer, 'track');
    expect(trackPlan.guides).toEqual([]);
  });

  it('builds a symmetric zigzag under the deck', () => {
    let bridge = deck();
    const deckJoints = [0, 4, 6, 8, 2]; // ids along the deck, left to right
    for (let i = 0; i < 4; i++) {
      const apexX = 130 + i * 20;
      // Down-right from the deck joint to the apex, then up to the next deck joint.
      const nearApex = { x: apexX + 1, y: 109 };
      const down = planBeam(bridge, level.terrain, deckJoints[i]!, nearApex, 'wood');
      expect(down.placement.ok).toBe(true);
      bridge = addBeam(bridge, down.fromJointId, down.target, 'wood');
      const apexId = bridge.joints.at(-1)!.id;
      const up = planBeam(bridge, level.terrain, apexId, { x: apexX + 9, y: 101 }, 'wood');
      expect(up.target).toEqual({ kind: 'joint', jointId: deckJoints[i + 1] });
      bridge = addBeam(bridge, up.fromJointId, up.target, 'wood');
    }
    const apexes = bridge.joints.filter((j) => !j.fixed && j.position.y === 110);
    expect(apexes.map((j) => j.position.x)).toEqual([130, 150, 170, 190]);
  });
});

describe('zoom-dependent grid', () => {
  it('uses the coarse grid when fine grid points would be too close on screen', () => {
    // iPhone portrait at zoom 1: about 1.2 CSS px per world unit.
    expect(gridSizeFor(1.2)).toBe(COARSE_GRID_SIZE);
    // Zoomed in far enough that 5 units are at least 12 CSS px apart.
    expect(gridSizeFor(2.4)).toBe(FINE_GRID_SIZE);
  });

  it('snaps free ends to the coarse grid when given it', () => {
    const origin = { x: 120, y: 100 };
    expect(snapToGridWithin(origin, { x: 133, y: 104 }, 24, COARSE_GRID_SIZE)).toEqual({
      x: 130,
      y: 100,
    });
  });

  it('plans beams on the coarse grid, while joints still win when close', () => {
    const bridge = createBridge(level.anchors);
    const snap = { jointRadius: 8, gridSize: COARSE_GRID_SIZE };
    const free = planBeam(bridge, level.terrain, LEFT_TOP, { x: 136, y: 99 }, 'track', snap);
    expect(free.to).toEqual({ x: 140, y: 100 });
    const onAnchor = planBeam(bridge, level.terrain, LEFT_TOP, { x: 129, y: 127 }, 'steel', snap);
    expect(onAnchor.target).toEqual({ kind: 'joint', jointId: 1 });
  });
});
