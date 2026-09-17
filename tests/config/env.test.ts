import { describe, it, expect } from "vitest";
import { loadEnv } from "../../src/config/env.js";

describe("loadEnv", () => {
  it("treats an empty-string optional var as unset, not invalid", () => {
    // Regression test: docker-compose's `${VAR:-}` substitution produces
    // "" when the host doesn't have the var set, not an absent key — this
    // used to fail startup entirely (found via live Docker testing).
    const env = loadEnv({
      GOOGLE_SHEETS_SPREADSHEET_ID: "",
      TELEGRAM_BOT_TOKEN: "",
      TELEGRAM_CHAT_ID: "",
    });
    expect(env.GOOGLE_SHEETS_SPREADSHEET_ID).toBeUndefined();
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(env.TELEGRAM_CHAT_ID).toBeUndefined();
  });

  it("accepts a genuinely-provided value for the same fields", () => {
    const env = loadEnv({ TELEGRAM_BOT_TOKEN: "abc123", TELEGRAM_CHAT_ID: "999" });
    expect(env.TELEGRAM_BOT_TOKEN).toBe("abc123");
    expect(env.TELEGRAM_CHAT_ID).toBe("999");
  });

  it("fills in defaults when nothing is provided at all", () => {
    const env = loadEnv({});
    expect(env.NODE_ENV).toBe("development");
    expect(env.DB_PATH).toBe("./data/jobradar.db");
  });
});
