import type { DatabaseSync } from "node:sqlite";
import { SourceManager } from "../services/job-discovery/source-manager.js";
import { WorkAtAStartupSource } from "../sources/workatastartup/index.js";
import { ScoringPipeline } from "../services/matching/scoring-pipeline.js";
import { JobAlertsService } from "../services/notifications/job-alerts.js";
import { DailyDigestService } from "../services/notifications/daily-digest.js";
import { FollowUpAlertsService } from "../services/notifications/follow-up-alerts.js";
import { WeeklyReportService } from "../services/notifications/weekly-report.js";
import { SheetsSyncService } from "../services/sheets/sheets-sync.js";
import { getAuthorizedClient } from "../services/sheets/google-auth.js";
import { GoogleSheetsClient } from "../services/sheets/sheets-client.js";
import { TelegramBotClient, type TelegramClient } from "../services/notifications/telegram-client.js";
import { formatFollowUpsSection } from "../services/notifications/templates.js";
import { env } from "../config/env.js";

export interface TaskResult {
  status: "success" | "failure";
  // Free-form per-step breakdown — persisted as JSON text (see
  // schema/scheduler-runs.ts), never flattened into typed columns, since
  // each task's shape genuinely differs.
  summary: Record<string, unknown>;
  error: string | null;
}

function getTelegramClient(): TelegramClient | null {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return null;
  return new TelegramBotClient(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

// Discovery -> scoring -> alerts -> Sheets sync, in that order (Faisal's
// Decisions Log confirmation: Sheets sync is tied to the discovery
// cycle, not its own timer — cheap and self-correcting, Decisions Log
// #28). Each step is isolated in its own try/catch: one step failing
// (e.g. Sheets sync, which does throw on failure after recording to
// sheet_sync_status) must not discard whatever the earlier steps already
// accomplished, the same "one thing failing isolates, not cascades"
// principle Decisions Log #19/#39 already established one level up.
export async function runDiscoveryCycle(db: DatabaseSync): Promise<TaskResult> {
  const summary: Record<string, unknown> = {};
  const errors: string[] = [];

  try {
    const manager = new SourceManager(db, [new WorkAtAStartupSource()]);
    const results = await manager.runAll();
    summary.discovery = results;
    if (results.some((result) => !result.ok)) errors.push("discovery: one or more sources failed");
  } catch (cause) {
    const message = errorMessage(cause);
    summary.discovery = { error: message };
    errors.push(`discovery: ${message}`);
  }

  try {
    summary.scoring = new ScoringPipeline(db).run();
  } catch (cause) {
    const message = errorMessage(cause);
    summary.scoring = { error: message };
    errors.push(`scoring: ${message}`);
  }

  const telegram = getTelegramClient();
  if (telegram) {
    try {
      summary.alerts = await new JobAlertsService(db, telegram).run();
    } catch (cause) {
      const message = errorMessage(cause);
      summary.alerts = { error: message };
      errors.push(`alerts: ${message}`);
    }
  } else {
    summary.alerts = { skipped: "Telegram not configured" };
  }

  if (env.GOOGLE_SHEETS_SPREADSHEET_ID) {
    try {
      const auth = await getAuthorizedClient();
      const sheetsClient = new GoogleSheetsClient(auth, env.GOOGLE_SHEETS_SPREADSHEET_ID);
      await new SheetsSyncService(db, sheetsClient).sync();
      summary.sheetsSync = { ok: true };
    } catch (cause) {
      const message = errorMessage(cause);
      summary.sheetsSync = { error: message };
      errors.push(`sheetsSync: ${message}`);
    }
  } else {
    summary.sheetsSync = { skipped: "Google Sheets not configured" };
  }

  return { status: errors.length === 0 ? "success" : "failure", summary, error: errors.length > 0 ? errors.join("; ") : null };
}

// One combined message, not two separate sends (Faisal's Decisions Log
// confirmation) — DailyDigestService.buildMessage() and
// FollowUpAlertsService.findDue() are both pure content-generation
// (no send), added in Phase 10 specifically so this could compose them
// without duplicating either service's query logic.
export async function runDailyDigest(db: DatabaseSync): Promise<TaskResult> {
  const telegram = getTelegramClient();
  if (!telegram) {
    return { status: "success", summary: { skipped: "Telegram not configured" }, error: null };
  }

  try {
    const { message: digestMessage, jobCount } = await new DailyDigestService(db, telegram).buildMessage();
    const { due, companyNameById } = new FollowUpAlertsService(db, telegram).findDue();

    const message = due.length > 0 ? `${digestMessage}\n${formatFollowUpsSection(due, companyNameById)}` : digestMessage;
    await telegram.sendMessage(message);

    return { status: "success", summary: { jobCount, followUpsDue: due.length }, error: null };
  } catch (cause) {
    const message = errorMessage(cause);
    return { status: "failure", summary: {}, error: message };
  }
}

export async function runWeeklyReport(db: DatabaseSync): Promise<TaskResult> {
  const telegram = getTelegramClient();
  if (!telegram) {
    return { status: "success", summary: { skipped: "Telegram not configured" }, error: null };
  }

  try {
    const summary = await new WeeklyReportService(db, telegram).run();
    return { status: "success", summary: { ...summary }, error: null };
  } catch (cause) {
    const message = errorMessage(cause);
    return { status: "failure", summary: {}, error: message };
  }
}
