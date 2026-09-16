export const SOURCE_HEALTH_STATUSES = ["healthy", "degraded", "failing"] as const;
export type SourceHealthStatus = (typeof SOURCE_HEALTH_STATUSES)[number];

export interface SourceHealth {
  source: string;
  status: SourceHealthStatus;
  last_success_at: string | null;
  last_failure_at: string | null;
  consecutive_failures: number;
  last_error: string | null;
  updated_at: string;
}
