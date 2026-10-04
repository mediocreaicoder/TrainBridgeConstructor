import {
  addBeam,
  canPlaceBeam,
  createBridge,
  findBeamNear,
  findJointNear,
  removeBeam,
  type BeamTarget,
} from './bridge';
import {
  computeCamera,
  cssPixelsPerUnit,
  cssToWorld,
  fitView,
  MAX_ZOOM,
  MIN_ZOOM,
  viewWithAnchor,
  type Camera,
  type CameraView,
  type ScreenSize,
} from './camera';
import { GameAudio } from './audio';
import { soundCues, summarizeRun, type SoundId } from './cues';
import { installDebugHook } from './debug';
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  GRID_SIZE,
  JOINT_SNAP_RADIUS,
  planBeam,
  redo,
  undo,
  type History,
} from './editor';
import { SHAKE_SECONDS, spawnSplash, stepDroplets } from './effects';
import type { Level } from './level';
import type { MaterialId } from './materials';
import { renderFrame, type FrameState } from './render';
import { createRun, stepRun } from './run';
import { VEHICLES, type RunOutcome } from './train';
import { distance, type Vec2 } from './types';

/** Editing the bridge, or watching the vehicle try to cross it. */
export type EngineMode = 'edit' | 'run';

/** Events the engine reports to the UI. */
export type EngineEvent =
  | { type: 'historyChanged'; canUndo: boolean; canRedo: boolean }
  | { type: 'zoomChanged'; canZoomIn: boolean; canZoomOut: boolean }
  | { type: 'modeChanged'; mode: EngineMode }
  | { type: 'runFinished'; outcome: RunOutcome };

export type EngineListener = (event: EngineEvent) => void;

// Touch targets are sized in CSS pixels, so they feel the same at every zoom
// level. Each is capped in world units, so zooming out doesn't make them huge.

/** Pressing this close to a joint grabs it to start a beam. */
const JOINT_GRAB_CSS_PX = 24;
const JOINT_GRAB_MAX_RADIUS = 10;

/** While dragging, the beam end snaps to a joint this close. */
const JOINT_SNAP_CSS_PX = 16;

/** A double-tap this close to a beam removes it. */
const BEAM_HIT_CSS_PX = 14;
const BEAM_HIT_MAX_RADIUS = 5;

/** The finger must move this far before a press becomes a drag or a pan. */
const DRAG_START_CSS_PX = 6;

/** Two taps within this time and distance make a double-tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_CSS_PX = 24;

/**
 * On touch screens the dragged beam end is drawn this many CSS pixels above
 * the finger, so the finger doesn't hide where the beam will end.
 */
const TOUCH_LIFT_CSS_PX = 20;

/** Zoom factor of the zoom buttons. */
const ZOOM_STEP = 1.5;

/** Mouse wheel zoom speed: zoom factor per pixel of wheel movement. */
const WHEEL_ZOOM_SPEED = 0.002;

/** Caps the time step so a backgrounded tab doesn't cause one huge jump. */
const MAX_FRAME_SECONDS = 0.1;

/**
 * The simulation always advances in steps of this size, however fast the
 * screen refreshes, so a run plays out the same on every device.
 */
const SIMULATION_STEP = 1 / 120;

/**
 * Once the vehicle has arrived or fallen in, the run goes on this long (so
 * the player sees what happened) and then ends by itself, back to editing.
 */
const AUTO_STOP_SECONDS = 1.5;

/**
 * What the finger(s) on the screen are doing:
 * - build: one finger that started on a joint; dragging it plans a beam.
 * - pan: one finger that started elsewhere; dragging it moves the view.
 * - pinch: two fingers zoom and move the view.
 * - ignore: a pinch ended with a finger still down; wait until all are up.
 */
type Gesture =
  | {
      kind: 'build';
      pointerId: number;
      startCss: Vec2;
      start: Vec2;
      fromJointId: number;
      dragging: boolean;
      /** How far to lift the beam end above the pointer, in world units. */
      lift: number;
    }
  | {
      kind: 'pan';
      pointerId: number;
      startCss: Vec2;
      start: Vec2;
      moved: boolean;
    }
  | {
      kind: 'pinch';
      startDistance: number;
      startZoom: number;
      /** The world point that stays under the middle of the two fingers. */
      anchor: Vec2;
    }
  | { kind: 'ignore' };

