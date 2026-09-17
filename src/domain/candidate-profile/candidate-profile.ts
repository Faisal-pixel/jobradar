export interface CompanySizeRange {
  min: number;
  max: number;
}

// Single-row entity — there is exactly one candidate. id is always 1
// (enforced by the table's CHECK (id = 1)).
export interface CandidateProfile {
  id: 1;
  location: string | null;
  location_code: string | null;
  target_titles: string[];
  stack_interest: string[];
  company_size_sweet_spot: CompanySizeRange | null;
  company_size_secondary: CompanySizeRange | null;
  company_size_opportunistic: CompanySizeRange | null;
  prefer_recent_yc_batch: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CandidateProfilePatch = Partial<Omit<CandidateProfile, "id" | "created_at" | "updated_at">>;
