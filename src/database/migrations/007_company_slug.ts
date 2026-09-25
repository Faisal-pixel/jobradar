import type { DatabaseSync } from "node:sqlite";
import type { Migration } from "./migrator.js";

// Self-contained ALTER, same reasoning as 003_company_last_active.ts.
// Work at a Startup's own payloads (search and detail tier) already
// carry this as `companySlug`/`slug` — previously parsed and discarded.
// It's also the same slug Y Combinator's own company pages use
// (ycombinator.com/companies/<slug>), which Phase 9's research tools
// fetch directly — persisting it here makes that lookup deterministic
// for companies discovered from now on, instead of guessing by name
// every time (see src/services/company-research/yc-company-page.ts).
export const migration007CompanySlug: Migration = {
  id: "007_company_slug",
  up(db: DatabaseSync) {
    db.exec("ALTER TABLE companies ADD COLUMN slug TEXT;");
  },
};
