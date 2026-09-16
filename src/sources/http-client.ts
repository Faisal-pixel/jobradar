import { logger } from "../shared/logger.js";

export const USER_AGENT = "JobRadar/1.0 (personal job-search tool; low-volume, rate-limited to ~1 req/sec)";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

// One entry per hostname, so every source adapter sharing this client
// gets throttled independently per host it talks to.
const lastRequestAtByHost = new Map<string, number>();

// Test-only: this module-level state is a deliberate singleton (it must
// throttle across every caller hitting the same host), which means it
// otherwise leaks between test cases. Not used by production code.
export function resetRateLimiterForTests(): void {
  lastRequestAtByHost.clear();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRateLimit(host: string, minIntervalMs: number): Promise<void> {
  const last = lastRequestAtByHost.get(host);
  const now = Date.now();
  if (last !== undefined) {
    const elapsed = now - last;
    if (elapsed < minIntervalMs) {
      await sleep(minIntervalMs - elapsed);
    }
  }
  lastRequestAtByHost.set(host, Date.now());
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export interface FetchWithRetryOptions {
  headers?: Record<string, string>;
  minIntervalMs?: number;
}

// Fetches a URL with an honest User-Agent, a per-host rate limit (default
// ~1 req/sec), a request timeout, and retry-with-backoff on transient
// failures (timeouts, network errors, 429, 5xx). Non-transient failures
// (404, other 4xx) are NOT retried — retrying a "this doesn't exist"
// response just wastes requests against someone else's site.
export async function fetchWithRetry(url: string, options: FetchWithRetryOptions = {}): Promise<Response> {
  const host = new URL(url).host;
  const minIntervalMs = options.minIntervalMs ?? 1000;

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await waitForRateLimit(host, minIntervalMs);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, ...options.headers },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) return response;
      if (!isRetryableStatus(response.status)) return response;

      lastError = new Error(`HTTP ${response.status} from ${url}`);
      logger.warn("Retryable HTTP status, will retry", { url, status: response.status, attempt });
    } catch (cause) {
      clearTimeout(timeout);
      lastError = cause;
      logger.warn("Fetch failed, will retry", { url, attempt, error: String(cause) });
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}
