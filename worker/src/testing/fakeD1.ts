import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

/**
 * A stand-in for Cloudflare D1 in tests: Node's built-in SQLite behind the
 * few D1 methods the worker uses. D1 is SQLite too, so the real SQL and the
 * real migrations run.
 */
export function createFakeD1(): D1Database {
  const db = new DatabaseSync(':memory:');
  const migration = new URL('../../migrations/0001_scores.sql', import.meta.url);
  db.exec(readFileSync(migration, 'utf8'));

  const prepare = (sql: string, values: SQLInputValue[] = []) => ({
    bind: (...next: SQLInputValue[]) => prepare(sql, next),
    run: async () => {
      const { changes } = db.prepare(sql).run(...values);
      return { success: true, meta: { changes: Number(changes) }, results: [] };
    },
    all: async () => ({ success: true, meta: {}, results: db.prepare(sql).all(...values) }),
    first: async () => db.prepare(sql).get(...values) ?? null,
  });

  return { prepare } as unknown as D1Database;
}
