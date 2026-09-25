# JobRadar — Project Context

This file is read automatically at the start of every Claude Code session in this repo. It replaces re-explaining the project from scratch each time. If anything here goes stale as we build, update this file rather than letting it drift from reality.

## What This Is

JobRadar is Faisal's personal software-engineering job-search operating system — not a job scraper. It discovers jobs, filters them against his preferences, researches the companies and people behind them, tracks the full application/outreach pipeline, and surfaces all of it through Google Sheets, Telegram, and Claude Desktop (via MCP).

Two things working together:

1. **JobRadar itself** — the worker. Runs on a schedule, independent of Claude. Discovers → filters → saves → researches → syncs → notifies. This must work with zero Claude involvement.
2. **Claude Desktop** — the intelligent researcher/operator, layered on top via MCP. Claude reads/writes JobRadar's data through MCP tools; it does not replace the scheduler or run the core pipeline.

```
Claude Desktop  ──MCP──▶  JobRadar (MCP Server → App Services → SQLite)
                                        │
                              ┌─────────┼─────────┐
                         Google Sheets          Telegram
```

## Candidate Profile (Faisal)

Lives in the database as editable preferences, not hardcoded logic:

- Nigeria-based, targeting remote/international roles
- Target titles: Software Engineer, Full-Stack, Backend, Product Engineer, Founding Engineer, Early Engineer, Infrastructure/Distributed Systems Engineer, AI Engineer (where relevant)
- Stack interest: TypeScript, Node.js, React/Next.js, APIs, distributed systems, infra, fintech, identity/security, dev tools, IoT
- Company preference: early-stage / YC / seed–Series A; **5–30 employees is the sweet spot, 31–50 is secondary, 2–4 is opportunistic**
- Recent YC batch or recent funding = stronger signal

## Tech Stack

- **Language:** TypeScript, strict mode
- **Runtime:** Node.js (current supported LTS)
- **Database:** SQLite (source of truth — not Postgres, not in V1)
- **Validation:** Zod
- **Containerization:** Docker + Docker Compose
- **MCP:** current stable MCP TypeScript SDK v2 (`McpServer`, `registerTool()`, `registerResource()`, `registerPrompt()`, `serveStdio()`) — **not** the old monolithic `@modelcontextprotocol/sdk`
- **Notifications:** Telegram Bot API
- **Sheets sync:** Google Sheets API
- **No Anthropic/LLM API in V1.** Claude Desktop is the research interface for now; an AI provider can be added later without a rewrite.

## Layering Principle (non-negotiable)

```
Claude → MCP Tool → Application Service → Repository → SQLite
Scheduler → Domain Service → Source Adapter → External Source
```

MCP is an interface, not a place for logic. A tool handler calls a service; it never touches SQLite, never contains business rules. This keeps the same services reusable behind a future REST API, CLI, or dashboard.

## Folder Structure

```
jobradar/
├── src/
│   ├── app/                     # startup / wiring
│   ├── config/                  # env vars, secrets — never hardcoded elsewhere
│   ├── database/
│   │   ├── schema/               # table/entity definitions
│   │   ├── migrations/           # schema change history
│   │   └── repositories/         # ONLY thing allowed to touch SQLite directly
│   ├── domain/                  # plain definitions of Job/Company/Person/etc — no logic
│   │   ├── jobs/  companies/  people/  applications/  outreach/
│   │   ├── sources/  candidate-profile/  sheets/
│   ├── services/                # the actual thinking/business logic
│   │   ├── job-discovery/  company-research/  people-research/
│   │   ├── matching/  applications/  outreach/  notifications/  sheets/
│   ├── sources/                 # one folder per job source, same adapter interface
│   │   ├── workatastartup/       # this IS YC Jobs — see Decisions Log #10
│   ├── scheduler/                # WHEN things run — knows nothing about HOW
│   ├── shared/                   # logger, custom error classes — cross-cutting, no business logic
│   ├── mcp/
│   │   ├── server.ts  tools/  resources/  prompts/
│   └── index.ts
├── tests/
├── data/                         # SQLite file lives here, mounted as a Docker volume
├── credentials/                   # gitignored: google-client.json, google-token.json (Phase 4)
├── docker/  docker-compose.yml  Dockerfile
├── .env.example
```

## Database Schema (core entities)

**Job** — `id, company_id, title, location, remote, salary_min, salary_max, salary_currency, description, job_url, application_url, source, source_job_id, date_found, date_posted, fit_score, fit_category, fit_explanation, status, created_at, updated_at`
Status: `new → reviewed → qualified → skipped/applied → interviewing → rejected/closed → archived`

