import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { PeopleRepository } from "../../../src/database/repositories/people-repository.js";
import { NotFoundError, ValidationError } from "../../../src/shared/errors.js";

describe("PeopleRepository", () => {
  let db: DatabaseSync;
  let repo: PeopleRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new PeopleRepository(db);
  });

  it("creates a person", () => {
    const person = repo.create({ name: "Jane Founder", category: "founder" });
    expect(person.name).toBe("Jane Founder");
    expect(person.category).toBe("founder");
  });

  it("finds a person by id, and returns null when missing", () => {
    const created = repo.create({ name: "Jane" });
    expect(repo.findById(created.id)).toEqual(created);
    expect(repo.findById(9999)).toBeNull();
  });

  it("updates fields and bumps updated_at", async () => {
    const created = repo.create({ name: "Jane" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = repo.update(created.id, { role: "CEO" });
    expect(updated.role).toBe("CEO");
    expect(updated.updated_at).not.toBe(created.updated_at);
  });

  it("throws NotFoundError when updating a missing person", () => {
    expect(() => repo.update(9999, { role: "CEO" })).toThrow(NotFoundError);
  });

  it("throws ValidationError when updating with no fields", () => {
    const created = repo.create({ name: "Jane" });
    expect(() => repo.update(created.id, {})).toThrow(ValidationError);
  });

  it("deletes a person", () => {
    const created = repo.create({ name: "Jane" });
    repo.delete(created.id);
    expect(repo.findById(created.id)).toBeNull();
  });

  describe("findByFilters", () => {
    beforeEach(() => {
      repo.create({ name: "Jane Founder", category: "founder" });
      repo.create({ name: "Jack Founder", category: "founder" });
      repo.create({ name: "Jane Recruiter", category: "recruiter" });
    });

    it("matches name case-insensitively and partially", () => {
      expect(repo.findByFilters({ name: "jane" })).toHaveLength(2);
      expect(repo.findByFilters({ name: "FOUNDER" })).toHaveLength(2); // matches the surname, not just first name
    });

    it("matches category exactly", () => {
      expect(repo.findByFilters({ category: "founder" })).toHaveLength(2);
      expect(repo.findByFilters({ category: "recruiter" })).toHaveLength(1);
    });

    it("combines name and category with AND semantics", () => {
      expect(repo.findByFilters({ name: "jane", category: "founder" })).toHaveLength(1);
    });

    it("returns everything when no filters are given", () => {
      expect(repo.findByFilters({})).toHaveLength(3);
    });
  });
});
