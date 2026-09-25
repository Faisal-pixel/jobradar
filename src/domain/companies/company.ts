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
  // Relative description as of discovery time (e.g. "4 months ago"), not
  // a real timestamp — see migration 003_company_last_active.
  last_active: string | null;
  // Y Combinator / Work at a Startup's own identifier, e.g. "mason" for
  // ycombinator.com/companies/mason — see migration 007_company_slug.
  slug: string | null;
  created_at: string;
  updated_at: string;
}

export type NewCompany = Pick<Company, "name"> &
  Partial<Omit<Company, "id" | "name" | "created_at" | "updated_at">>;

export type CompanyPatch = Partial<Omit<Company, "id" | "created_at" | "updated_at">>;
