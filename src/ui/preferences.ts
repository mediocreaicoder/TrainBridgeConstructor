/**
 * Small player preferences saved in the browser. Storage can be missing or
 * blocked (private browsing, full storage), so every access is wrapped in
 * try/catch and falls back to the default.
 */

const MUTED_KEY = 'train-bridge-constructor.muted';

export function loadMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTED_KEY, String(muted));
  } catch {
    // Not saved; the choice still applies until the page is reloaded.
  }
}

const COMPLETED_KEY = 'train-bridge-constructor.completed-levels';

/** Ids of the levels the player has completed. */
export function loadCompletedLevels(): Set<number> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(COMPLETED_KEY) ?? '[]');
    return new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === 'number') : []);
  } catch {
    return new Set();
  }
}

export function saveCompletedLevels(completed: ReadonlySet<number>): void {
  try {
    window.localStorage.setItem(COMPLETED_KEY, JSON.stringify([...completed]));
  } catch {
    // Not saved; progress still counts until the page is reloaded.
  }
}
