import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { CandidateProfileRepository } from "../../../src/database/repositories/candidate-profile-repository.js";
import { ValidationError } from "../../../src/shared/errors.js";

describe("CandidateProfileRepository", () => {
  let db: DatabaseSync;
  let repo: CandidateProfileRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new CandidateProfileRepository(db);
  });

  it("is seeded by migration 004 with CLAUDE.md's stated candidate profile", () => {
    const profile = repo.get();
    expect(profile.location).toBe("Nigeria");
    expect(profile.location_code).toBe("NG");
    expect(profile.target_titles).toContain("Founding Engineer");
    expect(profile.stack_interest).toContain("TypeScript");
    expect(profile.company_size_sweet_spot).toEqual({ min: 5, max: 30 });
    expect(profile.company_size_secondary).toEqual({ min: 31, max: 50 });
    expect(profile.company_size_opportunistic).toEqual({ min: 2, max: 4 });
    expect(profile.prefer_recent_yc_batch).toBe(true);
  });

  it("updates JSON array fields", () => {
    const updated = repo.update({ stack_interest: ["Rust"] });
    expect(updated.stack_interest).toEqual(["Rust"]);
  });

  it("updates JSON range fields", () => {
    const updated = repo.update({ company_size_sweet_spot: { min: 10, max: 20 } });
    expect(updated.company_size_sweet_spot).toEqual({ min: 10, max: 20 });
  });

  it("updates the boolean field as a real boolean round-trip", () => {
    const updated = repo.update({ prefer_recent_yc_batch: false });
    expect(updated.prefer_recent_yc_batch).toBe(false);
    expect(repo.get().prefer_recent_yc_batch).toBe(false);
  });

  it("throws ValidationError when updating with no fields", () => {
    expect(() => repo.update({})).toThrow(ValidationError);
  });
});
