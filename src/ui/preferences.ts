import type { LevelStars } from '../game/progress';
import { TRAIN_ORDER, type VehicleId } from '../game/train';

/**
 * Small player preferences and progress saved in the browser. Storage can be
 * missing or blocked (private browsing, full storage), so every access is
 * wrapped in try/catch and falls back to the default.
 */

const MUTED_KEY = 'train-bridge-constructor.muted';
const STARS_KEY = 'train-bridge-constructor.level-stars';
const TRAIN_KEY = 'train-bridge-constructor.train';
/** Older versions only saved which levels were completed; each counts as 1 star. */
const COMPLETED_KEY = 'train-bridge-constructor.completed-levels';

export function loadMuted(): boolean {
  return read(MUTED_KEY) === 'true';
}

export function saveMuted(muted: boolean): void {
  write(MUTED_KEY, String(muted));
}

/** Best stars per level id. */
export function loadLevelStars(): Map<number, number> {
  const stars = new Map<number, number>();
  for (const id of parseNumbers(read(COMPLETED_KEY))) stars.set(id, 1);
  const saved: unknown = parseJson(read(STARS_KEY));
  if (saved && typeof saved === 'object') {
    for (const [id, count] of Object.entries(saved)) {
      if (typeof count === 'number') stars.set(Number(id), count);
    }
  }
  return stars;
}

export function saveLevelStars(stars: LevelStars): void {
  write(STARS_KEY, JSON.stringify(Object.fromEntries(stars)));
}

/** The train chosen last time, so the player doesn't have to pick it again. */
export function loadTrain(): VehicleId {
  const saved = read(TRAIN_KEY);
  return TRAIN_ORDER.find((id) => id === saved) ?? 'handcar';
}

export function saveTrain(train: VehicleId): void {
  write(TRAIN_KEY, train);
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not saved; the value still applies until the page is reloaded.
  }
}

function parseJson(text: string | null): unknown {
  try {
    return text === null ? null : JSON.parse(text);
  } catch {
    return null;
  }
}

function parseNumbers(text: string | null): number[] {
  const value = parseJson(text);
  return Array.isArray(value) ? value.filter((item) => typeof item === 'number') : [];
}
