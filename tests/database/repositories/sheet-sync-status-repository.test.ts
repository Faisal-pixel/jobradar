import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { SheetSyncStatusRepository } from "../../../src/database/repositories/sheet-sync-status-repository.js";

describe("SheetSyncStatusRepository", () => {
  let db: DatabaseSync;
  let repo: SheetSyncStatusRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new SheetSyncStatusRepository(db);
  });

  it("returns null for a target with no recorded runs", () => {
    expect(repo.get("google_sheets")).toBeNull();
  });

  it("recordSuccess sets status healthy and resets failure count", () => {
    const status = repo.recordSuccess("google_sheets");
    expect(status).toMatchObject({ target: "google_sheets", status: "healthy", consecutive_failures: 0, last_error: null });
    expect(status.last_success_at).not.toBeNull();
  });

  it("1-2 consecutive failures is degraded, 3+ is failing", () => {
    repo.recordFailure("google_sheets", "err1");
    expect(repo.get("google_sheets")?.status).toBe("degraded");
    repo.recordFailure("google_sheets", "err2");
    expect(repo.get("google_sheets")?.status).toBe("degraded");
    repo.recordFailure("google_sheets", "err3");
    expect(repo.get("google_sheets")?.status).toBe("failing");
  });

  it("a success after failures resets consecutive_failures to 0", () => {
    repo.recordFailure("google_sheets", "err");
    repo.recordFailure("google_sheets", "err");
    repo.recordSuccess("google_sheets");
    expect(repo.get("google_sheets")).toMatchObject({ status: "healthy", consecutive_failures: 0 });
  });

  it("list returns all targets ordered by name", () => {
    repo.recordSuccess("google_sheets");
    repo.recordFailure("another_target", "err");
    expect(repo.list().map((s) => s.target)).toEqual(["another_target", "google_sheets"]);
  });
});
