import { env } from "../config/env.js";
import { logger } from "../shared/logger.js";
import { getDb, closeDb } from "../database/connection.js";
import { ALL_MIGRATIONS, runMigrations } from "../database/migrations/index.js";

function main(): void {
  logger.info("JobRadar starting", { env: env.NODE_ENV, dbPath: env.DB_PATH });

  const db = getDb();
  runMigrations(db, ALL_MIGRATIONS);

  logger.info("JobRadar foundation ready — no scheduler or MCP server yet (later phases)");

  // Phase 1 has no scheduler or MCP server to keep the process alive, but a
  // Docker container needs a running foreground process. This heartbeat is
  // a placeholder that later phases replace with real scheduled work / an
  // HTTP listener.
  const heartbeat = setInterval(() => {
    logger.debug("heartbeat");
  }, 60_000);

  const shutdown = (signal: string) => {
    logger.info("Shutting down", { signal });
    clearInterval(heartbeat);
    closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main();
