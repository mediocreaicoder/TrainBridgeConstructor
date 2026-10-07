import { forEachLinePixel } from './pixelLine';
import type { Car, CarKind, Train } from './train';

/**
 * Draws the trains, car by car: the one-man handcar, the yellow maintenance
 * shunter, the green steam engine, passenger coaches and boxcars.
 *
 * Each car is painted pixel by pixel into a small sprite canvas, which is
 * then drawn rotated by the car's tilt. With image smoothing off, the
 * rotation uses nearest-neighbour sampling, so the sprite stays pixel-sharp.
 * Sprite coordinates are relative to the rail contact point between the
 * wheels; the car faces right (+x), the way it drives.
 */

/** Sprite canvas size, and where the rail contact point is in it. */
const SPRITE_WIDTH = 40;
const SPRITE_HEIGHT = 32;
const ORIGIN = { x: 20, y: 28 };

/** The rail's top is this far above the joint line the car position is on. */
const RAIL_HEIGHT = 1;

const COLORS = {
  wheel: '#2a2a2a',
  spoke: '#b0b6be',
  frame: '#3a3a3a',
  outline: '#1c1c1c',
  window: '#9fd4ff',
  skin: '#f0c090',
  hair: '#1c1c1c',
  // Handcar
  deck: '#a0683a',
  deckShadow: '#6b4220',
  metal: '#9aa4b0',
  lever: '#3a3a3a',
  pants: '#2b4a8a',
  shirt: '#d83c3c',
  // Shunter
  yellow: '#f2c230',
  yellowDark: '#c7951c',
  beacon: '#ff8a1c',
  // Steam engine
  green: '#2f5d3a',
  greenLight: '#4e8a5c',
  brass: '#c9a43a',
  driveWheel: '#b8322a',
  // Coach
  maroon: '#8a2b2b',
  cream: '#e8d9a8',
  roof: '#6b6f78',
} as const;

/** Boxcars come in a few colours, so a long goods train isn't one brown block. */
const BOXCAR_COLORS = [
  { body: '#8b4a2b', plank: '#6b3518', roof: '#4a2a18' },
  { body: '#6d2f2a', plank: '#4f201c', roof: '#3a1814' },
  { body: '#4f5f4a', plank: '#3a4736', roof: '#2a3328' },
] as const;

let sprite: HTMLCanvasElement | null = null;

/** Draws every car of the train. The context must already use world coordinates. */
export function drawTrain(ctx: CanvasRenderingContext2D, train: Train, pixelScale: number): void {
  train.cars.forEach((car, index) => drawCar(ctx, car, index, pixelScale));
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  car: Car,
  index: number,
  pixelScale: number,
): void {
  if (car.status === 'sunk') return; // under water

  const canvas = paintSprite(car, index);
  // Round to whole canvas pixels so the sprite doesn't shimmer while moving.
  const snap = (value: number) => Math.round(value * pixelScale) / pixelScale;

  ctx.save();
  ctx.translate(snap(car.position.x), snap(car.position.y - RAIL_HEIGHT));
  // Drawing may use trigonometry: it never feeds back into the simulation.
  ctx.rotate(Math.atan2(car.direction.y, car.direction.x) + car.spinAngle);
  ctx.drawImage(canvas, -ORIGIN.x, -ORIGIN.y);
  ctx.restore();
}

/** Paints one car, as it looks right now, into the shared sprite canvas. */
function paintSprite(car: Car, index: number): HTMLCanvasElement {
  sprite ??= createSpriteCanvas();
  const ctx = sprite.getContext('2d');
  if (!ctx) return sprite;

  // Clear with no transform; the last car's origin shift is still set.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, SPRITE_WIDTH, SPRITE_HEIGHT);
  ctx.setTransform(1, 0, 0, 1, ORIGIN.x, ORIGIN.y);

  const painters: Record<CarKind, () => void> = {
    handcar: () => paintHandcar(ctx, car),
    shunter: () => paintShunter(ctx, car),
    engine: () => paintEngine(ctx, car),
    coach: () => paintCoach(ctx, car),
    boxcar: () => paintBoxcar(ctx, car, index),
  };
  painters[car.kind]();
  return sprite;
}

function createSpriteCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SPRITE_WIDTH;
  canvas.height = SPRITE_HEIGHT;
  return canvas;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

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

/**
 * A wheel of radius 2 (5×5) or 3 (7×7) standing on the rail, with a spoke
 * that turns as the car rolls (in eighths of a turn).
 */
