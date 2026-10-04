/**
 * Building materials. All balancing values live in this one table.
 * Physics values (stiffness, mass, break strain) are added in phase 2.
 */
export type MaterialId = 'track' | 'wood' | 'steel' | 'cable';

export interface Material {
  id: MaterialId;
  /** Shown on the toolbar button. */
  label: string;
  /** Longest beam that can be built from this material, in world units. */
  maxLength: number;
}

export const MATERIALS: Readonly<Record<MaterialId, Material>> = {
  track: { id: 'track', label: 'Track', maxLength: 20 },
  wood: { id: 'wood', label: 'Wood', maxLength: 24 },
  steel: { id: 'steel', label: 'Steel', maxLength: 32 },
  cable: { id: 'cable', label: 'Cable', maxLength: 64 },
};

/** Toolbar order. */
export const MATERIAL_IDS: readonly MaterialId[] = ['track', 'wood', 'steel', 'cable'];

/** Shorter beams are rejected: they would be hard to see and to tap. */
export const MIN_BEAM_LENGTH = 5;
