import { addBeam, createBridge, type BeamTarget, type Bridge } from '../bridge';
import type { Level } from '../level';
import type { MaterialId } from '../materials';
import type { Vec2 } from '../types';

/**
 * Test helper: builds bridges on a level by position instead of joint id.
 * A beam ends on the joint already at that point (anchor or built), or
 * creates a new joint there. Doesn't check the placement rules; tests that
 * care call `canPlaceBeam` themselves.
 */
export class BridgeBuilder {
  bridge: Bridge;
  private readonly jointAt: Map<string, number>;

  constructor(level: Level) {
    this.bridge = createBridge(level.anchors);
    this.jointAt = new Map(level.anchors.map((p, id) => [key(p), id]));
  }

  beam(from: Vec2, to: Vec2, material: MaterialId): this {
    const fromId = this.jointAt.get(key(from));
    if (fromId === undefined) throw new Error(`No joint at ${key(from)}`);
    const existing = this.jointAt.get(key(to));
    const target: BeamTarget =
      existing === undefined
        ? { kind: 'point', position: to }
        : { kind: 'joint', jointId: existing };
    this.bridge = addBeam(this.bridge, fromId, target, material);
    if (existing === undefined) this.jointAt.set(key(to), this.bridge.joints.at(-1)!.id);
    return this;
  }

  /** Beams between each pair of neighbouring points. */
  chain(points: Vec2[], material: MaterialId): this {
    for (let i = 0; i + 1 < points.length; i++) this.beam(points[i]!, points[i + 1]!, material);
    return this;
  }

  /**
   * A Warren truss under (depth > 0) or over (depth < 0) the deck points: a
   * zigzag down to an apex under the middle of each deck beam, plus a chord
   * joining the apexes.
   */
  truss(deck: Vec2[], depth: number, material: MaterialId): this {
    const apexes = deck.slice(1).map((p, i) => ({
      x: (deck[i]!.x + p.x) / 2,
      y: (deck[i]!.y + p.y) / 2 + depth,
    }));
    apexes.forEach((apex, i) => {
      this.beam(deck[i]!, apex, material).beam(apex, deck[i + 1]!, material);
    });
    return this.chain(apexes, material);
  }
}

function key(p: Vec2): string {
  return `${p.x},${p.y}`;
}
