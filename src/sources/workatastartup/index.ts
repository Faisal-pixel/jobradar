import { fetchWithRetry } from "../http-client.js";
import type { JobSource, DiscoveredJob, SourceHealthCheck } from "../job-source.js";
import { getSearchQueries } from "../../config/search-queries.js";
import { logger } from "../../shared/logger.js";
import { waasSearchResponseSchema, waasJobDetailPagePropsSchema, type WaasCompanyDetail } from "./types.js";
import { SOURCE_NAME, normalizeSearchJob, normalizeJobDetail, extractInertiaPageProps } from "./parse.js";

const BASE_URL = "https://www.workatastartup.com";

export class WorkAtAStartupSource implements JobSource {
  readonly name = SOURCE_NAME;

  async discoverJobs(): Promise<DiscoveredJob[]> {
    const queries = getSearchQueries();
    // Keyed by numeric job id so the same job surfacing in multiple
    // searches (e.g. "backend engineer" and "API engineer" both matching
    // the same posting) collapses to one entry before it ever reaches
    // the dedup logic in SourceManager.
    const candidatesById = new Map<number, DiscoveredJob>();

    for (const query of queries) {
      const url = `${BASE_URL}/jobs/search?q=${encodeURIComponent(query)}`;
      const response = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        throw new Error(`Work at a Startup search failed: HTTP ${response.status} for query "${query}"`);
      }

      const body = await response.json();
      const parsed = waasSearchResponseSchema.parse(body);

      for (const rawJob of parsed.jobs) {
        if (!candidatesById.has(rawJob.id)) {
          candidatesById.set(rawJob.id, normalizeSearchJob(rawJob));
        }
      }
      logger.debug("Work at a Startup search complete", { query, resultCount: parsed.jobs.length });
    }

    return [...candidatesById.values()];
  }

  async getJob(sourceJobId: string): Promise<DiscoveredJob | null> {
    const props = await this.fetchJobDetailPage(sourceJobId);
    if (!props) return null;
    return normalizeJobDetail(props.job, props.company, props.applyUrl);
  }

  // Phase 9: research_company needs fields normalizeJobDetail deliberately
  // drops (techDescriptionHtml, hiringDescriptionHtml, facebookUrl,
  // twitterUrl — not persisted company columns, see waasCompanyDetailSchema).
  // Reuses the same fetch — no extra request beyond what getJob already
  // makes for the same job id.
  async getCompanyResearchDetail(sourceJobId: string): Promise<WaasCompanyDetail | null> {
    const props = await this.fetchJobDetailPage(sourceJobId);
    return props?.company ?? null;
  }

  private async fetchJobDetailPage(sourceJobId: string) {
    const url = `${BASE_URL}/jobs/${sourceJobId}`;
    const response = await fetchWithRetry(url, { headers: { Accept: "text/html" } });

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Work at a Startup job detail failed: HTTP ${response.status} for job ${sourceJobId}`);
    }

    const html = await response.text();
    return waasJobDetailPagePropsSchema.parse(extractInertiaPageProps(html));
  }

  async healthCheck(): Promise<SourceHealthCheck> {
    try {
      const url = `${BASE_URL}/jobs/search?q=engineer`;
      const response = await fetchWithRetry(url, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        return { healthy: false, message: `HTTP ${response.status}` };
      }
      return { healthy: true };
    } catch (cause) {
      return { healthy: false, message: String(cause) };
    }
  }
}
