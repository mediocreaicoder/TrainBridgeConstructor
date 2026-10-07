/**
 * Level progression. A level gives 1 to 4 stars, one for each train weight
 * the bridge has carried (handcar 1, maintenance locomotive 2, passenger
 * train 3, goods train 4); the best result counts. Levels unlock in order:
 * the first is always open, and each following one opens once the one before
 * it has at least one star.
 */

/** Best stars per level id. Levels without an entry have no stars yet. */
export type LevelStars = ReadonlyMap<number, number>;

export function starsFor(levelId: number, stars: LevelStars): number {
  return stars.get(levelId) ?? 0;
}

export function isUnlocked(levelId: number, stars: LevelStars): boolean {
  return levelId === 1 || starsFor(levelId - 1, stars) >= 1;
}

/** Records a result; only an improvement changes anything. Returns the (new) map. */
export function withResult(stars: LevelStars, levelId: number, earned: number): LevelStars {
  if (earned <= starsFor(levelId, stars)) return stars;
  return new Map(stars).set(levelId, earned);
}

/**
 * The level to start in: the first one without any stars, or the last one if
 * they all have some. Returns a 0-based index into the level list.
 */
export function startingLevelIndex(levelIds: readonly number[], stars: LevelStars): number {
  const index = levelIds.findIndex((id) => starsFor(id, stars) === 0);
  return index === -1 ? Math.max(0, levelIds.length - 1) : index;
}
