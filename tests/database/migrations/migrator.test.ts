import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { runMigrations } from "../../../src/database/migrations/migrator.js";
import { ALL_MIGRATIONS } from "../../../src/database/migrations/index.js";

describe("runMigrations", () => {
  it("creates all five entity tables plus the migrations tracking table", () => {
    const db = new DatabaseSync(":memory:");
    runMigrations(db, ALL_MIGRATIONS);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toEqual(
      expect.arrayContaining([
        "applications",
        "companies",
        "jobs",
        "outreach",
        "people",
        "schema_migrations",
      ]),
    );
  });

  it("is idempotent — running twice applies nothing new the second time", () => {
    const db = new DatabaseSync(":memory:");
    runMigrations(db, ALL_MIGRATIONS);
    runMigrations(db, ALL_MIGRATIONS); // should not throw or duplicate rows

    const applied = db.prepare("SELECT id FROM schema_migrations").all();
    expect(applied).toHaveLength(ALL_MIGRATIONS.length);
  });
});
