import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./migrator.js";

// Self-contained ALTER, not sourced from schema/jobs.ts (frozen migration
// 001 snapshot — same reasoning as 003_company_last_active.ts). NULL =
// never alerted; set the moment an instant Category-A alert is sent, so
// re-running send-alerts never re-notifies the same job.
export const migration006JobAlertedAt: Migration = {
  id: "006_job_alerted_at",
  up(db: DatabaseSync) {
    db.exec("ALTER TABLE jobs ADD COLUMN alerted_at TEXT;");
  },
};
