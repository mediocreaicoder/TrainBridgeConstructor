import type { Bridge } from './bridge';
import type { Level } from './level';
import { createSimulation, stepSimulation, type Simulation } from './physics';
import {
  buildTrack,
  createVehicle,
  stepVehicle,
  wheelLoads,
  type Vehicle,
  type VehicleSpec,
} from './train';

/**
 * One attempt at crossing: the simulated bridge plus the vehicle on it.
 * Shared by the engine and the tests, so both play out a run the same way.
 */
export interface Run {
  sim: Simulation;
  vehicle: Vehicle;
}

export function createRun(level: Level, bridge: Bridge): Run {
  return { sim: createSimulation(bridge), vehicle: createVehicle(level) };
}

/**
 * Advances a run by `dt`: the vehicle's weight loads the bridge, the bridge
 * moves, and then the vehicle follows the track where it now is.
 * The simulation is changed in place; the vehicle is replaced.
 */
export function stepRun(run: Run, level: Level, spec: VehicleSpec, dt: number): void {
  const loads = wheelLoads(run.vehicle, spec, buildTrack(level, run.sim));
  stepSimulation(run.sim, loads, dt);
  run.vehicle = stepVehicle(run.vehicle, spec, buildTrack(level, run.sim), level, dt);
}
