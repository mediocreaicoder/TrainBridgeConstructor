-- One row per player, level, train and physics version: the player's cheapest
-- winning bridge. The bridge itself is kept so it can be re-verified and
-- replayed later (phase 8b).
CREATE TABLE scores (
  level_id INTEGER NOT NULL,
  vehicle_id TEXT NOT NULL,
  physics_version INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  cost INTEGER NOT NULL,
  bridge TEXT NOT NULL,
  -- Milliseconds since 1970. The earlier score wins a tie.
  created_at INTEGER NOT NULL,
  PRIMARY KEY (level_id, vehicle_id, physics_version, player_id)
);

-- The top-10 list and rank queries walk this index in order.
CREATE INDEX scores_ranking ON scores (level_id, vehicle_id, physics_version, cost, created_at);
