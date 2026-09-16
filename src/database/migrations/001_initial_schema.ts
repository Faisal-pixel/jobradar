import type { DatabaseSync } from "node:sqlite";
import { COMPANIES_CREATE_TABLE_SQL } from "../schema/companies.js";
import { JOBS_CREATE_TABLE_SQL } from "../schema/jobs.js";
import { PEOPLE_CREATE_TABLE_SQL } from "../schema/people.js";
import { APPLICATIONS_CREATE_TABLE_SQL } from "../schema/applications.js";
import { OUTREACH_CREATE_TABLE_SQL } from "../schema/outreach.js";
import type { Migration } from "./migrator.js";

// Tables are created in foreign-key dependency order: companies and jobs
// have no dependencies on the others, people depends on companies,
// applications depends on jobs/companies, outreach depends on all three.
export const migration001InitialSchema: Migration = {
  id: "001_initial_schema",
  up(db: DatabaseSync) {
    db.exec(COMPANIES_CREATE_TABLE_SQL);
    db.exec(JOBS_CREATE_TABLE_SQL);
    db.exec(PEOPLE_CREATE_TABLE_SQL);
    db.exec(APPLICATIONS_CREATE_TABLE_SQL);
    db.exec(OUTREACH_CREATE_TABLE_SQL);
  },
};
