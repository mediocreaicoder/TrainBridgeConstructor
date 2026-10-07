/**
 * Checks that a submitted score is well-formed. In phase 8a this is all the
 * checking there is: the bridge is stored as sent, not re-simulated, so a
 * faked score gets through (see docs/PLAN.md, phase 8a).
 */

export interface Submission {
  levelId: number;
  vehicleId: string;
  physicsVersion: number;
  playerId: string;
  nickname: string;
  cost: number;
  /** The bridge as JSON text, stored for re-verification and replays later. */
  bridge: string;
}

/** Which list to read: one level, one train, one version of the physics. */
export interface ListKey {
  levelId: number;
  vehicleId: string;
  physicsVersion: number;
}

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 16;
/** Far more than any real bridge needs (a big one is a few kilobytes). */
export const MAX_BRIDGE_CHARS = 64 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VEHICLE_ID = /^[a-z]{1,20}$/;
/** Letters, digits, spaces and a little punctuation; no control characters or markup. */
const NICKNAME = /^[\p{L}\p{N} _.\-!?']+$/u;

/** Returns the submission, or a message saying what is wrong with it. */
export function parseSubmission(body: unknown): Submission | string {
  if (!isObject(body)) return 'Body must be a JSON object';
  const { levelId, vehicleId, physicsVersion, playerId, cost, bridge } = body;
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim() : null;

  if (!isWholeNumber(levelId, 1, 1000)) return 'Bad levelId';
  if (typeof vehicleId !== 'string' || !VEHICLE_ID.test(vehicleId)) return 'Bad vehicleId';
  if (!isWholeNumber(physicsVersion, 1, 1_000_000)) return 'Bad physicsVersion';
  if (typeof playerId !== 'string' || !UUID.test(playerId)) return 'Bad playerId';
  if (!isNickname(nickname)) {
    return `Nickname must be ${NICKNAME_MIN}-${NICKNAME_MAX} letters, digits or spaces`;
  }
  if (!isWholeNumber(cost, 0, 1_000_000)) return 'Bad cost';
  if (!isBridge(bridge)) return 'Bad bridge';
  const bridgeText = JSON.stringify(bridge);
  if (bridgeText.length > MAX_BRIDGE_CHARS) return 'Bridge too big';

  return {
    levelId,
    vehicleId,
    physicsVersion,
    playerId: playerId.toLowerCase(),
    nickname,
    cost,
    bridge: bridgeText,
  };
}

/** Reads `level`, `vehicle` and `version` from a query string. */
export function parseListKey(params: URLSearchParams): ListKey | string {
  const levelId = Number(params.get('level'));
  const vehicleId = params.get('vehicle') ?? '';
  const physicsVersion = Number(params.get('version'));
  if (!isWholeNumber(levelId, 1, 1000)) return 'Bad level';
  if (!VEHICLE_ID.test(vehicleId)) return 'Bad vehicle';
  if (!isWholeNumber(physicsVersion, 1, 1_000_000)) return 'Bad version';
  return { levelId, vehicleId, physicsVersion };
}

/** The optional `player` query parameter, lower-cased, or null if missing or malformed. */
export function parsePlayerId(params: URLSearchParams): string | null {
  const playerId = params.get('player');
  return playerId && UUID.test(playerId) ? playerId.toLowerCase() : null;
}

function isNickname(value: string | null): value is string {
  if (value === null) return false;
  // Count characters, not UTF-16 units, so "Ø" and emoji-free accents count as one.
  const length = [...value].length;
  return length >= NICKNAME_MIN && length <= NICKNAME_MAX && NICKNAME.test(value);
}

/** Just the outline of a bridge: joints and beams lists. Their contents are checked in 8b. */
function isBridge(value: unknown): boolean {
  return isObject(value) && Array.isArray(value.joints) && Array.isArray(value.beams);
}

function isWholeNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
