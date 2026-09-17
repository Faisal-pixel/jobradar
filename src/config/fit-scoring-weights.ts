import { env } from "./env.js";

// CLAUDE.md: "Weights live in config, not hardcoded, so they can be
// tuned later." Defaults match CLAUDE.md's stated 100-point breakdown
// exactly; each is individually overridable via env (FIT_WEIGHT_*).
export interface FitScoringWeights {
  technicalFit: number;
  companyStageTeam: number;
  fundingHiringSignal: number;
  remoteEligibility: number;
  roleFit: number;
  founderAccessibility: number;
}

export const FIT_SCORING_WEIGHTS: FitScoringWeights = {
  technicalFit: env.FIT_WEIGHT_TECHNICAL ?? 25,
  companyStageTeam: env.FIT_WEIGHT_COMPANY_STAGE ?? 15,
  fundingHiringSignal: env.FIT_WEIGHT_FUNDING_HIRING ?? 20,
  remoteEligibility: env.FIT_WEIGHT_REMOTE ?? 15,
  roleFit: env.FIT_WEIGHT_ROLE ?? 15,
  founderAccessibility: env.FIT_WEIGHT_FOUNDER_ACCESS ?? 10,
};

const totalWeight = Object.values(FIT_SCORING_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
if (totalWeight !== 100) {
  throw new Error(
    `Fit scoring weights must sum to 100, got ${totalWeight}: ${JSON.stringify(FIT_SCORING_WEIGHTS)}`,
  );
}

// CLAUDE.md: "80-100 = A, 65-79 = B, <65 = skip". Not env-overridable —
// unlike the weights, CLAUDE.md doesn't call these out as tunable, and a
// personal tool doesn't need a config knob for every constant.
export const FIT_CATEGORY_THRESHOLDS = { A: 80, B: 65 } as const;
