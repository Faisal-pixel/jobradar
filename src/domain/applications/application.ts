export const APPLICATION_STATUSES = [
  "planned",
  "applied",
  "screening",
  "technical",
  "onsite",
  "offer",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface Application {
  id: number;
  job_id: number | null;
  company_id: number | null;
  role: string | null;
  application_url: string | null;
  date_applied: string | null;
  status: ApplicationStatus;
  interview_stage: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type NewApplication = Partial<Omit<Application, "id" | "created_at" | "updated_at">>;

export type ApplicationPatch = Partial<Omit<Application, "id" | "created_at" | "updated_at">>;
