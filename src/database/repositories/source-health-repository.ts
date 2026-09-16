import type { DatabaseSync } from "node:sqlite";
import type { SourceHealth } from "../../domain/sources/source-health.js";

// 1-2 consecutive failures is "degraded" (probably transient — a timeout,
// a site hiccup); 3+ is "failing" (something is actually broken, e.g. the
// site changed its HTML/JSON shape and the adapter needs a fix).
const FAILING_THRESHOLD = 3;

export class SourceHealthRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(source: string): SourceHealth | null {
    const row = this.db.prepare("SELECT * FROM source_health WHERE source = ?").get(source);
    return (row as unknown as SourceHealth) ?? null;
  }

  list(): SourceHealth[] {
    const rows = this.db.prepare("SELECT * FROM source_health ORDER BY source").all();
    return rows as unknown as SourceHealth[];
  }

  recordSuccess(source: string): SourceHealth {
    const row = this.db
      .prepare(
        `INSERT INTO source_health (source, status, last_success_at, consecutive_failures, last_error, updated_at)
         VALUES (?, 'healthy', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (source) DO UPDATE SET
           status = 'healthy',
           last_success_at = excluded.last_success_at,
           consecutive_failures = 0,
           last_error = NULL,
           updated_at = excluded.updated_at
         RETURNING *`,
      )
      .get(source);
    return row as unknown as SourceHealth;
  }

  recordFailure(source: string, errorMessage: string): SourceHealth {
    const existing = this.get(source);
    const consecutiveFailures = (existing?.consecutive_failures ?? 0) + 1;
    const status = consecutiveFailures >= FAILING_THRESHOLD ? "failing" : "degraded";

    const row = this.db
      .prepare(
        `INSERT INTO source_health (source, status, last_failure_at, consecutive_failures, last_error, updated_at)
         VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (source) DO UPDATE SET
           status = excluded.status,
           last_failure_at = excluded.last_failure_at,
           consecutive_failures = excluded.consecutive_failures,
           last_error = excluded.last_error,
           updated_at = excluded.updated_at
         RETURNING *`,
      )
      .get(source, status, consecutiveFailures, errorMessage);
    return row as unknown as SourceHealth;
  }
}
