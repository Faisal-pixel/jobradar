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

**Company** — `id, name, website, domain, yc_batch, team_size, industry, description, funding, funding_stage, location, remote_policy, notes, created_at, updated_at` (future: linkedin, twitter, github, crunchbase, employee_growth, tech_stack)

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

Tool vs. resource: a **tool** does something (`get_candidate_profile()`); a **resource** is something Claude can just read (`candidate://profile`, `jobradar://jobs/new`, `company://{id}/people`, etc.).

**Safety rules, hard requirement:**
- Drafting tools (`draft_founder_message`, `draft_email`, …) produce text only. **Nothing sends automatically** — no `send_linkedin_message`, no `send_email` — until Faisal explicitly approves and a safe-sending integration is deliberately built.
- Nothing auto-applies to a job. The system tracks applications; it does not submit them.
- Destructive tools (`delete_job`, `delete_person`, `merge_duplicates`, `restore_database`) are clearly flagged as destructive in their descriptions.

The full 70+ tool capability catalog was scoped in planning but is **not** all built at once — see Phases below.

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

**Current phase: 5 — Telegram, in progress.** Update this line as we progress.

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
