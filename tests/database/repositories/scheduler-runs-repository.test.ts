import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { SchedulerRunsRepository } from "../../../src/database/repositories/scheduler-runs-repository.js";

describe("SchedulerRunsRepository", () => {
  let db: DatabaseSync;
  let repo: SchedulerRunsRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new SchedulerRunsRepository(db);
  });

  it("creates a run and round-trips its fields", () => {
    const run = repo.create({
      task: "discovery_cycle",
      status: "success",
      started_at: "2026-09-25T08:00:00.000Z",
      finished_at: "2026-09-25T08:00:05.000Z",
      error: null,
      summary: JSON.stringify({ discovery: { ok: true } }),
    });

    expect(run.id).toBeTypeOf("number");
    expect(run.task).toBe("discovery_cycle");
    expect(run.status).toBe("success");
    expect(JSON.parse(run.summary!)).toEqual({ discovery: { ok: true } });
  });

  it("findLatestByTask returns the most recent run for that task only", () => {
    repo.create({ task: "discovery_cycle", status: "success", started_at: "2026-09-25T08:00:00.000Z", finished_at: "2026-09-25T08:00:01.000Z", error: null, summary: null });
    repo.create({ task: "discovery_cycle", status: "failure", started_at: "2026-09-25T11:00:00.000Z", finished_at: "2026-09-25T11:00:01.000Z", error: "boom", summary: null });
    repo.create({ task: "daily_digest", status: "success", started_at: "2026-09-25T12:30:00.000Z", finished_at: "2026-09-25T12:30:01.000Z", error: null, summary: null });

    const latestDiscovery = repo.findLatestByTask("discovery_cycle");
    expect(latestDiscovery?.status).toBe("failure");
    expect(latestDiscovery?.started_at).toBe("2026-09-25T11:00:00.000Z");

    const latestDigest = repo.findLatestByTask("daily_digest");
    expect(latestDigest?.status).toBe("success");
  });

  it("findLatestByTask returns null when a task has never run", () => {
    expect(repo.findLatestByTask("weekly_report")).toBeNull();
  });

  it("listRecent returns runs newest-first across all tasks, respecting the limit", () => {
    repo.create({ task: "discovery_cycle", status: "success", started_at: "2026-09-25T08:00:00.000Z", finished_at: "2026-09-25T08:00:01.000Z", error: null, summary: null });
    repo.create({ task: "daily_digest", status: "success", started_at: "2026-09-25T12:30:00.000Z", finished_at: "2026-09-25T12:30:01.000Z", error: null, summary: null });
    repo.create({ task: "discovery_cycle", status: "success", started_at: "2026-09-25T11:00:00.000Z", finished_at: "2026-09-25T11:00:01.000Z", error: null, summary: null });

    const recent = repo.listRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0]?.started_at).toBe("2026-09-25T12:30:00.000Z");
    expect(recent[1]?.started_at).toBe("2026-09-25T11:00:00.000Z");
  });
});
