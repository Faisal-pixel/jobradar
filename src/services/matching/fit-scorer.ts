import type { Job, JobFitCategory } from "../../domain/jobs/job.js";
import type { Company } from "../../domain/companies/company.js";
import type { Person } from "../../domain/people/person.js";
import type { CandidateProfile } from "../../domain/candidate-profile/candidate-profile.js";
import { FIT_SCORING_WEIGHTS, FIT_CATEGORY_THRESHOLDS, type FitScoringWeights } from "../../config/fit-scoring-weights.js";

export interface DimensionScore {
  score: number;
  max: number;
  explanation: string;
}

export interface FitScoreResult {
  score: number;
  category: JobFitCategory;
  explanation: string;
}

// The approved missing-data policy (see Phase 3 investigation): a
// dimension whose required input is genuinely unavailable scores at 50%
// of its max, labeled "(estimated — ...)" — never silently penalized to
// 0, never silently assumed to be a confident number.
function neutral(maxPoints: number, dimensionName: string, reason: string): DimensionScore {
  const score = Math.round(maxPoints * 0.5);
  return { score, max: maxPoints, explanation: `${dimensionName}: ${score}/${maxPoints} (estimated — ${reason})` };
}

// ---------------------------------------------------------------------
// Technical Fit — keyword overlap between the candidate's stack interest
// and this job's title + description. Every persisted job's description
// includes a "Skills: ..." line when enrichment succeeded (Phase 2), so
// this is meaningfully more than a title-only match in the common case.
// ---------------------------------------------------------------------
function scoreTechnicalFit(job: Job, profile: CandidateProfile, maxPoints: number): DimensionScore {
  if (profile.stack_interest.length === 0) {
    return neutral(maxPoints, "Technical Fit", "no stack preferences configured");
  }

  const haystack = `${job.title} ${job.description ?? ""}`.toLowerCase();
  const matched = profile.stack_interest.filter((keyword) => haystack.includes(keyword.toLowerCase()));
  const ratio = matched.length / profile.stack_interest.length;
  const score = Math.round(ratio * maxPoints);
  const detail = matched.length > 0 ? `matched: ${matched.join(", ")}` : "no stack keyword matches found";
  return { score, max: maxPoints, explanation: `Technical Fit: ${score}/${maxPoints} — ${detail}` };
}

// ---------------------------------------------------------------------
// Role Fit — how well this job's title matches the *best* single target
// title (not how many targets it vaguely resembles — a job has one
// title, so this is "is this fundamentally the kind of role I want").
// ---------------------------------------------------------------------
function scoreRoleFit(job: Job, profile: CandidateProfile, maxPoints: number): DimensionScore {
  if (profile.target_titles.length === 0) {
    return neutral(maxPoints, "Role Fit", "no target titles configured");
  }

  const titleWords = new Set(
    job.title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );

  let best = { title: "", overlap: 0, wordCount: 1 };
  for (const target of profile.target_titles) {
    const targetWords = target
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const overlap = targetWords.filter((w) => titleWords.has(w)).length;
    if (targetWords.length > 0 && overlap / targetWords.length > best.overlap / best.wordCount) {
      best = { title: target, overlap, wordCount: targetWords.length };
    }
  }

  const ratio = best.overlap / best.wordCount;
  const score = Math.round(ratio * maxPoints);
  const explanation =
    ratio > 0
      ? `Role Fit: ${score}/${maxPoints} — best match "${best.title}" (${best.overlap}/${best.wordCount} words in "${job.title}")`
      : `Role Fit: 0/${maxPoints} — "${job.title}" doesn't match any target title`;
  return { score, max: maxPoints, explanation };
}

// ---------------------------------------------------------------------
// Company Stage/Team — where team_size falls relative to the three
// preference tiers. Percentages (100/70/50/20%) are a deliberate, simple
// heuristic encoding "sweet spot > secondary > opportunistic > outside",
// not a precisely-derived formula — there isn't one for a judgment call
// like this.
// ---------------------------------------------------------------------
function scoreCompanyStageTeam(company: Company | null, profile: CandidateProfile, maxPoints: number): DimensionScore {
  const teamSize = company?.team_size;
  if (teamSize === null || teamSize === undefined) {
    return neutral(maxPoints, "Company Stage/Team", "team size unknown");
  }

  const inRange = (range: { min: number; max: number } | null) =>
    range !== null && teamSize >= range.min && teamSize <= range.max;

  let ratio: number;
  let tier: string;
  if (inRange(profile.company_size_sweet_spot)) {
    ratio = 1;
    tier = "sweet spot";
  } else if (inRange(profile.company_size_secondary)) {
    ratio = 0.7;
    tier = "secondary";
  } else if (inRange(profile.company_size_opportunistic)) {
    ratio = 0.5;
    tier = "opportunistic";
  } else {
    ratio = 0.2;
    tier = "outside all preferred ranges";
  }

  const score = Math.round(ratio * maxPoints);
  return {
    score,
    max: maxPoints,
    explanation: `Company Stage/Team: ${score}/${maxPoints} — team size ${teamSize} (${tier})`,
  };
}

