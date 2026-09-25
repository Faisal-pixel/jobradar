import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../test-helpers/create-test-db.js";

// scheduler.ts's own responsibility is the timing wiring and the
// persist-to-scheduler_runs wrapper — the task functions themselves are
// already covered directly in tasks.test.ts, so they're mocked here to
// keep this file focused on scheduler.ts's own contract (including the
// last-resort safety net for a task that throws, which the real task
// functions are designed never to do).
const mockRunDiscoveryCycle = vi.fn();
const mockRunDailyDigest = vi.fn();
const mockRunWeeklyReport = vi.fn();

vi.mock("../../src/scheduler/tasks.js", () => ({
  runDiscoveryCycle: (...args: unknown[]) => mockRunDiscoveryCycle(...args),
  runDailyDigest: (...args: unknown[]) => mockRunDailyDigest(...args),
  runWeeklyReport: (...args: unknown[]) => mockRunWeeklyReport(...args),
}));

const { executeTaskAndRecord, startScheduler } = await import("../../src/scheduler/scheduler.js");
const { SchedulerRunsRepository } = await import("../../src/database/repositories/scheduler-runs-repository.js");

describe("executeTaskAndRecord", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDb();
    mockRunDiscoveryCycle.mockReset();
    mockRunDailyDigest.mockReset();
    mockRunWeeklyReport.mockReset();
  });

  it("persists a successful run to scheduler_runs", async () => {
    mockRunDailyDigest.mockResolvedValue({ status: "success", summary: { jobCount: 3 }, error: null });

    const run = await executeTaskAndRecord(db, "daily_digest");

    expect(run.status).toBe("success");
    expect(JSON.parse(run.summary!)).toEqual({ jobCount: 3 });
    const stored = new SchedulerRunsRepository(db).findLatestByTask("daily_digest");
    expect(stored?.id).toBe(run.id);
  });

  it("persists a failed run with its error", async () => {
    mockRunWeeklyReport.mockResolvedValue({ status: "failure", summary: {}, error: "telegram down" });

    const run = await executeTaskAndRecord(db, "weekly_report");

    expect(run.status).toBe("failure");
    expect(run.error).toBe("telegram down");
  });

  it("catches a task function that throws unexpectedly — last-resort safety net, never propagates", async () => {
    mockRunDiscoveryCycle.mockRejectedValue(new Error("totally unexpected bug"));

    const run = await executeTaskAndRecord(db, "discovery_cycle"); // must not reject

    expect(run.status).toBe("failure");
    expect(run.error).toBe("totally unexpected bug");
  });

  it("sets started_at/finished_at as real timestamps bracketing the call", async () => {
    mockRunDailyDigest.mockResolvedValue({ status: "success", summary: {}, error: null });
    const before = new Date().toISOString();
    const run = await executeTaskAndRecord(db, "daily_digest");
    const after = new Date().toISOString();
    expect(run.started_at >= before).toBe(true);
    expect(run.finished_at <= after).toBe(true);
  });
});

describe("startScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 25, 7, 0, 0)); // Friday 7am — before every default cadence today
    mockRunDiscoveryCycle.mockReset().mockResolvedValue({ status: "success", summary: {}, error: null });
    mockRunDailyDigest.mockReset().mockResolvedValue({ status: "success", summary: {}, error: null });
    mockRunWeeklyReport.mockReset().mockResolvedValue({ status: "success", summary: {}, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires discovery_cycle at its configured wall-clock time (default: 8am), not before", async () => {
    const db = createTestDb();
    const scheduler = startScheduler(db);

    await vi.advanceTimersByTimeAsync(59 * 60 * 1000); // 7:59am
    expect(mockRunDiscoveryCycle).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000); // past 8:00am
    expect(mockRunDiscoveryCycle).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });

  it("fires discovery_cycle again 3 hours later (default cadence), not just once", async () => {
    const db = createTestDb();
    const scheduler = startScheduler(db);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000); // past 8am -> 1 run
    expect(mockRunDiscoveryCycle).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000); // past 11am -> 2nd run
    expect(mockRunDiscoveryCycle).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it("stop() prevents any further scheduled runs", async () => {
    const db = createTestDb();
    const scheduler = startScheduler(db);
    scheduler.stop();

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000); // a full day
    expect(mockRunDiscoveryCycle).not.toHaveBeenCalled();
    expect(mockRunDailyDigest).not.toHaveBeenCalled();
    expect(mockRunWeeklyReport).not.toHaveBeenCalled();
  });
});
