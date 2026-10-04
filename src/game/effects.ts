import type { Vec2 } from './types';

/**
 * Short-lived visual effects: water droplets from a splash, and screen shake.
 * Pure functions; the engine keeps the state and the renderer draws it.
 */

export interface Droplet {
  position: Vec2;
  velocity: Vec2;
  /** Seconds left before it disappears. */
  life: number;
}

const DROPLET_COUNT = 16;
const DROPLET_GRAVITY = 220;
const DROPLET_LIFE = 1.2;

/** How long the screen shakes after a beam breaks, and how far (world units). */
export const SHAKE_SECONDS = 0.3;
const SHAKE_AMPLITUDE = 2;

/**
 * A fan of droplets thrown up from where something hit the water. The spread
 * comes from a small seeded generator, so a run always looks the same.
 */
export function spawnSplash(at: Vec2, seed = 1): Droplet[] {
  const random = seededRandom(seed);
  return Array.from({ length: DROPLET_COUNT }, () => {
    const angle = -Math.PI / 2 + (random() - 0.5) * 1.6; // mostly upwards
    const speed = 40 + random() * 50;
    return {
      position: { ...at },
      velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      life: DROPLET_LIFE * (0.6 + random() * 0.4),
    };
  });
}

/** Moves droplets; drops the ones that expired or fell back into the water. */
export function stepDroplets(droplets: readonly Droplet[], dt: number, waterY: number): Droplet[] {
  return droplets
    .map((d) => ({
      position: { x: d.position.x + d.velocity.x * dt, y: d.position.y + d.velocity.y * dt },
      velocity: { x: d.velocity.x, y: d.velocity.y + DROPLET_GRAVITY * dt },
      life: d.life - dt,
    }))
    .filter((d) => d.life > 0 && !(d.velocity.y > 0 && d.position.y > waterY));
}

/**
 * Screen offset for a shake with `remaining` seconds left: a fast wobble that
 * fades out. Whole world units, so the pixels stay crisp.
 */
export function shakeOffset(remaining: number, time: number): Vec2 {
  if (remaining <= 0) return { x: 0, y: 0 };
  const amplitude = SHAKE_AMPLITUDE * (remaining / SHAKE_SECONDS);
  return {
    x: Math.round(Math.sin(time * 90) * amplitude),
    y: Math.round(Math.cos(time * 70) * amplitude),
  };
}

/** A tiny deterministic random number generator (LCG) returning values in [0, 1). */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}
