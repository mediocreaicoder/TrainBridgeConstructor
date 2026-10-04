import { beamEnds, type Beam, type Bridge, type Joint } from './bridge';
import type { Camera } from './camera';
import type { BeamPlan } from './editor';
import { shakeOffset, type Droplet } from './effects';
import type { Level } from './level';
import { MATERIALS, type MaterialId } from './materials';
import { particleAt, type Simulation } from './physics';
import { forEachLinePixel } from './pixelLine';
import { drawVehicle } from './renderVehicle';
import type { Run } from './run';
import type { Vec2 } from './types';

/** Everything that changes from frame to frame and affects drawing. */
export interface FrameState {
  /** Seconds since the engine started. Drives animations. */
  time: number;
  /** The bridge as built so far. */
  bridge: Bridge;
  /** Highlighted joint: where a drag starts, or the joint it would connect to. */
  activeJoint: number | null;
  /** Finger/mouse position while pressed (lifted above the finger while dragging). */
  pointer: Vec2 | null;
  /** The beam being dragged, drawn as a preview. */
  plan: BeamPlan | null;
  /** The simulated bridge and the vehicle during a run, or null while editing. */
  run: Run | null;
  /** Water droplets from a splash. */
  droplets: Droplet[];
  /** Seconds of screen shake left (after a beam breaks). */
  shake: number;
}

/** A small, limited palette keeps the retro look consistent. */
const PALETTE = {
  skyBands: ['#3a6ea5', '#4a80bd', '#5d93d0', '#76a9e0', '#93bfe9'],
  ground: '#7a4e2d',
  groundSpeckle: '#5f3b20',
  grass: '#4caf3e',
  grassShadow: '#2f7d2a',
  water: '#2a5aa8',
  waterDeep: '#1f4685',
  waterHighlight: '#7fb2ee',
  rail: '#b0b6be',
  sleeper: '#5a3a1e',
  anchorFill: '#e8e8e8',
  anchorActive: '#ffd84a',
  jointFill: '#c8c8c8',
  wood: '#a0683a',
  woodDark: '#6b4220',
  steel: '#9aa4b0',
  cable: '#2a2a2a',
  previewValid: '#ffffff',
  previewInvalid: '#ff4a3c',
  guide: '#ffd84a',
  outline: '#1c1c1c',
  pole: '#d8d8d8',
  flagStart: '#3cc84a',
  flagEnd: '#e8483c',
  gapHint: '#ffffff',
  pointer: '#ffffff',
} as const;

/** Draws one complete frame. Layers are painted back to front. */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  level: Level,
  state: FrameState,
): void {
  // Setting canvas.width resets context state, so set this every frame.
  ctx.imageSmoothingEnabled = false;

  // A shake moves the whole picture, which uncovers a thin strip at the
  // edges; clear it so it doesn't show the previous frame.
  const shake = shakeOffset(state.shake, state.time);
  if (shake.x !== 0 || shake.y !== 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.skyBands[0];
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  // From here on, all drawing uses world coordinates. The camera keeps
  // left/top on whole canvas pixels; rounding only removes float noise.
  const scale = camera.pixelScale;
  ctx.setTransform(
    scale,
    0,
    0,
    scale,
    -Math.round((camera.left - shake.x) * scale),
    -Math.round((camera.top - shake.y) * scale),
  );

  drawSky(ctx, camera);
  if (level.waterY !== null) drawWater(ctx, camera, level.waterY, state.time);
  for (const polygon of level.terrain) drawTerrain(ctx, camera, polygon);
  drawTrack(ctx, camera, level);
  drawGapHint(ctx, level, state.time);
  drawFlag(ctx, { x: level.bridgeStart.x - 8, y: level.bridgeStart.y }, PALETTE.flagStart);
  drawFlag(ctx, { x: level.bridgeEnd.x + 8, y: level.bridgeEnd.y }, PALETTE.flagEnd);
  if (state.run) {
    drawSimulatedBeams(ctx, state.run.sim);
    drawJoints(ctx, simulatedJoints(state.run.sim), null, state.time);
    drawVehicle(ctx, state.run.vehicle, camera.pixelScale);
  } else {
    drawBeams(ctx, state.bridge);
    if (state.plan) drawBeamPlan(ctx, state.plan);
    drawJoints(ctx, state.bridge.joints, state.activeJoint, state.time);
  }
  drawDroplets(ctx, state.droplets);
  if (state.pointer) drawPointer(ctx, state.pointer);
}

/** Splash droplets: single light-blue pixels. */
function drawDroplets(ctx: CanvasRenderingContext2D, droplets: readonly Droplet[]): void {
  ctx.fillStyle = PALETTE.waterHighlight;
  for (const { position } of droplets) {
    ctx.fillRect(Math.round(position.x), Math.round(position.y), 1, 1);
  }
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

/** Horizontal colour bands instead of a smooth gradient: the 16-bit way. */
function drawSky(ctx: CanvasRenderingContext2D, camera: Camera): void {
  const bands = PALETTE.skyBands;
  const bandHeight = Math.ceil(camera.viewHeight / bands.length);
  bands.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(camera.left, camera.top + i * bandHeight, camera.viewWidth, bandHeight);
  });
}