function drawWheel(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  radius: 2 | 3,
  distance: number,
  color: string = COLORS.wheel,
): void {
  const cy = -1 - radius; // the bottom row sits just above the rail contact point
  if (radius === 2) {
    rect(ctx, centerX - 1, cy - 2, 3, 1, color);
    rect(ctx, centerX - 2, cy - 1, 5, 3, color);
    rect(ctx, centerX - 1, cy + 2, 3, 1, color);
  } else {
    rect(ctx, centerX - 1, cy - 3, 3, 1, color);
    rect(ctx, centerX - 2, cy - 2, 5, 1, color);
    rect(ctx, centerX - 3, cy - 1, 7, 3, color);
    rect(ctx, centerX - 2, cy + 2, 5, 1, color);
    rect(ctx, centerX - 1, cy + 3, 3, 1, color);
  }
  const SPOKE_OFFSETS = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
  ] as const;
  const step = Math.floor(distance / radius / (Math.PI / 4)) % SPOKE_OFFSETS.length;
  const [dx, dy] = SPOKE_OFFSETS[step] ?? SPOKE_OFFSETS[0];
  const reach = radius - 1;
  const hub = { x: centerX, y: cy };
  plotLine(ctx, hub, { x: centerX + dx * reach, y: cy + dy * reach }, COLORS.spoke);
  plotLine(ctx, hub, { x: centerX - dx * reach, y: cy - dy * reach }, COLORS.spoke);
}

/** A head looking out of a window; it pops up in panic while the car falls. */
function drawHead(ctx: CanvasRenderingContext2D, x: number, y: number, scared: boolean): void {
  const top = scared ? y - 1 : y;
  rect(ctx, x, top, 2, 2, COLORS.skin);
  rect(ctx, x, top - 1, 2, 1, COLORS.hair);
}

// ---------------------------------------------------------------------------
// One-man handcar
// ---------------------------------------------------------------------------

const LEVER_PIVOT_Y = -11;
const LEVER_HALF_LENGTH = 5;
const LEVER_SWING = 0.45; // radians each way
/** Distance rolled per full pump stroke (down and up again). */
const PUMP_STROKE_DISTANCE = 16;

/** A platform on two wheels, a see-saw pump lever, and a man pumping it. */
function paintHandcar(ctx: CanvasRenderingContext2D, car: Car): void {
  const pumpPhase = (car.distance / PUMP_STROKE_DISTANCE) * Math.PI * 2;
  drawWheel(ctx, -4, 2, car.distance);
  drawWheel(ctx, 4, 2, car.distance);
  rect(ctx, -6, -6, 13, 1, COLORS.deck);
  rect(ctx, -6, -5, 13, 1, COLORS.deckShadow);
  rect(ctx, 0, LEVER_PIVOT_Y + 1, 1, -LEVER_PIVOT_Y - 7, COLORS.metal);
  const handle = drawLever(ctx, Math.sin(pumpPhase) * LEVER_SWING);
  drawMan(ctx, handle, car.status === 'falling');
}

/** The see-saw lever, tilted by `angle`. Returns the left handle, which the man holds. */
function drawLever(ctx: CanvasRenderingContext2D, angle: number): { x: number; y: number } {
  const dx = Math.round(Math.cos(angle) * LEVER_HALF_LENGTH);
  const dy = Math.round(Math.sin(angle) * LEVER_HALF_LENGTH);
  const left = { x: -dx, y: LEVER_PIVOT_Y + dy };
  const right = { x: dx, y: LEVER_PIVOT_Y - dy };
  plotLine(ctx, left, right, COLORS.lever);
  return left;
}

/** The man crouches when the handle is low, and throws his arms up while falling. */
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

// ---------------------------------------------------------------------------
// Maintenance shunter: a small yellow diesel with the cab at the back
// ---------------------------------------------------------------------------

