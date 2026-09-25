export const SCHEDULER_RUNS_TABLE = "scheduler_runs";

// One row per invocation of a scheduled task (whether fired by the clock
// or triggered manually via run_now) — Phase 10's new coverage for the
// automation gap source_health/sheet_sync_status don't fill: those track
// "is the external site/API reachable," not "did our own cron job fire
// and finish." `task` is one of 'discovery_cycle' | 'daily_digest' |
// 'weekly_report' (the three real scheduled cadences — see CLAUDE.md
// Decisions Log). `summary` is free-form JSON text, not flat columns —
// each task's result shape genuinely differs (discovery_cycle's has
// four sub-steps, daily_digest's has two, weekly_report's has one), the
// same "whole object, never filtered by SQL WHERE" reasoning Decision
// #17 already applied to candidate_profile.
export const SCHEDULER_RUNS_CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS scheduler_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task          TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('success', 'failure')),
  started_at    TEXT NOT NULL,
  finished_at   TEXT NOT NULL,
  error         TEXT,
  summary       TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_scheduler_runs_task ON scheduler_runs(task, started_at DESC);
`;
