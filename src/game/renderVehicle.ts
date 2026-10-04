import { forEachLinePixel } from './pixelLine';
import type { Vehicle } from './train';

/**
 * Draws the one-man handcar: a platform on two wheels, a see-saw pump lever
 * on a post, and a man pumping it in time with the wheels.
 *
 * The handcar is painted pixel by pixel into a small sprite canvas, which is
 * then drawn rotated by the vehicle's tilt. With image smoothing off, the
 * rotation uses nearest-neighbour sampling, so the sprite stays pixel-sharp.
 */

/** Sprite canvas size, and where the rail contact point (between the wheels) is in it. */
const SPRITE_SIZE = 24;
const ORIGIN = { x: 12, y: 21 };

/** The rail's top is this far above the joint line the vehicle position is on. */
const RAIL_HEIGHT = 3;

const WHEEL_RADIUS = 2;
const WHEEL_X = 4;
const LEVER_PIVOT_Y = -11;
const LEVER_HALF_LENGTH = 5;
const LEVER_SWING = 0.45; // radians each way
/** Distance rolled per full pump stroke (down and up again). */
const PUMP_STROKE_DISTANCE = 16;

const COLORS = {
  wheel: '#2a2a2a',
  spoke: '#b0b6be',
  deck: '#a0683a',
  deckShadow: '#6b4220',
  metal: '#9aa4b0',
  lever: '#3a3a3a',
  pants: '#2b4a8a',
  shirt: '#d83c3c',
  skin: '#f0c090',
  hair: '#1c1c1c',
} as const;

let sprite: HTMLCanvasElement | null = null;

/** Draws the vehicle. The context must already use world coordinates. */
export function drawVehicle(
  ctx: CanvasRenderingContext2D,
  vehicle: Vehicle,
  pixelScale: number,
): void {
  if (vehicle.status === 'sunk') return; // under water

  const canvas = paintSprite(vehicle);
  // Round to whole canvas pixels so the sprite doesn't shimmer while moving.
  const snap = (value: number) => Math.round(value * pixelScale) / pixelScale;

  ctx.save();
  ctx.translate(snap(vehicle.position.x), snap(vehicle.position.y - RAIL_HEIGHT));
  ctx.rotate(vehicle.angle);
  ctx.drawImage(canvas, -ORIGIN.x, -ORIGIN.y);
  ctx.restore();
}

/** Paints this frame of the handcar into the shared sprite canvas. */
function paintSprite(vehicle: Vehicle): HTMLCanvasElement {
  sprite ??= createSpriteCanvas();
  const ctx = sprite.getContext('2d');
  if (!ctx) return sprite;

  // Clear with no transform; last frame's origin shift is still set.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  // Draw relative to the rail contact point, like the world drawing does.
  ctx.setTransform(1, 0, 0, 1, ORIGIN.x, ORIGIN.y);

  const wheelTurn = vehicle.distance / WHEEL_RADIUS;
  const pumpPhase = (vehicle.distance / PUMP_STROKE_DISTANCE) * Math.PI * 2;
  const leverAngle = Math.sin(pumpPhase) * LEVER_SWING;
  const scared = vehicle.status === 'falling';

  drawWheel(ctx, -WHEEL_X, wheelTurn);
  drawWheel(ctx, WHEEL_X, wheelTurn);
  drawDeck(ctx);
  const handle = drawLever(ctx, leverAngle);
  drawMan(ctx, handle, scared);
  return sprite;
}

function createSpriteCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_SIZE;
  canvas.height = SPRITE_SIZE;
  return canvas;
}

function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}

/** A 5×5 pixel wheel standing on the rail, with a spoke that turns in eighths. */
function drawWheel(ctx: CanvasRenderingContext2D, centerX: number, turn: number): void {
  const cy = -1 - WHEEL_RADIUS; // bottom row sits just above the rail contact point
  rect(ctx, centerX - 1, cy - 2, 3, 1, COLORS.wheel);
  rect(ctx, centerX - 2, cy - 1, 5, 3, COLORS.wheel);
  rect(ctx, centerX - 1, cy + 2, 3, 1, COLORS.wheel);

  // The spoke is a line through the hub; four directions cover a half turn.
  const SPOKE_OFFSETS = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
  ] as const;
  const step = Math.floor(turn / (Math.PI / 4)) % SPOKE_OFFSETS.length;
  const [dx, dy] = SPOKE_OFFSETS[step] ?? SPOKE_OFFSETS[0];
  rect(ctx, centerX, cy, 1, 1, COLORS.spoke);
  rect(ctx, centerX + dx, cy + dy, 1, 1, COLORS.spoke);
  rect(ctx, centerX - dx, cy - dy, 1, 1, COLORS.spoke);
}

/** The wooden platform on the axles, and the post holding the lever. */
function drawDeck(ctx: CanvasRenderingContext2D): void {
  rect(ctx, -6, -6, 13, 1, COLORS.deck);
  rect(ctx, -6, -5, 13, 1, COLORS.deckShadow);
  rect(ctx, 0, LEVER_PIVOT_Y + 1, 1, -LEVER_PIVOT_Y - 7, COLORS.metal);
}

/**
 * The see-saw lever, tilted by `angle`. Returns the left handle's position,
 * which the man holds on to.
 */
function drawLever(ctx: CanvasRenderingContext2D, angle: number): { x: number; y: number } {
  const dx = Math.round(Math.cos(angle) * LEVER_HALF_LENGTH);
  const dy = Math.round(Math.sin(angle) * LEVER_HALF_LENGTH);
  const left = { x: -dx, y: LEVER_PIVOT_Y + dy };
  const right = { x: dx, y: LEVER_PIVOT_Y - dy };
  plotLine(ctx, left, right, COLORS.lever);
  return left;
}

/**
 * The man stands on the left half, facing the lever. He crouches when the
 * handle is low. While falling he throws his arms up in panic.
 */
function drawMan(
  ctx: CanvasRenderingContext2D,
  handle: { x: number; y: number },
  scared: boolean,
): void {
  const crouch = !scared && handle.y > LEVER_PIVOT_Y ? 1 : 0;
  const top = -16 + crouch;

  rect(ctx, -6, top + 8, 2, 2 - crouch, COLORS.pants); // legs, feet on the deck
  rect(ctx, -6, top + 4, 3, 4, COLORS.shirt); // body
  rect(ctx, -6, top + 1, 3, 3, COLORS.skin); // head
  rect(ctx, -6, top, 3, 1, COLORS.hair);

  const shoulder = { x: -4, y: top + 5 };
  if (scared) {
    plotLine(ctx, shoulder, { x: -3, y: top - 2 }, COLORS.skin);
    plotLine(ctx, { x: -6, y: top + 5 }, { x: -8, y: top - 1 }, COLORS.skin);
  } else {
    plotLine(ctx, shoulder, handle, COLORS.skin);
  }
}

/** A one-pixel line between two whole-pixel points. */
function plotLine(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
): void {
  ctx.fillStyle = color;
  forEachLinePixel(from, to, (x, y) => ctx.fillRect(x, y, 1, 1));
}
