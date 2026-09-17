import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { SheetsSyncService, SHEET_SYNC_TARGET, SHEET_TAB_NAMES } from "../../../src/services/sheets/sheets-sync.js";
import { SheetSyncStatusRepository } from "../../../src/database/repositories/sheet-sync-status-repository.js";
import { CompaniesRepository } from "../../../src/database/repositories/companies-repository.js";
import { JobsRepository } from "../../../src/database/repositories/jobs-repository.js";
import type { SheetsClient } from "../../../src/services/sheets/sheets-client.js";

// A fully in-memory SheetsClient — no network, no real Google API — so
// this test proves the sync orchestration logic (what data goes where,
// how failures are recorded) without depending on Google at all.
class FakeSheetsClient implements SheetsClient {
  ensureTabsCalls: string[][] = [];
  clearAndWriteCalls: Record<string, string[][]>[] = [];
  shouldThrow = false;

  async ensureTabs(tabNames: string[]): Promise<void> {
    this.ensureTabsCalls.push(tabNames);
  }

  async clearAndWrite(tabData: Record<string, string[][]>): Promise<void> {
    if (this.shouldThrow) throw new Error("simulated Sheets API failure");
    this.clearAndWriteCalls.push(tabData);
  }
}

describe("SheetsSyncService", () => {
  let db: DatabaseSync;
  let client: FakeSheetsClient;
  let syncStatus: SheetSyncStatusRepository;

  beforeEach(() => {
    db = createTestDb();
    client = new FakeSheetsClient();
    syncStatus = new SheetSyncStatusRepository(db);
  });

  it("ensures all 5 tabs exist and writes all 5 tabs' data in one call", async () => {
    const companies = new CompaniesRepository(db);
    const jobs = new JobsRepository(db);
    const company = companies.create({ name: "Acme" });
    jobs.create({ title: "Backend Engineer", source: "yc", source_job_id: "1", company_id: company.id });

    await new SheetsSyncService(db, client).sync();

    expect(client.ensureTabsCalls).toEqual([[...SHEET_TAB_NAMES]]);
    expect(client.clearAndWriteCalls).toHaveLength(1);
    const written = client.clearAndWriteCalls[0]!;
    expect(Object.keys(written).sort()).toEqual([...SHEET_TAB_NAMES].sort());
    expect(written.Jobs).toHaveLength(2); // header + 1 job
    expect(written.Companies).toHaveLength(2); // header + 1 company
  });

  it("records success in sheet_sync_status", async () => {
    await new SheetsSyncService(db, client).sync();
    const status = syncStatus.get(SHEET_SYNC_TARGET);
    expect(status).toMatchObject({ status: "healthy", consecutive_failures: 0 });
  });

  it("records failure and re-throws when the client fails", async () => {
    client.shouldThrow = true;
    await expect(new SheetsSyncService(db, client).sync()).rejects.toThrow("simulated Sheets API failure");

    const status = syncStatus.get(SHEET_SYNC_TARGET);
    expect(status).toMatchObject({ status: "degraded", consecutive_failures: 1, last_error: "simulated Sheets API failure" });
  });

  it("syncs empty tables (Applications/Outreach have no rows yet) without crashing", async () => {
    await new SheetsSyncService(db, client).sync();
    const written = client.clearAndWriteCalls[0]!;
    expect(written.Applications).toEqual([expect.any(Array)]); // header row only
    expect(written.Outreach).toEqual([expect.any(Array)]);
  });
});
