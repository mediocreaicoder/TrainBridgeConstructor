import type { Level } from './level';
import { MATERIALS } from './materials';
import type { Run } from './run';
import { carSpecAt, type TrainSpec } from './train';

/**
 * Sound cues: what happened during one simulation step that should be heard.
 * Pure, so it can be tested; `audio.ts` turns the cues into sound.
 */
export type SoundId =
  /** A bell when a run starts. */
  | 'bell'
  /** Wheels clacking over the rail, regularly while rolling. */
  | 'clack'
  /** A beam close to breaking. */
  | 'creak'
  /** A beam breaking. */
  | 'crack'
  /** People on a car that leaves the track. */
  | 'scream'
  /** A car hitting the water. */
  | 'splash'
  /** The whole train safely across. */
  | 'arrive';

/** The parts of a run that cues are worked out from. */
export interface RunSummary {
  brokenBeams: number;
  /** Cars with people on board that have left the track (falling or in the water). */
  fallenWithPeople: number;
  /** Cars that have reached the water (or the bottom of the screen). */
  sunk: number;
  arrived: boolean;
  /** Whether the front car is still on the track; it sets the clacking rhythm. */
  frontRolling: boolean;
  /** Distance rolled by the front car. */
  distance: number;
  /** Highest strain of any intact beam, as a fraction of its break limit. */
  maxLoad: number;
}

/** The train clacks once per this many world units rolled. */
const CLACK_DISTANCE = 10;

/** Beams creak above this fraction of their break limit. */
const CREAK_LOAD = 0.75;

export function summarizeRun(run: Run, spec: TrainSpec): RunSummary {
  let brokenBeams = 0;
  let maxLoad = 0;
  for (const constraint of run.sim.constraints) {
    if (constraint.broken) brokenBeams++;
    if (constraint.broken || constraint.fragment) continue;
    const load = Math.abs(constraint.strain) / MATERIALS[constraint.material].breakStrain;
    maxLoad = Math.max(maxLoad, load);
  }
  const { cars } = run.train;
  const front = cars[0];
  return {
    brokenBeams,
    fallenWithPeople: cars.filter(
      (car, i) => car.status !== 'rolling' && carSpecAt(spec, i).hasPeople,
    ).length,
    sunk: cars.filter((car) => car.status === 'sunk').length,
    arrived: run.train.outcome === 'arrived',
    frontRolling: front?.status === 'rolling',
    distance: front?.distance ?? 0,
    maxLoad,
  };
}

/** The sounds caused by going from `before` to `after` (one simulation step). */
export function soundCues(before: RunSummary, after: RunSummary, level: Level): SoundId[] {
  const cues: SoundId[] = [];
  if (after.brokenBeams > before.brokenBeams) cues.push('crack');
  if (after.maxLoad >= CREAK_LOAD) cues.push('creak');

  if (after.fallenWithPeople > before.fallenWithPeople) cues.push('scream');
  // A car that sinks without water has fallen off the screen: no splash.
  if (after.sunk > before.sunk && level.waterY !== null) cues.push('splash');
  if (!before.arrived && after.arrived) cues.push('arrive');

  const passedClack =
    Math.floor(after.distance / CLACK_DISTANCE) > Math.floor(before.distance / CLACK_DISTANCE);
  if (after.frontRolling && passedClack) cues.push('clack');
  return cues;
}
