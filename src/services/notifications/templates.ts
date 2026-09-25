import type { Job } from "../../domain/jobs/job.js";
import type { Outreach } from "../../domain/outreach/outreach.js";
import type { Application } from "../../domain/applications/application.js";

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

// Compact, one-line-per-item — used when bundling into the daily digest
// (Phase 10), unlike formatFollowUpAlert's fuller per-item block below
// (still used for the standalone send-followups CLI command / run()).
export function formatFollowUpsSection(due: Outreach[], companyNameById: Map<number, string>): string {
  const lines = ["", `Follow-ups due (${due.length}):`];
  for (const contact of due) {
    const company = contact.company_id !== null ? companyNameById.get(contact.company_id) : undefined;
    const dueLabel = contact.follow_up_date ? ` — due ${contact.follow_up_date}` : "";
    lines.push(`- ${company ?? "Unknown company"}${dueLabel}`);
  }
  return lines.join("\n");
}

export interface WeeklyReportInput {
  jobs: Job[];
  newApplicationsCount: number;
  updatedApplications: Application[];
  newOutreach: Outreach[];
  reachedOutCount: number;
  respondedCount: number;
  overdueFollowUpsCount: number;
}

// No status-history table exists (Decisions Log, Phase 10) — "with
// activity" reports current status as a snapshot, never a "moved from X
// to Y" transition, since that specific fact isn't knowable from what's
// stored. Response rate is similarly a lifetime snapshot (responded /
// ever-contacted as of report time), not scoped to this week's contacts
// specifically — there's no separate "responded at" timestamp to scope
// it by, only updated_at, which changes for any edit to the row.
export function formatWeeklyReport(input: WeeklyReportInput): string {
  const fitCounts = { A: 0, B: 0, skip: 0 };
  for (const job of input.jobs) {
    if (job.fit_category) fitCounts[job.fit_category]++;
  }

  const statusCounts = new Map<string, number>();
  for (const application of input.updatedApplications) {
    statusCounts.set(application.status, (statusCounts.get(application.status) ?? 0) + 1);
  }
  const statusSummary = [...statusCounts.entries()].map(([status, count]) => `${count} ${status}`).join(", ");

  const channelCounts = new Map<string, number>();
  for (const contact of input.newOutreach) {
    const channel = contact.channel ?? "unspecified";
    channelCounts.set(channel, (channelCounts.get(channel) ?? 0) + 1);
  }
  const channelSummary = [...channelCounts.entries()].map(([channel, count]) => `${count} ${channel}`).join(", ");

  const responseRatePct =
    input.reachedOutCount > 0 ? Math.round((input.respondedCount / input.reachedOutCount) * 100) : null;

  return [
    "JobRadar Weekly Report",
    "",
    `Jobs discovered: ${input.jobs.length} (${fitCounts.A} A, ${fitCounts.B} B, ${fitCounts.skip} skip)`,
    `Applications: ${input.newApplicationsCount} new, ${input.updatedApplications.length} with activity` +
      (statusSummary ? ` (currently: ${statusSummary})` : ""),
    `Outreach: ${input.newOutreach.length} new` + (channelSummary ? ` (${channelSummary})` : ""),
    responseRatePct !== null
      ? `Response rate: ${input.respondedCount}/${input.reachedOutCount} ever contacted have responded (${responseRatePct}%)`
      : "Response rate: no outreach contacted yet",
    `Follow-ups still overdue: ${input.overdueFollowUpsCount}`,
  ].join("\n");
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
