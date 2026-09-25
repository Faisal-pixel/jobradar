import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { CompaniesRepository } from "../../../src/database/repositories/companies-repository.js";
import { NotFoundError, ValidationError } from "../../../src/shared/errors.js";

describe("CompaniesRepository", () => {
  let db: DatabaseSync;
  let repo: CompaniesRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new CompaniesRepository(db);
  });

  it("creates a company and fills in defaults", () => {
    const company = repo.create({ name: "Acme Robotics" });
    expect(company.id).toBeTypeOf("number");
    expect(company.name).toBe("Acme Robotics");
    expect(company.website).toBeNull();
    expect(company.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(company.updated_at).toBe(company.created_at);
  });

  it("stores and updates slug (Phase 9, migration 007)", () => {
    const created = repo.create({ name: "Acme Robotics", slug: "acme-robotics" });
    expect(created.slug).toBe("acme-robotics");

    const noSlug = repo.create({ name: "No Slug Yet" });
    expect(noSlug.slug).toBeNull();

    const updated = repo.update(noSlug.id, { slug: "no-slug-yet" });
    expect(updated.slug).toBe("no-slug-yet");
  });

  it("finds a company by id, and returns null when missing", () => {
    const created = repo.create({ name: "Acme Robotics" });
    expect(repo.findById(created.id)).toEqual(created);
    expect(repo.findById(9999)).toBeNull();
  });

  it("lists companies in insertion order", () => {
    repo.create({ name: "First" });
    repo.create({ name: "Second" });
    const names = repo.list().map((c) => c.name);
    expect(names).toEqual(["First", "Second"]);
  });

  it("updates only the given fields and bumps updated_at", async () => {
    const created = repo.create({ name: "Acme Robotics" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = repo.update(created.id, { team_size: 12 });
    expect(updated.team_size).toBe(12);
    expect(updated.name).toBe("Acme Robotics");
    expect(updated.updated_at).not.toBe(created.updated_at);
  });

  it("throws NotFoundError when updating a missing company", () => {
    expect(() => repo.update(9999, { team_size: 12 })).toThrow(NotFoundError);
  });

  it("throws ValidationError when updating with no fields", () => {
    const created = repo.create({ name: "Acme Robotics" });
    expect(() => repo.update(created.id, {})).toThrow(ValidationError);
  });

  it("deletes a company", () => {
    const created = repo.create({ name: "Acme Robotics" });
    repo.delete(created.id);
    expect(repo.findById(created.id)).toBeNull();
  });
});
