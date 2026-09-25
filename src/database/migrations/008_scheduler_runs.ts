import type { DatabaseSync } from "node:sqlite";
import { SCHEDULER_RUNS_CREATE_TABLE_SQL } from "../schema/scheduler-runs.js";
import type { Migration } from "./migrator.js";

export const migration008SchedulerRuns: Migration = {
  id: "008_scheduler_runs",
  up(db: DatabaseSync) {
    db.exec(SCHEDULER_RUNS_CREATE_TABLE_SQL);
  },
};
