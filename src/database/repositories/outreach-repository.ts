import type { DatabaseSync } from "node:sqlite";
import type { Outreach, NewOutreach, OutreachPatch, OutreachStatus } from "../../domain/outreach/outreach.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";

export interface OutreachFilters {
  status?: OutreachStatus;
  jobId?: number;
  companyId?: number;
  personId?: number;
}

export class OutreachRepository {
  constructor(private readonly db: DatabaseSync) {}

  create(input: NewOutreach): Outreach {
    const row = this.db
      .prepare(
        `INSERT INTO outreach
           (company_id, person_id, job_id, channel, date_contacted, status,
            response, follow_up_date, notes)
         VALUES (?, ?, ?, ?, ?, COALESCE(?, 'draft'), ?, ?, ?)
         RETURNING *`,
      )
      .get(
        input.company_id ?? null,
        input.person_id ?? null,
        input.job_id ?? null,
        input.channel ?? null,
        input.date_contacted ?? null,
        input.status ?? null,
        input.response ?? null,
        input.follow_up_date ?? null,
        input.notes ?? null,
      );
    return row as unknown as Outreach;
  }

  findById(id: number): Outreach | null {
    const row = this.db.prepare("SELECT * FROM outreach WHERE id = ?").get(id);
    return (row as unknown as Outreach) ?? null;
  }

  list(): Outreach[] {
    const rows = this.db.prepare("SELECT * FROM outreach ORDER BY id").all();
    return rows as unknown as Outreach[];
  }

  // Query-time filtering, same pattern as JobsRepository.findByFilters.
  findByFilters(filters: OutreachFilters): Outreach[] {
    const clauses: string[] = [];
    const values: (string | number)[] = [];

    if (filters.status) {
      clauses.push("status = ?");
      values.push(filters.status);
    }
    if (filters.jobId !== undefined) {
      clauses.push("job_id = ?");
      values.push(filters.jobId);
    }
    if (filters.companyId !== undefined) {
      clauses.push("company_id = ?");
      values.push(filters.companyId);
    }
    if (filters.personId !== undefined) {
      clauses.push("person_id = ?");
      values.push(filters.personId);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(`SELECT * FROM outreach ${where} ORDER BY id`).all(...values);
    return rows as unknown as Outreach[];
  }

  // Follow-up alerts (Phase 5): overdue-or-due-today, still-open
  // commitments. Deliberately no "already alerted" tracking here — it's
  // correct for this to keep surfacing the same row every run until its
  // status is updated (that update IS the "stop reminding me" signal).
  findDueFollowUps(asOfDate: string): Outreach[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM outreach
         WHERE follow_up_date IS NOT NULL AND follow_up_date <= ?
           AND status NOT IN ('closed', 'responded')
         ORDER BY follow_up_date, id`,
      )
      .all(asOfDate);
    return rows as unknown as Outreach[];
  }

  update(id: number, patch: OutreachPatch): Outreach {
    const existing = this.findById(id);
    if (!existing) throw new NotFoundError("Outreach", id);

    const fields = Object.keys(patch) as (keyof OutreachPatch)[];
    if (fields.length === 0) throw new ValidationError("No fields provided to update");

    const setClause = fields.map((field) => `${field} = ?`).join(", ");
    const values = fields.map((field) => patch[field] ?? null);

    const row = this.db
      .prepare(
        `UPDATE outreach SET ${setClause}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? RETURNING *`,
      )
      .get(...values, id);
    return row as unknown as Outreach;
  }

  delete(id: number): void {
    this.db.prepare("DELETE FROM outreach WHERE id = ?").run(id);
  }
}
