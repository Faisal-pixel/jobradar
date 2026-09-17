import { describe, it, expect } from "vitest";
import { formatJobAlert, formatDigest, formatFollowUpAlert, TEST_NOTIFICATION_MESSAGE } from "../../../src/services/notifications/templates.js";
import { buildJob, buildOutreach } from "../../test-helpers/fixtures.js";

describe("formatJobAlert", () => {
  it("includes title, company, score, category, and the job URL", () => {
    const job = buildJob({
      title: "Founding Backend Engineer",
      fit_category: "A",
      fit_score: 87,
      job_url: "https://www.workatastartup.com/jobs/123",
    });
    const message = formatJobAlert(job, "Acme Robotics");

    expect(message).toContain("A — 87/100");
    expect(message).toContain("Founding Backend Engineer at Acme Robotics");
    expect(message).toContain("https://www.workatastartup.com/jobs/123");
  });

  it("pulls the Role Fit line out of the explanation as the top reasoning line", () => {
    const job = buildJob({
      fit_explanation: "Technical Fit: 20/25 — matched\nRole Fit: 15/15 — best match \"Backend Engineer\"",
    });
    expect(formatJobAlert(job, "Acme")).toContain('Role Fit: 15/15 — best match "Backend Engineer"');
  });

  it("falls back to Technical Fit when Role Fit is missing from the explanation", () => {
    const job = buildJob({ fit_explanation: "Technical Fit: 20/25 — matched" });
    expect(formatJobAlert(job, "Acme")).toContain("Technical Fit: 20/25 — matched");
  });

  it("shows an honest 'Unknown company' rather than blank when the join fails", () => {
    const job = buildJob();
    expect(formatJobAlert(job, null)).toContain("Unknown company");
  });

  it("renders remote status as Yes/No/Unknown, not TRUE/FALSE or null", () => {
    expect(formatJobAlert(buildJob({ remote: true }), "Acme")).toContain("Remote: Yes");
    expect(formatJobAlert(buildJob({ remote: false }), "Acme")).toContain("Remote: No");
    expect(formatJobAlert(buildJob({ remote: null }), "Acme")).toContain("Remote: Unknown");
  });
});

describe("formatDigest", () => {
  it("counts jobs by fit category", () => {
    const jobs = [
      buildJob({ id: 1, fit_category: "A" }),
      buildJob({ id: 2, fit_category: "A" }),
      buildJob({ id: 3, fit_category: "B" }),
      buildJob({ id: 4, fit_category: "skip" }),
    ];
    const message = formatDigest(jobs, new Map(), "in the last 24h");
    expect(message).toContain("4 new jobs in the last 24h — 2 A, 1 B, 1 skip");
  });

  it("lists Category A jobs as top matches, joined to company names", () => {
    const jobs = [buildJob({ id: 1, title: "Backend Engineer", fit_category: "A", fit_score: 90 })];
    const message = formatDigest(jobs, new Map([[1, "Acme Robotics"]]), "in the last 24h");
    expect(message).toContain("- Backend Engineer @ Acme Robotics — 90/100");
  });

  it("omits the 'Top matches' section entirely when there are no Category A jobs", () => {
    const jobs = [buildJob({ fit_category: "B" })];
    expect(formatDigest(jobs, new Map(), "in the last 24h")).not.toContain("Top matches");
  });

  it("handles zero jobs without crashing", () => {
    expect(formatDigest([], new Map(), "in the last 24h")).toContain("0 new jobs in the last 24h — 0 A, 0 B, 0 skip");
  });
});

describe("formatFollowUpAlert", () => {
  it("includes company, contact, job, channel, and due date when all are known", () => {
    const outreach = buildOutreach({ channel: "linkedin", follow_up_date: "2026-09-20" });
    const message = formatFollowUpAlert(outreach, "Acme Robotics", "Jane Founder", "Backend Engineer");

    expect(message).toContain("Follow-up due: Acme Robotics");
    expect(message).toContain("Contact: Jane Founder · Channel: linkedin");
    expect(message).toContain("Job: Backend Engineer");
    expect(message).toContain("Due: 2026-09-20");
  });

  it("omits lines for unknown fields rather than printing 'null'", () => {
    const outreach = buildOutreach({ channel: null, follow_up_date: null });
    const message = formatFollowUpAlert(outreach, "Acme", null, null);
    expect(message).not.toContain("null");
    expect(message).not.toContain("Contact:");
    expect(message).not.toContain("Job:");
  });
});

describe("TEST_NOTIFICATION_MESSAGE", () => {
  it("is a fixed, recognizable string", () => {
    expect(TEST_NOTIFICATION_MESSAGE).toContain("JobRadar test notification");
  });
});