interface Tap {
  time: number;
  css: Vec2;
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

  private screen: ScreenSize = { width: 0, height: 0 };
  private view: CameraView;
  private camera: Camera;
  private history: History;
  private material: MaterialId = 'track';
  private mode: EngineMode = 'edit';
  /** Time not yet simulated, carried over to the next frame. */
  private unsimulatedSeconds = 0;
  /** Simulated time since the run was decided, or null while it is still undecided. */
  private secondsSinceOutcome: number | null = null;
  private state: FrameState;
  /** Fingers / mouse buttons currently down, in CSS pixels relative to the canvas. */
  private readonly pointers = new Map<number, Vec2>();
  private gesture: Gesture | null = null;
  private lastTap: Tap | null = null;
  private frameId: number | null = null;
  private lastFrameTime: number | null = null;
  private readonly audio = new GameAudio();
  /** Removes `window.__game`. Only set in dev builds. */
  private removeDebugHook: (() => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    readonly level: Level,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not supported');
    this.ctx = ctx;

    this.view = fitView(level);
    this.camera = computeCamera({ width: 1, height: 1 }, level, this.view);
    this.history = createHistory(createBridge(level.anchors));
    this.state = {
      time: 0,
      bridge: this.history.present,
      activeJoint: null,
      pointer: null,
      plan: null,
      run: null,
      droplets: [],
      shake: 0,
    };
    this.resizeObserver = new ResizeObserver(() => this.handleResize());

    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerUp);
    canvas.addEventListener('wheel', this.handleWheel, { passive: true });
  }

  start(): void {
    this.resizeObserver.observe(this.canvas);
    this.handleResize();
    this.frameId = requestAnimationFrame(this.tick);
    // Tell the UI the starting state (e.g. after a level change).
    this.emitHistoryChanged();
    this.emitZoomChanged();

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
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    this.listeners.clear();
    this.audio.close();
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

  /** A copy of the current zoom and view centre. */
  getView(): CameraView {
    return structuredClone(this.view);
  }

  // -------------------------------------------------------------------------
  // Commands from the UI
  // -------------------------------------------------------------------------

  /** Material used for the next beams. */
  setMaterial(material: MaterialId): void {
    this.material = material;
  }

  setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  /** The most recent sounds played, newest last. For the debug hook. */
  getSoundHistory(): SoundId[] {
    return [...this.audio.history];
  }

  undo(): void {
    if (this.mode === 'edit') this.setHistory(undo(this.history));
  }

  redo(): void {
    if (this.mode === 'edit') this.setHistory(redo(this.history));
  }

  /**
   * Starts a run: the bridge becomes a physics simulation and the vehicle rolls
   * in from the left. The bridge can't be edited meanwhile.
   */
  play(): void {
    if (this.mode === 'run') return;
    this.state.run = createRun(this.level, this.history.present);
    this.unsimulatedSeconds = 0;
    this.secondsSinceOutcome = null;
    this.cancelBuildGesture();
    this.setMode('run');
    // Play is pressed by the user, so this is a gesture that may start audio (iOS).
    this.audio.unlock();
    this.audio.play('bell');
  }

  /** Ends the run and goes back to editing the (unchanged) bridge. */
  stop(): void {
    if (this.mode === 'edit') return;
    this.state.run = null;
    this.setMode('edit');
  }

  /**
   * Runs the simulation `seconds` ahead right away, in normal steps. For tests
   * and the debug hook; the game loop uses `update`.
   */
  stepSeconds(seconds: number): void {
    const steps = Math.round(seconds / SIMULATION_STEP);
    for (let i = 0; i < steps; i++) this.simulateStep();
  }

  zoomIn(): void {
    this.zoomAroundScreenCentre(this.view.zoom * ZOOM_STEP);
  }

  zoomOut(): void {
    this.zoomAroundScreenCentre(this.view.zoom / ZOOM_STEP);
  }

  /**
   * Builds a beam if the placement rules allow it, by default with the
   * selected material. Returns whether the beam was built.
   */
  tryAddBeam(fromJointId: number, target: BeamTarget, material = this.material): boolean {
    if (this.mode !== 'edit' || !this.level.allowedMaterials.includes(material)) return false;
    const bridge = this.history.present;
    const placement = canPlaceBeam(bridge, this.level.terrain, fromJointId, target, material);
    if (!placement.ok) return false;
    this.setHistory(commit(this.history, addBeam(bridge, fromJointId, target, material)));
    return true;
  }

  /** Removes a beam. Returns false if there was no such beam. */
  removeBeam(beamId: number): boolean {
    if (this.mode !== 'edit') return false;
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

  private setMode(mode: EngineMode): void {
    this.mode = mode;
    this.emit({ type: 'modeChanged', mode });
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

  /**
   * Advances animations by `dt`, and the run in whole simulation steps. Any
   * time left over is carried to the next frame (a fixed-step accumulator).
   */
  private update(dt: number): void {
    this.state.time += dt;
    this.updateEffects(dt);
    if (this.mode !== 'run') return;

    this.unsimulatedSeconds += dt;
    while (this.unsimulatedSeconds >= SIMULATION_STEP) {
      this.simulateStep();
      this.unsimulatedSeconds -= SIMULATION_STEP;
    }
  }

  /**
   * One simulation step. Reports the outcome the moment the run is decided,
   * and ends the run AUTO_STOP_SECONDS later.
   */
  private simulateStep(): void {
    const run = this.state.run;
    if (this.mode !== 'run' || !run) return;

    const before = summarizeRun(run);
    stepRun(run, this.level, VEHICLES[this.level.vehicle], SIMULATION_STEP);
    for (const cue of soundCues(before, summarizeRun(run), this.level)) this.handleCue(cue);

    const next = run.vehicle;
    if (next.outcome && this.secondsSinceOutcome === null) {
      this.secondsSinceOutcome = 0;
      this.emit({ type: 'runFinished', outcome: next.outcome });
    } else if (this.secondsSinceOutcome !== null) {
      this.secondsSinceOutcome += SIMULATION_STEP;
      if (this.secondsSinceOutcome >= AUTO_STOP_SECONDS) this.stop();
    }
  }

  /** Plays a cue's sound, and starts the visual effect that goes with it. */
  private handleCue(cue: SoundId): void {
    this.audio.play(cue);
    if (cue === 'crack') this.state.shake = SHAKE_SECONDS;
    if (cue === 'splash' && this.state.run && this.level.waterY !== null) {
      const at = { x: this.state.run.vehicle.position.x, y: this.level.waterY };
      this.state.droplets = [...this.state.droplets, ...spawnSplash(at, Math.round(at.x))];
    }
  }

  /** Effects run in screen time, so they finish even after the run has stopped. */
  private updateEffects(dt: number): void {
    this.state.shake = Math.max(0, this.state.shake - dt);
    if (this.state.droplets.length > 0 && this.level.waterY !== null) {
      this.state.droplets = stepDroplets(this.state.droplets, dt, this.level.waterY);
    }
  }

  // -------------------------------------------------------------------------
  // Camera: resize and zoom
  // -------------------------------------------------------------------------

  private handleResize(): void {
    const { clientWidth, clientHeight } = this.canvas;
    if (clientWidth === 0 || clientHeight === 0) return; // hidden / not laid out yet

    this.screen = { width: clientWidth, height: clientHeight };
    // Re-clamp the view: what fits depends on the screen's shape.
    const { center, zoom } = this.view;
    this.setView(viewWithAnchor(center, this.screenCentre(), zoom, this.screen, this.level));
  }

  /** Changes zoom/pan and rebuilds the camera. */
  private setView(view: CameraView): void {
    const zoomLimitsChanged =
      this.atZoomLimit(view.zoom, MIN_ZOOM) !== this.atZoomLimit(this.view.zoom, MIN_ZOOM) ||
      this.atZoomLimit(view.zoom, MAX_ZOOM) !== this.atZoomLimit(this.view.zoom, MAX_ZOOM);
    this.view = view;
    this.updateCamera();
    if (zoomLimitsChanged) this.emitZoomChanged();
  }

  private updateCamera(): void {
    if (this.screen.width === 0) return;
    this.camera = computeCamera(this.screen, this.level, this.view);
    // Resizing the backing store clears it, so only do it when the size
    // really changes. The next tick redraws.
    if (this.canvas.width !== this.camera.canvasWidth) this.canvas.width = this.camera.canvasWidth;
    if (this.canvas.height !== this.camera.canvasHeight) {
      this.canvas.height = this.camera.canvasHeight;
    }
  }

  private zoomAroundScreenCentre(zoom: number): void {
    const centre = this.screenCentre();
    const anchor = this.cssToWorldPoint(centre);
    this.setView(viewWithAnchor(anchor, centre, zoom, this.screen, this.level));
  }

  private atZoomLimit(zoom: number, limit: number): boolean {
    return Math.abs(zoom - limit) < 1e-6;
  }

  private emitZoomChanged(): void {
    this.emit({
      type: 'zoomChanged',
      canZoomIn: !this.atZoomLimit(this.view.zoom, MAX_ZOOM),
      canZoomOut: !this.atZoomLimit(this.view.zoom, MIN_ZOOM),
    });
  }

  /** Mouse wheel / trackpad: zoom around the point under the cursor. */
  private handleWheel = (event: WheelEvent): void => {
    const css = this.toCss(event);
    const anchor = this.cssToWorldPoint(css);
    const zoom = this.view.zoom * Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED);
    this.setView(viewWithAnchor(anchor, css, zoom, this.screen, this.level));
  };

  // -------------------------------------------------------------------------
  // Input: drag from a joint to build, drag elsewhere to pan, pinch to zoom,
  // double-tap a beam to remove it
  // -------------------------------------------------------------------------

  private handlePointerDown = (event: PointerEvent): void => {
    // Any touch is a user gesture, so audio may start now (needed on iOS).
    this.audio.unlock();
    // Keep receiving move/up events even if the finger slides off the canvas.
    this.canvas.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, this.toCss(event));

    if (this.pointers.size === 1) this.startSingleFingerGesture(event);
    else if (this.pointers.size === 2) this.startPinch();
    // A third finger is ignored.
  };

  private startSingleFingerGesture(event: PointerEvent): void {
    const startCss = this.toCss(event);
    const start = this.cssToWorldPoint(startCss);
    const grabRadius = this.cssToWorldRadius(JOINT_GRAB_CSS_PX, JOINT_GRAB_MAX_RADIUS);
    // During a run nothing can be built, so every one-finger drag pans.
    const fromJoint =
      this.mode === 'edit' ? findJointNear(this.history.present, start, grabRadius) : null;

    this.gesture = fromJoint
      ? {
          kind: 'build',
          pointerId: event.pointerId,
          startCss,
          start,
          fromJointId: fromJoint.id,
          dragging: false,
          lift: event.pointerType === 'touch' ? this.cssToWorldRadius(TOUCH_LIFT_CSS_PX) : 0,
        }
      : { kind: 'pan', pointerId: event.pointerId, startCss, start, moved: false };
    this.state.activeJoint = fromJoint?.id ?? null;
    this.state.pointer = start;
  }

  /** A second finger turns whatever the first was doing into a pinch. */
  private startPinch(): void {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return;
    this.clearGestureVisuals();
    this.lastTap = null;
    this.gesture = {
      kind: 'pinch',
      startDistance: Math.max(1, distance(a, b)),
      startZoom: this.view.zoom,
      anchor: this.cssToWorldPoint(midpoint(a, b)),
    };
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) return; // hovering mouse
    const css = this.toCss(event);
    this.pointers.set(event.pointerId, css);

    const gesture = this.gesture;
    if (!gesture) return;
    switch (gesture.kind) {
      case 'build':
        if (event.pointerId === gesture.pointerId) this.moveBuild(gesture, css);
        break;
      case 'pan':
        if (event.pointerId === gesture.pointerId) this.movePan(gesture, css);
        break;
      case 'pinch':
        this.movePinch(gesture);
        break;
      case 'ignore':
        break;
    }
  };

  private moveBuild(gesture: Extract<Gesture, { kind: 'build' }>, css: Vec2): void {
    if (!gesture.dragging && distance(css, gesture.startCss) >= DRAG_START_CSS_PX) {
      gesture.dragging = true;
    }
    if (!gesture.dragging) return;

    const position = this.cssToWorldPoint(css);
    const beamEnd = { x: position.x, y: position.y - gesture.lift };
    // A smaller snap radius when zoomed in lets the player reach grid points
    // right next to a joint, but never less than half a grid step.
    const snapRadius = Math.max(
      GRID_SIZE / 2,
      this.cssToWorldRadius(JOINT_SNAP_CSS_PX, JOINT_SNAP_RADIUS),
    );
    const plan = planBeam(
      this.history.present,
      this.level.terrain,
      gesture.fromJointId,
      beamEnd,
      this.material,
      snapRadius,
    );
    this.state.pointer = beamEnd;
    this.state.plan = plan;
    this.state.activeJoint = plan.target.kind === 'joint' ? plan.target.jointId : null;
  }

  /** Keeps the world point the finger first touched under the finger. */
  private movePan(gesture: Extract<Gesture, { kind: 'pan' }>, css: Vec2): void {
    if (!gesture.moved && distance(css, gesture.startCss) >= DRAG_START_CSS_PX) {
      gesture.moved = true;
      this.state.pointer = null;
    }
    if (!gesture.moved) return;
    this.setView(viewWithAnchor(gesture.start, css, this.view.zoom, this.screen, this.level));
  }

  /** Zooms by how far the fingers spread, around the point between them. */
  private movePinch(gesture: Extract<Gesture, { kind: 'pinch' }>): void {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return;
    const zoom = (gesture.startZoom * distance(a, b)) / gesture.startDistance;
    this.setView(viewWithAnchor(gesture.anchor, midpoint(a, b), zoom, this.screen, this.level));
  }

  private handlePointerUp = (event: PointerEvent): void => {
    if (!this.pointers.delete(event.pointerId)) return;
    const gesture = this.gesture;
    const cancelled = event.type === 'pointercancel';

    if (gesture?.kind === 'build' && event.pointerId === gesture.pointerId) {
      const { plan } = this.state;
      if (gesture.dragging && plan?.placement.ok && !cancelled) {
        this.tryAddBeam(plan.fromJointId, plan.target);
      } else if (!gesture.dragging && !cancelled) {
        this.handleTap({ time: event.timeStamp, css: gesture.startCss, position: gesture.start });
      }
    } else if (gesture?.kind === 'pan' && event.pointerId === gesture.pointerId) {
      if (!gesture.moved && !cancelled) {
        this.handleTap({ time: event.timeStamp, css: gesture.startCss, position: gesture.start });
      }
    }

    this.clearGestureVisuals();
    // After a pinch, the remaining finger does nothing until it is lifted too.
    this.gesture = this.pointers.size > 0 ? { kind: 'ignore' } : null;
  };

  private clearGestureVisuals(): void {
    this.state.plan = null;
    this.state.pointer = null;
    this.state.activeJoint = null;
  }

  /** Drops a beam being dragged (e.g. when Play is pressed mid-drag). */
  private cancelBuildGesture(): void {
    if (this.gesture?.kind !== 'build') return;
    this.clearGestureVisuals();
    this.gesture = { kind: 'ignore' };
  }

  /** A single tap does nothing on its own; a quick second tap on a beam removes it. */
  private handleTap(tap: Tap): void {
    if (this.mode !== 'edit') return;
    const previous = this.lastTap;
    const isDoubleTap =
      previous !== null &&
      tap.time - previous.time <= DOUBLE_TAP_MS &&
      distance(tap.css, previous.css) <= DOUBLE_TAP_CSS_PX;

    if (!isDoubleTap) {
      this.lastTap = tap;
      return;
    }
    this.lastTap = null; // a third tap starts a new pair
    const hitRadius = this.cssToWorldRadius(BEAM_HIT_CSS_PX, BEAM_HIT_MAX_RADIUS);
    const beam = findBeamNear(this.history.present, tap.position, hitRadius);
    if (beam) this.removeBeam(beam.id);
  }

  // -------------------------------------------------------------------------
  // Coordinate helpers
  // -------------------------------------------------------------------------

  /** Pointer position in CSS pixels relative to the canvas' top-left corner. */
  private toCss(event: MouseEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private cssToWorldPoint(css: Vec2): Vec2 {
    return cssToWorld(this.camera, css.x, css.y, this.screen.width, this.screen.height);
  }

  /** Converts a CSS pixel length to world units at the current zoom, capped at `maxWorld`. */
  private cssToWorldRadius(cssPixels: number, maxWorld = Infinity): number {
    if (this.screen.width === 0) return maxWorld;
    const worldUnits = cssPixels / cssPixelsPerUnit(this.screen, this.level, this.view);
    return Math.min(maxWorld, worldUnits);
  }

  private screenCentre(): Vec2 {
    return { x: this.screen.width / 2, y: this.screen.height / 2 };
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