function drawWater(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  surfaceY: number,
  time: number,
): void {
  const right = camera.left + camera.viewWidth;
  const bottom = camera.top + camera.viewHeight;

  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(camera.left, surfaceY, camera.viewWidth, bottom - surfaceY);
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(camera.left, surfaceY + 12, camera.viewWidth, bottom - surfaceY);

  // A one-pixel highlight that bobs up and down: a column at a time.
  ctx.fillStyle = PALETTE.waterHighlight;
  // Start on a whole world unit so the wave doesn't shift while panning.
  for (let x = Math.floor(camera.left); x < right; x++) {
    const wave = Math.round(Math.sin(x * 0.18 + time * 2.5));
    ctx.fillRect(x, surfaceY + wave, 1, 1);
  }
}

function drawTerrain(ctx: CanvasRenderingContext2D, camera: Camera, polygon: Vec2[]): void {
  tracePolygon(ctx, polygon);
  ctx.fillStyle = PALETTE.ground;
  ctx.fill();

  // Dithered speckles give the dirt some texture. They are anchored to a
  // world grid (not the screen) so they don't swim when the view resizes.
  ctx.save();
  tracePolygon(ctx, polygon);
  ctx.clip();
  ctx.fillStyle = PALETTE.groundSpeckle;
  const cell = 6;
  const startX = Math.floor(camera.left / cell) * cell;
  const startY = Math.floor(camera.top / cell) * cell;
  for (let y = startY; y < camera.top + camera.viewHeight; y += cell) {
    for (let x = startX; x < camera.left + camera.viewWidth; x += cell) {
      const h = hash(x, y);
      if (h < 0.45) ctx.fillRect(x + Math.floor(h * 10), y + Math.floor(h * 13) % cell, 1, 1);
    }
  }
  ctx.restore();

  drawGrass(ctx, polygon);
}

/**
 * Grass on every "walkable" edge: edges that go rightwards and are flatter
 * than 45°. With clockwise polygons, those are exactly the top surfaces.
 */
function drawGrass(ctx: CanvasRenderingContext2D, polygon: Vec2[]): void {
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    if (!b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx <= 0 || Math.abs(dy) > dx) return;

    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(a.x, a.y, dx, 2);
    ctx.fillStyle = PALETTE.grassShadow;
    ctx.fillRect(a.x, a.y + 2, dx, 1);
  });
}

/**
 * The existing railway on both banks. Assumes the ground is flat at track
 * height out to the screen edges, which holds for all current levels.
 */
function drawTrack(ctx: CanvasRenderingContext2D, camera: Camera, level: Level): void {
  const viewRight = camera.left + camera.viewWidth;
  drawTrackSegment(ctx, camera.left, level.bridgeStart.x, level.bridgeStart.y);
  drawTrackSegment(ctx, level.bridgeEnd.x, viewRight, level.bridgeEnd.y);
}

function drawTrackSegment(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  toX: number,
  groundY: number,
): void {
  const sleeperSpacing = 6;
  ctx.fillStyle = PALETTE.sleeper;
  const firstSleeper = Math.ceil(fromX / sleeperSpacing) * sleeperSpacing;
  for (let x = firstSleeper; x < toX - 2; x += sleeperSpacing) {
    ctx.fillRect(x, groundY - 2, 3, 2);
  }
  ctx.fillStyle = PALETTE.rail;
  ctx.fillRect(fromX, groundY - 3, toX - fromX, 1);
}

