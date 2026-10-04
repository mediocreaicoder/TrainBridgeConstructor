import type { Engine } from './Engine';
import type { Level } from './level';
import type { FrameState } from './render';

/**
 * Dev-only handle on the running game, exposed as `window.__game`.
 * Lets the dev console and scripted browser tests inspect engine state.
 * Commands such as `addBeam`, `play` and `stepSeconds(n)` will be added here
 * as the features they drive are built.
 */
export interface GameDebugApi {
  engine: Engine;
  level: Level;
  /** A copy of the current frame state. Changing it does not affect the game. */
  getState(): FrameState;
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
  };
  window.__game = api;

  return () => {
    // StrictMode mounts twice in dev: only remove the hook if a newer engine
    // hasn't already replaced it.
    if (window.__game === api) delete window.__game;
  };
}
