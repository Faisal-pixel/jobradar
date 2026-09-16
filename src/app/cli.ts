// Small debug CLI, not a JobRadar feature — a hand tool for verifying the
// database and job sources from the command line (e.g.
// `docker compose exec app node dist/app/cli.js list-companies`)
// while there's no MCP server or scheduler yet to exercise them through.
import { getDb, closeDb } from "../database/connection.js";
import { ALL_MIGRATIONS, runMigrations } from "../database/migrations/index.js";
import { CompaniesRepository } from "../database/repositories/companies-repository.js";
import { JobsRepository } from "../database/repositories/jobs-repository.js";
import { SourceHealthRepository } from "../database/repositories/source-health-repository.js";
import { SourceManager } from "../services/job-discovery/source-manager.js";
import { WorkAtAStartupSource } from "../sources/workatastartup/index.js";

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  const db = getDb();
  runMigrations(db, ALL_MIGRATIONS);
  const companies = new CompaniesRepository(db);
  const jobs = new JobsRepository(db);
  const sourceHealth = new SourceHealthRepository(db);

  switch (command) {
    case "insert-company": {
      const name = args[0];
      if (!name) {
        console.error("Usage: cli insert-company <name>");
        process.exitCode = 1;
        break;
      }
      const company = companies.create({ name });
      console.log(JSON.stringify(company, null, 2));
      break;
    }
    case "list-companies": {
      console.log(JSON.stringify(companies.list(), null, 2));
      break;
    }
    case "list-jobs": {
      console.log(JSON.stringify(jobs.list(), null, 2));
      break;
    }
    case "source-health": {
      console.log(JSON.stringify(sourceHealth.list(), null, 2));
      break;
    }
    case "discover-jobs": {
      const manager = new SourceManager(db, [new WorkAtAStartupSource()]);
      const results = await manager.runAll();
      console.log(JSON.stringify(results, null, 2));
      break;
    }
    default: {
      console.error(
        "Usage: cli <insert-company|list-companies|list-jobs|source-health|discover-jobs> [args]",
      );
      process.exitCode = 1;
    }
  }

  closeDb();
}

main();
