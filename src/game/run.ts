import type { Bridge } from './bridge';
import type { Level } from './level';
import { createSimulation, stepSimulation, type Simulation } from './physics';
import {
  buildTrack,
  createTrain,
  stepTrain,
  wheelLoads,
  type Train,
  type TrainSpec,
} from './train';

/**
 * One attempt at crossing: the simulated bridge plus the train on it.
 * Shared by the engine and the tests, so both play out a run the same way.
 */
export interface Run {
  sim: Simulation;
  train: Train;
}

export function createRun(level: Level, bridge: Bridge, spec: TrainSpec): Run {
  return { sim: createSimulation(bridge), train: createTrain(level, spec) };
}

/**
 * Advances a run by `dt`: the train's weight loads the bridge, the bridge
 * moves, and then the train follows the track where it now is.
 * The simulation is changed in place; the train is replaced.
 */
export function stepRun(run: Run, level: Level, spec: TrainSpec, dt: number): void {
  const loads = wheelLoads(run.train, spec, buildTrack(level, run.sim));
  stepSimulation(run.sim, loads, dt);
  run.train = stepTrain(run.train, spec, buildTrack(level, run.sim), level, dt);
}