/** A pulsing dashed line showing where the bridge has to go. */
function drawGapHint(ctx: CanvasRenderingContext2D, level: Level, time: number): void {
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.25 * Math.sin(time * 3);
  ctx.fillStyle = PALETTE.gapHint;
  const { bridgeStart: a, bridgeEnd: b } = level;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  // Pixel dashes: 3 on, 3 off.
  for (let d = 4; d < length - 4; d += 6) {
    const t = d / length;
    ctx.fillRect(Math.round(a.x + (b.x - a.x) * t), Math.round(a.y + (b.y - a.y) * t) - 3, 3, 1);
  }
  ctx.restore();
}

function drawFlag(ctx: CanvasRenderingContext2D, base: Vec2, color: string): void {
  const poleHeight = 16;
  ctx.fillStyle = PALETTE.pole;
  ctx.fillRect(base.x, base.y - poleHeight, 1, poleHeight);
  ctx.fillStyle = PALETTE.outline;
  ctx.fillRect(base.x + 1, base.y - poleHeight, 7, 6);
  ctx.fillStyle = color;
  ctx.fillRect(base.x + 1, base.y - poleHeight + 1, 6, 4);
}

/** Track beams are drawn last so the deck sits on top of its supports. */
function drawBeams(ctx: CanvasRenderingContext2D, bridge: Bridge): void {
  const supports = bridge.beams.filter((beam) => beam.material !== 'track');
  const deck = bridge.beams.filter((beam) => beam.material === 'track');
  for (const beam of [...supports, ...deck]) drawBeam(ctx, bridge, beam);
}

function drawBeam(ctx: CanvasRenderingContext2D, bridge: Bridge, beam: Beam): void {
  const [a, b] = beamEnds(bridge, beam);
  drawMaterialLine(ctx, a, b, beam.material);
}

/**
 * Each material has its own look, built from square "brushes" stamped along
 * a pixel line. Offsets are relative to the line pixel.
 */
function drawMaterialLine(
  ctx: CanvasRenderingContext2D,
  a: Vec2,
  b: Vec2,
  material: MaterialId,
  /** Replaces the beam's main colour, e.g. with its strain colour during a run. */
  bodyColor?: string,
): void {
  switch (material) {
    case 'track':
      // Planks just below the rail line, matching the track on the banks.
      stampLine(ctx, a, b, bodyColor ?? PALETTE.sleeper, -1, -2, 1, 2);
      stampLine(ctx, a, b, PALETTE.rail, 0, -3, 1, 1);
      break;
    case 'wood':
      stampLine(ctx, a, b, bodyColor ?? PALETTE.woodDark, -1, -1, 2, 2);
      if (!bodyColor) stampLine(ctx, a, b, PALETTE.wood, 0, -1, 1, 1);
      break;
    case 'steel':
      stampLine(ctx, a, b, PALETTE.outline, -1, -1, 3, 3);
      stampLine(ctx, a, b, bodyColor ?? PALETTE.steel, 0, 0, 1, 1);
      break;
    case 'cable':
      stampLine(ctx, a, b, bodyColor ?? PALETTE.cable, 0, 0, 1, 1);
      break;
  }
}

/**
 * During a run, beams are drawn where the simulation has moved them, coloured
 * by how close they are to breaking. Broken halves keep their material colour.
 */
function drawSimulatedBeams(ctx: CanvasRenderingContext2D, sim: Simulation): void {
  const intact = sim.constraints.filter((c) => !c.broken);
  const supports = intact.filter((c) => c.material !== 'track');
  const deck = intact.filter((c) => c.material === 'track');
  for (const constraint of [...supports, ...deck]) {
    const a = particleAt(sim, constraint.a).position;
    const b = particleAt(sim, constraint.b).position;
    const color = constraint.fragment
      ? undefined
      : strainColor(constraint.strain / MATERIALS[constraint.material].breakStrain);
    drawMaterialLine(ctx, a, b, constraint.material, color);
  }
}

/** The simulated joints, drawn like the editor's joints. Loose beam ends are not drawn. */
function simulatedJoints(sim: Simulation): Joint[] {
  return sim.particles.flatMap((particle) =>
    particle.jointId === null
      ? []
      : [{ id: particle.jointId, position: particle.position, fixed: particle.inverseMass === 0 }],
  );
}

/**
 * Green when relaxed, yellow at half the break limit, red at the limit.
 * `load` is strain divided by break strain; its sign (stretch/squeeze) is ignored.
 */
