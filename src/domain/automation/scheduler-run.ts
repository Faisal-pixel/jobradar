export const SCHEDULER_TASKS = ["discovery_cycle", "daily_digest", "weekly_report"] as const;
export type SchedulerTask = (typeof SCHEDULER_TASKS)[number];

export const SCHEDULER_RUN_STATUSES = ["success", "failure"] as const;
export type SchedulerRunStatus = (typeof SCHEDULER_RUN_STATUSES)[number];

export interface SchedulerRun {
  id: number;
  task: SchedulerTask;
  status: SchedulerRunStatus;
  started_at: string;
  finished_at: string;
  error: string | null;
  // JSON text, not flattened columns — each task's shape genuinely
  // differs (see schema/scheduler-runs.ts). Parse with JSON.parse when
  // read; callers that just want to log/display it can treat it as an
  // opaque string.
  summary: string | null;
  created_at: string;
}

export type NewSchedulerRun = Omit<SchedulerRun, "id" | "created_at">;
