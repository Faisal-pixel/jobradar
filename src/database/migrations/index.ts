import type { Migration } from "./migrator.js";
import { migration001InitialSchema } from "./001_initial_schema.js";

// New migrations are appended here, in order. Never reorder or remove
// an entry once it has shipped — schema_migrations tracks applied
// migrations by id, and history must stay append-only.
export const ALL_MIGRATIONS: Migration[] = [migration001InitialSchema];

export { runMigrations } from "./migrator.js";
