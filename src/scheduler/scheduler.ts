import type { DatabaseSync } from "node:sqlite";
import { SchedulerRunsRepository } from "../database/repositories/scheduler-runs-repository.js";
import type { SchedulerRun, SchedulerTask } from "../domain/automation/scheduler-run.js";
import { computeDailyTimes, nextDailyOccurrence, nextWeeklyOccurrence, msUntil, type TimeOfDay } from "./timing.js";
import { runDiscoveryCycle, runDailyDigest, runWeeklyReport, type TaskResult } from "./tasks.js";
import { env } from "../config/env.js";
import { logger } from "../shared/logger.js";

const TASK_RUNNERS: Record<SchedulerTask, (db: DatabaseSync) => Promise<TaskResult>> = {
  discovery_cycle: runDiscoveryCycle,
  daily_digest: runDailyDigest,
  weekly_report: runWeeklyReport,
};

interface RecurringHandle {
  stop: () => void;
}

// Anchored to real wall-clock times (see timing.ts), not a plain
// setInterval from process start — never drifts across restarts, and
// task() is never allowed to throw here (it's already a fully-caught
// TaskResult-returning function by the time it reaches this layer) so a
// bad run can't cancel future scheduled runs.
function scheduleRecurring(computeNext: (from: Date) => Date, task: () => Promise<unknown>): RecurringHandle {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function arm(): void {
    if (stopped) return;
    const next = computeNext(new Date());
    timer = setTimeout(() => {
      if (stopped) return;
      task().finally(arm);
    }, msUntil(next, new Date()));
  }

  arm();
  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}

export interface Scheduler {
  stop: () => void;
}

// Runs one task and persists the outcome to scheduler_runs — shared by
// both the automatic clock (below) and the run_now MCP tool, so a
// manual trigger is recorded exactly the same way a scheduled one is,
// and run_now works identically whether or not the automatic scheduler
// is even running (SCHEDULER_DISABLED for local dev/tests). No live
// Scheduler object needed — just the already-open db handle.
export async function executeTaskAndRecord(db: DatabaseSync, task: SchedulerTask): Promise<SchedulerRun> {
  const runs = new SchedulerRunsRepository(db);
  const startedAt = new Date().toISOString();
  let result: TaskResult;
  try {
    result = await TASK_RUNNERS[task](db);
  } catch (cause) {
    // Last-resort safety net — every task function above already
    // catches its own steps and returns a TaskResult rather than
    // throwing. This only fires on a genuine bug in that contract, and
    // exists specifically so it can never crash the process (and take
    // the MCP server down with it) the way an uncaught rejection inside
    // a setTimeout callback otherwise would.
    const message = cause instanceof Error ? cause.message : String(cause);
    result = { status: "failure", summary: {}, error: message };
    logger.error("Scheduled task threw unexpectedly", { task, error: message });
  }
  const finishedAt = new Date().toISOString();

  const run = runs.create({
    task,
    status: result.status,
    started_at: startedAt,
    finished_at: finishedAt,
    error: result.error,
    summary: JSON.stringify(result.summary),
  });

  logger.info("Scheduled task complete", { task, status: result.status });
  return run;
}

// Decision #5/#8's one-combined-container topology: this runs in the
// same process as the MCP server (Phase 8), sharing the same already-
// open `db` handle. Node's single event loop means no real concurrency
// hazard with node:sqlite's synchronous calls (Decisions Log #1) — a
// scheduled task's DB writes and an MCP tool call never interleave
// mid-operation.
export function startScheduler(db: DatabaseSync): Scheduler {
  const discoveryTimes = computeDailyTimes(
    env.DISCOVERY_INTERVAL_HOURS,
    env.DISCOVERY_WINDOW_START_HOUR,
    env.DISCOVERY_WINDOW_END_HOUR,
  );
  const digestTime: TimeOfDay = { hour: env.DIGEST_HOUR, minute: env.DIGEST_MINUTE };
  const weeklyReportTime: TimeOfDay = { hour: env.WEEKLY_REPORT_HOUR, minute: env.WEEKLY_REPORT_MINUTE };

  const handles = [
    scheduleRecurring(
      (from) => nextDailyOccurrence(discoveryTimes, from),
      () => executeTaskAndRecord(db, "discovery_cycle"),
    ),
    scheduleRecurring(
      (from) => nextDailyOccurrence([digestTime], from),
      () => executeTaskAndRecord(db, "daily_digest"),
    ),
    scheduleRecurring(
      (from) => nextWeeklyOccurrence(env.WEEKLY_REPORT_DAY_OF_WEEK, weeklyReportTime, from),
      () => executeTaskAndRecord(db, "weekly_report"),
    ),
  ];

  logger.info("Scheduler started", {
    discoveryTimes: discoveryTimes.map((t) => `${t.hour}:00`),
    digestTime: `${digestTime.hour}:${String(digestTime.minute).padStart(2, "0")}`,
    weeklyReportDay: env.WEEKLY_REPORT_DAY_OF_WEEK,
    weeklyReportTime: `${weeklyReportTime.hour}:${String(weeklyReportTime.minute).padStart(2, "0")}`,
  });

  return {
    stop: () => handles.forEach((handle) => handle.stop()),
  };
}
