import type { DatabaseSync } from "node:sqlite";
import { SOURCE_HEALTH_CREATE_TABLE_SQL } from "../schema/source-health.js";
import type { Migration } from "./migrator.js";

export const migration002SourceHealth: Migration = {
  id: "002_source_health",
  up(db: DatabaseSync) {
    db.exec(SOURCE_HEALTH_CREATE_TABLE_SQL);
  },
};
