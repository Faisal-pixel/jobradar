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
import { registerResearchTools } from "./tools/research.js";

// Decision #4/#61: Streamable HTTP. The actual TCP bind address is
// env.MCP_HOST (127.0.0.1 locally, 0.0.0.0 in Docker — see env.ts).
// createMcpExpressApp's `host` option is a DIFFERENT thing: it only
// configures DNS-rebinding/Origin validation (which hostnames the `Host`/
// `Origin` headers are allowed to carry), not the bind address — confirmed
// by reading the installed .d.mts, not assumed. It stays hardcoded to
// "127.0.0.1" here regardless of MCP_HOST, because host-side clients
// (curl, mcp-remote, a local dev client) always send `Host: 127.0.0.1:<port>`
// — whether connecting directly or via Docker's port-publish, which
// preserves the client's own Host header — so validating against
// "127.0.0.1" is correct either way (verified live during Phase 7 with a
// spoofed-Host curl request correctly rejected).
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
    registerResearchTools(server, db);
    return server;
  });

  const app = createMcpExpressApp({ host: "127.0.0.1" });
  app.post("/mcp", express.json(), (req, res) => {
    void toNodeHandler(handler)(req, res, req.body);
  });

  const httpServer = app.listen(env.MCP_PORT, env.MCP_HOST, () => {
    logger.info("MCP server listening", { url: `http://${env.MCP_HOST}:${env.MCP_PORT}/mcp` });
  });

  return {
    close: () =>
      new Promise((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
