import type { DatabaseSync } from "node:sqlite";
import { SHEET_SYNC_STATUS_CREATE_TABLE_SQL } from "../schema/sheet-sync-status.js";
import type { Migration } from "./migrator.js";

export const migration005SheetSyncStatus: Migration = {
  id: "005_sheet_sync_status",
  up(db: DatabaseSync) {
    db.exec(SHEET_SYNC_STATUS_CREATE_TABLE_SQL);
  },
};
