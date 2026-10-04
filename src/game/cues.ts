import type { Level } from './level';
import { MATERIALS } from './materials';
import type { Run } from './run';
import type { VehicleStatus } from './train';

/**
 * Sound cues: what happened during one simulation step that should be heard.
 * Pure, so it can be tested; `audio.ts` turns the cues into sound.
 */
export type SoundId =
  /** Handcar bell when a run starts. */
  | 'bell'
  /** Wheels clacking over the rail, regularly while rolling. */
  | 'clack'
  /** A beam close to breaking. */
  | 'creak'
  /** A beam breaking. */
  | 'crack'
  /** The handcar's driver as it leaves the track. */
  | 'scream'
  /** The handcar hitting the water. */
  | 'splash'
  /** The handcar reaching the goal. */
  | 'arrive';

/** The parts of a run that cues are worked out from. */
export interface RunSummary {
  brokenBeams: number;
  status: VehicleStatus;
  arrived: boolean;
  /** Distance rolled by the vehicle. */
  distance: number;
  /** Highest strain of any intact beam, as a fraction of its break limit. */
  maxLoad: number;
}

/** The vehicle clacks once per this many world units rolled. */
const CLACK_DISTANCE = 10;

/** Beams creak above this fraction of their break limit. */
const CREAK_LOAD = 0.75;

export function summarizeRun(run: Run): RunSummary {
  let brokenBeams = 0;
  let maxLoad = 0;
  for (const constraint of run.sim.constraints) {
    if (constraint.broken) brokenBeams++;
    if (constraint.broken || constraint.fragment) continue;
    const load = Math.abs(constraint.strain) / MATERIALS[constraint.material].breakStrain;
    maxLoad = Math.max(maxLoad, load);
  }
  return {
    brokenBeams,
    status: run.vehicle.status,
    arrived: run.vehicle.outcome === 'arrived',
    distance: run.vehicle.distance,
    maxLoad,
  };
}

/** The sounds caused by going from `before` to `after` (one simulation step). */
export function soundCues(before: RunSummary, after: RunSummary, level: Level): SoundId[] {
  const cues: SoundId[] = [];
  if (after.brokenBeams > before.brokenBeams) cues.push('crack');
  if (after.maxLoad >= CREAK_LOAD) cues.push('creak');

  if (before.status === 'rolling' && after.status === 'falling') cues.push('scream');
  // A vehicle that sinks without water has fallen off the screen: no splash.
  if (before.status !== 'sunk' && after.status === 'sunk' && level.waterY !== null) {
    cues.push('splash');
  }
  if (!before.arrived && after.arrived) cues.push('arrive');

  const passedClack =
    Math.floor(after.distance / CLACK_DISTANCE) > Math.floor(before.distance / CLACK_DISTANCE);
  if (after.status === 'rolling' && passedClack) cues.push('clack');
  return cues;
}
