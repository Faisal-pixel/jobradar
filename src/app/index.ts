import { env } from "../config/env.js";
import { logger } from "../shared/logger.js";
import { getDb, closeDb } from "../database/connection.js";
import { ALL_MIGRATIONS, runMigrations } from "../database/migrations/index.js";
import { startMcpServer } from "../mcp/server.js";

function main(): void {
  logger.info("JobRadar starting", { env: env.NODE_ENV, dbPath: env.DB_PATH });

  const db = getDb();
  runMigrations(db, ALL_MIGRATIONS);

  // Decisions #4/#5: the MCP server is the persistent process keeping
  // this container alive — Streamable HTTP, bound to 127.0.0.1 only, no
  // scheduler yet (Phase 10). Replaces Phase 1's heartbeat placeholder.
  const mcpServer = startMcpServer(db);

  logger.info("JobRadar ready — MCP server running, no scheduler yet (Phase 10)");

  const shutdown = (signal: string) => {
    logger.info("Shutting down", { signal });
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
