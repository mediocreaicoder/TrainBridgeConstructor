import { getJoint, type Bridge } from './bridge';
import { MATERIALS, type MaterialId } from './materials';
import { distance, type Vec2 } from './types';

/**
 * Bridge physics: point masses (the joints) held together by distance
 * constraints (the beams).
 *
 * The solver is XPBD (extended position-based dynamics) with "small steps":
 * each simulation step is split into a number of substeps, and each substep
 *
 *   1. moves every particle by its velocity, after adding gravity and loads,
 *   2. pulls the two ends of every beam towards the beam's rest length once,
 *   3. derives the new velocities from how far the particles actually moved.
 *
 * Unlike plain Verlet with a 0..1 "stiffness" per iteration, XPBD gives every
 * material a real stiffness: a beam under force F stretches by F / stiffness,
 * whatever the step size. That makes strain meaningful and breaking tunable.
 *
 * For speed, a Simulation is changed in place by `stepSimulation`.
 */

/** Gravity in world units per second². Exaggerated, as games do. Shared with vehicles. */
export const GRAVITY = 160;

/** Substeps per simulation step. More substeps make stiff beams converge better. */
const SUBSTEPS = 8;

/** Velocity damping per second, so a bridge settles instead of wobbling forever. */
const DAMPING = 3;

/**
 * Gravity is faded in over this many seconds when a run starts. Switched on
 * all at once, the bridge would drop and overshoot, nearly doubling the strain
 * for a moment, and break beams that easily hold their weight at rest.
 */
const GRAVITY_RAMP_SECONDS = 1;

/**
 * How quickly the displayed and breaking strain follows the real strain, per
 * step (0..1). Smoothing stops a single noisy step from breaking a beam.
 */
const STRAIN_SMOOTHING = 0.2;

export interface Particle {
  position: Vec2;
  /** Position at the start of the current substep; velocity = moved distance / time. */
  previous: Vec2;
  velocity: Vec2;
  /** 1 / mass. Zero for anchors, which never move. */
  inverseMass: number;
  /** The bridge joint this particle stands for, or null for a broken beam's loose end. */
  jointId: number | null;
}

export interface Constraint {
  /** Particle indices of the two ends. */
  a: number;
  b: number;
  restLength: number;
  material: MaterialId;
  /** The bridge beam this constraint stands for. */
  beamId: number;
  /** Smoothed strain: (length − rest length) / rest length. Positive is stretched. */
  strain: number;
  /** Broken beams are replaced by two loose halves and no longer simulated. */
  broken: boolean;
  /** One half of a broken beam. Halves dangle from their joint and can't break again. */
  fragment: boolean;
}

export interface Simulation {
  particles: Particle[];
  constraints: Constraint[];
  /** Simulated seconds since the start. */
  time: number;
}

/** A force pushing on one particle during a step, e.g. a wheel standing on a beam. */
export interface PointLoad {
  particle: number;
  force: Vec2;
}

/**
 * Builds a simulation of the bridge at rest. Each joint gets half the mass of
 * every beam that meets there; anchors are fixed.
 */
export function createSimulation(bridge: Bridge): Simulation {
  const particleIndex = new Map(bridge.joints.map((joint, index) => [joint.id, index]));
  const mass = new Map(bridge.joints.map((joint) => [joint.id, 0]));
  for (const beam of bridge.beams) {
    const half = beamMass(bridge, beam.a, beam.b, beam.material) / 2;
    mass.set(beam.a, (mass.get(beam.a) ?? 0) + half);
    mass.set(beam.b, (mass.get(beam.b) ?? 0) + half);
  }

  const particles = bridge.joints.map((joint) =>
    createParticle(joint.position, joint.fixed ? 0 : inverse(mass.get(joint.id) ?? 0), joint.id),
  );
  const constraints = bridge.beams.map((beam) => ({
    a: indexOf(particleIndex, beam.a),
    b: indexOf(particleIndex, beam.b),
    restLength: distance(getJoint(bridge, beam.a).position, getJoint(bridge, beam.b).position),
    material: beam.material,
    beamId: beam.id,
    strain: 0,
    broken: false,
    fragment: false,
  }));
  return { particles, constraints, time: 0 };
}

/** Advances the simulation by `dt` seconds, with `loads` pushing on it the whole time. */
export function stepSimulation(sim: Simulation, loads: readonly PointLoad[], dt: number): void {
  const h = dt / SUBSTEPS;
  const gravity = GRAVITY * Math.min(1, sim.time / GRAVITY_RAMP_SECONDS);
  for (let i = 0; i < SUBSTEPS; i++) {
    integrate(sim, loads, gravity, h);
    for (const constraint of sim.constraints) {
      if (!constraint.broken) solveConstraint(sim, constraint, h);
    }
    updateVelocities(sim, h);
  }
  updateStrains(sim);
  breakOverloadedBeams(sim);
  sim.time += dt;
}

/** Current (unsmoothed) strain of a constraint. */
export function currentStrain(sim: Simulation, constraint: Constraint): number {
  const a = particleAt(sim, constraint.a).position;
  const b = particleAt(sim, constraint.b).position;
  return (distance(a, b) - constraint.restLength) / constraint.restLength;
}

export function particleAt(sim: Simulation, index: number): Particle {
  const particle = sim.particles[index];
  if (!particle) throw new Error(`No particle ${index}`);
  return particle;
}