**Company** — `id, name, website, domain, yc_batch, team_size, industry, description, funding, funding_stage, location, remote_policy, notes, last_active, slug, created_at, updated_at`. `slug` added Phase 9 (migration 007) — the Work at a Startup / Y Combinator identifier `research_company` uses. linkedin/twitter/github/crunchbase deliberately **not** added as columns (Decisions Log #66-67) — Phase 9's `research_company`/`research_company_people` fetch and return them live instead of persisting them, since they're research-time lookups, not core discovered-job data.

**Person** — `id, company_id, name, role, category, linkedin_url, email, source, source_url, confidence, notes, created_at, updated_at`
Category: `founder | cofounder | ceo | cto | engineering_lead | engineer | recruiter | hr | talent | other`
**Hard rule: never invent names, emails, or LinkedIn URLs. Unknown = `null`, always.**

**Application** — `id, job_id, company_id, role, application_url, date_applied, status, interview_stage, rejection_reason, notes, created_at, updated_at`
Status: `planned → applied → screening → technical → onsite → offer/rejected → withdrawn`

**Outreach** — `id, company_id, person_id, job_id, channel, date_contacted, status, response, follow_up_date, notes, created_at, updated_at`
Channel: `linkedin | email | twitter | other` · Status: `draft → planned → contacted → responded/no_response → follow_up → closed`

Don't add fields "because they might be useful later." Extend when a real need shows up.

## Job Source Architecture

```ts
interface JobSource {
  name: string;
  discoverJobs(): Promise<Job[]>;
  getJob?(id: string): Promise<Job | null>;
  healthCheck(): Promise<SourceHealth>;
}
```

Each source (currently just `sources/workatastartup/` — see Decisions Log #10 on why there's no separate `ycombinator/` adapter) owns its own fetching, parsing, normalization, retries, and errors. The rest of the app never knows or cares where a job came from. **One source failing must never take down another or crash the scheduler** — catch, log, record health, continue, retry later.

Dedup on `source + source_job_id`, with a normalized `company + role + canonical_url` fallback for cross-source duplicates.

## Job Fit Scoring (100 pts)

`Technical Fit 25 · Company Stage/Team 15 · Funding/Hiring Signal 20 · Remote Eligibility 15 · Role Fit 15 · Founder Accessibility 10`
`80–100 = A · 65–79 = B · <65 = skip`

Every score must come with an explanation Claude/Faisal can query — never an opaque number. Weights live in config, not hardcoded, so they can be tuned later.

## Google Sheets

Separate sheets, never one crammed tab: **Jobs, Companies, People, Applications, Outreach.** SQLite stays the source of truth — Sheets is a synced view only, never written to directly by the app logic.

## MCP Surface

Group capabilities into a small number of flexible tools with rich filters — do **not** expose dozens of near-duplicate tiny tools (e.g. one `search_jobs` with filters, not `search_jobs_by_role` + `search_jobs_by_salary` + …).

Practical starting surface (build only what the current phase needs):
`search_jobs, get_job, run_source, get_source_status, get_company, research_company, research_company_people, get_company_jobs, get_company_people, find_people, get_person, save_person, update_person, research_job, get_candidate_profile, get_job_search_preferences, update_job_search_preferences, score_job, explain_job_score, list_applications, update_application, list_pending_outreach, update_outreach, sync_google_sheets, get_sheet_status, run_now, get_automation_status, get_system_health, get_errors, retry_failed_source`

Tool vs. resource: a **tool** does something (`get_candidate_profile()`); a **resource** is something Claude can just read. Phase 11 built exactly one — `candidate://profile` — after finding live that Claude Desktop can't have its model autonomously read a resource mid-conversation, only a manual user attach; `jobradar://jobs/new` and `company://{id}/people` were real candidates but deliberately not built, since that limitation would have been a regression for the tools they'd have replaced (Decisions Log #81-82).

**Safety rules, hard requirement:**
- Drafting tools (`draft_founder_message`, `draft_email`, …) produce text only. **Nothing sends automatically** — no `send_linkedin_message`, no `send_email` — until Faisal explicitly approves and a safe-sending integration is deliberately built.
- Nothing auto-applies to a job. The system tracks applications; it does not submit them.
- Destructive tools (`delete_job`, `delete_person`, `merge_duplicates`, `restore_database`) are clearly flagged as destructive in their descriptions.

The full 70+ tool capability catalog was scoped in planning but is **not** all built at once — see Phases below.

### Connecting Claude Desktop (Phase 7, Decision #49)

The server itself is plain Streamable HTTP, bound to `127.0.0.1:3939` (`http://127.0.0.1:3939/mcp`) — that never changes. Claude Desktop's `claude_desktop_config.json` cannot point at a local Streamable HTTP URL directly, so it spawns the community-standard `mcp-remote` bridge as a stdio subprocess instead, which itself speaks Streamable HTTP to the real server:

```json
{
  "mcpServers": {
    "jobradar": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:3939/mcp"]
    }
  }
}
```

Add this block to `claude_desktop_config.json` (Claude menu → Settings → Developer → Edit Config), then fully restart Claude Desktop. Prerequisite: `docker compose up` must already be running so something is listening on `127.0.0.1:3939` — `mcp-remote` has nothing to bridge to otherwise. No config changes needed if the server's port ever changes via `MCP_PORT` — just update the URL in `args`.

## Development Phases

Build in order. Do not jump ahead. Each phase ends with a report (format below) and waits for explicit go-ahead before the next one starts.

| Phase | Name | Delivers |
|---|---|---|
| 0 | Architecture & Plan | No code. Inspect repo/tools, propose schema/architecture/Docker/testing plan, flag decisions needing approval. |
| 1 | Foundation | TS project, SQLite schema, repositories, config, logging, error handling, Docker. `docker compose up` works. No external integrations. |
| 2 | Job Source Engine | Source adapter interface + YC + Work at a Startup, normalization, dedup, retries, source health. |
| 3 | Job Matching | Candidate profile, preferences, filtering, fit scoring + explanation. |
| 4 | Google Sheets | Auth + the 5 sheets + sync tools. SQLite stays canonical. |
| 5 | Telegram | Job alerts, daily digest, follow-up alerts, test notification. |
| 6 | Application + Outreach Pipeline | Full status tracking for both applications and outreach/follow-ups. |
| 7 | MCP Server | Wrap existing services in the starting tool surface above. No new business logic. |
| 8 | Claude Desktop Integration | Connect and prove real end-to-end workflows work. |
| 9 | Advanced Research | Funding/team/tech/hiring research tools, founder/CTO research, company comparison. |
| 10 | Automation | Full scheduler — discovery cadence, digests, follow-up reminders, weekly report. |
| 11 | Advanced MCP | Resources + prompts (`daily_job_hunt`, `research_company`, `weekly_job_review`, etc.). |
| 12 | Long-Running Tasks | "Research 30 companies" as a trackable background task (MCP Tasks extension), not a blocking call. |
| 13 | Future Sources | LinkedIn, HN Who's Hiring, Wellfound, Greenhouse, Lever, career pages — one at a time, same adapter interface. |

**Current phase: 11 — Advanced MCP (Resources + Prompts), complete.** Update this line as we progress.

## Decisions Log

Decisions made during Phase 0 review, approved 2026-09-16. Recorded here so they don't need re-explaining in a future session.

1. **SQLite library: `node:sqlite`** (Node's built-in module), not `better-sqlite3`. Reason: zero native-module build step, simpler Docker image. Trade-off accepted: fewer years of production hardening, no built-in `.transaction()` helper (transactions are hand-written with `BEGIN`/`COMMIT`/`ROLLBACK`).
2. **IDs: `INTEGER AUTOINCREMENT`**, not UUIDs. Simpler, smaller, faster joins — fine for a single-writer personal tool.
3. **Timestamps: `TEXT` ISO-8601 strings**, not unix epoch integers. Human-readable in a SQLite browser, sorts correctly as text.
4. **MCP transport: Streamable HTTP, bound to `127.0.0.1` only**, not stdio via `docker exec`. Claude Desktop connects to a localhost URL rather than spawning a subprocess inside the container.
5. **Docker topology: one combined container** running both the scheduler and the MCP server, not split into separate containers. Fewer moving parts for a personal tool.
6. **SQLite persistence: bind mount `./data:/app/data`**, not a named Docker volume. Lets the `.db` file be opened directly with a SQLite browser on the host for debugging.
7. **Test framework: Vitest**, not Jest. Native TS/ESM support, less config overhead.
8. **Added `src/shared/`** to the folder structure (not in the original CLAUDE.md tree) — home for the logger and custom error classes, both required by Phase 1 but with no other natural home.
9. **Zod: pinned to `4.6.5`** (latest at time of decision). Note for future sessions: Zod 4 has minor schema-API differences from Zod 3 — don't assume Zod 3 tutorials/examples apply directly.

Decisions made during Phase 2 investigation, approved 2026-09-16.

10. **One source adapter, not two: `sources/workatastartup/`, dropping `sources/ycombinator/`.** Confirmed by fetching `ycombinator.com/jobs` directly and decoding its embedded Inertia payload: it's a marketing landing page (`WaasLandingPage` component) with zero job listings — its only real content is links out to `workatastartup.com`. The actual job board lives entirely at `workatastartup.com/jobs`. "Work at a Startup" *is* YC Jobs, just under a different domain — there was never a second dataset to build a second adapter against.
11. **Discovery via `GET /jobs/search?q=...`**, a real, public, unauthenticated JSON endpoint (`{"jobs": [...]}`, `content-type: application/json` — confirmed directly, no HTML/Inertia parsing needed for this call). `discoverJobs()` runs a short, configurable list of search queries built from the candidate profile's target roles/stack (e.g. "backend engineer remote", "founding engineer Node.js") — one request per query, ~1 req/sec — instead of one fixed listing URL. Each query's results feed through the same dedup logic, so overlapping hits across queries collapse into one job record.
12. **Two-tier fetch: search (cheap) then detail (only for new jobs).** The search/list JSON gives id, title, company name/slug/batch, location, salary as one string, and a company one-liner — enough to detect whether a job is already known. Only jobs not already in the DB (by `source` + `source_job_id`) get a follow-up fetch to `/jobs/{id}` (an HTML page with a richer payload embedded as Inertia JSON: split salary/equity range, visa sponsorship, min experience, skills, full description, and full company detail) for full normalization. This keeps request volume proportional to *new* jobs per run, not total jobs.
13. **Pagination doesn't work on this site, on any endpoint tested.** Tried `page`, `offset`, `cursor`, `after`, and the proper Inertia partial-reload protocol (`X-Inertia` header + matching asset version) against both `/jobs` and `/jobs/search` — all capped at 30 results with no observed way to reach results 31+. The site reports ~2,850 total jobs; JobRadar cannot enumerate all of them without reverse-engineering the app's internals or automating a login, and neither is worth doing for a personal tool. Multi-query search (decision 11) widens coverage but this is explicitly **not exhaustive** — accepted as a known limitation, not silently ignored.
14. **Remote eligibility is inferred, not a real field.** Neither the search/list JSON nor the job-detail payload has a boolean/enum "remote" field anywhere. It's derived by pattern-matching the free-text `location` string (e.g. `/remote/i`). Treated in code and data as an inference, not a confirmed fact.
15. **Source health schema** (proposed in Phase 2 since CLAUDE.md didn't define one): a `source_health` table — one row per source — tracking `status` (`healthy`/`degraded`/`failing`), `last_success_at`, `last_failure_at`, `consecutive_failures`, `last_error`. `healthy` = last run succeeded; `degraded` = 1–2 consecutive failures (transient — site hiccup, timeout); `failing` = 3+ consecutive failures (something's actually broken, e.g. the site changed its HTML/JSON shape). Rationale: `get_source_status`/`get_system_health` (both already named in CLAUDE.md's MCP surface) need something to read, and "degraded" vs "failing" lets Faisal/Claude tell "probably fine, retry later" apart from "this adapter needs a fix."

Decisions made during Phase 3 investigation, approved 2026-09-16.

16. **Extended the Work at a Startup adapter (reopening Phase 2 code) to capture founders and company activity.** Both were already being fetched on every detail-page enrichment and silently discarded. `company.founders` (real name + LinkedIn, never fabricated) now becomes `Person` rows (`category: "founder"`), created only the moment a company is first seen — not backfilled onto an already-known company, same policy Phase 2 already applied to company fields. `companyLastActiveAt` (e.g. `"4 months ago"`) is now stored as `companies.last_active` — named without the `_at` suffix since it's a relative description, not a real ISO-8601 timestamp (would otherwise misleadingly imply decision #3's convention). Discovered during implementation: `last_active` only ever appears on the cheap search-tier response, never the detail tier — `SourceManager.enrich()` now explicitly merges it across tiers rather than letting detail-tier enrichment silently drop it (it would have, for nearly every job, since almost all persisted jobs go through enrichment).
17. **`candidate_profile` table: single row (`CHECK (id = 1)`), seeded from CLAUDE.md's own stated profile** so scoring works without Faisal configuring anything first. List/range preferences (`target_titles`, `stack_interest`, the three company-size tiers) are JSON-in-TEXT rather than flat columns — this row is always read as one whole object, never filtered by SQL `WHERE`. Editable later via `update_job_search_preferences` (Phase 7).
18. **`location_code` added to `candidate_profile`** (e.g. `"NG"`), alongside `location` (e.g. `"Nigeria"`) — found necessary during implementation: real Work at a Startup remote listings restrict by 2-letter country code (`"US / CA / GB / ..."`), never by full country name, so a name-only match would make Remote Eligibility's "explicitly includes the candidate's country" case effectively unreachable on real data.
19. **Missing-data policy for scoring, applied uniformly across all 6 dimensions:** when a dimension's required input is genuinely unavailable, it scores at 50% of its max, explicitly labeled `"(estimated — ...)"` in the explanation. Never silently 0 (unfairly punishes a job for a data gap that isn't its fault), never silently a confident number (would misrepresent genuine uncertainty).
20. **Filtering is a separate, query-time capability — not a pre-scoring gate.** Every discovered job gets a full 6-dimension score, always with an explanation, even one that's clearly inaccessible (e.g. on-site-only) — it lands low via Remote Eligibility with that reasoning stated, rather than being silently skipped with no explanation at all (which would cut against "every score must come with an explanation"). `JobsRepository.findByFilters()` (status/fitCategory/minFitScore/remoteOnly) is the query-time capability a future `search_jobs` MCP tool (Phase 7) will wrap.
21. **Funding/Hiring Signal (20pts) split into two sub-components**, since half its name is permanently unavailable from this source, not just per-job missing: recency (60% of the dimension — the better of YC batch age and `last_active` age, real data) and funding (40% — `company.funding`/`funding_stage`, which Work at a Startup never provides at all, confirmed during investigation; always scored at neutral with that limitation stated once, not treated as a per-job gap).
22. **Fit scoring weights live in `src/config/fit-scoring-weights.ts`**, individually overridable via `FIT_WEIGHT_*` env vars (same pattern as Phase 2's `search-queries.ts`), defaulting to CLAUDE.md's stated 25/15/20/15/15/10 — validated at startup to sum to 100. The A/80–B/65–skip category thresholds are fixed constants in the same file, not env-overridable — CLAUDE.md calls out weights specifically as tunable, not the thresholds, and a personal tool doesn't need a config knob for every constant.

Decisions made during Phase 4 investigation, approved 2026-09-17.

23. **Auth: OAuth 2.0 "Desktop app" flow, not a service account — changed mid-phase.** The original service-account plan was blocked by Faisal's actual Google Cloud org policy (`iam.disableServiceAccountKeyCreation`, confirmed via the Console UI, not assumed) preventing key creation. Switched to OAuth: a one-time browser sign-in as Faisal himself, using a Desktop-app OAuth client ID (`client_id`/`client_secret`, not a sensitive long-lived key), followed by a saved refresh token so every later run is unattended. Since auth is as Faisal's own account, the earlier "share the spreadsheet with a service account" step is gone — he just owns the sheet directly.
24. **Refresh token must come from a "published to production" OAuth consent screen, not left in "Testing."** Verified current Google policy: refresh tokens issued while the consent screen is in Testing status expire after 7 days regardless of test-user status — which would have silently broken "sign in once, never again" a week after setup. The `.../auth/spreadsheets` scope is "sensitive" (not "restricted"), so publishing to production needs no formal verification for a single-user app (Google explicitly exempts under-100-user apps) — just clicking through the one-time "unverified app" warning during Faisal's own sign-in.
25. **Loopback flow, not the old "out-of-band" copy-paste flow.** Google deprecated OOB in 2022. The one-time sign-in starts a temporary local HTTP server on an arbitrary free `http://127.0.0.1:<port>`, uses that as the OAuth redirect URI (Desktop-app clients accept any loopback port without pre-registering one), and captures the authorization code when Google redirects back after consent.
26. **The one-time sign-in must happen locally (`npm run dev`-style), not through `docker compose exec`.** The loopback server binds inside the container's network namespace, which the host browser can't reach without extra port-mapping plumbing — not worth building for a step that only ever runs once. `credentials/google-token.json` (bind-mounted, same pattern as `./data`) is what makes every later run — local or containerized — skip the browser entirely.
27. **Credential file layout**: `credentials/google-client.json` (the downloaded OAuth client — id/secret, not especially sensitive on its own) and `credentials/google-token.json` (the saved refresh token — at least as sensitive as the file it replaced). Both gitignored; `credentials/` bind-mounted into the container read-write (the token file gets written to it on first sign-in) rather than baked into the image.
28. **Sync strategy: full overwrite every run**, not incremental. Google's current documented Sheets API quota (300 read + 300 write requests/min per project, 60/min per user — verified, not assumed) makes this cheap: `spreadsheets.get` (check existing tabs) + one `batchUpdate` (add any missing tabs) + one `values.batchClear` + one `values.batchUpdate` (clear and rewrite all 5 tabs' data) — at most 4 calls per sync, regardless of row count. Full overwrite is also self-correcting: a partial failure mid-sync is silently fixed by the next successful run, since nothing here is incremental/diffed.
29. **`sheet_sync_status` table**, identical shape/reasoning to Phase 2's `source_health` (`status`/`last_success_at`/`last_failure_at`/`consecutive_failures`/`last_error`, same healthy/degraded/failing thresholds), keyed by `target` (currently just `"google_sheets"`). Backs the already-named `get_sheet_status` MCP tool (Phase 7) the same way `source_health` backs `get_source_status`.
30. **Sheet columns are joined/denormalized at sync time, not raw DB columns.** Foreign keys (`company_id`, `job_id`, `person_id`) become names/titles via lookup maps built once per sync — Sheets is a human-readable view (CLAUDE.md), and a spreadsheet full of numeric IDs wouldn't be one.
31. **Trigger: `sync-sheets` CLI command**, same pattern as `discover-jobs`/`score-jobs` — confirmed, no scheduler exists until Phase 10. Maps directly to CLAUDE.md's `sync_google_sheets` MCP tool name (Phase 7 wraps the same service, no new logic).
32. **CLI now exits explicitly (`process.exit()`) after `main()` resolves/rejects**, rather than relying on the event loop to drain naturally. Found live during the very first real OAuth sign-in verification: Google's HTTP client (`gaxios`, used internally by `googleapis`) leaves a keep-alive socket open, which silently hung the `sync-sheets` process after it had already finished all its work and printed "Sync complete." — needed a manual kill. Standard fix for a one-shot CLI; not worth chasing into gaxios's internals for a personal tool.

Decisions made during Phase 5 investigation, approved 2026-09-17.

33. **Job alerts fire on `fit_category='A'` only** — B counts belong in the daily digest as a summary, not an individual ping each; alerting on every B job would spam far more than it'd help. De-dup via a new `jobs.alerted_at` column (self-contained-ALTER migration, same pattern as `companies.last_active` — 001's frozen snapshot stays untouched). `send-alerts` queries `fit_category='A' AND alerted_at IS NULL`; one message's failure doesn't stop the others (same isolation spirit as `SourceManager`), and only successfully-sent jobs get `alerted_at` set.
34. **Daily digest is deliberately stateless** — a fixed 24h lookback window (`jobs.date_found >=`), no "last digest sent" tracking. Unlike alerts, a digest is a summary snapshot: re-running it and seeing overlapping content is harmless, so persisted cursor state would be complexity with no real payoff. `send-digest` always sends exactly one message, even a "0 new jobs" one.
35. **Follow-up alerts intentionally have no de-dup tracking either — but for the opposite reason from digest.** It's *correct* for `send-followups` to keep re-surfacing the same overdue Outreach row every run, for as long as its `follow_up_date` has passed and its `status` isn't `closed`/`responded`. The natural "stop reminding me" signal is Faisal updating that row's status — exactly what the field is for. Right now this always returns zero (Outreach is empty until Phase 6) — verified this returns a clean `{due: 0, sent: 0, failed: 0}` and sends nothing, not a crash or a fabricated "test" row.
36. **No persisted Telegram health table**, unlike `source_health`/`sheet_sync_status`. CLAUDE.md's MCP surface names `get_source_status` and `get_sheet_status` but no Telegram equivalent — treated as a deliberate omission, not an oversight. These commands are manually run today, so the command's own console output is the real-time feedback loop; a retrospective-query need (the actual reason the other two health tables exist) hasn't shown up yet. Failure handling is per-message instead: catch, log, and — the one piece worth a real implementation — honor Telegram's documented `429` `retry_after` (in seconds, confirmed from the live API docs) with exactly one retry before giving up.
37. **Telegram client is a plain `fetch` wrapper, no npm dependency.** The Bot API is a simple HTTPS/JSON REST API (confirmed from the live docs) — a library would add a dependency for something `fetch` already does in about 60 lines, consistent with how Phase 2 built its own lightweight HTTP client rather than depending on one.
38. **`get-telegram-chat-id` CLI helper**, wrapping `getUpdates`. The only way to learn a Telegram user's own chat_id is for them to message the bot first, then read it back off the API — this command does that read so Faisal never has to hand-parse raw JSON himself during setup.
39. **Fixed a real config bug found via live Docker testing, affecting Phase 4 too, not just Phase 5**: `docker-compose.yml`'s `${VAR:-}` substitution produces an empty string when the host has no such variable set — not an absent key. `z.string().min(1).optional()` rejects that empty string outright, so the container failed to start *at all* without Sheets/Telegram configured, defeating the entire point of making them optional. Fixed with a shared `optionalEnvString()` helper in `env.ts` that treats `""` the same as "not provided," applied to `GOOGLE_SHEETS_SPREADSHEET_ID`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, and `SEARCH_QUERIES`. This had been silently latent since Phase 4 — never triggered before because every prior Docker run happened to have `GOOGLE_SHEETS_SPREADSHEET_ID` set on the host.
40. **Fixed a second real gap, found while actually running `send-test` locally for the first time**: nothing ever loaded `.env` for local (non-Docker) runs — only `docker-compose` reads it, and only for its own variable substitution into the container's environment. `.env.example` had been documenting a convention that silently didn't work outside Docker since Phase 4. Fixed with Node's native `--env-file-if-exists=.env` flag (available in Node 24, no new dependency) on the `dev`/`cli`/`start` npm scripts — `-if-exists` specifically because plain `--env-file` hard-errors when the file is missing, which would break a fresh clone with no `.env` yet.

Decisions made during Phase 6 investigation, approved 2026-09-19.

41. **Corrected an assumption before building anything**: `ApplicationsRepository` and `OutreachRepository` already had full CRUD since Phase 1 — confirmed by reading the actual files, not assumed. The real gap was that nothing anywhere ever *called* `create()`/`update()` on either one (verified via grep — only read-only references, from Sheets sync and Phase 5's follow-up alerts). Phase 6 is the write path, not new repositories from scratch.
42. **`Job.status` <-> `Application.status`: one-way, partial auto-sync, not fully independent and not fully derived.** Creating/updating an Application nudges the linked Job's status forward via a fixed mapping (`applied`->`applied`, `screening`/`technical`/`onsite`->`interviewing`, `rejected`->`rejected`, `withdrawn`->`closed`); `planned` and `offer` map to nothing. Reasoning: fully independent risks exactly the drift this decision exists to prevent (an Application at "technical interview" while the Job still says "qualified"); fully auto-derived doesn't work because several Job states (`skipped`, `archived`, etc.) have no Application equivalent at all and need to stay under Faisal's direct control. `offer` deliberately maps to nothing rather than inventing a Job-level "offer" state CLAUDE.md never defined — Faisal decides what happens to the Job once there's a real offer. The sync logic lives in `ApplicationService`, not `ApplicationsRepository` — CLAUDE.md's layering principle keeps repositories as pure SQLite access with no business logic.
43. **Outreach never touches Job.status**, unlike Application. Outreach is a parallel channel — you might message a founder before, instead of, or without ever formally applying — and Job's status values have no clean "outreach in progress" equivalent. `OutreachService` intentionally has no Job-side effect at all.
44. **Status transitions are flexible, not enforced as a state machine.** Real hiring processes aren't linear — stages get skipped, rejections happen from any point, withdrawals happen any time. The only validation is what already existed: the DB `CHECK` constraints restricting each status field to its valid enum values (Phase 1). No new validation layer was added on top.
45. **`ApplicationsRepository.findByFilters`/`OutreachRepository.findByFilters`** added, mirroring `JobsRepository.findByFilters` (Phase 3) — status/jobId/companyId(/personId for Outreach). Powers `list-applications`/`list-outreach` and doubles as the "does this job already have an application?" check inside `ApplicationService`.
46. **Six new CLI commands** (`log-application`, `update-application`, `list-applications`, `log-outreach`, `update-outreach`, `list-outreach`), same flag-parsing pattern as every prior phase's commands. `log-application` requires at least one of `--job`/`--company`; when only `--job` is given, `company_id` is auto-derived from the job (but never overrides an explicit `--company`, since an Application can legitimately exist for a job JobRadar never discovered). `log-outreach` requires at least one of `--company`/`--person`/`--job`.
47. **Connects to Phase 5 with zero code changes there.** `send-followups` already queried `OutreachRepository.findDueFollowUps()` — it simply had nothing to find because nothing ever created an Outreach row. The moment `log-outreach` runs, follow-up alerts start working on real data.
48. **`OutreachService.logOutreach` now also auto-derives `company_id` from `job_id`** when only `--job` is given, never overriding an explicit `--company` — same pattern `ApplicationService.logApplication` already had. Originally left out of Phase 6's first pass (flagged as a known limitation in that phase's completion report: `log-outreach --job=1` alone left `company_id` null, so a follow-up alert for it read "Follow-up due: Unknown company"). Added on request immediately after, before the Phase 6 commit.

Decisions made during Phase 7 investigation and build, approved 2026-09-23.

49. **Corrected Decision #4, discovered before building anything: Claude Desktop's `claude_desktop_config.json` cannot point at a local Streamable HTTP URL directly**, and Claude.ai's Custom Connectors require public-internet reachability (localhost excluded) — confirmed via two independent research passes against official docs, not assumed. Decision #4's spirit (persistent Streamable HTTP service, not stdio via `docker exec`) stays intact; the fix is to also spawn the community-standard `mcp-remote` npm package as a stdio↔HTTP bridge from `claude_desktop_config.json`, so Desktop talks stdio to `mcp-remote`, which talks Streamable HTTP to the real server:
    ```json
    {
      "mcpServers": {
        "jobradar": {
          "command": "npx",
          "args": ["-y", "mcp-remote", "http://127.0.0.1:3939/mcp"]
        }
      }
    }
    ```
    No changes to the server itself — it stays plain Streamable HTTP, bound to `127.0.0.1`, exactly as Decision #4 already specified.
50. **MCP TypeScript SDK v2's split packages**: `@modelcontextprotocol/server` (`McpServer`, `registerTool`, `createMcpHandler`), `@modelcontextprotocol/node` (`toNodeHandler`, adapts the web-standard handler to Express/Node), `@modelcontextprotocol/express` (`createMcpExpressApp`, pre-wired DNS-rebinding/Origin protection when bound to localhost — verified live via a spoofed-`Host`-header curl request that correctly got HTTP 403). `@modelcontextprotocol/client` is dev-only (tests use it to drive the server over a real in-memory transport). Confirmed all at stable `2.0.0`, and confirmed exact signatures by reading the installed `.d.mts` files directly rather than trusting docs/memory.
51. **Layering relaxation, deliberate and scoped**: MCP tool handlers call repositories directly for logic-free reads/writes (`search_jobs`, `get_job`, `get_company`, `find_people`, `save_person`, `list_applications`, `list_pending_outreach`, `get_source_status`, `get_sheet_status`, …) — mirroring the CLI's established precedent every prior phase already set. Handlers go through an actual service only where real orchestration/business logic already lives: `ApplicationService` (Decision #42's status-sync), `OutreachService`, `ScoringPipeline`, `SheetsSyncService`, `SourceManager`, and the new `SystemHealthService`. CLAUDE.md's layering diagram is honored in spirit (MCP never contains business logic, never writes raw SQL) without inventing a placeholder service class for every single-line repository call.
52. **`score_job(job_id)`: new orchestration method on `ScoringPipeline`, reusing Phase 3's `scoreJob()` math — no new scoring logic.** Only advances `Job.status` from `'new'` to `'reviewed'`; never regresses a job that's already progressed further (e.g. to `'applied'` via Decision #42's Application-status sync) — re-scoring refreshes the fit fields but leaves a later status untouched. Throws `NotFoundError` for an unknown job id, caught and returned as a tool-level error rather than crashing the protocol connection.
53. **`get_candidate_profile` and `get_job_search_preferences` are two separate MCP tools that both read the same `candidate_profile` row.** CLAUDE.md names both in its tool list even though nothing currently distinguishes their outputs — kept separate rather than collapsed into one, since a future phase may split "identity" fields (location, target titles) from "preferences" fields (weights, thresholds) into genuinely different views.
54. **`get_system_health`/`get_errors`: a narrow rollup for now**, aggregating just `source_health` (Decision #15) and `sheet_sync_status` (Decision #29) — the only two persisted health tables that exist. No Telegram entry, consistent with Decision #36 (no persisted Telegram health table by design). `get_errors` filters both tables down to non-null `last_error` rows only. Expected to broaden once Phase 10's scheduler exists and there's more to aggregate.
55. **`list_pending_outreach` wraps `OutreachRepository.findDueFollowUps()` specifically** — the same strictly-overdue-or-due-today, still-open query Phase 5's automated follow-up alerts already use (Decision #35) — not a general status filter. `update_application` stays fully flexible with no new validation, per Decision #44 unchanged.
56. **`get_company_jobs` needed a `companyId` filter added to `JobsRepository.findByFilters`; `find_people` needed a new `PeopleRepository.findByFilters`** (case-insensitive partial name match, exact category match, AND-combined) — both small, additive repository changes, not new business logic. `PeopleRepository` had no dedicated test file before this phase despite having CRUD since Phase 1 (same gap Decision #41 found for Applications/Outreach); added one now, mirroring the existing repository test pattern.
57. **`omitUndefined<T>()` helper added to `src/mcp/tool-helpers.ts`**, fixing a recurring `exactOptionalPropertyTypes` failure: Zod's parsed tool-input objects always include every optional key (as `key: undefined`) rather than omitting it, which `Partial<T>`-typed repository/service methods reject under this project's strict tsconfig. A first attempt that only stripped keys at runtime didn't satisfy the type checker; the fix needed a mapped return type (`{ [K in keyof T]: Exclude<T[K], undefined> }`) so TypeScript itself knows every field is no longer possibly-`undefined`.
58. **Explicitly skipped this phase**: `research_company`, `research_company_people`, `research_job` (Phase 9 — Advanced Research), `get_automation_status`, `run_now` (Phase 10 — no scheduler exists yet), and a dedicated `explain_job_score` tool (`fit_explanation` already comes back on `get_job`; a separate tool would just duplicate it, not add capability).
59. **Resources and prompts deferred to Phase 11 in full**, resolving an apparent tension in CLAUDE.md's own text (it uses `get_candidate_profile()` as its illustrative *tool* example while also listing `candidate://profile` as a *resource* example in the same section). Everything Phase 7 names as a tool is built as a tool now; converting any of them to resources is left as a Phase 11 decision, not made implicitly here.
60. **`MCP_PORT` added to `env.ts` (default `3939`), but the bind host stays hardcoded `127.0.0.1` in `server.ts`, not env-configurable** — consistent with Decision #4's security posture; only the port is a legitimate per-environment knob. `docker-compose.yml` publishes `127.0.0.1:3939:3939`, never `0.0.0.0`, matching the server's own restriction. The Phase 1 heartbeat placeholder in `src/app/index.ts` is now the real MCP server as the persistent foreground process (Decision #5's one-combined-container topology unchanged).

Decisions made during Phase 8 investigation and build, approved 2026-09-23.

61. **Corrected Decision #4/#60: binding to `127.0.0.1` *inside* the Docker container makes the MCP server completely unreachable via `docker-compose.yml`'s own `ports:` mapping — not just off-LAN, unreachable from the host too.** Found live: `docker compose up` started cleanly and logged "listening," but every request (curl, raw `nc` bytes, even a plain GET) got an empty reply. Isolated with a controlled side-by-side test — two throwaway containers, one bound to `0.0.0.0` (reachable via its published port), one to `127.0.0.1` (unreachable, identical symptom) — proving the mechanism: Docker's port-publishing delivers host traffic over the container's bridge/NAT interface, which a loopback-bound socket never sees. Fix: new `MCP_HOST` env var (`src/config/env.ts`), defaulting to `127.0.0.1` for local (non-Docker) runs — matching Decision #4's original intent — with `docker-compose.yml` setting it to `0.0.0.0` explicitly. The actual "never reachable off this machine" guarantee now comes entirely from `docker-compose.yml`'s `127.0.0.1:3939:3939` host-side mapping, not the container's own bind address. Checked first, before changing anything: `createMcpExpressApp`'s `host` option (confirmed by reading the installed `.d.mts`) only configures DNS-rebinding/Origin header validation, not the TCP bind address — so it stays hardcoded to `"127.0.0.1"` in `server.ts` regardless of `MCP_HOST`, since host-side clients always send `Host: 127.0.0.1:<port>` whether connecting directly or via Docker's port-publish (which preserves the client's own Host header). Re-verified live post-fix: the same curl `initialize` request that previously got "Empty reply from server" now gets a real response, and the spoofed-Host DNS-rebinding rejection (HTTP 403) still fires correctly.
62. **Found live during Phase 8 testing, two compounding real bugs in `SourceManager`, both fixed**: (1) `enrich()` re-extracts `source_job_id` from the detail page's own payload rather than trusting the id it was fetched with (workatastartup's detail-page HTML can report a different id than the search-tier candidate did) — the dedup check that ran *before* enrichment was checking the wrong id, so `persist()` could crash with a `UNIQUE(source, source_job_id)` violation on a job that, under its *enriched* id, already existed. (2) That crash was caught by `runOne`'s single top-level try/catch, which discarded the whole run's progress and reported `jobsCreated: 0` — even though, live, 122 jobs had already been committed to the DB before the crashing candidate. Fixed with two changes: `persist()` now re-checks dedup using the final enriched `source_job_id` right before insert (skip, don't crash, if it turns out to already exist); the per-candidate enrich+persist step now has its own try/catch inside `runOne`'s loop, so one bad candidate is logged and skipped (via a new `jobsFailed` counter on `SourceRunResult`) without discarding every candidate processed before or after it. Extends CLAUDE.md's explicit "one source failing must never take down another" isolation principle one level deeper, to "one *candidate* failing must never take down the rest of that source's run" — the same reasoning, applied at finer grain once live testing showed it mattered in practice, not just in theory.
63. **Phase 8's "prove real end-to-end workflows work" was exercised as real JSON-RPC `tools/call` requests against the actual running Streamable HTTP server (the same wire protocol `mcp-remote` uses), not literally driven through the Claude Desktop GUI app.** Claude Code has no mechanism to operate a separate running GUI application's chat interface — that gap is real, not glossed over. All 9 proposed scenarios (discovery/scoring, company/people research, saving a real contact, application and outreach status walks with live `Job.status` sync verification, preferences read/update, Sheets sync error handling, system health, not-found handling) passed against the real container with real data, which is meaningfully stronger evidence than the unit/integration test suite alone (it caught decision #61 and #62, neither of which any existing test surfaced). The final "have an actual conversation in Desktop" pass is left for Faisal to do himself once the `mcpServers` config is pasted in — CLAUDE.md's `claude_desktop_config.json` is Desktop's own live, actively-used settings file (not a small dedicated MCP config), so editing it programmatically was deliberately left to a human, done with the app fully quit, rather than risking a race with the running app's own read/write of that file.

Decisions made during Phase 9 investigation and build, approved 2026-09-24.

64. **Funding research is explicitly out of scope, not a gap to quietly fill later.** Investigated three real candidate sources live: Y Combinator's own company pages (fetched real pages for several DB companies — no funding amount shown on any of them, consistent with Decisions Log #21, not a Work-at-a-Startup-specific gap), SEC EDGAR's free full-text-search API for Form D filings (real and free, but searching real company names like "Constant" and "Paradigm" returned dozens to 1,000+ unrelated entities with similar names — a genuine misattribution risk for short/generic startup names, not a hypothetical one), and Crunchbase (paid API; scraping is bot-protected/ToS-risk). Decision: don't build funding lookup at all this phase. `companies.funding`/`funding_stage` stay `null`, exactly as before — this is a deliberate scope cut, confirmed with Faisal before building anything, not a silent limitation to discover later.
65. **`companies.slug` added (migration 007, self-contained ALTER, same pattern as `last_active`/003).** Both Work at a Startup's search-tier and detail-tier payloads already carry this (`companySlug`/`slug`) — previously parsed and discarded. It's the same identifier Y Combinator's own company pages use (`ycombinator.com/companies/<slug>`), confirmed live by decoding real pages the same way Phase 2 decoded workatastartup's Inertia payloads: same Rails+Inertia stack, same `data-page` extraction technique (`extractInertiaPageProps`, reused directly). Now persisted going forward (`normalizeSearchJob`/`normalizeJobDetail`); for companies discovered before this migration, `research_company`/`research_company_people` fall back to a name-normalization guess (`guessCompanySlug` — lowercase, non-alphanumeric collapsed to hyphens, confirmed against several real companies), and backfill `companies.slug` the moment a guess resolves to a real page, so future calls don't re-guess. A wrong guess 404s cleanly — never silently returns another company's data.
66. **`research_company` found and surfaces fields Work at a Startup's own detail-page payload already carries but Phase 2 never parsed**: `techDescriptionHtml`, `hiringDescriptionHtml` (self-declared tech stack / hiring blurb; checked live — populated for 3 of 5 real companies sampled, a real hit rate not a dead field), `facebookUrl`, `twitterUrl`, and the plural `industries` (richer than the singular `industry` already stored). None of these are persisted onto the `companies` table (CLAUDE.md: don't add fields "because they might be useful later") — they're fetched fresh and returned only from `research_company`'s own response, via a new `WorkAtAStartupSource.getCompanyResearchDetail()` that reuses the exact same HTTP request `getJob()` already makes (no extra round-trip). `waasCompanyDetailSchema` extended accordingly; `stripHtml` (previously private to `workatastartup/parse.ts`) exported and reused, same HTML-stripping already applied to job descriptions.
67. **Every `research_company` field is tagged with exactly where it came from, never a flat merged blob** — `{ value, source }`, where `source` is either a specific provenance string (`"self-declared (Work at a Startup)"`, `"self-declared (Y Combinator)"`, `"public GitHub data — reflects public repos, not a confirmed company-wide stack"`) or a specific reason for `null` (`"not available — no known job listing for this company"`, `"...could not locate a Y Combinator page..."`, `"...not provided by Y Combinator"`, `"...no GitHub link declared"`). This is CLAUDE.md's "never fabricate" rule applied to research: a null always says why, distinguishing "we checked and found nothing" from "we didn't check" — extending the same spirit as Phase 3's `"(estimated — ...)"` labels. GitHub's public repos API is only ever called as a follow-up to a company's own self-declared `github_url` on its Y Combinator page — never a name-based search (confirmed live: searching GitHub for "adam" returns 2,297 unrelated results; following a self-declared link straight to the org's repos is reliable, real data).
68. **Found live, fixed before shipping: Y Combinator's own payload uses `""` for an unset link field, not `null`** (Adam's `cb_url` is `""`; Mason's `github_url` is `""`) — an early version of `research_company` passed these straight through as "found" values tagged `self-declared`, which is exactly the silent-wrong-data failure Decision #67 exists to prevent. Fixed generically in the shared `field()`/`isPresent()` helpers (empty string and empty array both count as "not present"), not patched per call site, plus a regression test built directly from this real fixture data. Live-verified against the real Docker container afterward: `crunchbaseUrl`/`githubUrl` on a real company now correctly read `null` with a "not provided" source when Y Combinator's page leaves them blank.
69. **`research_company_people` is read-only — it does not call `save_person` itself, even for a founder it finds that JobRadar didn't already know about** (cross-referenced against existing `people` rows by normalized name; unmatched founders come back with `matchedExistingPersonId: null`). Same principle as CLAUDE.md's drafting-tools rule ("nothing sends automatically") applied to research: surfacing a new fact and persisting it are different steps, and persisting stays an explicit action for Faisal/Claude via `save_person`. Scoped to founders only, per CLAUDE.md's confirmed decision — neither Work at a Startup nor Y Combinator publishes recruiters/engineers, and LinkedIn scraping was ruled out entirely (ToS/legal risk), not attempted as a partial workaround.
70. **`research_job` is also read-only — it re-fetches the live posting and reports `stillListed` plus a field-level diff (title/location/salary), but never writes the result back onto the stored `Job` row.** No MCP tool exists for a raw Job-field update outside `update_application`'s `Job.status` nudge (Decisions Log #42) — there's nowhere for this to safely write even if it wanted to. Full-text description changes are reported as a boolean flag, not a diffed value — a word-level diff of prose would be noisy (minor rewording reading as a "change") for no real benefit over "go look at this again."
71. **No `compare_companies` tool built.** CLAUDE.md's own MCP design principle ("a small number of flexible tools... not dozens of near-duplicate tiny tools") argues against one directly: `get_company` + `get_company_people` + `research_company` already return complete, structured per-company data, and Claude Desktop composing 2-3 calls per company in one conversation is comparison — a dedicated tool would just be a thin wrapper calling the others twice. Confirmed with Faisal before skipping it, not assumed.

Decisions made during Phase 10 investigation and build, approved 2026-09-25.

72. **The scheduler wires existing services to a clock — no new business logic for discovery/scoring/Sheets sync/alerts/digest/follow-ups.** Every CLI command from Phases 2-6 (`discover-jobs`, `score-jobs`, `sync-sheets`, `send-alerts`, `send-digest`, `send-followups`) was already a thin wrapper around one service's `.run()`/`.sync()` method — confirmed by reading each one, not assumed. The only genuinely new pieces this phase: the scheduler itself (nothing like it existed), `WeeklyReportService` (no prior equivalent), and failure isolation at the scheduler layer (see #76).
73. **Cadences confirmed with Faisal, not silently picked**: discovery/scoring/alerts/Sheets sync every 3h within an 8am-22:00 window (5 fixed daily slots: 8, 11, 14, 17, 20 — not a plain interval-from-startup, so the schedule never drifts across restarts); the combined digest+follow-ups message at 12:30pm; the weekly report Sunday at 19:00. All configurable via new env vars (`DISCOVERY_INTERVAL_HOURS`, `DISCOVERY_WINDOW_START_HOUR`/`_END_HOUR`, `DIGEST_HOUR`/`_MINUTE`, `WEEKLY_REPORT_DAY_OF_WEEK`/`_HOUR`/`_MINUTE`), defaulting to exactly what was confirmed. All wall-clock, not UTC: `docker-compose.yml` now sets `TZ=Africa/Lagos` — verified live that `node:24-alpine`'s tzdata resolves it correctly (Node's `Date` methods reflect West Africa Time even though the container OS clock itself still reports UTC, which is what actually matters since the scheduler is pure Node code).
74. **Sheets sync is tied to the discovery cycle, not its own timer** (Faisal's decision) — runs as the last step of `discovery_cycle`, after alerts. Cheap and self-correcting either way (Decision #28), so no real cost to coupling it; one fewer clock to reason about.
75. **Follow-up reminders are bundled into the daily digest as one combined Telegram message, not a separate send** (Faisal's decision). `DailyDigestService`/`FollowUpAlertsService` each gained a read-only, no-send method (`buildMessage()` / `findDue()`) specifically so the scheduler could compose their content into one message without duplicating either service's query logic. Their existing `run()` methods (and the `send-digest`/`send-followups` CLI commands) are unchanged — each still sends its own separate message when invoked directly; the bundling is scheduler-specific orchestration, not a behavior change to the underlying services.
76. **Failure isolation lives in the scheduler layer, not as a change to `DailyDigestService`/`FollowUpAlertsService`'s own throw-on-failure behavior** (which is correct and unchanged for interactive CLI use — an uncaught rejection there is supposed to print an error and set a nonzero exit code). Every scheduled task function (`runDiscoveryCycle`/`runDailyDigest`/`runWeeklyReport`) catches each of its own steps individually and returns a result rather than throwing — found live during design that `SheetsSyncService.sync()` re-throws after recording to `sheet_sync_status`, so without this, one failed Sheets sync would have silently discarded whatever discovery/scoring/alerts had already accomplished in the same cycle. `executeTaskAndRecord` (`src/scheduler/scheduler.ts`) adds one more layer on top — a last-resort catch that exists purely so a genuine bug in a task function can never throw uncaught inside a `setTimeout` callback and crash the whole process, taking the MCP server down with it (Decision #5/#8's shared-process topology).
77. **New `scheduler_runs` table**, as proposed: one row per task invocation (scheduled or manual via `run_now`), tracking `task`/`status`/`started_at`/`finished_at`/`error`/`summary` (JSON text, not flattened columns — each task's result shape genuinely differs). Deliberately separate from `source_health`/`sheet_sync_status`, which answer "is the external site/API reachable" — a different question from "did our own cron job fire and finish," which neither of those tables could answer for scoring/alerts/digest/follow-ups/weekly-report (0 of 7 scheduled operations had this before; discovery and Sheets sync already had their own external-reachability tracking, which stays as-is).
78. **Scheduler implementation: hand-rolled, no new dependency** (Faisal's decision, matching Decision #37's precedent). Two pure, directly-unit-testable primitives cover every cadence: `computeDailyTimes`/`nextDailyOccurrence` (fixed daily wall-clock slots) and `nextWeeklyOccurrence` (a specific weekday+time) — both take an explicit `from` parameter rather than reading the real clock, so they're tested without fake timers at all. `scheduleRecurring` (impure, real `setTimeout`) anchors to the next real occurrence and re-arms after each fire — never a plain `setInterval` from process start, which would drift across container restarts.
79. **`run_now`/`get_automation_status` don't depend on a live `Scheduler` singleton object.** `executeTaskAndRecord(db, task)` — the same function both the automatic clock and `run_now` call — only needs the already-open `db` handle, not a reference threaded through from `app/index.ts`'s `startScheduler()` call. This means `run_now` works identically whether or not the automatic scheduler is even running (`SCHEDULER_DISABLED`, a local-dev/test escape hatch never set in `docker-compose.yml`), and kept `mcp/server.ts`'s per-request factory function (Decision #50) from needing to thread a scheduler reference through it.
80. **Weekly report content is grounded in what's actually queryable, not a wishlist** — confirmed live against real production data (`run_now weekly_report` sent a real report to Faisal's real Telegram during Phase 10 verification, not just a test fixture). Jobs discovered (by fit category), new/updated applications (current-status snapshot, never a "moved from X to Y" transition — no status-history table exists to know that), new outreach (by channel), an approximate lifetime response rate (responded ÷ ever-contacted as of report time — there's no separate "responded at" timestamp to scope it precisely to the week), and outreach still overdue. Two new repository methods, `findCreatedSince`/`findUpdatedSince`, added to both `ApplicationsRepository` and `OutreachRepository`, mirroring `JobsRepository.findDiscoveredSince`'s existing shape.

Decisions made during Phase 11 investigation and build, approved 2026-09-25.

81. **Resolves Decision #59's deferred question: only `candidate://profile` becomes a resource, nothing else.** Verified protocol-level (registerResource/registerPrompt read directly off the installed SDK, not assumed) that a resource is a read-only, addressable GET, while a tool is model-invoked and can take rich filters. Checked all 29 existing tools against that distinction; `candidate://profile` is the one genuinely strong fit — singular, rarely changes, and the real usage pattern ("attach once as session background context") is exactly what a resource is good at and a repeated tool call isn't. `get_candidate_profile`/`get_job_search_preferences` are unchanged — this is an addition, not a replacement, confirmed with Faisal rather than assumed.
82. **`company://{id}/people` and the curated-view resources (`jobs/new`, pending-outreach) — both real candidates from the investigation — were explicitly not built, confirmed with Faisal.** The deciding factor, verified live rather than assumed: Claude Desktop (CLAUDE.md's actual target client for day-to-day use) has no dedicated resource-browsing UI and — critically — **the model cannot autonomously read a resource mid-conversation there**, only a manual "+ → Add from" attach the user has to click themselves, with an open unresolved bug about items not reliably appearing. Converting an autonomously-useful tool to a resource would have been a real regression for Desktop; `get_company_people` and the filterable job/outreach tools stay exactly as they are.
83. **Claude Code fully supports both primitives** (prompts as `/mcp__jobradar__<name>` slash commands, resources as `@jobradar:jobradar://...` mentions, plus model-autonomous resource access via its own built-in `ListMcpResourcesTool`/`ReadMcpResourceTool`) — verified against a real, closed GitHub issue confirming that mechanism, and confirming its one known bug (HTTP-direct MCP connections only) does **not** affect our actual setup, which connects through the `mcp-remote` stdio bridge (Decision #49).
84. **Prompts are never autonomously suggested by Claude in either client — confirmed via a closed "not planned" Anthropic issue, not assumed.** They exist purely as user-invoked shortcuts (a slash command in Code, a "+" attach in Desktop) that save Faisal re-typing a routine request, not as something that changes Claude's spontaneous behavior. Set real expectations for all four prompts below: none of them make Claude proactively do anything it wasn't already going to do.
85. **All four prompts return pure instructional text naming the exact tools to call and how to synthesize the results — none of them call a tool or touch `db` themselves.** A prompt only returns a canned starter message (verified: `registerPrompt`'s callback returns `{ messages }`, not data); the actual tool-calling happens afterward as Claude responds to that seeded message using its normal tool use. This kept every prompt registration simple (`registerXPrompt(server)`, no `db` parameter) and avoided any need to duplicate query logic that already lives in the tool/service layer.
86. **`company_deep_dive`, not `research_company`, for the company-research prompt** (Faisal's naming decision) — avoids colliding with the existing `research_company` *tool* name. Different MCP namespaces mean there's no technical conflict, but the same name in both the tool list and the prompt list would be confusing for a human reading either one.
87. **`weekly_job_review` explicitly instructs Claude not to call `run_now`.** Found during design, before it became a real bug: `run_now("weekly_report")` sends a real Telegram message as a side effect (Phase 10) — an on-demand conversational review that casually triggered it would spam Faisal's own phone with a duplicate report every time he asked for a review. The prompt instead tells Claude to gather the same underlying picture itself via the existing read-only tools (`search_jobs`, `list_applications`, `list_pending_outreach`, `get_automation_status` for context only), matching Decision #75/#76's care around notification side effects.
88. **`prep_for_outreach` explicitly tells Claude it can't check prior outreach history and to ask Faisal directly, rather than silently assuming a clean slate.** Found while designing it: no MCP tool exposes a company's *full* outreach history — only `list_pending_outreach` (strictly overdue, Decision #55) and `update_outreach` (a single known row). Building a new tool to close that gap was out of scope for a resources-and-prompts phase, so the prompt names the real limitation instead of quietly working around it or pretending the data doesn't matter.

## Development Rules (non-negotiable)

1. **Don't jump ahead.** Stay inside the current phase's scope.
2. **Explain before major architectural decisions** — Faisal is learning while building this.
3. **Prefer simple.** No Kubernetes, microservices, Redis, Kafka, RabbitMQ, Postgres, AWS, or complex cloud infra unless a real need forces it. SQLite + Docker + Node is enough.
4. **No AI/Anthropic API dependency in V1.** Claude Desktop/Code are the research interface; don't assume API credits exist. Design so a provider can be plugged in later.
5. **Never fabricate data** — emails, LinkedIn URLs, people, funding, job details. Unknown = `null`, always.
6. **Don't silently make significant assumptions.** Surface anything that meaningfully affects the architecture.
7. **TypeScript strict mode**, typed domain models, validated external input, explicit error handling.
8. **Every external integration needs failure handling.** The internet will fail; JobRadar shouldn't.
9. **Write tests alongside the functionality**, not all at the end.
10. **Keep MCP thin** — it calls services, it doesn't contain them.
11. **SQLite is the source of truth.** Google Sheets is a synced view, never primary.
12. **Don't overengineer.** This is a personal tool first.

## Working Style

Faisal is learning while building this — don't dump large blocks of code unexplained.

For each phase: explain what we're building and why → show the architecture → break it into small steps → implement one step → test it → explain what changed → move to the next step. Favor "think of it like…" plain-language explanations over jargon-first ones.

## Phase Completion Report Format

End every phase with exactly this, then stop and wait:

```
PHASE COMPLETE
What we built:
Files created:
Files changed:
Tests:
How to run:
What I learned:
Known limitations:
Next phase:
```
