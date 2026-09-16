import type { DatabaseSync } from "node:sqlite";
import type { Company, NewCompany, CompanyPatch } from "../../domain/companies/company.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";

export class CompaniesRepository {
  constructor(private readonly db: DatabaseSync) {}

  create(input: NewCompany): Company {
    const row = this.db
      .prepare(
        `INSERT INTO companies
           (name, website, domain, yc_batch, team_size, industry, description,
            funding, funding_stage, location, remote_policy, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`,
      )
      .get(
        input.name,
        input.website ?? null,
        input.domain ?? null,
        input.yc_batch ?? null,
        input.team_size ?? null,
        input.industry ?? null,
        input.description ?? null,
        input.funding ?? null,
        input.funding_stage ?? null,
        input.location ?? null,
        input.remote_policy ?? null,
        input.notes ?? null,
      );
    return row as unknown as Company;
  }

  findById(id: number): Company | null {
    const row = this.db.prepare("SELECT * FROM companies WHERE id = ?").get(id);
    return (row as unknown as Company) ?? null;
  }

  // Case-insensitive exact match. Good enough for one source repeatedly
  // reporting the same company name run over run; fuzzy/near-duplicate
  // matching across differently-spelled company names is not attempted
  // here — that's research-phase territory, not job discovery.
  findByName(name: string): Company | null {
    const row = this.db
      .prepare("SELECT * FROM companies WHERE LOWER(name) = LOWER(?) LIMIT 1")
      .get(name);
    return (row as unknown as Company) ?? null;
  }

  list(): Company[] {
    const rows = this.db.prepare("SELECT * FROM companies ORDER BY id").all();
    return rows as unknown as Company[];
  }

  update(id: number, patch: CompanyPatch): Company {
    const existing = this.findById(id);
    if (!existing) throw new NotFoundError("Company", id);

    const fields = Object.keys(patch) as (keyof CompanyPatch)[];
    if (fields.length === 0) throw new ValidationError("No fields provided to update");

    const setClause = fields.map((field) => `${field} = ?`).join(", ");
    const values = fields.map((field) => patch[field] ?? null);

    const row = this.db
      .prepare(
        `UPDATE companies SET ${setClause}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? RETURNING *`,
      )
      .get(...values, id);
    return row as unknown as Company;
  }

  delete(id: number): void {
    this.db.prepare("DELETE FROM companies WHERE id = ?").run(id);
  }
}
