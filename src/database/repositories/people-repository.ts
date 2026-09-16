import type { DatabaseSync } from "node:sqlite";
import type { Person, NewPerson, PersonPatch } from "../../domain/people/person.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";

export class PeopleRepository {
  constructor(private readonly db: DatabaseSync) {}

  create(input: NewPerson): Person {
    const row = this.db
      .prepare(
        `INSERT INTO people
           (company_id, name, role, category, linkedin_url, email, source, source_url, confidence, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`,
      )
      .get(
        input.company_id ?? null,
        input.name ?? null,
        input.role ?? null,
        input.category ?? null,
        input.linkedin_url ?? null,
        input.email ?? null,
        input.source ?? null,
        input.source_url ?? null,
        input.confidence ?? null,
        input.notes ?? null,
      );
    return row as unknown as Person;
  }

  findById(id: number): Person | null {
    const row = this.db.prepare("SELECT * FROM people WHERE id = ?").get(id);
    return (row as unknown as Person) ?? null;
  }

  list(): Person[] {
    const rows = this.db.prepare("SELECT * FROM people ORDER BY id").all();
    return rows as unknown as Person[];
  }

  update(id: number, patch: PersonPatch): Person {
    const existing = this.findById(id);
    if (!existing) throw new NotFoundError("Person", id);

    const fields = Object.keys(patch) as (keyof PersonPatch)[];
    if (fields.length === 0) throw new ValidationError("No fields provided to update");

    const setClause = fields.map((field) => `${field} = ?`).join(", ");
    const values = fields.map((field) => patch[field] ?? null);

    const row = this.db
      .prepare(
        `UPDATE people SET ${setClause}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? RETURNING *`,
      )
      .get(...values, id);
    return row as unknown as Person;
  }

  delete(id: number): void {
    this.db.prepare("DELETE FROM people WHERE id = ?").run(id);
  }
}
