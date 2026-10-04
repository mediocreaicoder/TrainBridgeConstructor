import {
  addBeam,
  canPlaceBeam,
  createBridge,
  findBeamNear,
  findJointNear,
  removeBeam,
  type BeamTarget,
} from './bridge';
import { cssToWorld, fitCamera, type Camera } from './camera';
import { installDebugHook } from './debug';
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  planBeam,
  redo,
  undo,
  type History,
} from './editor';
import type { Level } from './level';
import type { MaterialId } from './materials';
import { renderFrame, type FrameState } from './render';
import { distance, type Vec2 } from './types';

/** Events the engine reports to the UI. */
export type EngineEvent = { type: 'historyChanged'; canUndo: boolean; canRedo: boolean };

export type EngineListener = (event: EngineEvent) => void;

/** Pressing within this many world units of a joint grabs it to start a beam. */
const JOINT_GRAB_RADIUS = 10;

/** The finger must move this far (world units) before a press becomes a drag. */
const DRAG_START_DISTANCE = 3;

/** Two taps within this time and distance make a double-tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DISTANCE = 8;

/** A double-tap within this many world units of a beam removes it. */
const BEAM_HIT_RADIUS = 5;

/**
 * On touch screens the dragged beam end is drawn this many CSS pixels above
 * the finger, so the finger doesn't hide where the beam will end.
 */
const TOUCH_LIFT_CSS_PX = 20;

/** Caps the time step so a backgrounded tab doesn't cause one huge jump. */
const MAX_FRAME_SECONDS = 0.1;

/** The press currently in progress. */
interface Gesture {
  pointerId: number;
  /** Where the finger went down, in world units. */
  start: Vec2;
  /** The joint the press started on, if any. Only those presses can drag. */
  fromJointId: number | null;
  dragging: boolean;
  /** How far to lift the beam end above the pointer, in world units. */
  lift: number;
}

