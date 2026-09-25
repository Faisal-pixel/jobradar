import { z } from "zod";
import { fetchWithRetry } from "../../sources/http-client.js";

// Only ever called with a github_url the company itself declared on its
// YC page — never a name-based search. Confirmed live during Phase 9
// investigation: searching GitHub by company name is unreliable (a
// generic name like "adam" returns thousands of unrelated results), but
// following a self-declared org link straight to its public repos is
// real, low-risk data.
const githubRepoSchema = z.object({
  name: z.string(),
  language: z.string().nullable(),
  stargazers_count: z.number(),
  fork: z.boolean(),
});

export interface GithubRepoSignal {
  repo: string;
  language: string | null;
  stars: number;
}

// Extracts the org login from a URL like "https://github.com/Adam-CAD".
// Returns null for anything that isn't a plain github.com/<org> URL (a
// link to a specific repo or user profile, an unrelated domain, etc.) —
// those aren't worth guessing at further.
export function extractGithubOrg(githubUrl: string): string | null {
  try {
    const url = new URL(githubUrl);
    if (!/(^|\.)github\.com$/.test(url.hostname)) return null;
    const [org] = url.pathname.split("/").filter(Boolean);
    return org ?? null;
  } catch {
    return null;
  }
}

// Unauthenticated GitHub API: 60 requests/hour, confirmed live. Fine for
// on-demand personal use (this only ever runs when Claude/Faisal asks for
// company research, not on a schedule) — not worth a token/auth setup
// for that volume. A rate-limit response (403) or a missing/renamed org
// (404) both return null here rather than throwing — this is a nice-to-
// have signal, not something a research call should fail over.
export async function fetchGithubOrgSignal(githubUrl: string): Promise<GithubRepoSignal[] | null> {
  const org = extractGithubOrg(githubUrl);
  if (!org) return null;

  const response = await fetchWithRetry(`https://api.github.com/orgs/${org}/repos?per_page=10&sort=pushed`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) return null;

  const repos = z.array(githubRepoSchema).parse(await response.json());
  return repos
    .filter((repo) => !repo.fork)
    .map((repo) => ({ repo: repo.name, language: repo.language, stars: repo.stargazers_count }));
}
