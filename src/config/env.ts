import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DB_PATH: z.string().min(1).default("./data/jobradar.db"),
  // Comma-separated override for the Work at a Startup search queries.
  // Optional — src/config/search-queries.ts falls back to a sensible
  // default (derived from CLAUDE.md's candidate profile) when unset.
  SEARCH_QUERIES: z.string().min(1).optional(),
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