// ---------------------------------------------------------------------
// Funding/Hiring Signal — split into two sub-components:
//   - Recency signal (60% of this dimension's points): the better of
//     YC batch recency and company activity recency (companyLastActiveAt).
//     Real, source-provided data.
//   - Funding signal (40%): company.funding/funding_stage. Work at a
//     Startup never provides this at all (confirmed during Phase 2/3
//     investigation, not a per-job gap) — always neutral, with that
//     limitation stated plainly rather than hidden.
// ---------------------------------------------------------------------
const BATCH_RECENCY_HORIZON_YEARS = 4;
const ACTIVITY_RECENCY_HORIZON_MONTHS = 12;

function parseYcBatchAgeYears(batch: string | null | undefined, now: Date): number | null {
  const match = batch?.match(/^[WS](\d{2})$/i);
  if (!match) return null;
  const year = 2000 + parseInt(match[1] as string, 10);
  return now.getFullYear() - year;
}

function parseLastActiveAgeMonths(lastActive: string | null | undefined): number | null {
  const match = lastActive?.match(/(\d+)\s*(day|week|month|year)s?\s*ago/i);
  if (!match) return null;
  const amount = parseInt(match[1] as string, 10);
  const unit = (match[2] as string).toLowerCase();
  const monthsPerUnit: Record<string, number> = { day: 1 / 30, week: 1 / 4.345, month: 1, year: 12 };
  return amount * (monthsPerUnit[unit] as number);
}

function recencyRatio(age: number | null, horizon: number): number | null {
  if (age === null) return null;
  return Math.max(0, Math.min(1, 1 - age / horizon));
}

function scoreFundingHiringSignal(company: Company | null, maxPoints: number, now: Date): DimensionScore {
  const recencyMax = Math.round(maxPoints * 0.6);
  const fundingMax = maxPoints - recencyMax;

  const batchRatio = recencyRatio(parseYcBatchAgeYears(company?.yc_batch, now), BATCH_RECENCY_HORIZON_YEARS);
  const activityRatio = recencyRatio(parseLastActiveAgeMonths(company?.last_active), ACTIVITY_RECENCY_HORIZON_MONTHS);
  const ratios = [batchRatio, activityRatio].filter((r): r is number => r !== null);

  const recencyScore =
    ratios.length > 0 ? Math.round(Math.max(...ratios) * recencyMax) : Math.round(recencyMax * 0.5);
  const recencyNote =
    ratios.length > 0
      ? `batch ${company?.yc_batch ?? "?"}, last active ${company?.last_active ?? "unknown"}`
      : "batch and activity both unknown (estimated)";

  const fundingScore = Math.round(fundingMax * 0.5);

  const score = recencyScore + fundingScore;
  return {
    score,
    max: maxPoints,
    explanation:
      `Funding/Hiring Signal: ${score}/${maxPoints} — recency ${recencyScore}/${recencyMax} (${recencyNote}); ` +
      `funding ${fundingScore}/${fundingMax} (estimated — funding data not available from this source)`,
  };
}

