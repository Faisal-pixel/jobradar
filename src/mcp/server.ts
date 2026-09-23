import type { DatabaseSync } from "node:sqlite";
import express from "express";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { env } from "../config/env.js";
import { logger } from "../shared/logger.js";
import { registerJobTools } from "./tools/jobs.js";
import { registerCompanyTools } from "./tools/companies.js";
import { registerPeopleTools } from "./tools/people.js";
import { registerPreferencesTools } from "./tools/preferences.js";
import { registerApplicationTools } from "./tools/applications.js";
import { registerOutreachTools } from "./tools/outreach.js";
import { registerSourceTools } from "./tools/sources.js";
import { registerSheetsTools } from "./tools/sheets.js";
import { registerSystemTools } from "./tools/system.js";

// Decision #4: Streamable HTTP, bound to 127.0.0.1 only — never made
// configurable via env, unlike MCP_PORT (see env.ts). createMcpExpressApp
// enables DNS-rebinding/Origin protection automatically for a localhost
// host (verified live during Phase 7 investigation, not just documented).
//
// createMcpHandler's factory runs once per HTTP request (the SDK's
// stateless-friendly model) — cheap here, since "registering tools" is
// just attaching closures over the one shared, already-open `db`.
export function startMcpServer(db: DatabaseSync): { close: () => Promise<void> } {
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "jobradar", version: "1.0.0" });
    registerJobTools(server, db);
    registerCompanyTools(server, db);
    registerPeopleTools(server, db);
    registerPreferencesTools(server, db);
    registerApplicationTools(server, db);
    registerOutreachTools(server, db);
    registerSourceTools(server, db);
    registerSheetsTools(server, db);
    registerSystemTools(server, db);
    return server;
  });

  const app = createMcpExpressApp({ host: "127.0.0.1" });
  app.post("/mcp", express.json(), (req, res) => {
    void toNodeHandler(handler)(req, res, req.body);
  });

  const httpServer = app.listen(env.MCP_PORT, "127.0.0.1", () => {
    logger.info("MCP server listening", { url: `http://127.0.0.1:${env.MCP_PORT}/mcp` });
  });

  return {
    close: () =>
      new Promise((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