// ---------------------------------------------------------------------------
// The substep
// ---------------------------------------------------------------------------

/** Step 1: apply gravity, loads and damping to the velocity, then move. */
function integrate(
  sim: Simulation,
  loads: readonly PointLoad[],
  gravity: number,
  h: number,
): void {
  const damping = Math.exp(-DAMPING * h);
  sim.particles.forEach((particle, index) => {
    particle.previous = { ...particle.position };
    if (particle.inverseMass === 0) return;

    let ax = 0;
    let ay = gravity;
    for (const load of loads) {
      if (load.particle !== index) continue;
      ax += load.force.x * particle.inverseMass;
      ay += load.force.y * particle.inverseMass;
    }
    particle.velocity = {
      x: (particle.velocity.x + ax * h) * damping,
      y: (particle.velocity.y + ay * h) * damping,
    };
    particle.position = {
      x: particle.position.x + particle.velocity.x * h,
      y: particle.position.y + particle.velocity.y * h,
    };
  });
}

/**
 * Step 2: the XPBD distance constraint. With C = length − rest length, the
 * correction is Δλ = −C / (wA + wB + α/h²), where w is inverse mass and
 * α = rest length / stiffness is the beam's compliance (how far it gives per
 * unit of force). The ends move along the beam, in proportion to their w.
 */
function solveConstraint(sim: Simulation, constraint: Constraint, h: number): void {
  const a = particleAt(sim, constraint.a);
  const b = particleAt(sim, constraint.b);
  const totalInverseMass = a.inverseMass + b.inverseMass;
  if (totalInverseMass === 0) return;

  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return;

  const material = MATERIALS[constraint.material];
  const stretch = length - constraint.restLength;
  if (material.tensionOnly && stretch < 0) return; // a slack cable doesn't push

  const compliance = constraint.restLength / material.stiffness;
  const lambda = -stretch / (totalInverseMass + compliance / (h * h));
  const nx = dx / length;
  const ny = dy / length;
  a.position = {
    x: a.position.x - nx * lambda * a.inverseMass,
    y: a.position.y - ny * lambda * a.inverseMass,
  };
  b.position = {
    x: b.position.x + nx * lambda * b.inverseMass,
    y: b.position.y + ny * lambda * b.inverseMass,
  };
}

/** Step 3: velocity is how far each particle really moved this substep. */
function updateVelocities(sim: Simulation, h: number): void {
  for (const particle of sim.particles) {
    if (particle.inverseMass === 0) continue;
    particle.velocity = {
      x: (particle.position.x - particle.previous.x) / h,
      y: (particle.position.y - particle.previous.y) / h,
    };
  }
}

// ---------------------------------------------------------------------------
// Strain and breaking
// ---------------------------------------------------------------------------

function updateStrains(sim: Simulation): void {
  for (const constraint of sim.constraints) {
    if (constraint.broken) continue;
    const raw = currentStrain(sim, constraint);
    // A slack cable carries no load, whatever its length.
    const strain = MATERIALS[constraint.material].tensionOnly ? Math.max(0, raw) : raw;
    constraint.strain += (strain - constraint.strain) * STRAIN_SMOOTHING;
  }
}

function breakOverloadedBeams(sim: Simulation): void {
  // Copy the list: breaking adds the two halves to the end of it.
  for (const constraint of [...sim.constraints]) {
    if (constraint.broken || constraint.fragment) continue;
    if (Math.abs(constraint.strain) > MATERIALS[constraint.material].breakStrain) {
      breakBeam(sim, constraint);
    }
  }
}

/**
 * Replaces a beam with two loose halves. Each half keeps one end on its old
 * joint and gets a new particle in the middle, so the halves dangle and fall.
 */
function breakBeam(sim: Simulation, constraint: Constraint): void {
  constraint.broken = true;
  const a = particleAt(sim, constraint.a);
  const b = particleAt(sim, constraint.b);
  const middle = midpoint(a.position, b.position);
  const velocity = midpoint(a.velocity, b.velocity);
  // Each loose end carries a quarter of the beam's mass.
  const quarterMass =
    (MATERIALS[constraint.material].massPerLength * constraint.restLength) / 4;

  for (const end of [constraint.a, constraint.b]) {
    const loose = createParticle(middle, inverse(quarterMass), null);
    loose.velocity = { ...velocity };
    sim.particles.push(loose);
    sim.constraints.push({
      ...constraint,
      a: end,
      b: sim.particles.length - 1,
      restLength: constraint.restLength / 2,
      strain: 0,
      broken: false,
      fragment: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createParticle(position: Vec2, inverseMass: number, jointId: number | null): Particle {
  return {
    position: { ...position },
    previous: { ...position },
    velocity: { x: 0, y: 0 },
    inverseMass,
    jointId,
  };
}

function beamMass(bridge: Bridge, a: number, b: number, material: MaterialId): number {
  const length = distance(getJoint(bridge, a).position, getJoint(bridge, b).position);
  return length * MATERIALS[material].massPerLength;
}

function inverse(mass: number): number {
  return mass > 0 ? 1 / mass : 0;
}

function indexOf(particleIndex: Map<number, number>, jointId: number): number {
  const index = particleIndex.get(jointId);
  if (index === undefined) throw new Error(`No joint with id ${jointId}`);
  return index;
}

function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
