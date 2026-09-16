import type { DatabaseSync } from "node:sqlite";
import type { Application, NewApplication, ApplicationPatch } from "../../domain/applications/application.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";

export class ApplicationsRepository {
  constructor(private readonly db: DatabaseSync) {}

  create(input: NewApplication): Application {
    const row = this.db
      .prepare(
        `INSERT INTO applications
           (job_id, company_id, role, application_url, date_applied, status,
            interview_stage, rejection_reason, notes)
         VALUES (?, ?, ?, ?, ?, COALESCE(?, 'planned'), ?, ?, ?)
         RETURNING *`,
      )
      .get(
        input.job_id ?? null,
        input.company_id ?? null,
        input.role ?? null,
        input.application_url ?? null,
        input.date_applied ?? null,
        input.status ?? null,
        input.interview_stage ?? null,
        input.rejection_reason ?? null,
        input.notes ?? null,
      );
    return row as unknown as Application;
  }

  findById(id: number): Application | null {
    const row = this.db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
    return (row as unknown as Application) ?? null;
  }

  list(): Application[] {
    const rows = this.db.prepare("SELECT * FROM applications ORDER BY id").all();
    return rows as unknown as Application[];
  }

  update(id: number, patch: ApplicationPatch): Application {
    const existing = this.findById(id);
    if (!existing) throw new NotFoundError("Application", id);

    const fields = Object.keys(patch) as (keyof ApplicationPatch)[];
    if (fields.length === 0) throw new ValidationError("No fields provided to update");

    const setClause = fields.map((field) => `${field} = ?`).join(", ");
    const values = fields.map((field) => patch[field] ?? null);

    const row = this.db
      .prepare(
        `UPDATE applications SET ${setClause}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? RETURNING *`,
      )
      .get(...values, id);
    return row as unknown as Application;
  }

  delete(id: number): void {
    this.db.prepare("DELETE FROM applications WHERE id = ?").run(id);
  }
}
