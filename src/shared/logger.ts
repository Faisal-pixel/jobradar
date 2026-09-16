import { env } from "../config/env.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const threshold = LEVELS[env.LOG_LEVEL];

function write(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < threshold) return;
  const timestamp = new Date().toISOString();
  const metaStr = meta
    ? " " + Object.entries(meta).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(" ")
    : "";
  const line = `[${timestamp}] ${level.toUpperCase().padEnd(5)} ${message}${metaStr}`;
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  out(line);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write("error", message, meta),
};
