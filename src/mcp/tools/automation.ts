import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type { McpServer } from "@modelcontextprotocol/server";
import { SchedulerRunsRepository } from "../../database/repositories/scheduler-runs-repository.js";
import { SCHEDULER_TASKS } from "../../domain/automation/scheduler-run.js";
import { executeTaskAndRecord } from "../../scheduler/scheduler.js";
import { computeDailyTimes, type TimeOfDay } from "../../scheduler/timing.js";
import { env } from "../../config/env.js";
import { toolResult } from "../tool-helpers.js";

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
        "in order (discovery_cycle, then daily_digest, then weekly_report). Recorded to scheduler_runs exactly " +
        "like an automatic run, so get_automation_status reflects it afterward.",
      inputSchema: z.object({ task: z.enum(SCHEDULER_TASKS).optional() }),
    },
    async ({ task }) => {
      const tasksToRun = task ? [task] : [...SCHEDULER_TASKS];
      const results = [];
      for (const t of tasksToRun) {
        const run = await executeTaskAndRecord(db, t);
        results.push({ ...run, summary: run.summary ? JSON.parse(run.summary) : null });
      }
      return toolResult(results);
    },
  );
}
