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
