import type { DatabaseSync } from "node:sqlite";
import type { SchedulerRun, NewSchedulerRun, SchedulerTask } from "../../domain/automation/scheduler-run.js";

export class SchedulerRunsRepository {
  constructor(private readonly db: DatabaseSync) {}

  create(input: NewSchedulerRun): SchedulerRun {
    const row = this.db
      .prepare(
        `INSERT INTO scheduler_runs (task, status, started_at, finished_at, error, summary)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING *`,
      )
      .get(input.task, input.status, input.started_at, input.finished_at, input.error ?? null, input.summary ?? null);
    return row as unknown as SchedulerRun;
  }

  // Powers get_automation_status: the one thing that answers "did this
  // task actually run, and when, and did it work" for each of the three
  // scheduled cadences.
  findLatestByTask(task: SchedulerTask): SchedulerRun | null {
    const row = this.db
      .prepare("SELECT * FROM scheduler_runs WHERE task = ? ORDER BY started_at DESC LIMIT 1")
      .get(task);
    return (row as unknown as SchedulerRun) ?? null;
  }

  listRecent(limit = 20): SchedulerRun[] {
    const rows = this.db.prepare("SELECT * FROM scheduler_runs ORDER BY started_at DESC LIMIT ?").all(limit);
    return rows as unknown as SchedulerRun[];
  }
}
