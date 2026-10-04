import { cssToWorld, fitCamera, type Camera } from './camera';
import type { Level } from './level';
import { renderFrame, type FrameState } from './render';
import { distance, type Vec2 } from './types';

/** Events the engine reports to the UI. */
export type EngineEvent =
  | { type: 'anchorTapped'; anchorIndex: number }
  | { type: 'emptyTapped'; position: Vec2 };

export type EngineListener = (event: EngineEvent) => void;

/** A tap within this many world units of an anchor counts as hitting it. */
const ANCHOR_SNAP_RADIUS = 10;

/** Caps the time step so a backgrounded tab doesn't cause one huge jump. */
const MAX_FRAME_SECONDS = 0.1;

/**
 * Owns the canvas: runs the game loop, handles input and draws frames.
 * Plain TypeScript with no React, so the hot path never touches React state.
 *
 * Lifecycle: `new Engine(canvas, level)` → `start()` → `destroy()`.
 */
export class Engine {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly listeners = new Set<EngineListener>();
  private readonly resizeObserver: ResizeObserver;

  private camera: Camera;
  private state: FrameState = { time: 0, pointer: null, activeAnchor: null };
  private frameId: number | null = null;
  private lastFrameTime: number | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly level: Level,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not supported');
    this.ctx = ctx;

    this.camera = fitCamera(1, 1, level);
    this.resizeObserver = new ResizeObserver(() => this.handleResize());

    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerUp);
  }

  start(): void {
    this.resizeObserver.observe(this.canvas);
    this.handleResize();
    this.frameId = requestAnimationFrame(this.tick);
  }

  /** Stops the loop and removes every listener. The engine can't be restarted. */
  destroy(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
    this.listeners.clear();
  }

  /** Subscribes to engine events. Returns a function that unsubscribes. */
  onEvent(listener: EngineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // -------------------------------------------------------------------------
  // Game loop
  // -------------------------------------------------------------------------

  // Arrow functions keep `this` bound when passed as callbacks.
  private tick = (now: number): void => {
    const seconds = this.lastFrameTime === null ? 0 : (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;

    this.update(Math.min(seconds, MAX_FRAME_SECONDS));
    renderFrame(this.ctx, this.camera, this.level, this.state);

    this.frameId = requestAnimationFrame(this.tick);
  };

  /** Advances the simulation. Bridge physics and the train will live here. */
  private update(dt: number): void {
    this.state.time += dt;
  }

  // -------------------------------------------------------------------------
  // Resize & input
  // -------------------------------------------------------------------------

  private handleResize(): void {
    const { clientWidth, clientHeight } = this.canvas;
    if (clientWidth === 0 || clientHeight === 0) return; // hidden / not laid out yet

    this.camera = fitCamera(clientWidth, clientHeight, this.level);
    // Resizing the backing store also clears it; the next tick redraws.
    this.canvas.width = this.camera.viewWidth;
    this.canvas.height = this.camera.viewHeight;
  }

  private handlePointerDown = (event: PointerEvent): void => {
    // Keep receiving move/up events even if the finger slides off the canvas.
    this.canvas.setPointerCapture(event.pointerId);
    const position = this.toWorld(event);
    this.updatePointer(position);

    const { activeAnchor } = this.state;
    this.emit(
      activeAnchor !== null
        ? { type: 'anchorTapped', anchorIndex: activeAnchor }
        : { type: 'emptyTapped', position },
    );
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (this.state.pointer === null) return; // only track while pressed
    this.updatePointer(this.toWorld(event));
  };

  private handlePointerUp = (): void => {
    this.state.pointer = null;
    this.state.activeAnchor = null;
  };

  private updatePointer(position: Vec2): void {
    this.state.pointer = position;
    this.state.activeAnchor = this.findAnchorNear(position);
  }

  private toWorld(event: PointerEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return cssToWorld(
      this.camera,
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height,
    );
  }

  /** Returns the index of the closest anchor within snapping range, or null. */
  private findAnchorNear(position: Vec2): number | null {
    let best: number | null = null;
    let bestDistance = ANCHOR_SNAP_RADIUS;
    for (const [i, anchor] of this.level.anchors.entries()) {
      const d = distance(anchor, position);
      if (d <= bestDistance) {
        best = i;
        bestDistance = d;
      }
    }
    return best;
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
