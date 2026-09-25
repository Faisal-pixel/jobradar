import { env } from "../config/env.js";
import { logger } from "../shared/logger.js";
import { getDb, closeDb } from "../database/connection.js";
import { ALL_MIGRATIONS, runMigrations } from "../database/migrations/index.js";
import { startMcpServer } from "../mcp/server.js";
import { startScheduler } from "../scheduler/scheduler.js";

function main(): void {
  logger.info("JobRadar starting", { env: env.NODE_ENV, dbPath: env.DB_PATH });

  const db = getDb();
  runMigrations(db, ALL_MIGRATIONS);

  // Decisions #4/#5: the MCP server is the persistent process keeping
  // this container alive — Streamable HTTP, bound to 127.0.0.1 only.
  const mcpServer = startMcpServer(db);

  // Phase 10: the scheduler runs in this same process/event loop, sharing
  // the same db handle — see scheduler.ts for why that's safe.
  // SCHEDULER_DISABLED is a local-dev/test escape hatch only, never set
  // in docker-compose.yml.
  const scheduler = env.SCHEDULER_DISABLED ? null : startScheduler(db);

  logger.info("JobRadar ready", { schedulerEnabled: scheduler !== null });

  const shutdown = (signal: string) => {
    logger.info("Shutting down", { signal });
    scheduler?.stop();
    mcpServer
      .close()
      .catch((error: unknown) => logger.error("Error closing MCP server", { error: String(error) }))
      .finally(() => {
        closeDb();
        process.exit(0);
      });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main();
