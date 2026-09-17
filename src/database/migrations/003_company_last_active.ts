import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./migrator.js";

// A self-contained ALTER, not sourced from schema/companies.ts — that
// file is migration 001's historical snapshot and must stay frozen once
// shipped (see the comment atop that file). This migration is the sole
// source of truth for this column from here on, for both existing
// databases (ALTER applies) and brand-new ones (001 creates the table
// without it, then this ALTER runs next in sequence).
//
// Named `last_active` (no `_at` suffix) rather than `last_active_at`:
// Work at a Startup only reports this as a relative string like
// "4 months ago", not a real date — giving it an `_at` name would
// misleadingly imply it follows the ISO-8601 convention every other
// timestamp column in this database uses (Decisions Log #3).
export const migration003CompanyLastActive: Migration = {
  id: "003_company_last_active",
  up(db: DatabaseSync) {
    db.exec("ALTER TABLE companies ADD COLUMN last_active TEXT;");
  },
};
