import type { Job } from "../../domain/jobs/job.js";
import type { Outreach } from "../../domain/outreach/outreach.js";

export const TEST_NOTIFICATION_MESSAGE = "JobRadar test notification — Telegram is connected.";

function firstExplanationLine(explanation: string | null, dimensionLabel: string): string | null {
  if (!explanation) return null;
  return explanation.split("\n").find((line) => line.startsWith(dimensionLabel)) ?? null;
}

function formatRemote(remote: boolean | null): string {
  if (remote === null) return "Unknown";
  return remote ? "Yes" : "No";
}

export function formatJobAlert(job: Job, companyName: string | null): string {
  const lines = [
    `New Job Match (${job.fit_category} — ${job.fit_score}/100)`,
    `${job.title} at ${companyName ?? "Unknown company"}`,
    `Remote: ${formatRemote(job.remote)}${job.location ? ` · Location: ${job.location}` : ""}`,
  ];

  // Role Fit is the most directly relevant single line for "why this job,"
  // falling back to Technical Fit if that's missing for some reason.
  const topLine =
    firstExplanationLine(job.fit_explanation, "Role Fit") ?? firstExplanationLine(job.fit_explanation, "Technical Fit");
  if (topLine) lines.push(topLine);
  if (job.job_url) lines.push(job.job_url);

  return lines.join("\n");
}

export function formatDigest(jobs: Job[], companyNameByJobId: Map<number, string>, windowLabel: string): string {
  const counts = { A: 0, B: 0, skip: 0 };
  for (const job of jobs) {
    if (job.fit_category) counts[job.fit_category]++;
  }

  const lines = [
    "JobRadar Daily Digest",
    `${jobs.length} new job${jobs.length === 1 ? "" : "s"} ${windowLabel} — ${counts.A} A, ${counts.B} B, ${counts.skip} skip`,
  ];

  const categoryA = jobs.filter((job) => job.fit_category === "A");
  if (categoryA.length > 0) {
    lines.push("", "Top matches:");
    for (const job of categoryA) {
      const company = companyNameByJobId.get(job.id) ?? "Unknown company";
      lines.push(`- ${job.title} @ ${company} — ${job.fit_score}/100`);
    }
  }

  return lines.join("\n");
}

export function formatFollowUpAlert(
  outreach: Outreach,
  companyName: string | null,
  personName: string | null,
  jobTitle: string | null,
): string {
  const lines = [`Follow-up due: ${companyName ?? "Unknown company"}`];
  if (personName) {
    lines.push(`Contact: ${personName}${outreach.channel ? ` · Channel: ${outreach.channel}` : ""}`);
  }
  if (jobTitle) lines.push(`Job: ${jobTitle}`);
  if (outreach.follow_up_date) lines.push(`Due: ${outreach.follow_up_date}`);
  return lines.join("\n");
}
