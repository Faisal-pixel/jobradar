import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type { McpServer } from "@modelcontextprotocol/server";
import { SheetSyncStatusRepository } from "../../database/repositories/sheet-sync-status-repository.js";
import { getAuthorizedClient } from "../../services/sheets/google-auth.js";
import { GoogleSheetsClient } from "../../services/sheets/sheets-client.js";
import { SheetsSyncService } from "../../services/sheets/sheets-sync.js";
import { env } from "../../config/env.js";
import { toolResult, toolError } from "../tool-helpers.js";

export function registerSheetsTools(server: McpServer, db: DatabaseSync): void {
  const sheetSyncStatus = new SheetSyncStatusRepository(db);

  server.registerTool(
    "sync_google_sheets",
    {
      title: "Sync Google Sheets",
      description:
        "Sync current SQLite data (Jobs, Companies, People, Applications, Outreach) to the configured Google " +
        "Sheet. SQLite stays the source of truth — this is a one-way, full-overwrite sync.",
      inputSchema: z.object({}),
    },
    async () => {
      if (!env.GOOGLE_SHEETS_SPREADSHEET_ID) {
        return toolError("GOOGLE_SHEETS_SPREADSHEET_ID is not configured.");
      }
      const auth = await getAuthorizedClient();
      const sheetsClient = new GoogleSheetsClient(auth, env.GOOGLE_SHEETS_SPREADSHEET_ID);
      await new SheetsSyncService(db, sheetsClient).sync();
      return toolResult({ ok: true });
    },
  );

  server.registerTool(
    "get_sheet_status",
    {
      title: "Get Sheet Status",
      description: "Get Google Sheets sync health status.",
      inputSchema: z.object({}),
    },
    async () => toolResult(sheetSyncStatus.list()),
  );
}
