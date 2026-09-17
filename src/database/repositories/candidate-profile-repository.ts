import type { DatabaseSync } from "node:sqlite";
import type {
  CandidateProfile,
  CandidateProfilePatch,
  CompanySizeRange,
} from "../../domain/candidate-profile/candidate-profile.js";
import { DatabaseError, ValidationError } from "../../shared/errors.js";

const JSON_ARRAY_FIELDS = ["target_titles", "stack_interest"] as const;
const JSON_RANGE_FIELDS = [
  "company_size_sweet_spot",
  "company_size_secondary",
  "company_size_opportunistic",
] as const;

function rangeToJson(range: CompanySizeRange | null | undefined): string | null {
  if (!range) return null;
  return JSON.stringify([range.min, range.max]);
}

function jsonToRange(raw: unknown): CompanySizeRange | null {
  if (typeof raw !== "string") return null;
  const [min, max] = JSON.parse(raw) as [number, number];
  return { min, max };
}

function mapRow(row: unknown): CandidateProfile {
  const raw = row as Record<string, unknown>;
  return {
    ...raw,
    target_titles: JSON.parse(raw.target_titles as string),
    stack_interest: JSON.parse(raw.stack_interest as string),
    company_size_sweet_spot: jsonToRange(raw.company_size_sweet_spot),
    company_size_secondary: jsonToRange(raw.company_size_secondary),
    company_size_opportunistic: jsonToRange(raw.company_size_opportunistic),
    prefer_recent_yc_batch: Boolean(raw.prefer_recent_yc_batch),
  } as unknown as CandidateProfile;
}

// Single-row repository: no create/delete — migration 004 seeds the one
// row (id=1) that ever exists, matching CLAUDE.md's "lives in the
// database as editable preferences" for the Candidate Profile.
export class CandidateProfileRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(): CandidateProfile {
    const row = this.db.prepare("SELECT * FROM candidate_profile WHERE id = 1").get();
    if (!row) {
      throw new DatabaseError("candidate_profile row is missing — migration 004 should have seeded it", undefined);
    }
    return mapRow(row);
  }

  update(patch: CandidateProfilePatch): CandidateProfile {
    const fields = Object.keys(patch) as (keyof CandidateProfilePatch)[];
    if (fields.length === 0) throw new ValidationError("No fields provided to update");

    const setClause = fields.map((field) => `${field} = ?`).join(", ");
    const values = fields.map((field) => {
      const value = patch[field];
      if ((JSON_ARRAY_FIELDS as readonly string[]).includes(field)) {
        return JSON.stringify(value ?? []);
      }
      if ((JSON_RANGE_FIELDS as readonly string[]).includes(field)) {
        return rangeToJson(value as CompanySizeRange | null | undefined);
      }
      if (field === "prefer_recent_yc_batch") {
        return value ? 1 : 0;
      }
      return (value ?? null) as string | number | null;
    });

    const row = this.db
      .prepare(
        `UPDATE candidate_profile SET ${setClause}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = 1 RETURNING *`,
      )
      .get(...values);
    return mapRow(row);
  }
}
