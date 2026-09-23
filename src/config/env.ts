import { z } from "zod";

// docker-compose's `${VAR:-}` substitution produces an empty string when
// the host doesn't have VAR set — not "absent". Plain `z.string().min(1).optional()`
// rejects that empty string outright (a real bug found via live Docker
// testing: the container failed to start at all without Sheets/Telegram
// configured, defeating the whole point of "optional"). This treats ""
// the same as "not provided".
const optionalEnvString = () => z.preprocess((val) => (val === "" ? undefined : val), z.string().min(1).optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DB_PATH: z.string().min(1).default("./data/jobradar.db"),
  // Comma-separated override for the Work at a Startup search queries.
  // Optional — src/config/search-queries.ts falls back to a sensible
  // default (derived from CLAUDE.md's candidate profile) when unset.
  SEARCH_QUERIES: optionalEnvString(),
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
  GOOGLE_SHEETS_SPREADSHEET_ID: optionalEnvString(),
  // Telegram notifications (Phase 5). Optional at the env-schema level for
  // the same reason as the Sheets vars above — the send-* commands do the
  // real "is this configured" check and fail clearly if not.
  TELEGRAM_BOT_TOKEN: optionalEnvString(),
  TELEGRAM_CHAT_ID: optionalEnvString(),
  // MCP server (Phase 7/8). Port is configurable. The bind host is now
  // configurable too (Decision #61 corrects Decision #60): binding
  // 127.0.0.1 *inside* the Docker container makes it unreachable via
  // docker-compose's own port-publishing, since published-port traffic
  // arrives over the container's bridge interface, not loopback. Local
  // (non-Docker) runs default to 127.0.0.1 — tightest option, matches
  // Decision #4's original intent. docker-compose.yml sets this to
  // 0.0.0.0 explicitly; the "never reachable off this machine" guarantee
  // comes from docker-compose.yml's `127.0.0.1:3939:3939` host-side
  // mapping instead, not from the container's own bind address.
  MCP_PORT: z.coerce.number().default(3939),
  MCP_HOST: z.string().min(1).default("127.0.0.1"),
});

export type Env = z.infer<typeof envSchema>;

// Exported for the regression test covering the empty-string bug above —
// not used elsewhere.
export function loadEnv(source: NodeJS.ProcessEnv): Env {
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
