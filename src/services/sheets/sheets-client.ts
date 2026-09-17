import { google, type sheets_v4 } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

// A thin interface between the sync orchestrator and the real Google API
// — lets tests substitute a fake client instead of hitting the network
// (same pattern as Phase 2's fetch-mocking for the job source adapter).
export interface SheetsClient {
  ensureTabs(tabNames: string[]): Promise<void>;
  clearAndWrite(tabData: Record<string, string[][]>): Promise<void>;
}

export class GoogleSheetsClient implements SheetsClient {
  private readonly sheets: sheets_v4.Sheets;

  constructor(
    auth: OAuth2Client,
    private readonly spreadsheetId: string,
  ) {
    this.sheets = google.sheets({ version: "v4", auth });
  }

  async ensureTabs(tabNames: string[]): Promise<void> {
    const { data } = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    const existing = new Set((data.sheets ?? []).map((sheet) => sheet.properties?.title).filter(Boolean));
    const missing = tabNames.filter((name) => !existing.has(name));
    if (missing.length === 0) return;

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
      },
    });
  }

  // Clear then write, both as single batched calls covering all tabs —
  // at most 2 API calls total regardless of how many of the 5 sheets are
  // being synced, well under Google's 300/min (60/min per user) quota.
  async clearAndWrite(tabData: Record<string, string[][]>): Promise<void> {
    const tabNames = Object.keys(tabData);
    if (tabNames.length === 0) return;

    await this.sheets.spreadsheets.values.batchClear({
      spreadsheetId: this.spreadsheetId,
      requestBody: { ranges: tabNames.map((name) => `'${name}'`) },
    });

    await this.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: tabNames.map((name) => ({
          range: `'${name}'!A1`,
          values: tabData[name] ?? [],
        })),
      },
    });
  }
}
