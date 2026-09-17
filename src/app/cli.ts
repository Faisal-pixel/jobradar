// Small debug CLI, not a JobRadar feature — a hand tool for verifying the
// database and job sources from the command line (e.g.
// `docker compose exec app node dist/app/cli.js list-companies`)
// while there's no MCP server or scheduler yet to exercise them through.
import { getDb, closeDb } from "../database/connection.js";
import { ALL_MIGRATIONS, runMigrations } from "../database/migrations/index.js";
import { CompaniesRepository } from "../database/repositories/companies-repository.js";
import { JobsRepository, type JobFilters } from "../database/repositories/jobs-repository.js";
import { SourceHealthRepository } from "../database/repositories/source-health-repository.js";
import { CandidateProfileRepository } from "../database/repositories/candidate-profile-repository.js";
import { SourceManager } from "../services/job-discovery/source-manager.js";
import { ScoringPipeline } from "../services/matching/scoring-pipeline.js";
import { WorkAtAStartupSource } from "../sources/workatastartup/index.js";
import type { JobStatus, JobFitCategory } from "../domain/jobs/job.js";
import { SheetSyncStatusRepository } from "../database/repositories/sheet-sync-status-repository.js";
import { getAuthorizedClient } from "../services/sheets/google-auth.js";
import { GoogleSheetsClient } from "../services/sheets/sheets-client.js";
import { SheetsSyncService } from "../services/sheets/sheets-sync.js";
import { env } from "../config/env.js";
import { TelegramBotClient, fetchRecentChatIds, type TelegramClient } from "../services/notifications/telegram-client.js";
import { TEST_NOTIFICATION_MESSAGE } from "../services/notifications/templates.js";
import { JobAlertsService } from "../services/notifications/job-alerts.js";
import { DailyDigestService } from "../services/notifications/daily-digest.js";
import { FollowUpAlertsService } from "../services/notifications/follow-up-alerts.js";

function requireTelegramClient(): TelegramClient | null {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.error(
      "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must both be set. Create a bot via @BotFather, " +
        "message it once, then run `cli get-telegram-chat-id <token>` to find your chat ID.",
    );
    process.exitCode = 1;
    return null;
  }
  return new TelegramBotClient(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);
}

function parseFlags(args: string[]): Record<string, string | true> {
  const flags: Record<string, string | true> = {};
  for (const arg of args) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    if (key) flags[key] = value ?? true;
  }
  return flags;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  const db = getDb();
  runMigrations(db, ALL_MIGRATIONS);
  const companies = new CompaniesRepository(db);
  const jobs = new JobsRepository(db);
  const sourceHealth = new SourceHealthRepository(db);
  const candidateProfile = new CandidateProfileRepository(db);
  const sheetSyncStatus = new SheetSyncStatusRepository(db);

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
    case "score-jobs": {
      const pipeline = new ScoringPipeline(db);
      console.log(JSON.stringify(pipeline.run(), null, 2));
      break;
    }
    case "get-profile": {
      console.log(JSON.stringify(candidateProfile.get(), null, 2));
      break;
    }
    case "search-jobs": {
      const flags = parseFlags(args);
      const filters: JobFilters = {};
      if (typeof flags.status === "string") filters.status = flags.status as JobStatus;
      if (typeof flags.fitCategory === "string") filters.fitCategory = flags.fitCategory as JobFitCategory;
      if (typeof flags.minFitScore === "string") filters.minFitScore = Number(flags.minFitScore);
      if (flags.remote) filters.remoteOnly = true;
      console.log(JSON.stringify(jobs.findByFilters(filters), null, 2));
      break;
    }
    case "sync-sheets": {
      if (!env.GOOGLE_SHEETS_SPREADSHEET_ID) {
        console.error(
          "GOOGLE_SHEETS_SPREADSHEET_ID is not set. Create a Google Sheet, share it with " +
            "yourself (you already own it), and set that env var to its ID from the sheet's URL.",
        );
        process.exitCode = 1;
        break;
      }
      const auth = await getAuthorizedClient();
      const sheetsClient = new GoogleSheetsClient(auth, env.GOOGLE_SHEETS_SPREADSHEET_ID);
      const sync = new SheetsSyncService(db, sheetsClient);
      await sync.sync();
      console.log("Sync complete.");
      break;
    }
    case "sheet-status": {
      console.log(JSON.stringify(sheetSyncStatus.list(), null, 2));
      break;
    }
    case "send-test": {
      const telegram = requireTelegramClient();
      if (!telegram) break;
      await telegram.sendMessage(TEST_NOTIFICATION_MESSAGE);
      console.log("Test notification sent.");
      break;
    }
    case "send-alerts": {
      const telegram = requireTelegramClient();
      if (!telegram) break;
      const result = await new JobAlertsService(db, telegram).run();
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "send-digest": {
      const telegram = requireTelegramClient();
      if (!telegram) break;
      const result = await new DailyDigestService(db, telegram).run();
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "send-followups": {
      const telegram = requireTelegramClient();
      if (!telegram) break;
      const result = await new FollowUpAlertsService(db, telegram).run();
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "get-telegram-chat-id": {
      const token = args[0] ?? env.TELEGRAM_BOT_TOKEN;
      if (!token) {
        console.error("Usage: cli get-telegram-chat-id <bot-token>  (or set TELEGRAM_BOT_TOKEN)");
        process.exitCode = 1;
        break;
      }
      const chatIds = await fetchRecentChatIds(token);
      if (chatIds.length === 0) {
        console.error(
          "No chat IDs found. Message your bot at least once in Telegram, then run this again.",
        );
        process.exitCode = 1;
        break;
      }
      console.log(`Found chat ID(s): ${chatIds.join(", ")}`);
      console.log("Set TELEGRAM_CHAT_ID to the right one above (usually there's only one).");
      break;
    }
    default: {
      console.error(
        "Usage: cli <insert-company|list-companies|list-jobs|source-health|discover-jobs|" +
          "score-jobs|get-profile|search-jobs|sync-sheets|sheet-status|send-test|send-alerts|" +
          "send-digest|send-followups|get-telegram-chat-id> [args]\n" +
          "  search-jobs --status=reviewed --fitCategory=A --minFitScore=70 --remote",
      );
      process.exitCode = 1;
    }
  }

  closeDb();
}

// Google's HTTP client (gaxios) can leave a keep-alive socket open, which
// otherwise silently hangs the process after the command's actual work is
// done — explicit exit is the standard fix for a one-shot CLI, not
// something worth chasing into gaxios's internals.
main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
