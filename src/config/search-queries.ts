import { env } from "./env.js";

// Work at a Startup's /jobs/search endpoint has no working pagination
// (see CLAUDE.md Decisions Log #13), so discovery widens coverage by
// running several searches instead of one. This default list mirrors
// CLAUDE.md's candidate profile target titles/stack; override with a
// comma-separated SEARCH_QUERIES env var without touching adapter code.
export const DEFAULT_SEARCH_QUERIES: readonly string[] = [
  "backend engineer remote",
  "full-stack engineer TypeScript",
  "founding engineer Node.js",
  "distributed systems engineer",
  "API engineer",
];

export function getSearchQueries(): readonly string[] {
  if (!env.SEARCH_QUERIES) return DEFAULT_SEARCH_QUERIES;
  const queries = env.SEARCH_QUERIES.split(",")
    .map((q) => q.trim())
    .filter((q) => q.length > 0);
  return queries.length > 0 ? queries : DEFAULT_SEARCH_QUERIES;
}
