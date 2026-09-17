import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createServer } from "node:http";
import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env.js";
import { logger } from "../../shared/logger.js";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

interface InstalledClientCredentials {
  client_id: string;
  client_secret: string;
}

function loadClientCredentials(): InstalledClientCredentials {
  if (!existsSync(env.GOOGLE_OAUTH_CLIENT_PATH)) {
    throw new Error(
      `Google OAuth client file not found at ${env.GOOGLE_OAUTH_CLIENT_PATH}. ` +
        `Download it from Google Cloud Console (APIs & Services > Credentials > your Desktop app client) and save it there.`,
    );
  }
  const raw = JSON.parse(readFileSync(env.GOOGLE_OAUTH_CLIENT_PATH, "utf8")) as {
    installed?: InstalledClientCredentials;
  };
  const installed = raw.installed;
  if (!installed?.client_id || !installed?.client_secret) {
    throw new Error(
      `Google OAuth client file at ${env.GOOGLE_OAUTH_CLIENT_PATH} doesn't look like a Desktop app ` +
        `OAuth client (expected an "installed" object with client_id/client_secret).`,
    );
  }
  return installed;
}

function loadSavedTokens(): Record<string, unknown> | null {
  if (!existsSync(env.GOOGLE_OAUTH_TOKEN_PATH)) return null;
  return JSON.parse(readFileSync(env.GOOGLE_OAUTH_TOKEN_PATH, "utf8"));
}

function saveTokens(tokens: unknown): void {
  mkdirSync(dirname(env.GOOGLE_OAUTH_TOKEN_PATH), { recursive: true });
  writeFileSync(env.GOOGLE_OAUTH_TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf8");
}

// One-time browser sign-in: starts a local loopback HTTP server (current
// Google-recommended flow for Desktop app OAuth clients — the old
// copy-paste "out-of-band" flow was deprecated in 2022), prints the
// consent URL, waits for Google's redirect carrying the auth code,
// exchanges it for tokens, and saves them. Only ever runs once — every
// later call finds saved tokens via loadSavedTokens() and skips this
// entirely, no browser involved.
async function runLoopbackAuthFlow(client: OAuth2Client): Promise<void> {
  const { code, redirectUri } = await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    // Captured once the server starts listening, before server.close()
    // ever runs — server.address() returns null after close(), so the
    // request handler below must reuse this rather than re-querying it.
    let redirectUri = "";

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const authCode = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.end("Authorization failed — you can close this tab and check the terminal.");
        server.close();
        reject(new Error(`Google OAuth consent was denied or failed: ${error}`));
        return;
      }
      if (!authCode) {
        // A stray request (e.g. the browser's favicon fetch) — ignore and
        // keep waiting for the real callback.
        res.end();
        return;
      }

      res.end("JobRadar is authorized. You can close this tab and return to the terminal.");
      server.close();
      resolve({ code: authCode, redirectUri });
    });

    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      redirectUri = `http://127.0.0.1:${port}`;
      const authUrl = client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: SCOPES,
        redirect_uri: redirectUri,
      });
      console.log(`\nOpen this URL in your browser to authorize JobRadar:\n\n${authUrl}\n`);
      logger.info("Waiting for Google OAuth consent in the browser");
    });
  });

  const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
  client.setCredentials(tokens);
  saveTokens(tokens);
  logger.info("Google OAuth tokens saved", { path: env.GOOGLE_OAUTH_TOKEN_PATH });
}

export async function getAuthorizedClient(): Promise<OAuth2Client> {
  const credentials = loadClientCredentials();
  const client = new OAuth2Client({
    clientId: credentials.client_id,
    clientSecret: credentials.client_secret,
  });

  const savedTokens = loadSavedTokens();
  if (savedTokens) {
    client.setCredentials(savedTokens);
    return client;
  }

  await runLoopbackAuthFlow(client);
  return client;
}
