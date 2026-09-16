import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "../config/env.js";
import { DatabaseError } from "../shared/errors.js";

let db: DatabaseSync | undefined;

export function getDb(): DatabaseSync {
  if (db) return db;

  try {
    if (env.DB_PATH !== ":memory:") {
      mkdirSync(dirname(env.DB_PATH), { recursive: true });
    }
    db = new DatabaseSync(env.DB_PATH);
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA journal_mode = WAL;");
    return db;
  } catch (cause) {
    throw new DatabaseError(`Failed to open database at ${env.DB_PATH}`, cause);
  }
}

export function closeDb(): void {
  db?.close();
  db = undefined;
}
