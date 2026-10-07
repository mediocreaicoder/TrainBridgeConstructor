import type { Bridge } from '../game/bridge';
import { PHYSICS_VERSION } from '../game/physics';
import type { VehicleId } from '../game/train';

/**
 * Client for the high-score worker (worker/, docs/PLAN.md phase 8a). The game
 * works without it: if VITE_API_URL is not set, or the server can't be
 * reached, the result panel simply shows no list.
 */

const API_URL: string | undefined = import.meta.env.VITE_API_URL;

/** Give up on a request after this long, so the panel never waits forever. */
const TIMEOUT_MS = 8000;

export interface ScoreEntry {
  rank: number;
  nickname: string;
  cost: number;
}

export interface ScoreList {
  entries: ScoreEntry[];
  /** The player's own entry, if they have one (also when outside the top 10). */
  you: { rank: number; cost: number } | null;
}

/** The number one on one level's list. */
export interface LevelRecord {
  levelId: number;
  nickname: string;
  cost: number;
}

export interface SubmitResult {
  rank: number;
  /** False if the player already had an equal or cheaper bridge on the list. */
  improved: boolean;
}

export interface ScoreSubmission {
  levelId: number;
  vehicleId: VehicleId;
  playerId: string;
  nickname: string;
  cost: number;
  bridge: Bridge;
}

export function hasScoreServer(): boolean {
  return Boolean(API_URL);
}

/** The top 10 for one level and train, and the player's own place. */
export function fetchScores(
  levelId: number,
  vehicleId: VehicleId,
  playerId: string,
): Promise<ScoreList> {
  const query = new URLSearchParams({
    level: String(levelId),
    vehicle: vehicleId,
    version: String(PHYSICS_VERSION),
    player: playerId,
  });
  return request<ScoreList>(`/scores?${query}`);
}

/** The record on every level that has one, for one train. */
export async function fetchRecords(vehicleId: VehicleId): Promise<LevelRecord[]> {
  const query = new URLSearchParams({ vehicle: vehicleId, version: String(PHYSICS_VERSION) });
  const { records } = await request<{ records: LevelRecord[] }>(`/records?${query}`);
  return records;
}

export function submitScore(submission: ScoreSubmission): Promise<SubmitResult> {
  return request<SubmitResult>('/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...submission, physicsVersion: PHYSICS_VERSION }),
  });
}

/** Fetches JSON from the worker. Rejects with the server's error message, if it sent one. */
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_URL) throw new Error('No score server');
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data ? String(data.error) : 'Server error';
    throw new Error(message);
  }
  return data as T;
}
