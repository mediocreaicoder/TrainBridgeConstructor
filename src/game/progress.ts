/**
 * Level progression. Levels unlock in order: the first is always open, and
 * each following one opens when the one before it has been completed.
 * Completed levels are identified by level id (1, 2, 3, ...).
 */

export function isUnlocked(levelId: number, completed: ReadonlySet<number>): boolean {
  return levelId === 1 || completed.has(levelId - 1);
}

/**
 * The level to start in: the first one not yet completed, or the last one if
 * they all are. Returns a 0-based index into the level list.
 */
export function startingLevelIndex(
  levelIds: readonly number[],
  completed: ReadonlySet<number>,
): number {
  const index = levelIds.findIndex((id) => !completed.has(id));
  return index === -1 ? Math.max(0, levelIds.length - 1) : index;
}
