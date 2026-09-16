import { z } from "zod";

// Shape returned by GET /jobs/search?q=... (confirmed directly: real,
// public, unauthenticated JSON endpoint — see CLAUDE.md Decisions Log #11).
// Validated at runtime, not just typed: if the site changes this shape,
// we want a loud, catchable parse failure (recorded as a source-health
// failure), not a silently-wrong Job row.
export const waasSearchJobSchema = z.object({
  id: z.number(),
  title: z.string(),
  jobType: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  roleType: z.string().nullable().optional(),
  salary: z.string().nullable().optional(),
  companyName: z.string(),
  companySlug: z.string(),
  companyBatch: z.string().nullable().optional(),
  companyOneLiner: z.string().nullable().optional(),
  companyLogoUrl: z.string().nullable().optional(),
  companyLastActiveAt: z.string().nullable().optional(),
  applyUrl: z.string().nullable().optional(),
});
export type WaasSearchJob = z.infer<typeof waasSearchJobSchema>;

export const waasSearchResponseSchema = z.object({
  jobs: z.array(waasSearchJobSchema),
});

// Shape embedded in /jobs/{id}'s Inertia `data-page` payload (props.job).
export const waasJobDetailSchema = z.object({
  id: z.number(),
  title: z.string(),
  salaryRange: z.string().nullable().optional(),
  equityRange: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  jobType: z.string().nullable().optional(),
  sponsorsVisa: z.string().nullable().optional(),
  minExperience: z.string().nullable().optional(),
  skills: z.array(z.string()).nullable().optional(),
  descriptionHtml: z.string().nullable().optional(),
});
export type WaasJobDetail = z.infer<typeof waasJobDetailSchema>;

// Shape embedded in the same payload (props.company). founders/jobs are
// present in the real response but unused in Phase 2 (see CLAUDE.md
// Decisions Log — founder research is Phase 9), so they're left loose.
export const waasCompanyDetailSchema = z.object({
  name: z.string(),
  slug: z.string(),
  batch: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  teamSize: z.number().nullable().optional(),
  industry: z.string().nullable().optional(),
  industries: z.array(z.string()).nullable().optional(),
  founders: z.array(z.unknown()).optional(),
  jobs: z.array(z.unknown()).optional(),
});
export type WaasCompanyDetail = z.infer<typeof waasCompanyDetailSchema>;

export const waasJobDetailPagePropsSchema = z.object({
  job: waasJobDetailSchema,
  company: waasCompanyDetailSchema,
  // Sibling of `job` on the page, not nested inside it.
  applyUrl: z.string().nullable().optional(),
});
