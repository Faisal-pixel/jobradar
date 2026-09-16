import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "../../src/database/migrations/migrator.js";
import { ALL_MIGRATIONS } from "../../src/database/migrations/index.js";

export function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  runMigrations(db, ALL_MIGRATIONS);
  return db;
}