export function strainColor(load: number): string {
  const t = Math.min(1, Math.abs(load));
  const [from, to, local] =
    t < 0.5
      ? [STRAIN_COLORS.relaxed, STRAIN_COLORS.half, t / 0.5]
      : [STRAIN_COLORS.half, STRAIN_COLORS.breaking, (t - 0.5) / 0.5];
  const channel = (i: number) => Math.round(from[i]! + (to[i]! - from[i]!) * local);
  const hex = (value: number) => value.toString(16).padStart(2, '0');
  return `#${hex(channel(0))}${hex(channel(1))}${hex(channel(2))}`;
}

/** Strain colour stops as RGB, so they can be blended. */
const STRAIN_COLORS = {
  relaxed: [0x3c, 0xc8, 0x4a],
  half: [0xff, 0xd8, 0x4a],
  breaking: [0xe8, 0x30, 0x2c],
} as const;

/** Preview of the beam being dragged: white if it can be built, red if not. */
function drawBeamPlan(ctx: CanvasRenderingContext2D, plan: BeamPlan): void {
  for (const guide of plan.guides) drawGuide(ctx, guide);

  const color = plan.placement.ok ? PALETTE.previewValid : PALETTE.previewInvalid;
  stampLine(ctx, plan.from, plan.to, color, 0, 0, 1, 1);

  // Hollow square marking where the beam will end.
  const x = Math.round(plan.to.x);
  const y = Math.round(plan.to.y);
  ctx.fillStyle = color;
  ctx.fillRect(x - 2, y - 2, 5, 1);
  ctx.fillRect(x - 2, y + 2, 5, 1);
  ctx.fillRect(x - 2, y - 1, 1, 3);
  ctx.fillRect(x + 2, y - 1, 1, 3);
}

/** A small diamond marking a snap point, such as a triangle apex. */
function drawGuide(ctx: CanvasRenderingContext2D, at: Vec2): void {
  const x = Math.round(at.x);
  const y = Math.round(at.y);
  ctx.fillStyle = PALETTE.guide;
  ctx.fillRect(x, y - 2, 1, 1);
  ctx.fillRect(x - 1, y - 1, 3, 1);
  ctx.fillRect(x - 2, y, 5, 1);
  ctx.fillRect(x - 1, y + 1, 3, 1);
  ctx.fillRect(x, y + 2, 1, 1);
}

/** Anchors are large squares; free joints the player made are small ones. */
function drawJoints(
  ctx: CanvasRenderingContext2D,
  joints: readonly Joint[],
  activeJointId: number | null,
  time: number,
): void {
  for (const joint of joints) {
    const isActive = joint.id === activeJointId;
    const baseSize = joint.fixed ? 5 : 3;
    // The active joint grows a pixel every other quarter second.
    const size = isActive ? baseSize + (Math.floor(time * 4) % 2) * 2 : baseSize;
    const half = Math.floor(size / 2);
    const x = Math.round(joint.position.x) - half;
    const y = Math.round(joint.position.y) - half;

    ctx.fillStyle = PALETTE.outline;
    ctx.fillRect(x - 1, y - 1, size + 2, size + 2);
    ctx.fillStyle = isActive
      ? PALETTE.anchorActive
      : joint.fixed
        ? PALETTE.anchorFill
        : PALETTE.jointFill;
    ctx.fillRect(x, y, size, size);
  }
}

/** A small crosshair under the finger. */
function drawPointer(ctx: CanvasRenderingContext2D, p: Vec2): void {
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  ctx.fillStyle = PALETTE.pointer;
  ctx.fillRect(x - 4, y, 3, 1);
  ctx.fillRect(x + 2, y, 3, 1);
  ctx.fillRect(x, y - 4, 1, 3);
  ctx.fillRect(x, y + 2, 1, 3);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Draws a crisp pixel line from `a` to `b` by stamping a `width`×`height`
 * rectangle, offset by (`offsetX`, `offsetY`), on every pixel of the line.
 * Canvas strokes would be anti-aliased and blur the pixel look.
 */
function stampLine(
  ctx: CanvasRenderingContext2D,
  a: Vec2,
  b: Vec2,
  color: string,
  offsetX: number,
  offsetY: number,
  width: number,
  height: number,
): void {
  ctx.fillStyle = color;
  forEachLinePixel(a, b, (x, y) => ctx.fillRect(x + offsetX, y + offsetY, width, height));
}

function tracePolygon(ctx: CanvasRenderingContext2D, polygon: Vec2[]): void {
  ctx.beginPath();
  polygon.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

/** Cheap deterministic pseudo-random number in [0, 1) for a grid position. */
function hash(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
