/**
 * Building materials. All balancing values live in this one table.
 *
 * Units are game units, not real ones: lengths in world units, mass in
 * arbitrary "mass units", forces in mass × world units / s².
 */
export type MaterialId = 'track' | 'wood' | 'steel' | 'cable';

export interface Material {
  id: MaterialId;
  /** Shown on the toolbar button. */
  label: string;
  /** Longest beam that can be built from this material, in world units. */
  maxLength: number;
  /** Mass per world unit of beam length. */
  massPerLength: number;
  /**
   * Axial stiffness: the force that would stretch a beam by 100 %. A beam
   * under force F stretches by F / stiffness of its length (its strain).
   */
  stiffness: number;
  /** The beam breaks when stretched or squeezed by more than this fraction of its length. */
  breakStrain: number;
  /** Cables only pull: they go slack instead of pushing back when squeezed. */
  tensionOnly: boolean;
  /** Price per world unit of beam length, counted against the level's budget. */
  costPerLength: number;
}

export const MATERIALS: Readonly<Record<MaterialId, Material>> = {
  track: {
    id: 'track',
    label: 'Track',
    maxLength: 30,
    massPerLength: 1,
    stiffness: 4e7,
    breakStrain: 0.0035,
    tensionOnly: false,
    costPerLength: 2,
  },
  wood: {
    id: 'wood',
    label: 'Wood',
    maxLength: 36,
    massPerLength: 0.6,
    stiffness: 3e7,
    breakStrain: 0.004,
    tensionOnly: false,
    costPerLength: 1,
  },
  steel: {
    id: 'steel',
    label: 'Steel',
    maxLength: 48,
    massPerLength: 1.5,
    stiffness: 1.2e8,
    breakStrain: 0.008,
    tensionOnly: false,
    costPerLength: 3,
  },
  cable: {
    id: 'cable',
    label: 'Cable',
    maxLength: 96,
    massPerLength: 0.2,
    stiffness: 8e7,
    breakStrain: 0.006,
    tensionOnly: true,
    costPerLength: 2,
  },
};

/** Toolbar order. */
export const MATERIAL_IDS: readonly MaterialId[] = ['track', 'wood', 'steel', 'cable'];

/** Shorter beams are rejected: they would be hard to see and to tap. */
export const MIN_BEAM_LENGTH = 5;
