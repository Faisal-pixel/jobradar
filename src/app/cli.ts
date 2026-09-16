// Small debug CLI, not a JobRadar feature — a hand tool for verifying the
// database from the command line (e.g. `docker compose exec app node dist/app/cli.js list-companies`)
// while there's no MCP server or scheduler yet to exercise it through.
import { getDb, closeDb } from "../database/connection.js";
import { ALL_MIGRATIONS, runMigrations } from "../database/migrations/index.js";
import { CompaniesRepository } from "../database/repositories/companies-repository.js";

function main(): void {
  const [command, ...args] = process.argv.slice(2);

  const db = getDb();
  runMigrations(db, ALL_MIGRATIONS);
  const companies = new CompaniesRepository(db);

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
    default: {
      console.error("Usage: cli <insert-company|list-companies> [args]");
      process.exitCode = 1;
    }
  }

  closeDb();
}

main();
