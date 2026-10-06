import { describe, expect, it } from 'vitest';
import { soundCues, type RunSummary } from './cues';
import type { Level } from './level';
import { TEST_LEVEL } from './testing/testLevel';

const level = TEST_LEVEL;
const dryLevel: Level = { ...level, waterY: null };

const rolling: RunSummary = {
  brokenBeams: 0,
  status: 'rolling',
  arrived: false,
  distance: 3,
  maxLoad: 0.2,
};

describe('soundCues', () => {
  it('stays quiet when nothing happens', () => {
    expect(soundCues(rolling, { ...rolling, distance: 4 }, level)).toEqual([]);
  });

  it('clacks every 10 units rolled', () => {
    expect(soundCues({ ...rolling, distance: 9.9 }, { ...rolling, distance: 10.1 }, level)).toEqual(
      ['clack'],
    );
  });

  it('cracks when a beam breaks, and creaks when one is close to breaking', () => {
    expect(soundCues(rolling, { ...rolling, brokenBeams: 1 }, level)).toContain('crack');
    expect(soundCues(rolling, { ...rolling, maxLoad: 0.8 }, level)).toContain('creak');
  });

  it('screams when the handcar leaves the track, and splashes when it hits the water', () => {
    const falling: RunSummary = { ...rolling, status: 'falling' };
    expect(soundCues(rolling, falling, level)).toEqual(['scream']);
    expect(soundCues(falling, { ...falling, status: 'sunk' }, level)).toEqual(['splash']);
  });

  it('does not splash on a level without water', () => {
    const falling: RunSummary = { ...rolling, status: 'falling' };
    expect(soundCues(falling, { ...falling, status: 'sunk' }, dryLevel)).toEqual([]);
  });

  it('plays the arrival jingle once', () => {
    const arrived: RunSummary = { ...rolling, arrived: true };
    expect(soundCues(rolling, arrived, level)).toEqual(['arrive']);
    expect(soundCues(arrived, arrived, level)).toEqual([]);
  });
});
