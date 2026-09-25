import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { McpServer } from "@modelcontextprotocol/server";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import type { CallToolResult } from "@modelcontextprotocol/client";
import { createTestDb } from "../test-helpers/create-test-db.js";
import { registerJobTools } from "../../src/mcp/tools/jobs.js";
import { registerCompanyTools } from "../../src/mcp/tools/companies.js";
import { registerPeopleTools } from "../../src/mcp/tools/people.js";
import { registerPreferencesTools } from "../../src/mcp/tools/preferences.js";
import { registerApplicationTools } from "../../src/mcp/tools/applications.js";
import { registerOutreachTools } from "../../src/mcp/tools/outreach.js";
import { registerSourceTools } from "../../src/mcp/tools/sources.js";
import { registerSheetsTools } from "../../src/mcp/tools/sheets.js";
import { registerSystemTools } from "../../src/mcp/tools/system.js";
import { registerResearchTools } from "../../src/mcp/tools/research.js";
import { CompaniesRepository } from "../../src/database/repositories/companies-repository.js";
import { JobsRepository } from "../../src/database/repositories/jobs-repository.js";
import { ApplicationsRepository } from "../../src/database/repositories/applications-repository.js";
import { OutreachRepository } from "../../src/database/repositories/outreach-repository.js";

const EXPECTED_TOOL_NAMES = [
  "search_jobs",
  "get_job",
  "score_job",
  "get_company",
  "get_company_jobs",
  "get_company_people",
  "get_person",
  "save_person",
  "update_person",
  "find_people",
  "get_candidate_profile",
  "get_job_search_preferences",
  "update_job_search_preferences",
  "list_applications",
  "update_application",
  "list_pending_outreach",
  "update_outreach",
  "get_source_status",
  "run_source",
  "retry_failed_source",
  "sync_google_sheets",
  "get_sheet_status",
  "get_system_health",
  "get_errors",
  "research_company",
  "research_company_people",
  "research_job",
];

function jsonOf(result: CallToolResult): unknown {
  const text = result.content[0];
  if (!text || text.type !== "text") throw new Error("expected a text content block");
  return JSON.parse(text.text);
}

