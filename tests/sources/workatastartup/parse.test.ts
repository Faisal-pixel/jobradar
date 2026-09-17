import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseSalary,
  inferRemote,
  extractDomain,
  normalizeSearchJob,
  normalizeJobDetail,
  extractInertiaPageProps,
} from "../../../src/sources/workatastartup/parse.js";
import { waasSearchResponseSchema, waasJobDetailPagePropsSchema } from "../../../src/sources/workatastartup/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "../../fixtures/workatastartup");

// Both fixture files are real, unmodified captures from workatastartup.com
// taken during Phase 2 investigation (2026-09-16) — not fabricated shapes.
const searchFixture = readFileSync(join(FIXTURES_DIR, "search-response.json"), "utf8");
const jobDetailFixture = readFileSync(join(FIXTURES_DIR, "job-detail-13302.html"), "utf8");

describe("parseSalary", () => {
  it("parses a $K-$K range", () => {
    expect(parseSalary("$80K - $140K")).toEqual({ min: 80_000, max: 140_000, currency: "USD" });
  });

  it("parses a single value", () => {
    expect(parseSalary("$150K")).toEqual({ min: 150_000, max: 150_000, currency: "USD" });
  });

  it("returns all-null for missing salary", () => {
    expect(parseSalary(null)).toEqual({ min: null, max: null, currency: null });
    expect(parseSalary(undefined)).toEqual({ min: null, max: null, currency: null });
  });

  it("returns all-null when the string has no dollar amount", () => {
    expect(parseSalary("Competitive")).toEqual({ min: null, max: null, currency: null });
  });

  it("rejects implausibly small numbers instead of storing a listing error as fact", () => {
    // Real example seen on a live listing: "$100 - $165" with no K
    // suffix — not a real annual salary, almost certainly meant $100K-$165K.
    expect(parseSalary("$100 - $165")).toEqual({ min: null, max: null, currency: null });
  });
});

describe("inferRemote", () => {
  it("is true when location mentions Remote", () => {
    expect(inferRemote("Remote (US)")).toBe(true);
    expect(inferRemote("CA / Remote (CA)")).toBe(true);
  });

  it("is false for a plain city with no remote mention", () => {
    expect(inferRemote("Seattle, WA")).toBe(false);
  });

  it("is false for missing location", () => {
    expect(inferRemote(null)).toBe(false);
    expect(inferRemote(undefined)).toBe(false);
  });
});

describe("extractDomain", () => {
  it("strips www and protocol", () => {
    expect(extractDomain("http://www.bymason.com")).toBe("bymason.com");
    expect(extractDomain("https://acme.io/careers")).toBe("acme.io");
  });

  it("returns null for missing or invalid URLs", () => {
    expect(extractDomain(null)).toBeNull();
    expect(extractDomain("not a url")).toBeNull();
  });
});

describe("normalizeSearchJob (real fixture: search-response.json)", () => {
  const parsed = waasSearchResponseSchema.parse(JSON.parse(searchFixture));

  it("normalizes every job in the fixture without throwing", () => {
    for (const raw of parsed.jobs) {
      expect(() => normalizeSearchJob(raw)).not.toThrow();
    }
  });

  it("produces the expected shape for the first job (Nango, Staff Backend Engineer)", () => {
    const discovered = normalizeSearchJob(parsed.jobs[0]!);
    expect(discovered.job.source).toBe("workatastartup");
    expect(discovered.job.source_job_id).toBe("73764");
    expect(discovered.job.title).toBe("Staff Backend Engineer (Remote)");
    expect(discovered.job.remote).toBe(true);
    expect(discovered.job.salary_min).toBe(140_000);
    expect(discovered.job.salary_max).toBe(220_000);
    // Cheap tier honestly has no description yet — filled in by getJob().
    expect(discovered.job.description).toBeNull();
    expect(discovered.company.name).toBe("Nango");
    expect(discovered.company.yc_batch).toBe("W23");
    expect(discovered.company.last_active).toBe("10 months ago");
  });
});

describe("extractInertiaPageProps + normalizeJobDetail (real fixture: job-detail-13302.html)", () => {
  const props = waasJobDetailPagePropsSchema.parse(extractInertiaPageProps(jobDetailFixture));

  it("extracts and validates the embedded Inertia payload", () => {
    expect(props.job.id).toBe(13302);
    expect(props.company.name).toBe("Mason");
  });

  it("normalizes the full detail into job + company", () => {
    const discovered = normalizeJobDetail(props.job, props.company, props.applyUrl);

    expect(discovered.job.source_job_id).toBe("13302");
    expect(discovered.job.location).toBe("Seattle, WA");
    expect(discovered.job.remote).toBe(false);
    expect(discovered.job.salary_min).toBe(80_000);
    expect(discovered.job.salary_max).toBe(140_000);
    expect(discovered.job.description).toContain("Visa: US citizen/visa only");
    expect(discovered.job.description).toContain("Skills: Amazon Web Services (AWS)");
    expect(discovered.job.description).not.toContain("<p>"); // HTML stripped

    expect(discovered.company.name).toBe("Mason");
    expect(discovered.company.website).toBe("http://www.bymason.com");
    expect(discovered.company.domain).toBe("bymason.com");
    expect(discovered.company.team_size).toBe(65);
    // last_active is search-tier-only — normalizeJobDetail alone can't
    // know it; SourceManager.enrich() is what merges it in.
    expect(discovered.company.last_active).toBeUndefined();
  });

  it("normalizes real founder data (name + LinkedIn), not fabricated", () => {
    const discovered = normalizeJobDetail(props.job, props.company, props.applyUrl);

    expect(discovered.founders).toEqual([
      expect.objectContaining({
        name: "Jim Xiao",
        category: "founder",
        linkedin_url: "https://www.linkedin.com/in/jimxiao",
        source: "workatastartup",
        source_url: "https://www.workatastartup.com/jobs/13302",
      }),
    ]);
    expect(discovered.founders?.[0]?.notes).toContain("Past experience at Microsoft");
  });
});
