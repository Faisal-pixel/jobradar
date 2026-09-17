import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DB_PATH: z.string().min(1).default("./data/jobradar.db"),
  // Comma-separated override for the Work at a Startup search queries.
  // Optional — src/config/search-queries.ts falls back to a sensible
  // default (derived from CLAUDE.md's candidate profile) when unset.
  SEARCH_QUERIES: z.string().min(1).optional(),
  // Per-dimension fit-scoring weight overrides (CLAUDE.md: "Weights live
  // in config, not hardcoded"). Optional — src/config/fit-scoring-weights.ts
  // falls back to CLAUDE.md's stated 25/15/20/15/15/10 and validates the
  // final set sums to 100.
  FIT_WEIGHT_TECHNICAL: z.coerce.number().optional(),
  FIT_WEIGHT_COMPANY_STAGE: z.coerce.number().optional(),
  FIT_WEIGHT_FUNDING_HIRING: z.coerce.number().optional(),
  FIT_WEIGHT_REMOTE: z.coerce.number().optional(),
  FIT_WEIGHT_ROLE: z.coerce.number().optional(),
  FIT_WEIGHT_FOUNDER_ACCESS: z.coerce.number().optional(),
  // Google Sheets sync (Phase 4). All optional at the env-schema level so
  // the rest of the app still starts without Sheets configured — the
  // sync-sheets command itself does the real "is this actually set up"
  // check and fails clearly if not.
  GOOGLE_OAUTH_CLIENT_PATH: z.string().min(1).default("./credentials/google-client.json"),
  GOOGLE_OAUTH_TOKEN_PATH: z.string().min(1).default("./credentials/google-token.json"),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export const env = loadEnv(process.env);
