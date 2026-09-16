export const PERSON_CATEGORIES = [
  "founder",
  "cofounder",
  "ceo",
  "cto",
  "engineering_lead",
  "engineer",
  "recruiter",
  "hr",
  "talent",
  "other",
] as const;
export type PersonCategory = (typeof PERSON_CATEGORIES)[number];

export interface Person {
  id: number;
  company_id: number | null;
  name: string | null;
  role: string | null;
  category: PersonCategory | null;
  linkedin_url: string | null;
  email: string | null;
  source: string | null;
  source_url: string | null;
  confidence: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type NewPerson = Partial<Omit<Person, "id" | "created_at" | "updated_at">>;

export type PersonPatch = Partial<Omit<Person, "id" | "created_at" | "updated_at">>;
