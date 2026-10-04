import type { Engine } from './Engine';
import type { Level } from './level';
import type { MaterialId } from './materials';
import type { FrameState } from './render';
import type { Vec2 } from './types';

/**
 * Dev-only handle on the running game, exposed as `window.__game`.
 * Lets the dev console and scripted browser tests inspect and drive the engine.
 * More commands are added here as the features they drive are built.
 */
export interface GameDebugApi {
  engine: Engine;
  level: Level;
  /** A copy of the current frame state. Changing it does not affect the game. */
  getState(): FrameState;
  /**
   * Builds a beam from a joint to another joint (by id) or to a point, with
   * the given material (default: the current one). Same rules as dragging,
   * but without grid snapping. Returns whether the beam was built.
   */
  addBeam(fromJointId: number, to: number | Vec2, material?: MaterialId): boolean;
  removeBeam(beamId: number): boolean;
  undo(): void;
  redo(): void;
  /** Starts a run (the vehicle rolls in), or ends it and goes back to editing. */
  play(): void;
  stop(): void;
  /** Simulates the run `seconds` ahead immediately, without waiting for frames. */
  stepSeconds(seconds: number): void;
}

declare global {
  interface Window {
    __game?: GameDebugApi;
  }
}

/**
 * Publishes `window.__game` for this engine and returns a function that
 * removes it again. Only call this behind `import.meta.env.DEV`, so the
 * hook is stripped from production builds.
 */
export function installDebugHook(engine: Engine): () => void {
  const api: GameDebugApi = {
    engine,
    level: engine.level,
    getState: () => engine.getState(),
    addBeam: (fromJointId, to, material) => {
      const target =
        typeof to === 'number'
          ? ({ kind: 'joint', jointId: to } as const)
          : ({ kind: 'point', position: to } as const);
      return engine.tryAddBeam(fromJointId, target, material);
    },
    removeBeam: (beamId) => engine.removeBeam(beamId),
    undo: () => engine.undo(),
    redo: () => engine.redo(),
    play: () => engine.play(),
    stop: () => engine.stop(),
    stepSeconds: (seconds) => engine.stepSeconds(seconds),
  };
  window.__game = api;

  return () => {
    // StrictMode mounts twice in dev: only remove the hook if a newer engine
    // hasn't already replaced it.
    if (window.__game === api) delete window.__game;
  };
}
