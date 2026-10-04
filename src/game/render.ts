import type { Camera } from './camera';
import type { Level } from './level';
import type { Vec2 } from './types';

/** Everything that changes from frame to frame and affects drawing. */
export interface FrameState {
  /** Seconds since the engine started. Drives animations. */
  time: number;
  /** Finger/mouse position while pressed, in world units. */
  pointer: Vec2 | null;
  /** Index into level.anchors of the anchor under the pointer, if any. */
  activeAnchor: number | null;
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

  // From here on, all drawing uses world coordinates.
  ctx.setTransform(1, 0, 0, 1, -camera.left, -camera.top);

  drawSky(ctx, camera);
  if (level.waterY !== null) drawWater(ctx, camera, level.waterY, state.time);
  for (const polygon of level.terrain) drawTerrain(ctx, camera, polygon);
  drawTrack(ctx, camera, level);
  drawGapHint(ctx, level, state.time);
  drawFlag(ctx, { x: level.bridgeStart.x - 8, y: level.bridgeStart.y }, PALETTE.flagStart);
  drawFlag(ctx, { x: level.bridgeEnd.x + 8, y: level.bridgeEnd.y }, PALETTE.flagEnd);
  drawAnchors(ctx, level.anchors, state.activeAnchor, state.time);
  if (state.pointer) drawPointer(ctx, state.pointer);
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
  for (let x = camera.left; x < right; x++) {
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

function drawAnchors(
  ctx: CanvasRenderingContext2D,
  anchors: Vec2[],
  activeIndex: number | null,
  time: number,
): void {
  anchors.forEach((anchor, i) => {
    const isActive = i === activeIndex;
    // The active anchor grows a pixel every other quarter second.
    const size = isActive ? 5 + (Math.floor(time * 4) % 2) * 2 : 5;
    const half = Math.floor(size / 2);
    const x = Math.round(anchor.x) - half;
    const y = Math.round(anchor.y) - half;

    ctx.fillStyle = PALETTE.outline;
    ctx.fillRect(x - 1, y - 1, size + 2, size + 2);
    ctx.fillStyle = isActive ? PALETTE.anchorActive : PALETTE.anchorFill;
    ctx.fillRect(x, y, size, size);
  });
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
