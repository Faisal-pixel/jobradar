import { describe, it, expect, beforeEach } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createTestDb } from "../../test-helpers/create-test-db.js";
import { SystemHealthService } from "../../../src/services/system/system-health-service.js";
import { SourceHealthRepository } from "../../../src/database/repositories/source-health-repository.js";
import { SheetSyncStatusRepository } from "../../../src/database/repositories/sheet-sync-status-repository.js";

describe("SystemHealthService", () => {
  let db: DatabaseSync;
  let sourceHealth: SourceHealthRepository;
  let sheetSyncStatus: SheetSyncStatusRepository;
  let service: SystemHealthService;

  beforeEach(() => {
    db = createTestDb();
    sourceHealth = new SourceHealthRepository(db);
    sheetSyncStatus = new SheetSyncStatusRepository(db);
    service = new SystemHealthService(db);
  });

  describe("getSystemHealth", () => {
    it("returns both sources and sheets, including healthy entries", () => {
      sourceHealth.recordSuccess("workatastartup");
      sheetSyncStatus.recordSuccess("google_sheets");

      const health = service.getSystemHealth();

      expect(health.sources).toHaveLength(1);
      expect(health.sheets).toHaveLength(1);
      expect(health.sources[0]?.status).toBe("healthy");
    });

    it("returns empty arrays when nothing has run yet", () => {
      expect(service.getSystemHealth()).toEqual({ sources: [], sheets: [] });
    });
  });

  describe("getErrors", () => {
    it("returns only entries with a non-null last_error, from both tables", () => {
      sourceHealth.recordSuccess("workatastartup");
      sourceHealth.recordFailure("some-other-source", "boom");
      sheetSyncStatus.recordFailure("google_sheets", "sync failed");

      const errors = service.getErrors();

      expect(errors).toHaveLength(2);
      expect(errors).toContainEqual(
        expect.objectContaining({ kind: "source", target: "some-other-source", lastError: "boom" }),
      );
      expect(errors).toContainEqual(
        expect.objectContaining({ kind: "sheet", target: "google_sheets", lastError: "sync failed" }),
      );
    });

    it("excludes healthy entries", () => {
      sourceHealth.recordSuccess("workatastartup");
      expect(service.getErrors()).toEqual([]);
    });

    it("returns an empty array when nothing has run yet", () => {
      expect(service.getErrors()).toEqual([]);
    });
  });
});
