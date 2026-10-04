import type { Level } from './level';
import type { Vec2 } from './types';

/**
 * Maps world units to the canvas.
 *
 * The canvas backing store is deliberately low resolution: `pixelScale`
 * canvas pixels per world unit (1 when zoomed out). CSS stretches it to fill
 * the screen with `image-rendering: pixelated`, which gives the chunky 16-bit
 * look for free. Everything is drawn in whole world units, so a higher
 * `pixelScale` looks the same; it only lets the view pan in finer steps.
 */
export interface Camera {
  /** Canvas backing-store size, in canvas pixels. */
  canvasWidth: number;
  canvasHeight: number;
  /** Canvas pixels per world unit. Always a whole number, so pixels stay crisp. */
  pixelScale: number;
  /** Visible area in world units. */
  viewWidth: number;
  viewHeight: number;
  /** World coordinate shown at the canvas' top-left corner. */
  left: number;
  top: number;
}

/**
 * What the player has zoomed to. `zoom` 1 shows the whole playfield (and any
 * spare screen as extra landscape); higher values zoom in around `center`.
 */
export interface CameraView {
  zoom: number;
  center: Vec2;
}

/** Screen size in CSS pixels. */
export interface ScreenSize {
  width: number;
  height: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** The default view: zoomed out, playfield centred. */
export function fitView(level: Level): CameraView {
  return { zoom: MIN_ZOOM, center: { x: level.width / 2, y: level.height / 2 } };
}

/** CSS pixels per world unit at zoom 1: the largest scale where the playfield fits. */
function fitScale(screen: ScreenSize, level: Level): number {
  return Math.min(screen.width / level.width, screen.height / level.height);
}

/** CSS pixels per world unit at the view's zoom. */
export function cssPixelsPerUnit(screen: ScreenSize, level: Level, view: CameraView): number {
  return fitScale(screen, level) * view.zoom;
}

/** Builds the camera for a screen size and view. */
export function computeCamera(
  screen: ScreenSize,
  level: Level,
  view: CameraView = fitView(level),
): Camera {
  const scale = cssPixelsPerUnit(screen, level, view);
  const pixelScale = Math.max(1, Math.floor(view.zoom));
  const canvasWidth = Math.ceil((screen.width / scale) * pixelScale);
  const canvasHeight = Math.ceil((screen.height / scale) * pixelScale);
  const viewWidth = canvasWidth / pixelScale;
  const viewHeight = canvasHeight / pixelScale;

  // Snap the top-left corner to whole canvas pixels, so world pixels don't blur.
  const snap = (value: number) => Math.round(value * pixelScale) / pixelScale;
  return {
    canvasWidth,
    canvasHeight,
    pixelScale,
    viewWidth,
    viewHeight,
    left: snap(view.center.x - viewWidth / 2),
    top: snap(view.center.y - viewHeight / 2),
  };
}

/** The camera that shows the whole playfield. Kept for callers that don't zoom. */
export function fitCamera(cssWidth: number, cssHeight: number, level: Level): Camera {
  return computeCamera({ width: cssWidth, height: cssHeight }, level);
}

/**
 * Limits zoom to [MIN_ZOOM, MAX_ZOOM] and keeps the view inside the area that
 * is visible at zoom 1, so the player can't pan away into nothing.
 */
export function clampView(view: CameraView, screen: ScreenSize, level: Level): CameraView {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom));
  const fit = fitScale(screen, level);

  // Half sizes, in world units, of the zoom-1 area and of the visible area.
  const halfFitWidth = screen.width / fit / 2;
  const halfFitHeight = screen.height / fit / 2;
  const halfViewWidth = halfFitWidth / zoom;
  const halfViewHeight = halfFitHeight / zoom;

  const clamp = (value: number, middle: number, room: number) =>
    Math.min(middle + room, Math.max(middle - room, value));
  return {
    zoom,
    center: {
      x: clamp(view.center.x, level.width / 2, halfFitWidth - halfViewWidth),
      y: clamp(view.center.y, level.height / 2, halfFitHeight - halfViewHeight),
    },
  };
}

/**
 * The view at `zoom` where world point `anchor` appears at screen position
 * `anchorCss`. Pinch, pan and wheel zoom all use this: the point under the
 * fingers stays under the fingers. The result is clamped.
 */
export function viewWithAnchor(
  anchor: Vec2,
  anchorCss: Vec2,
  zoom: number,
  screen: ScreenSize,
  level: Level,
): CameraView {
  const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  const scale = fitScale(screen, level) * clampedZoom;
  const center = {
    x: anchor.x - (anchorCss.x - screen.width / 2) / scale,
    y: anchor.y - (anchorCss.y - screen.height / 2) / scale,
  };
  return clampView({ zoom: clampedZoom, center }, screen, level);
}

/** Converts a position relative to the canvas element (CSS pixels) to world units. */
export function cssToWorld(
  camera: Camera,
  cssX: number,
  cssY: number,
  cssWidth: number,
  cssHeight: number,
): Vec2 {
  return {
    x: camera.left + (cssX / cssWidth) * camera.viewWidth,
    y: camera.top + (cssY / cssHeight) * camera.viewHeight,
  };
}
