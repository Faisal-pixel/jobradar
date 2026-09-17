import { describe, it, expect } from "vitest";
import { scoreJob } from "../../../src/services/matching/fit-scorer.js";
import { FIT_SCORING_WEIGHTS } from "../../../src/config/fit-scoring-weights.js";
import { buildJob, buildCompany, buildPerson, buildCandidateProfile } from "../../test-helpers/fixtures.js";

const NOW = new Date("2026-09-16T00:00:00.000Z");

describe("scoreJob", () => {
  it("every dimension line sums to the total score, and weights sum to 100", () => {
    const profile = buildCandidateProfile();
    const job = buildJob({ title: "Backend Engineer", description: "Skills: TypeScript, Node.js" });
    const company = buildCompany({ team_size: 10, yc_batch: "W25", last_active: "1 month ago" });
    const result = scoreJob(job, company, [buildPerson()], profile, FIT_SCORING_WEIGHTS, NOW);

    const lineScores = [...result.explanation.matchAll(/: (\d+)\/(\d+)/g)].map((m) => Number(m[1]));
    expect(lineScores.reduce((a, b) => a + b, 0)).toBe(result.score);

    const total = Object.values(FIT_SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it("categorizes using CLAUDE.md's thresholds: 80-100=A, 65-79=B, <65=skip", () => {
    const profile = buildCandidateProfile();
    // A strong, well-matched job should land in A.
    const strong = buildJob({
      title: "Founding Backend Engineer",
      remote: true,
      location: "Remote (NG)",
      description: "Skills: TypeScript, Node.js, distributed systems",
    });
    const strongCompany = buildCompany({ team_size: 10, yc_batch: "W25", last_active: "1 month ago" });
    const strongResult = scoreJob(strong, strongCompany, [buildPerson({ linkedin_url: "https://linkedin.com/in/x" })], profile, FIT_SCORING_WEIGHTS, NOW);
    expect(strongResult.category).toBe("A");
    expect(strongResult.score).toBeGreaterThanOrEqual(80);

    // A completely unrelated, on-site, unknown-everything job should skip.
    const weak = buildJob({ title: "Enterprise Sales Manager", remote: false });
    const weakResult = scoreJob(weak, null, [], profile, FIT_SCORING_WEIGHTS, NOW);
    expect(weakResult.category).toBe("skip");
    expect(weakResult.score).toBeLessThan(65);
  });

  describe("Technical Fit", () => {
    it("scores proportionally to matched stack keywords", () => {
      const profile = buildCandidateProfile({ stack_interest: ["TypeScript", "Node.js"] });
      const bothMatch = buildJob({ description: "Skills: TypeScript, Node.js" });
      const oneMatch = buildJob({ description: "Skills: TypeScript" });
      const noMatch = buildJob({ description: "Skills: Python, Django" });

      const scoreOf = (job: ReturnType<typeof buildJob>) =>
        scoreJob(job, null, [], profile, FIT_SCORING_WEIGHTS, NOW).explanation.match(/Technical Fit: (\d+)/)![1];

      expect(scoreOf(bothMatch)).toBe("25");
      expect(scoreOf(oneMatch)).toBe("13"); // rounded 12.5
      expect(scoreOf(noMatch)).toBe("0");
    });

    it("is neutral (50%) when no stack preferences are configured", () => {
      const profile = buildCandidateProfile({ stack_interest: [] });
      const result = scoreJob(buildJob(), null, [], profile, FIT_SCORING_WEIGHTS, NOW);
      expect(result.explanation).toContain("Technical Fit: 13/25 (estimated");
    });
  });

  describe("Role Fit", () => {
    it("finds the best-matching target title, not an average across all targets", () => {
      const profile = buildCandidateProfile({ target_titles: ["Backend Engineer", "Founding Engineer"] });
      const job = buildJob({ title: "Founding Backend Engineer" });
      const result = scoreJob(job, null, [], profile, FIT_SCORING_WEIGHTS, NOW);
      expect(result.explanation).toContain("Role Fit: 15/15");
    });

    it("scores 0 when the title matches nothing", () => {
      const profile = buildCandidateProfile({ target_titles: ["Backend Engineer"] });
      const job = buildJob({ title: "Enterprise Sales Manager" });
      const result = scoreJob(job, null, [], profile, FIT_SCORING_WEIGHTS, NOW);
      expect(result.explanation).toContain("Role Fit: 0/15");
    });
  });

  describe("Company Stage/Team", () => {
    const profile = buildCandidateProfile();
    const scoreFor = (teamSize: number | null) =>
      scoreJob(buildJob(), buildCompany({ team_size: teamSize }), [], profile, FIT_SCORING_WEIGHTS, NOW).explanation;

    it("gives full marks in the sweet spot", () => {
      expect(scoreFor(12)).toContain("Company Stage/Team: 15/15");
    });
    it("gives partial credit in the secondary range", () => {
      expect(scoreFor(40)).toContain("Company Stage/Team: 11/15"); // 70% of 15
    });
    it("gives partial credit in the opportunistic range", () => {
      expect(scoreFor(3)).toContain("Company Stage/Team: 8/15"); // 50% of 15
    });
    it("gives low credit outside all ranges", () => {
      expect(scoreFor(500)).toContain("Company Stage/Team: 3/15"); // 20% of 15
    });
    it("is neutral when team size is unknown", () => {
      expect(scoreFor(null)).toContain("Company Stage/Team: 8/15 (estimated");
    });
  });

  describe("Remote Eligibility", () => {
    const profile = buildCandidateProfile(); // Nigeria / NG

    it("scores 0 for on-site roles", () => {
      const job = buildJob({ remote: false });
      const result = scoreJob(job, null, [], profile, FIT_SCORING_WEIGHTS, NOW);
      expect(result.explanation).toContain("Remote Eligibility: 0/15");
    });

    it("gives full marks when the candidate's country code is explicitly listed", () => {
      const job = buildJob({ remote: true, location: "US / CA / NG / Remote" });
      const result = scoreJob(job, null, [], profile, FIT_SCORING_WEIGHTS, NOW);
      expect(result.explanation).toContain("Remote Eligibility: 15/15");
    });

    it("does not match a country code as a substring of another word", () => {
      // "NG" must not accidentally match inside e.g. "ENGINEERING" or similar.
      const job = buildJob({ remote: true, location: "Remote — Engineering hub" });
      const result = scoreJob(job, null, [], profile, FIT_SCORING_WEIGHTS, NOW);
      expect(result.explanation).not.toContain("Remote Eligibility: 15/15");
    });

    it("gives reduced credit for a real-world country-restricted listing that excludes the candidate", () => {
      // Real example captured during Phase 2 investigation.
      const job = buildJob({
        remote: true,
        location:
          "GB / FR / US / BR / CA / ES / PT / DE / AT / CH / BE / NL / DK / SE / NO / FI / GL / GR / IT / PL / RO / HU / SK / CZ / Remote",
      });
      const result = scoreJob(job, null, [], profile, FIT_SCORING_WEIGHTS, NOW);
      expect(result.explanation).toContain("Remote Eligibility: 4/15"); // 25% of 15, rounded
    });

    it("is neutral when remote status itself is unknown", () => {
      const job = buildJob({ remote: null });
      const result = scoreJob(job, null, [], profile, FIT_SCORING_WEIGHTS, NOW);
      expect(result.explanation).toContain("Remote Eligibility: 8/15 (estimated");
    });
  });

  describe("Founder Accessibility", () => {
    const profile = buildCandidateProfile();

    it("scores highly when founders with LinkedIn are on file", () => {
      const founder = buildPerson({ category: "founder", linkedin_url: "https://linkedin.com/in/x" });
      const result = scoreJob(buildJob(), null, [founder], profile, FIT_SCORING_WEIGHTS, NOW);
      expect(result.explanation).toContain("Founder Accessibility: 10/10");
    });

    it("falls back to team size as a weak proxy when no founders are on file", () => {
      const result = scoreJob(buildJob(), buildCompany({ team_size: 10 }), [], profile, FIT_SCORING_WEIGHTS, NOW);
      expect(result.explanation).toContain("Founder Accessibility: 5/10 (estimated — no founder data; team size 10");
    });

    it("is neutral when neither founders nor team size are known", () => {
      const result = scoreJob(buildJob(), null, [], profile, FIT_SCORING_WEIGHTS, NOW);
      expect(result.explanation).toContain("Founder Accessibility: 5/10 (estimated — no founder or team size");
    });
  });

  describe("Funding/Hiring Signal", () => {
    const profile = buildCandidateProfile();

    it("always includes the funding-unavailable caveat — this source never provides funding data", () => {
      const company = buildCompany({ yc_batch: "W25", last_active: "1 month ago" });
      const result = scoreJob(buildJob(), company, [], profile, FIT_SCORING_WEIGHTS, NOW);
      expect(result.explanation).toContain("funding data not available from this source");
    });

    it("rewards a very recent YC batch", () => {
      const recent = buildCompany({ yc_batch: "W26" });
      const old = buildCompany({ yc_batch: "W15" });
      const recentScore = scoreJob(buildJob(), recent, [], profile, FIT_SCORING_WEIGHTS, NOW).explanation;
      const oldScore = scoreJob(buildJob(), old, [], profile, FIT_SCORING_WEIGHTS, NOW).explanation;
      const extract = (s: string) => Number(s.match(/Funding\/Hiring Signal: (\d+)/)![1]);
      expect(extract(recentScore)).toBeGreaterThan(extract(oldScore));
    });
  });
});
