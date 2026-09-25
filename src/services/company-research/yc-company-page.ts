import { z } from "zod";
import { fetchWithRetry } from "../../sources/http-client.js";
import { extractInertiaPageProps } from "../../sources/workatastartup/parse.js";

// ycombinator.com/companies/<slug> is the same Inertia-page pattern Phase
// 2 already decoded for workatastartup.com (both are YC-family Rails+
// Inertia apps) — confirmed live during Phase 9 investigation, not
// assumed: fetched real pages for several companies already in the DB
// and found a structured `company` object with self-declared social
// links and a `founders[]` array, richer than what Work at a Startup's
// own payload exposes. No funding amount anywhere on this page for any
// company checked — consistent with Decisions Log #21, not a gap unique
// to Work at a Startup.
const ycFounderSchema = z.object({
  full_name: z.string(),
  title: z.string().nullable().optional(),
  founder_bio: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  twitter_url: z.string().nullable().optional(),
});

const ycCompanyPageSchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
  linkedin_url: z.string().nullable().optional(),
  twitter_url: z.string().nullable().optional(),
  github_url: z.string().nullable().optional(),
  cb_url: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  year_founded: z.number().nullable().optional(),
  ycdc_status: z.string().nullable().optional(),
  founders: z.array(ycFounderSchema).nullable().optional(),
});
export type YcCompanyPage = z.infer<typeof ycCompanyPageSchema>;

const YC_BASE_URL = "https://www.ycombinator.com";

// Y Combinator's slug convention, confirmed against several real company
// pages (lowercase, spaces/punctuation collapsed to single hyphens, e.g.
// "NOSO LABS" -> "noso-labs"). Only ever used as a single best-effort
// guess for companies discovered before migration 007 persisted the real
// slug — a wrong guess 404s cleanly (see fetchYcCompanyPage), it never
// silently returns another company's data.
export function guessCompanySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Returns null on a 404 (wrong guess, or the company has no YC page) —
// never throws for that case, since it's an expected, handled outcome,
// not a failure. Any other non-2xx, or a page whose shape doesn't match
// what's expected, throws loudly (same "don't silently return wrong
// data" policy Phase 2 already established for Work at a Startup).
export async function fetchYcCompanyPage(slug: string): Promise<YcCompanyPage | null> {
  const url = `${YC_BASE_URL}/companies/${slug}`;
  const response = await fetchWithRetry(url, { headers: { Accept: "text/html" } });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Y Combinator company page failed: HTTP ${response.status} for slug "${slug}"`);
  }

  const html = await response.text();
  const props = extractInertiaPageProps(html) as { company?: unknown };
  return ycCompanyPageSchema.parse(props.company);
}
