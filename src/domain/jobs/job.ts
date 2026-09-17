export const JOB_STATUSES = [
  "new",
  "reviewed",
  "qualified",
  "skipped",
  "applied",
  "interviewing",
  "rejected",
  "closed",
  "archived",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_FIT_CATEGORIES = ["A", "B", "skip"] as const;
export type JobFitCategory = (typeof JOB_FIT_CATEGORIES)[number];

export interface Job {
  id: number;
  company_id: number | null;
  title: string;
  location: string | null;
  remote: boolean | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  description: string | null;
  job_url: string | null;
  application_url: string | null;
  source: string;
  source_job_id: string;
  date_found: string | null;
  date_posted: string | null;
  fit_score: number | null;
  fit_category: JobFitCategory | null;
  fit_explanation: string | null;
  status: JobStatus;
  // NULL = never alerted via Telegram. Set the moment an instant
  // Category-A alert is sent (see services/notifications/job-alerts.ts)
  // so re-running send-alerts never re-notifies the same job.
  alerted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type NewJob = Pick<Job, "title" | "source" | "source_job_id"> &
  Partial<Omit<Job, "id" | "title" | "source" | "source_job_id" | "created_at" | "updated_at">>;

export type JobPatch = Partial<Omit<Job, "id" | "created_at" | "updated_at">>;