describe("MCP server (real protocol, in-memory transport)", () => {
  let db: DatabaseSync;
  let client: Client;
  let server: McpServer;

  beforeEach(async () => {
    db = createTestDb();
    server = new McpServer({ name: "jobradar", version: "1.0.0" });
    registerJobTools(server, db);
    registerCompanyTools(server, db);
    registerPeopleTools(server, db);
    registerPreferencesTools(server, db);
    registerApplicationTools(server, db);
    registerOutreachTools(server, db);
    registerSourceTools(server, db);
    registerSheetsTools(server, db);
    registerSystemTools(server, db);
    registerResearchTools(server, db);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "1.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  afterEach(async () => {
    await client.close();
  });

  it("lists exactly the 27 tools (24 from Phase 7, 3 from Phase 9)", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...EXPECTED_TOOL_NAMES].sort());
  });

  it("get_job returns a helpful not-found error rather than throwing", async () => {
    const result = await client.callTool({ name: "get_job", arguments: { id: 9999 } });
    expect(result.isError).toBe(true);
    const text = result.content[0];
    expect(text?.type === "text" && text.text).toContain("not found");
  });

  it("get_job returns the job when it exists", async () => {
    const companies = new CompaniesRepository(db);
    const jobs = new JobsRepository(db);
    const company = companies.create({ name: "Acme" });
    const job = jobs.create({ title: "Founding Engineer", source: "yc", source_job_id: "1", company_id: company.id });

    const result = await client.callTool({ name: "get_job", arguments: { id: job.id } });
    expect(result.isError).toBeFalsy();
    expect(jsonOf(result)).toMatchObject({ id: job.id, title: "Founding Engineer" });
  });

  it("score_job re-scores without regressing a job's status past 'new'", async () => {
    const jobs = new JobsRepository(db);
    const job = jobs.create({ title: "Backend Engineer", source: "yc", source_job_id: "1" });
    jobs.update(job.id, { status: "applied" });

    const result = await client.callTool({ name: "score_job", arguments: { jobId: job.id } });
    expect(result.isError).toBeFalsy();
    const scored = jsonOf(result) as { status: string; fit_score: number | null };
    expect(scored.status).toBe("applied");
    expect(scored.fit_score).not.toBeNull();
  });

  it("score_job surfaces NotFoundError as a tool error, not a protocol crash", async () => {
    const result = await client.callTool({ name: "score_job", arguments: { jobId: 9999 } });
    expect(result.isError).toBe(true);
  });

  it("find_people matches by partial name and exact category together", async () => {
    const { PeopleRepository } = await import("../../src/database/repositories/people-repository.js");
    const people = new PeopleRepository(db);
    people.create({ name: "Jane Founder", category: "founder" });
    people.create({ name: "Jack Founder", category: "founder" });
    people.create({ name: "Jane Recruiter", category: "recruiter" });

    const result = await client.callTool({ name: "find_people", arguments: { name: "jane", category: "founder" } });
    const found = jsonOf(result) as Array<{ name: string }>;
    expect(found.map((p) => p.name)).toEqual(["Jane Founder"]);
  });

  it("list_pending_outreach only returns strictly-overdue-or-due-today, open outreach", async () => {
    const companies = new CompaniesRepository(db);
    const outreach = new OutreachRepository(db);
    const company = companies.create({ name: "Acme" });
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const due = outreach.create({ company_id: company.id, channel: "email", status: "follow_up", follow_up_date: today });
    outreach.create({ company_id: company.id, channel: "email", status: "follow_up", follow_up_date: future });
    outreach.create({ company_id: company.id, channel: "email", status: "closed", follow_up_date: today });

    const result = await client.callTool({ name: "list_pending_outreach", arguments: {} });
    const pending = jsonOf(result) as Array<{ id: number }>;
    expect(pending.map((o) => o.id)).toEqual([due.id]);
  });

  it("update_application accepts any status with no enforced sequence (Decision #44)", async () => {
    const companies = new CompaniesRepository(db);
    const jobs = new JobsRepository(db);
    const applications = new ApplicationsRepository(db);
    const company = companies.create({ name: "Acme" });
    const job = jobs.create({ title: "Backend Engineer", source: "yc", source_job_id: "1", company_id: company.id });
    const application = applications.create({ job_id: job.id, company_id: company.id, status: "planned" });

    const result = await client.callTool({
      name: "update_application",
      arguments: { id: application.id, status: "offer" },
    });
    expect(result.isError).toBeFalsy();
    expect(jsonOf(result)).toMatchObject({ status: "offer" });
  });

  it("get_system_health aggregates source and sheet health", async () => {
    const { SourceHealthRepository } = await import("../../src/database/repositories/source-health-repository.js");
    new SourceHealthRepository(db).recordSuccess("workatastartup");

    const result = await client.callTool({ name: "get_system_health", arguments: {} });
    expect(jsonOf(result)).toMatchObject({ sources: [{ source: "workatastartup", status: "healthy" }], sheets: [] });
  });

  it("get_errors surfaces only unhealthy entries across sources and sheets", async () => {
    const { SourceHealthRepository } = await import("../../src/database/repositories/source-health-repository.js");
    new SourceHealthRepository(db).recordFailure("workatastartup", "timeout");

    const result = await client.callTool({ name: "get_errors", arguments: {} });
    const errors = jsonOf(result) as Array<{ kind: string; target: string }>;
    expect(errors).toEqual([expect.objectContaining({ kind: "source", target: "workatastartup" })]);
  });

  it("research_company returns a helpful not-found error for an unknown company", async () => {
    const result = await client.callTool({ name: "research_company", arguments: { companyId: 9999 } });
    expect(result.isError).toBe(true);
    const text = result.content[0];
    expect(text?.type === "text" && text.text).toContain("not found");
  });

  it("research_company_people returns a helpful not-found error for an unknown company", async () => {
    const result = await client.callTool({ name: "research_company_people", arguments: { companyId: 9999 } });
    expect(result.isError).toBe(true);
  });

  it("research_job returns a helpful not-found error for an unknown job", async () => {
    const result = await client.callTool({ name: "research_job", arguments: { jobId: 9999 } });
    expect(result.isError).toBe(true);
  });

  it("research_job skips network entirely for a job from a source other than Work at a Startup", async () => {
    const jobs = new JobsRepository(db);
    const job = jobs.create({ title: "Hypothetical", source: "future-source", source_job_id: "1" });

    const result = await client.callTool({ name: "research_job", arguments: { jobId: job.id } });
    expect(result.isError).toBeFalsy();
    expect(jsonOf(result)).toMatchObject({ stillListed: true, changes: [] });
  });
});