interface Tap {
  time: number;
  position: Vec2;
}

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
  private history: History;
  private material: MaterialId = 'track';
  private state: FrameState;
  private gesture: Gesture | null = null;
  private lastTap: Tap | null = null;
  private frameId: number | null = null;
  private lastFrameTime: number | null = null;
  /** Removes `window.__game`. Only set in dev builds. */
  private removeDebugHook: (() => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly level: Level,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not supported');
    this.ctx = ctx;

    this.camera = fitCamera(1, 1, level);
    this.history = createHistory(createBridge(level.anchors));
    this.state = {
      time: 0,
      bridge: this.history.present,
      activeJoint: null,
      pointer: null,
      plan: null,
    };
    this.resizeObserver = new ResizeObserver(() => this.handleResize());

    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerCancel);
  }

  start(): void {
    this.resizeObserver.observe(this.canvas);
    this.handleResize();
    this.frameId = requestAnimationFrame(this.tick);
    // Tell the UI the starting undo/redo state (e.g. after a level change).
    this.emitHistoryChanged();

    // Vite replaces import.meta.env.DEV with `false` in production builds,
    // so this branch and the debug module are dropped from the bundle.
    if (import.meta.env.DEV) this.removeDebugHook = installDebugHook(this);
  }

  /** Stops the loop and removes every listener. The engine can't be restarted. */
  destroy(): void {
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.removeDebugHook?.();
    this.removeDebugHook = null;
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.listeners.clear();
  }

  /** Subscribes to engine events. Returns a function that unsubscribes. */
  onEvent(listener: EngineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A snapshot of the current frame state, safe for callers to keep or modify. */
  getState(): FrameState {
    return structuredClone(this.state);
  }

  // -------------------------------------------------------------------------
  // Commands from the UI
  // -------------------------------------------------------------------------

  /** Material used for the next beams. */
  setMaterial(material: MaterialId): void {
    this.material = material;
  }

  undo(): void {
    this.setHistory(undo(this.history));
  }

  redo(): void {
    this.setHistory(redo(this.history));
  }

  /**
   * Builds a beam if the placement rules allow it, by default with the
   * selected material. Returns whether the beam was built.
   */
  tryAddBeam(fromJointId: number, target: BeamTarget, material = this.material): boolean {
    const bridge = this.history.present;
    const placement = canPlaceBeam(bridge, this.level.terrain, fromJointId, target, material);
    if (!placement.ok) return false;
    this.setHistory(commit(this.history, addBeam(bridge, fromJointId, target, material)));
    return true;
  }

  /** Removes a beam. Returns false if there was no such beam. */
  removeBeam(beamId: number): boolean {
    const before = this.history.present;
    this.setHistory(commit(this.history, removeBeam(before, beamId)));
    return this.history.present !== before;
  }

  private setHistory(history: History): void {
    if (history === this.history) return;
    this.history = history;
    this.state.bridge = history.present;
    this.emitHistoryChanged();
  }

  private emitHistoryChanged(): void {
    const { history } = this;
    this.emit({ type: 'historyChanged', canUndo: canUndo(history), canRedo: canRedo(history) });
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
  // Resize
  // -------------------------------------------------------------------------

  private handleResize(): void {
    const { clientWidth, clientHeight } = this.canvas;
    if (clientWidth === 0 || clientHeight === 0) return; // hidden / not laid out yet

    this.camera = fitCamera(clientWidth, clientHeight, this.level);
    // Resizing the backing store also clears it; the next tick redraws.
    this.canvas.width = this.camera.viewWidth;
    this.canvas.height = this.camera.viewHeight;
  }

  // -------------------------------------------------------------------------
  // Input: drag from a joint to build, double-tap a beam to remove it
  // -------------------------------------------------------------------------

  private handlePointerDown = (event: PointerEvent): void => {
    if (this.gesture) return; // ignore extra fingers while one is down

    // Keep receiving move/up events even if the finger slides off the canvas.
    this.canvas.setPointerCapture(event.pointerId);
    const start = this.toWorld(event);
    const fromJoint = findJointNear(this.history.present, start, JOINT_GRAB_RADIUS);

    this.gesture = {
      pointerId: event.pointerId,
      start,
      fromJointId: fromJoint?.id ?? null,
      dragging: false,
      lift: event.pointerType === 'touch' ? this.cssToWorldLength(TOUCH_LIFT_CSS_PX) : 0,
    };
    this.state.activeJoint = this.gesture.fromJointId;
    this.state.pointer = start;
  };

  private handlePointerMove = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    const position = this.toWorld(event);
    if (
      !gesture.dragging &&
      gesture.fromJointId !== null &&
      distance(position, gesture.start) >= DRAG_START_DISTANCE
    ) {
      gesture.dragging = true;
    }
    if (!gesture.dragging || gesture.fromJointId === null) {
      this.state.pointer = position;
      return;
    }

    const beamEnd = { x: position.x, y: position.y - gesture.lift };
    const plan = planBeam(
      this.history.present,
      this.level.terrain,
      gesture.fromJointId,
      beamEnd,
      this.material,
    );
    this.state.pointer = beamEnd;
    this.state.plan = plan;
    this.state.activeJoint = plan.target.kind === 'joint' ? plan.target.jointId : null;
  };

  private handlePointerUp = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    const { plan } = this.state;
    if (gesture.dragging && plan?.placement.ok) {
      this.tryAddBeam(plan.fromJointId, plan.target);
    } else if (!gesture.dragging) {
      this.handleTap({ time: event.timeStamp, position: gesture.start });
    }
    this.endGesture();
  };

  private handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.gesture?.pointerId) this.endGesture();
  };

  private endGesture(): void {
    this.gesture = null;
    this.state.plan = null;
    this.state.pointer = null;
    this.state.activeJoint = null;
  }

  /** A single tap does nothing on its own; a quick second tap on a beam removes it. */
  private handleTap(tap: Tap): void {
    const previous = this.lastTap;
    const isDoubleTap =
      previous !== null &&
      tap.time - previous.time <= DOUBLE_TAP_MS &&
      distance(tap.position, previous.position) <= DOUBLE_TAP_DISTANCE;

    if (!isDoubleTap) {
      this.lastTap = tap;
      return;
    }
    this.lastTap = null; // a third tap starts a new pair
    const beam = findBeamNear(this.history.present, tap.position, BEAM_HIT_RADIUS);
    if (beam) this.removeBeam(beam.id);
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

  /** Converts a length in CSS pixels to world units at the current zoom. */
  private cssToWorldLength(cssPixels: number): number {
    const { height } = this.canvas.getBoundingClientRect();
    return height === 0 ? 0 : (cssPixels / height) * this.camera.viewHeight;
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
