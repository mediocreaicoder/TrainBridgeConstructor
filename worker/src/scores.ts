import type { ListKey, Submission } from './submission';

/** How many entries a list shows. */
export const TOP_COUNT = 10;

export interface ListEntry {
  rank: number;
  nickname: string;
  cost: number;
}

export interface ScoreList {
  entries: ListEntry[];
  /** The asking player's own entry, if they have one (even outside the top 10). */
  you: { rank: number; cost: number } | null;
}

export interface SubmitResult {
  /** The player's rank after submitting. */
  rank: number;
  /** False if the player already had an equal or cheaper bridge on this list. */
  improved: boolean;
}

// Every query is scoped to one list.
const SAME_LIST = 'level_id = ?1 AND vehicle_id = ?2 AND physics_version = ?3';

/**
 * Keeps the player's cheapest bridge: a new row, or a replacement if the new
 * bridge is cheaper than the one stored. A tie keeps the older bridge, which
 * keeps its place in the list.
 */
export async function submitScore(
  db: D1Database,
  submission: Submission,
  now: number,
): Promise<SubmitResult> {
  const { levelId, vehicleId, physicsVersion, playerId, nickname, cost, bridge } = submission;
  const result = await db
    .prepare(
      `INSERT INTO scores
         (level_id, vehicle_id, physics_version, player_id, nickname, cost, bridge, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
       ON CONFLICT (level_id, vehicle_id, physics_version, player_id) DO UPDATE SET
         nickname = excluded.nickname,
         cost = excluded.cost,
         bridge = excluded.bridge,
         created_at = excluded.created_at
       WHERE excluded.cost < scores.cost`,
    )
    .bind(levelId, vehicleId, physicsVersion, playerId, nickname, cost, bridge, now)
    .run();
  const improved = result.meta.changes > 0;
  const own = await ownEntry(db, submission, playerId);
  return { rank: own?.rank ?? 0, improved };
}

/**
 * The top of the list, cheapest first, and the player's own place. The earlier
 * score wins a tie; rowid (insertion order) settles scores in the same millisecond.
 */
export async function readScores(
  db: D1Database,
  key: ListKey,
  playerId: string | null,
): Promise<ScoreList> {
  const { results } = await db
    .prepare(
      `SELECT nickname, cost FROM scores WHERE ${SAME_LIST}
       ORDER BY cost, created_at, rowid LIMIT ${TOP_COUNT}`,
    )
    .bind(key.levelId, key.vehicleId, key.physicsVersion)
    .all<{ nickname: string; cost: number }>();
  const entries = results.map((row, index) => ({ rank: index + 1, ...row }));
  const you = playerId ? await ownEntry(db, key, playerId) : null;
  return { entries, you };
}

/** The player's row and rank: one more than the number of rows ahead of it. */
async function ownEntry(
  db: D1Database,
  key: ListKey,
  playerId: string,
): Promise<{ rank: number; cost: number } | null> {
  const row = await db
    .prepare(
      `SELECT mine.cost AS cost,
         (SELECT COUNT(*) FROM scores AS other
            WHERE other.level_id = ?1 AND other.vehicle_id = ?2 AND other.physics_version = ?3
              AND (other.cost < mine.cost
                OR (other.cost = mine.cost AND other.created_at < mine.created_at)
                OR (other.cost = mine.cost AND other.created_at = mine.created_at
                  AND other.rowid < mine.rowid))) + 1 AS rank
       FROM scores AS mine
       WHERE mine.level_id = ?1 AND mine.vehicle_id = ?2 AND mine.physics_version = ?3
         AND mine.player_id = ?4`,
    )
    .bind(key.levelId, key.vehicleId, key.physicsVersion, playerId)
    .first<{ cost: number; rank: number }>();
  return row ? { rank: row.rank, cost: row.cost } : null;
}
