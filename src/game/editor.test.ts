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
  snapToGridWithin,
  undo,
} from './editor';
import { getLevel } from './level';
import { distance } from './types';

const level = getLevel(0);
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
    const plan = planBeam(bridge, level.terrain, LEFT_TOP, { x: 170, y: 100 }, 'track');
    expect(plan.to).toEqual({ x: 140, y: 100 });
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
