export interface Company {
  id: number;
  name: string;
  website: string | null;
  domain: string | null;
  yc_batch: string | null;
  team_size: number | null;
  industry: string | null;
  description: string | null;
  funding: string | null;
  funding_stage: string | null;
  location: string | null;
  remote_policy: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type NewCompany = Pick<Company, "name"> &
  Partial<Omit<Company, "id" | "name" | "created_at" | "updated_at">>;

export type CompanyPatch = Partial<Omit<Company, "id" | "created_at" | "updated_at">>;
