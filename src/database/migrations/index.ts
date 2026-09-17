import type { Migration } from "./migrator.js";
import { migration001InitialSchema } from "./001_initial_schema.js";
import { migration002SourceHealth } from "./002_source_health.js";
import { migration003CompanyLastActive } from "./003_company_last_active.js";
import { migration004CandidateProfile } from "./004_candidate_profile.js";

// New migrations are appended here, in order. Never reorder or remove
// an entry once it has shipped — schema_migrations tracks applied
// migrations by id, and history must stay append-only.
export const ALL_MIGRATIONS: Migration[] = [
  migration001InitialSchema,
  migration002SourceHealth,
  migration003CompanyLastActive,
  migration004CandidateProfile,
];

export { runMigrations } from "./migrator.js";
