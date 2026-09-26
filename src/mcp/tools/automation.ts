import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type { McpServer } from "@modelcontextprotocol/server";
import { SchedulerRunsRepository } from "../../database/repositories/scheduler-runs-repository.js";
import { SCHEDULER_TASKS } from "../../domain/automation/scheduler-run.js";
import { executeTaskAndRecord } from "../../scheduler/scheduler.js";
import { computeDailyTimes, type TimeOfDay } from "../../scheduler/timing.js";
import { env } from "../../config/env.js";
import { toolResult } from "../tool-helpers.js";
import { logger } from "../../shared/logger.js";

function formatTime(time: TimeOfDay): string {
  return `${time.hour}:${String(time.minute).padStart(2, "0")}`;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function registerAutomationTools(server: McpServer, db: DatabaseSync): void {
  const runs = new SchedulerRunsRepository(db);

  server.registerTool(
    "get_automation_status",
    {
      title: "Get Automation Status",
      description:
        "Report whether the scheduler is running, its configured cadences, and the last run (when, success/" +
        "failure, and a summary) of each scheduled task: discovery_cycle (discovery + scoring + alerts + " +
        "Sheets sync), daily_digest (digest + bundled follow-up reminders), and weekly_report.",
      inputSchema: z.object({}),
    },
    async () => {
      const discoveryTimes = computeDailyTimes(
        env.DISCOVERY_INTERVAL_HOURS,
        env.DISCOVERY_WINDOW_START_HOUR,
        env.DISCOVERY_WINDOW_END_HOUR,
      );

      const latestByTask = Object.fromEntries(
        SCHEDULER_TASKS.map((task) => {
          const latest = runs.findLatestByTask(task);
          return [
            task,
            latest
              ? {
                  status: latest.status,
                  started_at: latest.started_at,
                  finished_at: latest.finished_at,
                  error: latest.error,
                  summary: latest.summary ? JSON.parse(latest.summary) : null,
                }
              : null,
          ];
        }),
      );

      return toolResult({
        schedulerEnabled: !env.SCHEDULER_DISABLED,
        cadences: {
          discovery_cycle: `every ${env.DISCOVERY_INTERVAL_HOURS}h at ${discoveryTimes.map(formatTime).join(", ")}`,
          daily_digest: `daily at ${formatTime({ hour: env.DIGEST_HOUR, minute: env.DIGEST_MINUTE })}`,
          weekly_report: `${WEEKDAY_NAMES[env.WEEKLY_REPORT_DAY_OF_WEEK]} at ${formatTime({ hour: env.WEEKLY_REPORT_HOUR, minute: env.WEEKLY_REPORT_MINUTE })}`,
        },
        lastRun: latestByTask,
      });
    },
  );

  server.registerTool(
    "run_now",
    {
      title: "Run Now",
      description:
        "Trigger a scheduled task immediately instead of waiting for its clock. Omit `task` to run all three " +
        "in order (discovery_cycle, then daily_digest, then weekly_report). Returns as soon as the run(s) are " +
        "started, not when they finish — discovery_cycle in particular can take well over a minute (multiple " +
        "rate-limited external requests), long enough to risk a client-side timeout if this waited. Check " +
        "get_automation_status shortly afterward for the real outcome, recorded to scheduler_runs exactly like " +
        "an automatic run — the same fire-and-forget pattern the scheduler's own clock already uses.",
      inputSchema: z.object({ task: z.enum(SCHEDULER_TASKS).optional() }),
    },
    async ({ task }) => {
      const tasksToRun = task ? [task] : [...SCHEDULER_TASKS];

      // Deliberately not awaited — see the description above and
      // Decisions Log. executeTaskAndRecord never throws (Decisions Log
      // #76's last-resort catch), so this .catch() is purely a defensive
      // backstop, not an expected path.
      void (async () => {
        for (const t of tasksToRun) {
          await executeTaskAndRecord(db, t).catch((cause: unknown) =>
            logger.error("run_now: unexpected error outside executeTaskAndRecord's own safety net", {
              task: t,
              error: cause instanceof Error ? cause.message : String(cause),
            }),
          );
        }
      })();

      return toolResult({
        status: "started",
        tasks: tasksToRun,
        note: "Started in the background — call get_automation_status shortly for the real outcome.",
      });
    },
  );
}