function paintShunter(ctx: CanvasRenderingContext2D, car: Car): void {
  rect(ctx, -11, -8, 22, 2, COLORS.frame); // frame
  rect(ctx, -12, -8, 1, 1, COLORS.outline); // buffers
  rect(ctx, 11, -8, 1, 1, COLORS.outline);

  rect(ctx, -10, -19, 8, 11, COLORS.yellow); // cab
  rect(ctx, -11, -20, 10, 1, COLORS.frame); // cab roof
  rect(ctx, -8, -17, 4, 3, COLORS.window);
  drawHead(ctx, -7, -15, car.status === 'falling');

  rect(ctx, -2, -14, 12, 6, COLORS.yellow); // hood
  rect(ctx, -2, -14, 12, 1, COLORS.yellowDark);
  rect(ctx, 4, -17, 2, 3, COLORS.frame); // exhaust stack
  // Hazard stripes on the front end.
  for (let y = -13; y < -8; y += 2) rect(ctx, 8, y, 2, 1, COLORS.outline);

  // A beacon on the cab roof that blinks as it drives.
  const blink = Math.floor(car.distance / 6) % 2 === 0;
  rect(ctx, -7, -22, 2, 2, blink ? COLORS.beacon : COLORS.yellowDark);

  drawWheel(ctx, -7, 3, car.distance);
  drawWheel(ctx, 7, 3, car.distance);
}

// ---------------------------------------------------------------------------
// Steam engine: green boiler, chimney, three red driving wheels
// ---------------------------------------------------------------------------

function paintEngine(ctx: CanvasRenderingContext2D, car: Car): void {
  rect(ctx, -13, -8, 26, 2, COLORS.frame); // frame
  rect(ctx, 13, -8, 1, 1, COLORS.outline); // buffer

  rect(ctx, -4, -15, 14, 7, COLORS.green); // boiler
  rect(ctx, -4, -15, 14, 1, COLORS.greenLight);
  rect(ctx, 0, -15, 1, 7, COLORS.brass); // boiler bands
  rect(ctx, 6, -15, 1, 7, COLORS.brass);
  rect(ctx, 10, -15, 2, 7, COLORS.outline); // smokebox
  rect(ctx, 8, -19, 2, 4, COLORS.outline); // chimney
  rect(ctx, 7, -20, 4, 1, COLORS.outline);
  rect(ctx, 2, -17, 2, 2, COLORS.brass); // dome

  rect(ctx, -13, -20, 9, 12, COLORS.green); // cab
  rect(ctx, -14, -21, 11, 1, COLORS.outline); // cab roof
  rect(ctx, -11, -18, 4, 3, COLORS.window);
  drawHead(ctx, -10, -16, car.status === 'falling');

  // Driving wheels joined by a rod that goes round with them.
  const wheels = [-8, 0, 8];
  for (const x of wheels) drawWheel(ctx, x, 3, car.distance, COLORS.driveWheel);
  const crank = car.distance / 3;
  const rodY = -4 + Math.round(Math.sin(crank) * 2);
  const rodShift = Math.round(Math.cos(crank) * 2);
  plotLine(ctx, { x: -8 + rodShift, y: rodY }, { x: 8 + rodShift, y: rodY }, COLORS.metal);
}

// ---------------------------------------------------------------------------
// Passenger coach: maroon with a cream stripe and people at the windows
// ---------------------------------------------------------------------------

function paintCoach(ctx: CanvasRenderingContext2D, car: Car): void {
  rect(ctx, -13, -6, 26, 1, COLORS.frame); // frame
  rect(ctx, -13, -17, 26, 11, COLORS.maroon); // body
  rect(ctx, -13, -9, 26, 1, COLORS.cream); // stripe
  rect(ctx, -12, -19, 24, 2, COLORS.roof);

  const scared = car.status === 'falling';
  for (const x of [-10, -4, 2, 8]) {
    rect(ctx, x, -15, 3, 4, COLORS.window);
    drawHead(ctx, x, -12, scared);
  }

  drawWheel(ctx, -9, 2, car.distance);
  drawWheel(ctx, 9, 2, car.distance);
}

// ---------------------------------------------------------------------------
// Boxcar: planked sides and a sliding door, in a few colours
// ---------------------------------------------------------------------------

function paintBoxcar(ctx: CanvasRenderingContext2D, car: Car, index: number): void {
  const colors = BOXCAR_COLORS[index % BOXCAR_COLORS.length] ?? BOXCAR_COLORS[0];
  rect(ctx, -11, -6, 22, 1, COLORS.frame); // frame
  rect(ctx, -11, -18, 22, 12, colors.body);
  for (let x = -9; x < 11; x += 3) rect(ctx, x, -18, 1, 12, colors.plank); // planks
  rect(ctx, -3, -16, 6, 10, colors.plank); // door
  rect(ctx, -2, -15, 4, 8, colors.body);
  rect(ctx, -12, -19, 24, 1, colors.roof);

  drawWheel(ctx, -7, 2, car.distance);
  drawWheel(ctx, 7, 2, car.distance);
}
