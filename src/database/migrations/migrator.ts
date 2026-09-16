import type { DatabaseSync } from "node:sqlite";
import { logger } from "../../shared/logger.js";
import { DatabaseError } from "../../shared/errors.js";

export interface Migration {
  id: string;
  up: (db: DatabaseSync) => void;
}

const SCHEMA_MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id          TEXT PRIMARY KEY,
  applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
`;

export function runMigrations(db: DatabaseSync, migrations: Migration[]): void {
  db.exec(SCHEMA_MIGRATIONS_TABLE_SQL);

  const isApplied = db.prepare("SELECT 1 FROM schema_migrations WHERE id = ?");
  const markApplied = db.prepare("INSERT INTO schema_migrations (id) VALUES (?)");

  for (const migration of migrations) {
    if (isApplied.get(migration.id)) {
      logger.debug("Migration already applied, skipping", { id: migration.id });
      continue;
    }

    db.exec("BEGIN");
    try {
      migration.up(db);
      markApplied.run(migration.id);
      db.exec("COMMIT");
      logger.info("Migration applied", { id: migration.id });
    } catch (cause) {
      db.exec("ROLLBACK");
      throw new DatabaseError(`Migration ${migration.id} failed`, cause);
    }
  }
}
