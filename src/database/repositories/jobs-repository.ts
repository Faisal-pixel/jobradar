import type { DatabaseSync } from "node:sqlite";
import type { Job, NewJob, JobPatch, JobStatus, JobFitCategory } from "../../domain/jobs/job.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";

export interface JobFilters {
  status?: JobStatus;
  fitCategory?: JobFitCategory;
  minFitScore?: number;
  remoteOnly?: boolean;
}

// SQLite has no boolean type; `remote` is stored as an INTEGER 0/1/NULL
// and converted at the repository boundary so nothing above this layer
// has to think about it.
function toSqliteBool(value: boolean | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return value ? 1 : 0;
}

function mapRow(row: unknown): Job {
  const raw = row as Record<string, unknown>;
  return { ...raw, remote: raw.remote === null ? null : Boolean(raw.remote) } as unknown as Job;
}

export class JobsRepository {
  constructor(private readonly db: DatabaseSync) {}

  create(input: NewJob): Job {
    const row = this.db
      .prepare(
        `INSERT INTO jobs
           (company_id, title, location, remote, salary_min, salary_max, salary_currency,
            description, job_url, application_url, source, source_job_id, date_found,
            date_posted, fit_score, fit_category, fit_explanation, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'new'))
         RETURNING *`,
      )
      .get(
        input.company_id ?? null,
        input.title,
        input.location ?? null,
        toSqliteBool(input.remote),
        input.salary_min ?? null,
        input.salary_max ?? null,
        input.salary_currency ?? null,
        input.description ?? null,
        input.job_url ?? null,
        input.application_url ?? null,
        input.source,
        input.source_job_id,
        input.date_found ?? null,
        input.date_posted ?? null,
        input.fit_score ?? null,
        input.fit_category ?? null,
        input.fit_explanation ?? null,
        input.status ?? null,
      );
    return mapRow(row);
  }

  findById(id: number): Job | null {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
    return row ? mapRow(row) : null;
  }

  findBySource(source: string, sourceJobId: string): Job | null {
    const row = this.db
      .prepare("SELECT * FROM jobs WHERE source = ? AND source_job_id = ?")
      .get(source, sourceJobId);
    return row ? mapRow(row) : null;
  }

  // Cross-source dedup fallback (CLAUDE.md's "normalized company + role"
  // rule): same company, same title (case/whitespace-insensitive), from
  // a *different* source than the one asking. Exact same-source repeats
  // are already caught by the source+source_job_id UNIQUE constraint via
  // findBySource — this is only for the same job cross-posted elsewhere.
  findPotentialDuplicate(companyId: number, title: string, excludingSource: string): Job | null {
    const normalizedTitle = title.trim().toLowerCase();
    const row = this.db
      .prepare(
        `SELECT * FROM jobs
         WHERE company_id = ? AND LOWER(TRIM(title)) = ? AND source != ?
         LIMIT 1`,
      )
      .get(companyId, normalizedTitle, excludingSource);
    return row ? mapRow(row) : null;
  }

  list(): Job[] {
    const rows = this.db.prepare("SELECT * FROM jobs ORDER BY id").all();
    return rows.map(mapRow);
  }

  // Query-time filtering (Phase 3 decision: filtering is a separate
  // capability layered on top of already-scored jobs, never a
  // pre-scoring gate — see CLAUDE.md Decisions Log). This is what a
  // future `search_jobs` MCP tool (Phase 7) will wrap.
  findByFilters(filters: JobFilters): Job[] {
    const clauses: string[] = [];
    const values: (string | number)[] = [];

    if (filters.status) {
      clauses.push("status = ?");
      values.push(filters.status);
    }
    if (filters.fitCategory) {
      clauses.push("fit_category = ?");
      values.push(filters.fitCategory);
    }
    if (filters.minFitScore !== undefined) {
      clauses.push("fit_score >= ?");
      values.push(filters.minFitScore);
    }
    if (filters.remoteOnly) {
      clauses.push("remote = 1");
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(`SELECT * FROM jobs ${where} ORDER BY fit_score DESC, id`).all(...values);
    return rows.map(mapRow);
  }

  // Instant Category-A alerts: everything scored 'A' that hasn't been
  // alerted yet. alerted_at is what makes re-running send-alerts safe.
  findUnalertedByCategory(category: JobFitCategory): Job[] {
    const rows = this.db
      .prepare("SELECT * FROM jobs WHERE fit_category = ? AND alerted_at IS NULL ORDER BY fit_score DESC, id")
      .all(category);
    return rows.map(mapRow);
  }

  // Daily digest's fixed lookback window (Decisions Log: stateless by
  // design, no "last digest sent" tracking).
  findDiscoveredSince(isoTimestamp: string): Job[] {
    const rows = this.db
      .prepare("SELECT * FROM jobs WHERE date_found >= ? ORDER BY fit_score DESC, id")
      .all(isoTimestamp);
    return rows.map(mapRow);
  }

  update(id: number, patch: JobPatch): Job {
    const existing = this.findById(id);
    if (!existing) throw new NotFoundError("Job", id);

    const fields = Object.keys(patch) as (keyof JobPatch)[];
    if (fields.length === 0) throw new ValidationError("No fields provided to update");

    const setClause = fields.map((field) => `${field} = ?`).join(", ");
    const values = fields.map((field) => {
      const value = patch[field];
      return field === "remote"
        ? toSqliteBool(value as boolean | null)
        : ((value ?? null) as string | number | null);
    });

    const row = this.db
      .prepare(
        `UPDATE jobs SET ${setClause}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? RETURNING *`,
      )
      .get(...values, id);
    return mapRow(row);
  }

  delete(id: number): void {
    this.db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
  }
}
