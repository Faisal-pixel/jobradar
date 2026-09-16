export const OUTREACH_CHANNELS = ["linkedin", "email", "twitter", "other"] as const;
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

export const OUTREACH_STATUSES = [
  "draft",
  "planned",
  "contacted",
  "responded",
  "no_response",
  "follow_up",
  "closed",
] as const;
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export interface Outreach {
  id: number;
  company_id: number | null;
  person_id: number | null;
  job_id: number | null;
  channel: OutreachChannel | null;
  date_contacted: string | null;
  status: OutreachStatus;
  response: string | null;
  follow_up_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type NewOutreach = Partial<Omit<Outreach, "id" | "created_at" | "updated_at">>;

export type OutreachPatch = Partial<Omit<Outreach, "id" | "created_at" | "updated_at">>;