// ---------------------------------------------------------------------
// Remote Eligibility — job.remote is itself an inference (Decisions Log
// #14), and even a "remote" job may restrict eligibility to specific
// countries (e.g. "US / CA / Remote (US; CA)") or require visa-free
// status. Full marks are reserved for the rare case where the
// candidate's country is explicitly mentioned; everything else is a
// deliberately imperfect text-based estimate, never asserted as certain.
// ---------------------------------------------------------------------
function scoreRemoteEligibility(job: Job, profile: CandidateProfile, maxPoints: number): DimensionScore {
  if (job.remote === null) {
    return neutral(maxPoints, "Remote Eligibility", "remote status unknown");
  }
  if (job.remote === false) {
    return {
      score: 0,
      max: maxPoints,
      explanation: `Remote Eligibility: 0/${maxPoints} — on-site role, not accessible from ${profile.location ?? "candidate's location"}`,
    };
  }

  const location = job.location ?? "";
  const candidateLocation = profile.location ?? "";
  const candidateCode = profile.location_code ?? "";
  // Real listings restrict by 2-letter country code ("US / CA / GB /
  // ..."), never by full country name — matching only the name would
  // make this branch effectively unreachable on real data.
  const mentionsCandidateCountry =
    (candidateLocation.length > 0 && new RegExp(candidateLocation, "i").test(location)) ||
    (candidateCode.length > 0 && new RegExp(`\\b${candidateCode}\\b`).test(location)) ||
    (candidateLocation.length > 0 && new RegExp(candidateLocation, "i").test(job.description ?? ""));

  if (mentionsCandidateCountry) {
    return {
      score: maxPoints,
      max: maxPoints,
      explanation: `Remote Eligibility: ${maxPoints}/${maxPoints} — remote and explicitly includes ${candidateLocation || candidateCode}`,
    };
  }

  // A long list of 2-letter country codes (e.g. "GB / FR / US / BR / CA
  // ...") signals a specific allow-list that likely excludes the
  // candidate's country if it wasn't matched above.
  const countryCodeCount = (location.match(/\b[A-Z]{2}\b/g) ?? []).length;
  const visaLine = (job.description ?? "").match(/Visa:\s*(.+)/i)?.[1] ?? "";
  const visaRestrictive = /citizen|visa only|no sponsorship|does not sponsor/i.test(visaLine);

  if (countryCodeCount >= 2 || visaRestrictive) {
    const score = Math.round(maxPoints * 0.25);
    return {
      score,
      max: maxPoints,
      explanation:
        `Remote Eligibility: ${score}/${maxPoints} — remote but appears restricted (location: "${location}"` +
        `${visaRestrictive ? `, visa: "${visaLine}"` : ""}), unclear if ${candidateLocation || "the candidate"} is eligible`,
    };
  }

  const score = Math.round(maxPoints * 0.8);
  return {
    score,
    max: maxPoints,
    explanation: `Remote Eligibility: ${score}/${maxPoints} — remote, no explicit country restriction found (location: "${location}")`,
  };
}

// ---------------------------------------------------------------------
// Founder Accessibility — real founder records (name + LinkedIn) when
// available (Phase 3 extension of the Work at a Startup adapter); falls
// back to team_size as a weak proxy (smaller team ~ more accessible)
// when no founders are on file, and to neutral when neither exists.
// ---------------------------------------------------------------------
const FOUNDER_LIKE_CATEGORIES = new Set(["founder", "cofounder", "ceo", "cto"]);

function scoreFounderAccessibility(people: Person[], company: Company | null, maxPoints: number): DimensionScore {
  const founders = people.filter((p) => p.category && FOUNDER_LIKE_CATEGORIES.has(p.category));

  if (founders.length > 0) {
    const withLinkedIn = founders.filter((f) => f.linkedin_url);
    const ratio = 0.5 + 0.5 * (withLinkedIn.length / founders.length);
    const score = Math.round(ratio * maxPoints);
    return {
      score,
      max: maxPoints,
      explanation:
        `Founder Accessibility: ${score}/${maxPoints} — ${founders.length} founder(s) identified, ` +
        `${withLinkedIn.length} with LinkedIn (${founders.map((f) => f.name).join(", ")})`,
    };
  }

  const teamSize = company?.team_size;
  if (teamSize !== null && teamSize !== undefined) {
    const ratio = teamSize <= 15 ? 0.5 : 0.3;
    const score = Math.round(ratio * maxPoints);
    return {
      score,
      max: maxPoints,
      explanation: `Founder Accessibility: ${score}/${maxPoints} (estimated — no founder data; team size ${teamSize} used as a weak proxy)`,
    };
  }

  return neutral(maxPoints, "Founder Accessibility", "no founder or team size data available");
}

// ---------------------------------------------------------------------

export function scoreJob(
  job: Job,
  company: Company | null,
  people: Person[],
  profile: CandidateProfile,
  weights: FitScoringWeights = FIT_SCORING_WEIGHTS,
  now: Date = new Date(),
): FitScoreResult {
  const dimensions: DimensionScore[] = [
    scoreTechnicalFit(job, profile, weights.technicalFit),
    scoreCompanyStageTeam(company, profile, weights.companyStageTeam),
    scoreFundingHiringSignal(company, weights.fundingHiringSignal, now),
    scoreRemoteEligibility(job, profile, weights.remoteEligibility),
    scoreRoleFit(job, profile, weights.roleFit),
    scoreFounderAccessibility(people, company, weights.founderAccessibility),
  ];

  const score = dimensions.reduce((sum, d) => sum + d.score, 0);
  const category: JobFitCategory =
    score >= FIT_CATEGORY_THRESHOLDS.A ? "A" : score >= FIT_CATEGORY_THRESHOLDS.B ? "B" : "skip";
  const explanation = dimensions.map((d) => d.explanation).join("\n");

  return { score, category, explanation };
}
